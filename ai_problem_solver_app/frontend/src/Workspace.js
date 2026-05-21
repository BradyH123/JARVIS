import React, { useEffect, useMemo, useState } from 'react';
import Canvas from './Canvas';
import CoachOverlay from './CoachOverlay';
import coach from './coach';

const CANVAS_W = 5000;
const CANVAS_H = 5000;
const ROOT_X = CANVAS_W / 2;
const ROOT_Y = CANVAS_H / 2;
const CHILD_DIST = 340;
const SIBLING_DIST = 240;

// Place a new child around a parent, picking the next available angle.
function placeChild(parent, grandparent, siblings, count) {
  const baseAngle = grandparent
    ? Math.atan2(parent.y - grandparent.y, parent.x - grandparent.x)
    : -Math.PI / 2;
  const totalSpread = grandparent ? Math.PI * 0.9 : Math.PI * 2;
  const idx = siblings.length;
  let angle;
  if (grandparent) {
    const denom = Math.max(1, count - 1);
    const offset = denom === 0 ? 0 : (idx - (count - 1) / 2) / denom;
    angle = baseAngle + offset * totalSpread;
  } else {
    angle = baseAngle + (idx / Math.max(count, 1)) * 2 * Math.PI;
  }
  return {
    x: parent.x + CHILD_DIST * Math.cos(angle),
    y: parent.y + CHILD_DIST * Math.sin(angle),
  };
}

// Lay out a new node given its parent and existing siblings.
function positionForNew(nodes, parentId) {
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) return { x: ROOT_X + 200, y: ROOT_Y };
  const grandparent = parent.parentId
    ? nodes.find((n) => n.id === parent.parentId)
    : null;
  const siblings = nodes.filter((n) => n.parentId === parentId);
  // Try to reserve enough angular space for ~5 children
  const expected = Math.max(siblings.length + 1, 4);
  return placeChild(parent, grandparent, siblings, expected);
}

export default function Workspace({
  rootText,
  classification,
  initialState,
  onPersist,
  onNewDay,
  onChangeGoal,
  brainDump,
  meta,
}) {
  const [state, setState] = useState(() => {
    if (initialState && initialState.nodes && initialState.nodes.length) {
      return initialState;
    }
    const rootId = coach.nid();
    const root = {
      id: rootId,
      type: 'goal',
      text: rootText,
      parentId: null,
      status: 'pending',
      x: ROOT_X,
      y: ROOT_Y,
    };
    return { nodes: [root], rootId, flags: {} };
  });

  const [prompt, setPrompt] = useState(null);
  const [recentlyAddedId, setRecentlyAddedId] = useState(null);

  // Generate the very first prompt and any time state advances.
  useEffect(() => {
    if (!prompt || prompt._stale) {
      const next = coach.getNextPrompt(state);
      setPrompt(next);
    }
  }, [state, prompt]);

  // Persist whenever the canvas state changes.
  useEffect(() => {
    if (onPersist) onPersist(state);
  }, [state, onPersist]);

  // Clear recently-added highlight after a short delay so the pulse plays once.
  useEffect(() => {
    if (!recentlyAddedId) return;
    const t = setTimeout(() => setRecentlyAddedId(null), 1800);
    return () => clearTimeout(t);
  }, [recentlyAddedId]);

  const applyAnswer = (response) => {
    if (!prompt) return;
    const out = coach.handleAnswer(prompt, response, state);

    setState((prev) => {
      let nodes = [...prev.nodes];

      // Apply node patches first
      if (out.updateNodes) {
        for (const u of out.updateNodes) {
          nodes = nodes.map((n) => (n.id === u.id ? { ...n, ...u.patch } : n));
        }
      }

      // Add new nodes with computed positions
      let lastAddedId = null;
      if (out.addNodes) {
        for (const partial of out.addNodes) {
          const id = coach.nid();
          const pos = positionForNew(nodes, partial.parentId);
          const node = {
            id,
            parentId: partial.parentId,
            type: partial.type,
            text: partial.text,
            status: partial.status || 'pending',
            x: pos.x,
            y: pos.y,
          };
          nodes = nodes.concat(node);
          lastAddedId = id;
        }
      }

      const flags = { ...(prev.flags || {}), ...(out.setFlags || {}) };
      const newState = { ...prev, nodes, flags };

      if (lastAddedId) {
        // Trigger animation + scroll
        setTimeout(() => setRecentlyAddedId(lastAddedId), 0);
      }
      return newState;
    });

    // Mark the current prompt stale so the next render fetches a new one.
    setPrompt((p) => (p ? { ...p, _stale: true } : p));
  };

  const handleSkip = () => {
    // Treat skip as "no response, advance phase by setting flag"
    setState((prev) => ({
      ...prev,
      flags: { ...(prev.flags || {}), themesComplete: true },
      // Add a dummy theme count so getNextPrompt moves past theme phase
      nodes: prev.nodes,
    }));
    setPrompt((p) => (p ? { ...p, _stale: true } : p));
  };

  const headerStats = useMemo(() => {
    const themes = state.nodes.filter((n) => n.type === 'theme').length;
    const tasks  = state.nodes.filter((n) => n.type === 'task');
    const done   = tasks.filter((t) => t.status === 'done').length;
    return { themes, tasks: tasks.length, done };
  }, [state.nodes]);

  return (
    <div className="workspace">
      <header className="canvas-header">
        <div className="canvas-header-left">
          <div className="classification-pill">
            {classification.icon} {classification.label}
          </div>
          <div className="canvas-goal" title={rootText}>{rootText}</div>
          {meta && (meta.energy || meta.timebox) && (
            <div className="canvas-meta">
              {meta.energy && <span>{meta.energy}</span>}
              {meta.timebox && <span>· {meta.timebox}</span>}
            </div>
          )}
        </div>
        <div className="canvas-header-right">
          <div className="canvas-stats">
            ◆ {headerStats.themes} pieces · ✓ {headerStats.done}/{headerStats.tasks} done
          </div>
          <button className="ghost small" onClick={onChangeGoal}>↻ New goal</button>
          <button className="ghost small" onClick={onNewDay}>⟳ New day</button>
        </div>
      </header>

      <Canvas
        nodes={state.nodes}
        highlightedNodeId={prompt && !prompt._stale ? prompt.referencingNodeId : null}
        recentlyAddedId={recentlyAddedId}
      />

      <CoachOverlay
        prompt={prompt && !prompt._stale ? prompt : null}
        onAnswer={applyAnswer}
        onSkip={handleSkip}
      />

      {brainDump && brainDump.now && brainDump.now.length > 0 && (
        <div className="brain-strip">
          <div className="brain-strip-label">📥 Also on your plate:</div>
          <div className="brain-strip-items">
            {brainDump.now.slice(0, 6).map((it, i) => (
              <span key={i} className="brain-strip-item" title={it}>{it}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
