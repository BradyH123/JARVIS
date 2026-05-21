import React, { useEffect, useRef } from 'react';
import CanvasNode from './CanvasNode';

const CANVAS_W = 5000;
const CANVAS_H = 5000;

export default function Canvas({ nodes, highlightedNodeId, recentlyAddedId, onClaimSuggestion }) {
  const containerRef = useRef(null);
  const rootNode = nodes.find((n) => n.type === 'goal');

  // Center the root on first mount.
  useEffect(() => {
    if (!rootNode || !containerRef.current) return;
    const c = containerRef.current;
    c.scrollLeft = rootNode.x - c.clientWidth / 2;
    c.scrollTop = rootNode.y - c.clientHeight / 2;
  }, []); // eslint-disable-line

  // Smoothly scroll a referenced node into view.
  useEffect(() => {
    if (!highlightedNodeId || !containerRef.current) return;
    const target = nodes.find((n) => n.id === highlightedNodeId);
    if (!target) return;
    const c = containerRef.current;
    c.scrollTo({
      left: target.x - c.clientWidth / 2,
      top: target.y - c.clientHeight / 2 - 80, // bias up so overlay doesn't cover it
      behavior: 'smooth',
    });
  }, [highlightedNodeId]); // eslint-disable-line

  // Auto-pan to the newly born node so the user sees it appear.
  useEffect(() => {
    if (!recentlyAddedId || !containerRef.current) return;
    const target = nodes.find((n) => n.id === recentlyAddedId);
    if (!target) return;
    const c = containerRef.current;
    c.scrollTo({
      left: target.x - c.clientWidth / 2,
      top: target.y - c.clientHeight / 2 - 80,
      behavior: 'smooth',
    });
  }, [recentlyAddedId]); // eslint-disable-line

  // Connector lines.
  const lines = [];
  for (const n of nodes) {
    if (!n.parentId) continue;
    const p = nodes.find((x) => x.id === n.parentId);
    if (!p) continue;
    const isHot =
      highlightedNodeId &&
      (n.id === highlightedNodeId || p.id === highlightedNodeId);
    const faded = n.status === 'dismissed' || n.status === 'done';
    lines.push({
      id: `${p.id}-${n.id}`,
      x1: p.x, y1: p.y, x2: n.x, y2: n.y,
      isHot, faded,
    });
  }

  return (
    <div ref={containerRef} className="canvas-container">
      <div
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
              className={`canvas-line ${l.isHot ? 'hot' : ''} ${l.faded ? 'faded' : ''}`}
            />
          ))}
        </svg>
        {nodes.map((n) => (
          <CanvasNode
            key={n.id}
            node={n}
            highlighted={highlightedNodeId === n.id}
            isActive={n.status === 'active'}
            justBorn={recentlyAddedId === n.id}
            onClaim={onClaimSuggestion}
          />
        ))}
      </div>
    </div>
  );
}
