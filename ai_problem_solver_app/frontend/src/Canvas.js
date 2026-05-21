import React, { useState, useRef, useLayoutEffect, useEffect, useMemo } from 'react';
import {
  canvasNodes,
  canvasEdges,
  DESIGN_W,
  mockStepDetail,
  mockNodeDetail,
} from './mockData';

// Build adjacency once
function buildAdjacency() {
  const adj = {};
  canvasEdges.forEach((e, i) => {
    (adj[e.from] = adj[e.from] || []).push({ other: e.to, kind: e.kind, idx: i });
    (adj[e.to] = adj[e.to] || []).push({ other: e.from, kind: e.kind, idx: i });
  });
  return adj;
}

const ADJ = buildAdjacency();

function highlightSet(activeId) {
  if (!activeId) return { nodes: new Set(), edges: new Set() };
  const nodes = new Set([activeId]);
  const edges = new Set();
  (ADJ[activeId] || []).forEach(({ other, idx }) => {
    nodes.add(other);
    edges.add(idx);
  });
  return { nodes, edges };
}

function NodeShell({ node, refSetter, onTap, dimmed, highlighted, isActiveSel }) {
  const className = [
    'cnode',
    `cnode-${node.kind}`,
    dimmed && 'cnode-dim',
    highlighted && 'cnode-hi',
    isActiveSel && 'cnode-sel',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div
      ref={refSetter}
      className={className}
      style={{
        left: `${(node.x / DESIGN_W) * 100}%`,
        top: `${node.y}px`,
      }}
      onClick={() => onTap(node)}
    >
      <div className="cnode-label">{node.label}</div>
      {node.sub && <div className="cnode-sub">{node.sub}</div>}
    </div>
  );
}

function Edge({ from, to, kind, highlighted, dimmed }) {
  if (!from || !to) return null;
  // Curved path for cleaner look
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  // Use a soft curve via quadratic bezier with offset perpendicular to direction
  // For mostly-vertical edges keep it close to straight.
  const isMostlyVertical = Math.abs(dy) > Math.abs(dx) * 1.5;
  const offset = isMostlyVertical ? 0 : Math.min(20, Math.abs(dx) * 0.15);
  // Perpendicular offset
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const cx = mx + px * offset;
  const cy = my + py * offset;
  const d = `M ${from.x} ${from.y} Q ${cx} ${cy} ${to.x} ${to.y}`;
  return (
    <path
      d={d}
      className={[
        'cedge',
        `cedge-${kind}`,
        highlighted && 'cedge-hi',
        dimmed && 'cedge-dim',
      ]
        .filter(Boolean)
        .join(' ')}
      fill="none"
    />
  );
}

function StepSheet({ stepId, onClose, onOpenChat }) {
  const detail = mockStepDetail[stepId];
  if (!detail) return null;
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-inner" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-tag">NEXT STEP</div>
        <div className="sheet-title">{detail.title}</div>
        <div className="sheet-meta">
          ~{detail.durationMin} min · <span className="agency-you">YOU do this</span> ·{' '}
          {detail.tool}
        </div>
        {detail.blurb && <div className="sheet-blurb">{detail.blurb}</div>}
        <div className="sheet-subhead">Why this</div>
        <ul className="why-list">
          {detail.whyThis.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        <div className="sheet-subhead">Leverages</div>
        <div className="leverage-chips">
          {detail.leverages.map((l) => {
            const node = canvasNodes.find((n) => n.id === l);
            return (
              <span key={l} className="chip">
                {node ? node.label : l}
              </span>
            );
          })}
        </div>
        <div className="sheet-actions">
          <button className="primary-btn">Start</button>
          <button className="ghost-btn">Skip</button>
          <button className="ghost-btn" onClick={onOpenChat}>
            Talk about it
          </button>
        </div>
      </div>
    </div>
  );
}

