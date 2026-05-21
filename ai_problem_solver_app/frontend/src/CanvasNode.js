import React from 'react';

const TYPE_META = {
  dump:  { icon: '🧠', label: 'Thought', cls: 'node-dump' },
  goal:  { icon: '🎯', label: 'Today',   cls: 'node-goal' },
  theme: { icon: '◆',  label: 'Piece',   cls: 'node-theme' },
  task:  { icon: '▶',  label: 'Do',      cls: 'node-task' },
};

export default function CanvasNode({ node, highlighted, isActive, justBorn, onClaim }) {
  const meta = TYPE_META[node.type] || TYPE_META.task;
  const isSuggested = !!node._suggested;

  const cls = [
    'node',
    meta.cls,
    `status-${node.status}`,
    highlighted ? 'is-highlighted' : '',
    isActive ? 'is-active' : '',
    justBorn ? 'is-born' : '',
    isSuggested ? 'is-suggested' : '',
  ].filter(Boolean).join(' ');

  const handleClick = (e) => {
    if (isSuggested && onClaim) {
      e.stopPropagation();
      onClaim(node.id);
    }
  };

  return (
    <div
      className={cls}
      style={{
        transform: `translate(-50%, -50%) translate(${node.x}px, ${node.y}px)`,
      }}
      onClick={handleClick}
      role={isSuggested ? 'button' : undefined}
      title={isSuggested ? 'Tap to add this to your map' : undefined}
    >
      <div className="node-header">
        <span className="node-icon">{meta.icon}</span>
        <span className="node-type">{meta.label}</span>
        {isSuggested && <span className="node-badge">AI</span>}
        {node.status === 'done' && <span className="node-done">✓</span>}
      </div>
      <div className="node-text">{node.text}</div>
      {isSuggested && <div className="node-claim-hint">tap to keep</div>}
    </div>
  );
}
