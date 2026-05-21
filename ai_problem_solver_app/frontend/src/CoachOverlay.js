import React, { useEffect, useState } from 'react';

// A persistent overlay that always presents one prompt to the user.
// Positioned as a bottom sheet on mobile and a right rail on desktop.

export default function CoachOverlay({ prompt, onAnswer, onSkip }) {
  const [value, setValue] = useState('');
  const [collapsed, setCollapsed] = useState(false);

  // Reset input when the prompt changes
  useEffect(() => {
    setValue('');
  }, [prompt && prompt.id]);

  if (!prompt) return null;

  const send = () => {
    const v = value.trim();
    if (!v) return;
    onAnswer(v);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={`coach-overlay ${collapsed ? 'collapsed' : ''}`}>
      <button
        className="coach-collapse"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={collapsed ? 'Open coach' : 'Minimize coach'}
      >
        <span className="coach-grip" />
      </button>

      <div className="coach-header">
        <div className="coach-avatar">●</div>
        <div className="coach-title">Coach</div>
        {prompt.referencingNodeId && (
          <div className="coach-pointing" title="See the highlighted node">
            ↗ referencing your map
          </div>
        )}
      </div>

      <div className="coach-body">
        <div className="coach-prompt">{prompt.text}</div>
        {prompt.hint && <div className="coach-hint">{prompt.hint}</div>}

        {prompt.type === 'open' && (
          <div className="coach-input-row">
            <input
              autoFocus
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type your answer…"
            />
            <button className="primary" onClick={send} disabled={!value.trim()}>
              Send
            </button>
          </div>
        )}

        {prompt.type === 'open-or-skip' && (
          <>
            <div className="coach-input-row">
              <input
                autoFocus
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Type to add — or tap skip…"
              />
              <button className="primary" onClick={send} disabled={!value.trim()}>
                Send
              </button>
            </div>
            <button className="ghost small coach-skip" onClick={onSkip}>
              skip — my map feels complete
            </button>
          </>
        )}

        {(prompt.type === 'choice' || prompt.type === 'confirm') && (
          <div className="coach-choices">
            {prompt.options.map((opt) => (
              <button
                key={opt.value}
                className="coach-choice"
                onClick={() => onAnswer(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
