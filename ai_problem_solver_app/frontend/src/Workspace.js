import React, { useEffect, useMemo, useState } from 'react';
import Canvas from './Canvas';
import CoachOverlay from './CoachOverlay';
import coach from './coach';

const CANVAS_W = 5000;
const CANVAS_H = 5000;
const ROOT_X = CANVAS_W / 2;
const ROOT_Y = CANVAS_H / 2;
const CHILD_DIST = 320;

// Position a brain-dump node — golden-angle spiral around the center so
// the dump cluster feels organic but doesn't overlap.
function positionForDump(existingDumpCount) {
  const angle = existingDumpCount * 137.5 * (Math.PI / 180);
  const radius = 180 + existingDumpCount * 70;
  return { x: ROOT_X + radius * Math.cos(angle), y: ROOT_Y + radius * Math.sin(angle) };
}

function positionForChild(parent, grandparent, siblingsCount, indexAmongSiblings) {
  if (!parent) return { x: ROOT_X, y: ROOT_Y };
  const baseAngle = grandparent
    ? Math.atan2(parent.y - grandparent.y, parent.x - grandparent.x)
    : -Math.PI / 2;
  const spread = grandparent ? Math.PI * 0.85 : Math.PI * 2;
  const total = Math.max(siblingsCount, 4);
  let angle;
  if (grandparent) {
    const denom = Math.max(1, total - 1);
    angle = baseAngle + ((indexAmongSiblings - (total - 1) / 2) / denom) * spread;
  } else {
    angle = baseAngle + (indexAmongSiblings / total) * 2 * Math.PI;
  }
  return { x: parent.x + CHILD_DIST * Math.cos(angle), y: parent.y + CHILD_DIST * Math.sin(angle) };
}

// Decide a position for a partial node about to be added.
function placeForNew(nodes, partial) {
  if (partial.type === 'dump') {
    const existingDumps = nodes.filter((n) => n.type === 'dump').length;
    return positionForDump(existingDumps);
  }
  if (partial.type === 'goal' && !partial.parentId) {
    return { x: ROOT_X, y: ROOT_Y };
  }
  const parent = nodes.find((n) => n.id === partial.parentId);
  if (!parent) return { x: ROOT_X + 200, y: ROOT_Y };
  const grandparent = parent.parentId ? nodes.find((n) => n.id === parent.parentId) : null;
  const siblings = nodes.filter((n) => n.parentId === parent.parentId && n.id !== parent.id);
  // budget enough angular slots for ~5 children of this parent
  const childrenSoFar = nodes.filter((n) => n.parentId === parent.id).length;
  return positionForChild(parent, grandparent, Math.max(5, childrenSoFar + 1), childrenSoFar);
}

