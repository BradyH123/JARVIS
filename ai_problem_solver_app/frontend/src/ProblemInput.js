import React, { useState } from 'react';

export default function ProblemInput({ onSubmit }) {
  const [text, setText] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    onSubmit(trimmed);
  };

  return (
    <div className="screen">
      <div className="welcome">
        <div className="welcome-eyebrow">Let's get you moving.</div>
        <h1 className="welcome-title">What do you want to work on?</h1>
        <p className="welcome-sub">
          A task, a problem, a goal, a thing you have been avoiding. Type it
          however it lives in your head. I will help you break it down.
        </p>
        <form onSubmit={submit} className="welcome-form">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. I need to write an essay on the French Revolution and I have no idea where to start..."
            rows={5}
          />
          <button type="submit" disabled={text.trim().length < 3}>
            Help me start →
          </button>
        </form>
        <div className="welcome-examples">
          <span>Try:</span>
          {[
            'Clean my bedroom',
            'Study for my biology exam',
            'Write a short story',
            'Decide whether to switch jobs',
          ].map((ex) => (
            <button
              key={ex}
              type="button"
              className="chip"
              onClick={() => setText(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
