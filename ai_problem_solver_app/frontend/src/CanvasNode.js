import React from 'react';

const TYPE_META = {
  goal:  { icon: '🎯', label: 'Goal',  cls: 'node-goal' },
  theme: { icon: '◆',  label: 'Piece', cls: 'node-theme' },
  task:  { icon: '▶',  label: 'Do',    cls: 'node-task' },
};

export default function CanvasNode({ node, highlighted, isActive, justBorn }) {
  const meta = TYPE_META[node.type] || TYPE_META.task;

  const cls = [
    'node',
    meta.cls,
    `status-${node.status}`,
    highlighted ? 'is-highlighted' : '',
    isActive ? 'is-active' : '',
    justBorn ? 'is-born' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      style={{
        transform: `translate(-50%, -50%) translate(${node.x}px, ${node.y}px)`,
      }}
    >
      <div className="node-header">
        <span className="node-icon">{meta.icon}</span>
        <span className="node-type">{meta.label}</span>
        {node.status === 'done' && <span className="node-done">✓</span>}
      </div>
      <div className="node-text">{node.text}</div>
    </div>
  );
}
