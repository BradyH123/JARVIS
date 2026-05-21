import React, { useState, useRef, useEffect } from 'react';

function MessageMeta({ time, sender }) {
  return (
    <div className="msg-meta">
      <span className="msg-sender">{sender === 'ai' ? 'AI' : 'YOU'}</span>
      <span className="msg-dot">·</span>
      <span>{time}</span>
    </div>
  );
}

function StepCard({ step, onWhyThis }) {
  const agencyText =
    step.agency === 'ai'
      ? 'I do this'
      : step.agency === 'copilot'
      ? 'I draft, you react'
      : 'YOU do this';
  return (
    <div className="step-card">
      <div className="step-title">{step.title}</div>
      <div className="step-meta">
        <span>~{step.durationMin} min</span>
        <span className="step-meta-dot">·</span>
        <span className={`agency agency-${step.agency}`}>{agencyText}</span>
        {step.tool && (
          <>
            <span className="step-meta-dot">·</span>
            <span>{step.tool}</span>
          </>
        )}
      </div>
      {step.blurb && <div className="step-blurb">{step.blurb}</div>}
      <div className="step-actions">
        <button className="primary-btn">Start</button>
        <button className="ghost-btn">Skip</button>
        <button className="ghost-btn" onClick={onWhyThis}>
          Why this?
        </button>
        <button className="ghost-btn">Resize</button>
      </div>
    </div>
  );
}

function Stars({ value, onChange }) {
  return (
    <span className="stars" role="radiogroup" aria-label="rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={`star ${n <= value ? 'filled' : ''}`}
          onClick={() => onChange(n)}
          aria-label={`${n} stars`}
        >
          ★
        </button>
      ))}
    </span>
  );
}

function CritiqueInline({ critique }) {
  const [ratings, setRatings] = useState(critique.defaultRatings);
  const [note, setNote] = useState(critique.defaultNote || '');
  const [iterated, setIterated] = useState(false);

  if (iterated) {
    return (
      <div className="critique">
        <div className="critique-prompt">Trimmed the line. Try this:</div>
        <div className="option-card">
          <div className="option-label">Option B (v2)</div>
          <div className="option-body">
            {"if you've ever stared at a plain hat: that's the brief.\neach one drawn by hand. each one only made once.\n$58 to start. link below."
              .split('\n')
              .map((line, i) => (
                <div key={i}>{line || ' '}</div>
              ))}
          </div>
        </div>
        <div className="critique-aside">
          I also updated my notes about you: <em>prefers earned confidence over claims about craft.</em>{' '}
          I'll lean into that.
        </div>
        <div className="rating-row">
          <Stars value={5} onChange={() => {}} />
          <button className="primary-btn small">Use it</button>
          <button className="ghost-btn small">One more pass</button>
        </div>
      </div>
    );
  }

  return (
    <div className="critique">
      {critique.options.map((opt) => (
        <div key={opt.id} className="option-card">
          <div className="option-label">{opt.label}</div>
          <div className="option-body">
            {opt.body.split('\n').map((line, i) => (
              <div key={i}>{line || ' '}</div>
            ))}
          </div>
          <div className="rating-row">
            <span className="rating-label">{opt.label.slice(-1)}:</span>
            <Stars
              value={ratings[opt.id]}
              onChange={(v) => setRatings({ ...ratings, [opt.id]: v })}
            />
          </div>
        </div>
      ))}
      <div className="critique-prompt" style={{ marginTop: 10 }}>
        Notes (optional):
      </div>
      <textarea
        className="critique-input"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="rating-row" style={{ marginTop: 8 }}>
        <button className="primary-btn small" onClick={() => setIterated(true)}>
          Iterate B with notes
        </button>
        <button className="ghost-btn small">Use B as-is</button>
      </div>
    </div>
  );
}

function MessageBlock({ msg, onWhyThis }) {
  const isYou = msg.sender === 'you';
  return (
    <div className={`msg-block ${isYou ? 'msg-block-you' : 'msg-block-ai'}`}>
      <MessageMeta time={msg.time} sender={msg.sender} />
      {msg.body && (
        <div className={`msg ${isYou ? 'msg-you' : 'msg-ai'}`}>
          {msg.body}
          {msg.actions && (
            <div className="msg-action-row">
              {msg.actions.map((a, i) => (
                <button key={i} className="text-btn">
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {msg.critique && <CritiqueInline critique={msg.critique} />}
      {msg.step && <StepCard step={msg.step} onWhyThis={() => onWhyThis(msg.step)} />}
    </div>
  );
}

function WhyThisOverlay({ step, onClose }) {
  if (!step) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Why this step?</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="modal-step-title">{step.title}</div>
          <ul className="why-list">
            {step.whyThis.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <div className="leverages-label">Leverages from your Situation:</div>
          <div className="leverage-chips">
            {step.leverages.map((l, i) => (
              <span key={i} className="chip">
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ChatSurface({ messages }) {
  const [whyStep, setWhyStep] = useState(null);
  const [input, setInput] = useState('');
  const threadRef = useRef(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, []);

  // Group messages by day for dividers
  const groups = [];
  let lastDay = null;
  messages.forEach((m) => {
    if (m.day !== lastDay) {
      groups.push({ type: 'divider', day: m.day });
      lastDay = m.day;
    }
    groups.push({ type: 'msg', msg: m });
  });

  return (
    <div className="chat-region">
      <div className="chat-thread" ref={threadRef}>
        <div className="chat-thread-inner">
          {groups.map((g, i) =>
            g.type === 'divider' ? (
              <div key={`d-${i}`} className="day-divider">
                — {g.day} —
              </div>
            ) : (
              <MessageBlock
                key={g.msg.id}
                msg={g.msg}
                onWhyThis={(step) => setWhyStep(step)}
              />
            ),
          )}
        </div>
      </div>
      <div className="input-bar">
        <div className="input-bar-inner">
          <textarea
            className="input-field"
            placeholder="Type a message..."
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="send-btn" aria-label="Send">
            ↑
          </button>
        </div>
      </div>
      <WhyThisOverlay step={whyStep} onClose={() => setWhyStep(null)} />
    </div>
  );
}
