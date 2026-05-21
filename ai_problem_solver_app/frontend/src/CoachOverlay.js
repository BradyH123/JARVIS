import React, { useEffect, useState } from 'react';

export default function CoachOverlay({ prompt, onAnswer, onSkip }) {
  const [value, setValue] = useState('');
  const [showOther, setShowOther] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setValue('');
    setShowOther(false);
  }, [prompt && prompt.id]);

  if (!prompt) return null;

  const send = () => {
    const v = value.trim();
    if (!v) return;
    onAnswer(v);
  };
  const sendOther = () => {
    const v = value.trim();
    if (!v) return;
    onAnswer('__other:' + v);
  };

  const onKeyDown = (e, isOther) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      isOther ? sendOther() : send();
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
        {prompt.phase && (
          <div className="coach-phase">{phaseLabel(prompt.phase)}</div>
        )}
        {prompt.referencingNodeId && (
          <div className="coach-pointing" title="See the highlighted node">
            ↗ pointing at your map
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
              onKeyDown={(e) => onKeyDown(e, false)}
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
                onKeyDown={(e) => onKeyDown(e, false)}
                placeholder="Type to add — or skip…"
              />
              <button className="primary" onClick={send} disabled={!value.trim()}>
                Send
              </button>
            </div>
            <button className="ghost small coach-skip" onClick={onSkip}>
              {prompt.skipLabel || 'skip'}
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

        {prompt.type === 'choice-with-other' && (
          <>
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
              <button
                className="coach-choice coach-choice-other"
                onClick={() => {
                  if (prompt.otherValue) {
                    onAnswer(prompt.otherValue);
                  } else {
                    setShowOther((s) => !s);
                  }
                }}
              >
                {prompt.otherLabel || 'Something else'}
              </button>
            </div>
            {showOther && !prompt.otherValue && (
              <div className="coach-input-row">
                <input
                  autoFocus
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => onKeyDown(e, true)}
                  placeholder="Type today's focus…"
                />
                <button className="primary" onClick={sendOther} disabled={!value.trim()}>
                  Use this
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function phaseLabel(p) {
  switch (p) {
    case 'dump':    return 'dump';
    case 'pick':    return 'pick focus';
    case 'expand':  return 'expand';
    case 'drill':   return 'drill in';
    case 'execute': return 'execute';
    case 'loop':    return 'loop';
    case 'wrap':    return 'wrap';
    default: return p;
  }
}