function NodeSheet({ nodeId, onClose }) {
  const detail = mockNodeDetail[nodeId];
  if (!detail) return null;
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheet-inner" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-title">{detail.title}</div>
        {detail.subtitle && <div className="sheet-subtitle">{detail.subtitle}</div>}
        {detail.sections.map((sec, si) => (
          <div key={si}>
            <div className="sheet-subhead">{sec.heading}</div>
            {sec.items.map((item, ii) => {
              if (item.actor) {
                return (
                  <div
                    key={ii}
                    className={`thread-msg thread-msg-${item.actor === 'you' ? 'you' : 'them'}`}
                  >
                    <div className="thread-msg-meta">
                      {item.when} · {item.actor === 'you' ? 'YOU' : detail.title.toUpperCase()}
                    </div>
                    <div className="thread-msg-body">
                      {item.body.split('\n').map((line, j) => (
                        <div key={j}>{line || ' '}</div>
                      ))}
                    </div>
                    {item.draftedByAi && (
                      <div className="drafted-by-ai">drafted by AI, you sent</div>
                    )}
                  </div>
                );
              }
              if (item.kind === 'bullet') {
                return (
                  <div key={ii} className="bullet-row">
                    <span className="bullet-dot">·</span>
                    <span>{item.text}</span>
                  </div>
                );
              }
              if (item.kind === 'note') {
                return (
                  <div key={ii} className="note-row">
                    {item.text}
                  </div>
                );
              }
              if (item.kind === 'action') {
                return (
                  <button key={ii} className="ghost-btn" style={{ marginRight: 6, marginTop: 8 }}>
                    {item.label}
                  </button>
                );
              }
              return null;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Canvas({ onOpenChat }) {
  const containerRef = useRef(null);
  const nodeRefs = useRef({});
  const [positions, setPositions] = useState({});
  const [activeId, setActiveId] = useState(null); // no default highlight; user explores
  const [sheetId, setSheetId] = useState(null);

  // On mount, center the goal in the viewport so the radial layout reads right.
  useEffect(() => {
    const scrollEl = containerRef.current?.parentElement;
    const goalEl = nodeRefs.current['goal'];
    if (!scrollEl || !goalEl) return;
    const goalY = goalEl.offsetTop + goalEl.offsetHeight / 2;
    scrollEl.scrollTop = Math.max(0, goalY - scrollEl.clientHeight / 2);
  }, []);

  // Measure node positions after render.
  useLayoutEffect(() => {
    const measure = () => {
      if (!containerRef.current) return;
      const cRect = containerRef.current.getBoundingClientRect();
      const next = {};
      Object.entries(nodeRefs.current).forEach(([id, el]) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        next[id] = {
          x: r.left - cRect.left + r.width / 2,
          y: r.top - cRect.top + r.height / 2,
        };
      });
      setPositions(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  // Highlight set for the active selection.
  const { nodes: hiNodes, edges: hiEdges } = useMemo(
    () => highlightSet(activeId),
    [activeId],
  );

  const handleNodeTap = (node) => {
    setActiveId(node.id);
    // Open a detail sheet for actionable nodes
    if (mockStepDetail[node.id] || mockNodeDetail[node.id]) {
      setSheetId(node.id);
    }
  };

  // Compute total canvas height
  const totalH = Math.max(...canvasNodes.map((n) => n.y)) + 100;

  return (
    <>
      <div
        className="canvas"
        ref={containerRef}
        style={{ height: `${totalH}px` }}
      >
        <svg
          className="canvas-svg"
          width="100%"
          height={totalH}
          style={{ height: `${totalH}px` }}
        >
          {canvasEdges.map((e, i) => (
            <Edge
              key={i}
              from={positions[e.from]}
              to={positions[e.to]}
              kind={e.kind}
              highlighted={hiEdges.has(i)}
              dimmed={activeId && !hiEdges.has(i)}
            />
          ))}
        </svg>

        {canvasNodes.map((n) => (
          <NodeShell
            key={n.id}
            node={n}
            refSetter={(el) => (nodeRefs.current[n.id] = el)}
            onTap={handleNodeTap}
            highlighted={hiNodes.has(n.id) && n.id !== activeId}
            isActiveSel={activeId === n.id}
            dimmed={activeId && !hiNodes.has(n.id) && n.id !== activeId}
          />
        ))}
      </div>

      {sheetId && mockStepDetail[sheetId] && (
        <StepSheet
          stepId={sheetId}
          onClose={() => setSheetId(null)}
          onOpenChat={() => {
            setSheetId(null);
            onOpenChat?.();
          }}
        />
      )}
      {sheetId && mockNodeDetail[sheetId] && (
        <NodeSheet nodeId={sheetId} onClose={() => setSheetId(null)} />
      )}
    </>
  );
}
