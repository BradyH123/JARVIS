import React, { useEffect, useRef, useState, useCallback } from 'react';
import CanvasNode from './CanvasNode';
import coach from './coach';

// Canvas size and root position
const CANVAS_W = 5000;
const CANVAS_H = 5000;
const ROOT_X = CANVAS_W / 2;
const ROOT_Y = CANVAS_H / 2;
const CHILD_DIST = 320;
const IDLE_MS = 60_000; // spawn a nudge if no interaction for this long

// Position a set of new children around a parent, away from the grandparent.
function positionChildren(parent, grandparent, count) {
  if (count === 0) return [];
  const baseAngle = grandparent
    ? Math.atan2(parent.y - grandparent.y, parent.x - grandparent.x)
    : -Math.PI / 2;
  const totalSpread = grandparent ? Math.PI * 0.9 : Math.PI * 2;
  const positions = [];
  for (let i = 0; i < count; i++) {
    let angle;
    if (grandparent) {
      const offset = count === 1
        ? 0
        : (i - (count - 1) / 2) / (count - 1);
      angle = baseAngle + offset * totalSpread;
    } else {
      angle = baseAngle + (i / count) * 2 * Math.PI;
    }
    positions.push({
      x: parent.x + CHILD_DIST * Math.cos(angle),
      y: parent.y + CHILD_DIST * Math.sin(angle),
    });
  }
  return positions;
}

