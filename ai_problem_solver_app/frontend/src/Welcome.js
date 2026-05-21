import React from 'react';
import coach from './coach';

export default function Welcome({ onBegin }) {
  return (
    <div className="screen">
      <div className="welcome">
        <div className="welcome-eyebrow">{coach.greeting()}</div>
        <h1 className="welcome-title">
          I'm your assistant.<br />
          I keep you moving.
        </h1>
        <p className="welcome-sub">
          Before anything else: let's empty your head. Everything you're
          carrying — work, life, the thing you keep avoiding — out of your
          brain and onto the canvas. I'll sort it, then we'll pick what to win
          today.
        </p>
        <button className="primary big" onClick={onBegin}>
          Start brain dump →
        </button>
        <p className="welcome-fine">
          Takes 2 minutes. Future-you will thank you.
        </p>
      </div>
    </div>
  );
}
