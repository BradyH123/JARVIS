import React, { useState, useRef, useEffect } from 'react';

// Node types: 'prompt' (root), 'question', 'task', 'idea', 'celebration'
// Statuses: 'active' (pulsing), 'pending', 'done', 'answered', 'dismissed'

const TYPE_META = {
  prompt:       { icon: '🎯', label: 'Goal',  cls: 'node-prompt' },
  question:     { icon: '❓', label: 'Ask',   cls: 'node-question' },
  task:         { icon: '✋', label: 'Do',    cls: 'node-task' },
  idea:         { icon: '💡', label: 'Idea',  cls: 'node-idea' },
  celebration:  { icon: '🎉', label: 'Win',   cls: 'node-celebration' },
};

export default function CanvasNode({ node, isActive, onAnswer, onDone, onSkip, onAccept, onDismiss, registerEl }) {
  const [expanded, setExpanded] = useState(false);
  const [answer, setAnswer] = useState(node.answer || '');
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && registerEl) registerEl(node.id, ref.current);
  }, [node.id, registerEl]);

  const meta = TYPE_META[node.type] || TYPE_META.task;

  const submitAnswer = (e) => {
    e.preventDefault();
    if (!answer.trim()) return;
    onAnswer(node.id, answer.trim());
    setExpanded(false);
  };

  const pickOption = (opt) => {
    onAnswer(node.id, opt);
    setExpanded(false);
  };

  const collapsedClick = () => {
    if (node.status === 'done' || node.status === 'answered' || node.status === 'dismissed') return;
    if (node.type === 'celebration') return;
    setExpanded(true);
  };

  return (
    <div
      ref={ref}
      className={`node ${meta.cls} status-${node.status} ${isActive ? 'is-active' : ''} ${expanded ? 'is-expanded' : ''}`}
      style={{
        transform: `translate(-50%, -50%) translate(${node.x}px, ${node.y}px)`,
      }}
      onClick={!expanded ? collapsedClick : undefined}
    >
      <div className="node-header">
        <span className="node-icon">{meta.icon}</span>
        <span className="node-type">{meta.label}</span>
        {node.status === 'done' && <span className="node-done">✓</span>}
      </div>
      <div className="node-text">{node.text}</div>

      {node.answer && (
        <div className="node-answer">{node.answer}</div>
      )}

      {expanded && (
        <div className="node-actions" onClick={(e) => e.stopPropagation()}>
          {node.type === 'question' && node.options && (
            <div className="choices">
              {node.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className="choice"
                  onClick={() => pickOption(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
          {node.type === 'question' && !node.options && (
            <form onSubmit={submitAnswer} className="node-form">
              <input
                autoFocus
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer…"
              />
              <button type="submit" disabled={!answer.trim()}>Send</button>
            </form>
          )}
          {node.type === 'task' && (
            <div className="node-row">
              <button className="primary small" onClick={() => { onDone(node.id); setExpanded(false); }}>
                ✓ Done
              </button>
              <button className="ghost small" onClick={() => { onSkip(node.id); setExpanded(false); }}>
                Skip
              </button>
            </div>
          )}
          {node.type === 'idea' && (
            <div className="node-row">
              <button className="primary small" onClick={() => { onAccept(node.id); setExpanded(false); }}>
                Use this
              </button>
              <button className="ghost small" onClick={() => { onDismiss(node.id); setExpanded(false); }}>
                Dismiss
              </button>
            </div>
          )}
          <button
            type="button"
            className="link-back small-link"
            onClick={() => setExpanded(false)}
          >
            cancel
          </button>
        </div>
      )}
    </div>
  );
}