export default function Canvas({
  rootText,
  classification,
  initialNodes,
  onPersist,
  onNewDay,
  onChangeGoal,
  brainDump,
  meta,
}) {
  // Build the initial graph if none provided
  const buildInitialGraph = () => {
    const root = {
      id: coach.nid(),
      type: 'prompt',
      text: rootText,
      status: 'pending',
      parentId: null,
      childIds: [],
      x: ROOT_X,
      y: ROOT_Y,
    };
    const partials = coach.generateInitial(rootText, classification);
    const positions = positionChildren(root, null, partials.length);
    const children = partials.map((p, i) => ({
      ...p,
      id: coach.nid(),
      parentId: root.id,
      childIds: [],
      x: positions[i].x,
      y: positions[i].y,
    }));
    root.childIds = children.map((c) => c.id);
    return [root, ...children];
  };

  const [nodes, setNodes] = useState(() => initialNodes && initialNodes.length ? initialNodes : buildInitialGraph());
  const [lastInteraction, setLastInteraction] = useState(Date.now());
  const nodeEls = useRef({});
  const stageRef = useRef(null);
  const containerRef = useRef(null);

  // Find the current active node — newest one with status 'active'
  const activeNode = [...nodes].reverse().find((n) => n.status === 'active');

  // Persist whenever nodes change
  useEffect(() => {
    if (onPersist) onPersist(nodes);
  }, [nodes, onPersist]);

  // Center the root on first mount
  useEffect(() => {
    const root = nodes.find((n) => n.type === 'prompt');
    if (root && containerRef.current) {
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      containerRef.current.scrollLeft = root.x - w / 2;
      containerRef.current.scrollTop = root.y - h / 2;
    }
   
  }, []);

  // When the active node changes, scroll it into view smoothly
  useEffect(() => {
    if (!activeNode || !containerRef.current) return;
    const w = containerRef.current.clientWidth;
    const h = containerRef.current.clientHeight;
    containerRef.current.scrollTo({
      left: activeNode.x - w / 2,
      top: activeNode.y - h / 2,
      behavior: 'smooth',
    });
  }, [activeNode && activeNode.id]);

  // Idle nudge — spawn a question if user goes quiet
  useEffect(() => {
    const id = setInterval(() => {
      if (Date.now() - lastInteraction > IDLE_MS && activeNode) {
        // Add a nudge as a sibling of the current active node
        const partial = coach.generateNudge();
        addChildren(activeNode.parentId || activeNode.id, [partial], true);
        setLastInteraction(Date.now());
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [lastInteraction, activeNode]);

  const touch = () => setLastInteraction(Date.now());

  // Generic: append children to a node, optionally making one active
  const addChildren = useCallback(
    (parentId, partials, _replaceActive = true) => {
      setNodes((prev) => {
        const parent = prev.find((n) => n.id === parentId);
        if (!parent || partials.length === 0) return prev;
        const grandparent = parent.parentId
          ? prev.find((n) => n.id === parent.parentId)
          : null;

        // Mark all current 'active' nodes as 'pending' before adding new
        const cleared = prev.map((n) =>
          n.status === 'active' && partials.some((p) => p.status === 'active')
            ? { ...n, status: 'pending' }
            : n,
        );

        const existingChildCount = parent.childIds.length;
        // Place new children far enough from existing ones — use a slight
        // offset based on existing count
        const positions = positionChildren(
          parent,
          grandparent,
          existingChildCount + partials.length,
        ).slice(existingChildCount);

        const newNodes = partials.map((p, i) => ({
          ...p,
          id: coach.nid(),
          parentId,
          childIds: [],
          x: positions[i]?.x ?? parent.x + 200 + i * 30,
          y: positions[i]?.y ?? parent.y + 200 + i * 30,
        }));

        const updatedParent = {
          ...parent,
          childIds: [...parent.childIds, ...newNodes.map((n) => n.id)],
        };

        return cleared.map((n) => (n.id === parent.id ? updatedParent : n)).concat(newNodes);
      });
    },
    [],
  );

  const handleAnswer = (id, answer) => {
    touch();
    setNodes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, answer, status: 'answered' } : n,
      ),
    );
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const partials = coach.generateAfterAnswer(node, answer, classification);
    addChildren(id, partials);
  };

  const handleDone = (id) => {
    touch();
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: 'done' } : n)),
    );
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const partials = coach.generateAfterTaskDone(node, classification);
    addChildren(id, partials);
  };

  const handleSkip = (id) => {
    touch();
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: 'dismissed' } : n)),
    );
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const partials = coach.generateAfterTaskSkipped(node, classification);
    addChildren(id, partials);
  };

  const handleAccept = (id) => {
    touch();
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: 'answered' } : n)),
    );
    const partials = coach.generateAfterIdeaAccepted(node, classification);
    addChildren(id, partials);
  };

  const handleDismiss = (id) => {
    touch();
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, status: 'dismissed' } : n)),
    );
  };

  const registerEl = (id, el) => {
    nodeEls.current[id] = el;
  };

  const focusActive = () => {
    if (activeNode && containerRef.current) {
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      containerRef.current.scrollTo({
        left: activeNode.x - w / 2,
        top: activeNode.y - h / 2,
        behavior: 'smooth',
      });
    }
  };

  // Render connector lines as SVG between every parent and its children
  const lines = [];
  for (const n of nodes) {
    if (!n.parentId) continue;
    const p = nodes.find((x) => x.id === n.parentId);
    if (!p) continue;
    lines.push({ id: `${p.id}-${n.id}`, x1: p.x, y1: p.y, x2: n.x, y2: n.y, faded: n.status === 'dismissed' || n.status === 'done' });
  }

  const stats = {
    total: nodes.length,
    done: nodes.filter((n) => n.status === 'done').length,
    answered: nodes.filter((n) => n.status === 'answered').length,
  };

  return (
    <div className="canvas-root">
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
            ✓ {stats.done} done · 💬 {stats.answered} answered · ◯ {stats.total} nodes
          </div>
          <button className="ghost small" onClick={focusActive} title="Jump to the glowing node">
            🎯 Focus
          </button>
          <button className="ghost small" onClick={onChangeGoal} title="Switch today's goal">
            ↻ New goal
          </button>
          <button className="ghost small" onClick={onNewDay} title="Reset everything">
            ⟳ New day
          </button>
        </div>
      </header>

      <div ref={containerRef} className="canvas-container">
        <div
          ref={stageRef}
          className="canvas-stage"
          style={{ width: CANVAS_W, height: CANVAS_H }}
        >
          <svg
            className="canvas-lines"
            width={CANVAS_W}
            height={CANVAS_H}
            viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
          >
            {lines.map((l) => (
              <line
                key={l.id}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                className={`canvas-line ${l.faded ? 'faded' : ''}`}
              />
            ))}
          </svg>
          {nodes.map((n) => (
            <CanvasNode
              key={n.id}
              node={n}
              isActive={activeNode && activeNode.id === n.id}
              onAnswer={handleAnswer}
              onDone={handleDone}
              onSkip={handleSkip}
              onAccept={handleAccept}
              onDismiss={handleDismiss}
              registerEl={registerEl}
            />
          ))}
        </div>
      </div>

      {brainDump && brainDump.now && brainDump.now.length > 0 && (
        <div className="brain-strip">
          <div className="brain-strip-label">📥 Also on your plate:</div>
          <div className="brain-strip-items">
            {brainDump.now.slice(0, 6).map((it, i) => (
              <span key={i} className="brain-strip-item" title={it}>
                {it}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