export default function Workspace({ initialState, onPersist, onReset, classification: defaultClassification }) {
  const [state, setState] = useState(() => initialState || { nodes: [], rootId: null, flags: {}, classification: defaultClassification || coach.classify('') });
  const [prompt, setPrompt] = useState(null);
  const [recentlyAddedId, setRecentlyAddedId] = useState(null);

  // Persist
  useEffect(() => {
    if (onPersist) onPersist(state);
  }, [state, onPersist]);

  // Keep a fresh prompt for the current state.
  useEffect(() => {
    if (!prompt || prompt._stale) {
      setPrompt(coach.getNextPrompt(state));
    }
  }, [state, prompt]);

  // Clear the "just born" pulse after a moment.
  useEffect(() => {
    if (!recentlyAddedId) return;
    const t = setTimeout(() => setRecentlyAddedId(null), 1800);
    return () => clearTimeout(t);
  }, [recentlyAddedId]);

  const applyAnswer = (response) => {
    if (!prompt) return;
    const out = coach.handleAnswer(prompt, response, state);
    const extras = coach.getProactiveAdditions(prompt, response, state.classification);
    let lastAddedId = null;

    setState((prev) => {
      let nodes = [...prev.nodes];
      let rootId = prev.rootId;
      let classification = prev.classification;

      // updateNodes patches
      if (out.updateNodes) {
        for (const u of out.updateNodes) {
          nodes = nodes.map((n) => {
            if (n.id !== u.id) return n;
            const patched = { ...n, ...u.patch };
            // If a dump is being promoted to goal, recompute its position to center.
            if (u.patch.type === 'goal') {
              patched.x = ROOT_X;
              patched.y = ROOT_Y;
            }
            return patched;
          });
        }
      }

      if (out.setRootId) rootId = out.setRootId;

      // Add user-driven nodes
      if (out.addNodes) {
        for (const partial of out.addNodes) {
          const id = coach.nid();
          const pos = placeForNew(nodes, partial);
          const node = {
            id,
            parentId: partial.parentId || null,
            type: partial.type,
            text: partial.text,
            status: partial.status || 'pending',
            x: pos.x,
            y: pos.y,
          };
          nodes = nodes.concat(node);
          if (partial._setAsRoot) rootId = id;
          lastAddedId = id;
        }
      }

      // Classify on first goal selection so themes & icons feel right.
      if (rootId && !classification.type) {
        const root = nodes.find((n) => n.id === rootId);
        if (root) classification = coach.classify(root.text);
      }
      if (rootId && classification.type === 'default') {
        const root = nodes.find((n) => n.id === rootId);
        if (root) {
          const fresh = coach.classify(root.text);
          if (fresh.type !== 'default') classification = fresh;
        }
      }

      // Now apply proactive AI additions (suggestions)
      if (extras && extras.length) {
        for (const partial of extras) {
          const parentId = partial._attachToRoot ? rootId : partial.parentId;
          if (!parentId) continue;
          const id = coach.nid();
          const pos = placeForNew(nodes, { ...partial, parentId });
          const node = {
            id,
            parentId,
            type: partial.type,
            text: partial.text,
            status: partial.status || 'pending',
            x: pos.x,
            y: pos.y,
            _suggested: !!partial._suggested,
          };
          nodes = nodes.concat(node);
        }
      }

      const flags = { ...(prev.flags || {}), ...(out.setFlags || {}) };
      return { ...prev, nodes, rootId, flags, classification };
    });

    if (lastAddedId) setTimeout(() => setRecentlyAddedId(lastAddedId), 0);
    setPrompt((p) => (p ? { ...p, _stale: true } : p));
  };

  const handleSkip = () => {
    if (!prompt) return;
    const out = coach.handleSkip(prompt, state);
    setState((prev) => ({ ...prev, flags: { ...(prev.flags || {}), ...(out.setFlags || {}) } }));
    setPrompt((p) => (p ? { ...p, _stale: true } : p));
  };

  // Tap a suggestion node to claim it (turn it into a real node)
  const claimSuggestion = (nodeId) => {
    setState((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) =>
        n.id === nodeId ? { ...n, _suggested: false } : n,
      ),
    }));
    setPrompt((p) => (p ? { ...p, _stale: true } : p));
  };

  const root = state.rootId ? state.nodes.find((n) => n.id === state.rootId) : null;

  const stats = useMemo(() => {
    const dumps = state.nodes.filter((n) => n.type === 'dump').length;
    const themes = state.nodes.filter((n) => n.type === 'theme' && !n._suggested).length;
    const tasks = state.nodes.filter((n) => n.type === 'task' && !n._suggested);
    return { dumps, themes, tasks: tasks.length, done: tasks.filter((t) => t.status === 'done').length };
  }, [state.nodes]);

  return (
    <div className="workspace">
      <header className="canvas-header">
        <div className="canvas-header-left">
          {root ? (
            <>
              <div className="classification-pill">
                {state.classification.icon} {state.classification.label}
              </div>
              <div className="canvas-goal" title={root.text}>{root.text}</div>
            </>
          ) : (
            <div className="canvas-goal canvas-goal-empty">Your canvas</div>
          )}
        </div>
        <div className="canvas-header-right">
          <div className="canvas-stats">
            🧠 {stats.dumps} · ◆ {stats.themes} · ✓ {stats.done}/{stats.tasks}
          </div>
          <button className="ghost small" onClick={onReset}>⟳ Reset</button>
        </div>
      </header>

      <Canvas
        nodes={state.nodes}
        highlightedNodeId={prompt && !prompt._stale ? prompt.referencingNodeId : null}
        recentlyAddedId={recentlyAddedId}
        onClaimSuggestion={claimSuggestion}
      />

      <CoachOverlay
        prompt={prompt && !prompt._stale ? prompt : null}
        onAnswer={applyAnswer}
        onSkip={handleSkip}
      />
    </div>
  );
}
