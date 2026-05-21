import React, { useState } from 'react';

export default function ProblemInput({ onSubmit, onBrainDump }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState('problem');

  const submit = (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 3) return;
    if (mode === 'dump') {
      onBrainDump(trimmed);
    } else {
      onSubmit(trimmed);
    }
  };

  const isDump = mode === 'dump';

  return (
    <div className="screen">
      <div className="welcome">
        <div className="welcome-eyebrow">Let's get you moving.</div>
        <h1 className="welcome-title">
          {isDump ? 'What\'s in your head?' : 'What do you want to work on?'}
        </h1>
        <p className="welcome-sub">
          {isDump
            ? 'Dump everything you\'re carrying. One per line. Don\'t think — just type. I\'ll sort it into Now / Later / Trash for you.'
            : 'A task, a problem, a goal, a thing you have been avoiding. Type it however it lives in your head. I will help you break it down.'}
        </p>

        <div className="mode-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            className={`mode-tab ${!isDump ? 'mode-tab-active' : ''}`}
            onClick={() => setMode('problem')}
          >
            🎯 One thing
          </button>
          <button
            type="button"
            role="tab"
            className={`mode-tab ${isDump ? 'mode-tab-active' : ''}`}
            onClick={() => setMode('dump')}
          >
            🧠 Brain dump
          </button>
        </div>

        <form onSubmit={submit} className="welcome-form">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              isDump
                ? 'Pay the credit card bill\nReply to mom\'s text\nFigure out summer plans\nFinish the chemistry lab\nClean the kitchen\n...'
                : 'e.g. I am staring at my chemistry homework and have no idea where to start...'
            }
            rows={isDump ? 9 : 5}
          />
          <button type="submit" disabled={text.trim().length < 3}>
            {isDump ? 'Sort it for me →' : 'Help me start →'}
          </button>
        </form>

        {!isDump && (
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
        )}
      </div>
    </div>
  );
}
