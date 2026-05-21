import React, { useState } from 'react';
import coach from './coach';

export default function DailyCheckIn({ buckets, onSubmit, onSkipDump }) {
  const [goal, setGoal] = useState('');
  const [energy, setEnergy] = useState('');
  const [timebox, setTimebox] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (!goal.trim()) return;
    onSubmit({ goal: goal.trim(), energy, timebox });
  };

  const pick = (item) => setGoal(item);

  return (
    <div className="screen">
      <div className="checkin">
        <div className="welcome-eyebrow">{coach.greeting()}</div>
        <h1 className="welcome-title">What's the ONE thing you want to win today?</h1>
        <p className="welcome-sub">
          Pick from your Now list, or type something fresh. Small is fine —
          done is better than ambitious.
        </p>

        {buckets && buckets.now.length > 0 && (
          <div className="now-pick">
            <div className="now-pick-label">From your brain dump:</div>
            <div className="now-pick-row">
              {buckets.now.slice(0, 6).map((it, i) => (
                <button
                  key={i}
                  type="button"
                  className={`chip ${goal === it ? 'chip-active' : ''}`}
                  onClick={() => pick(it)}
                >
                  {it}
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={submit} className="welcome-form">
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="e.g. Finish the lab report. Or: Have a real conversation with Sam."
            rows={3}
          />

          <div className="checkin-meta">
            <div className="checkin-meta-block">
              <div className="checkin-meta-label">Energy right now?</div>
              <div className="choices">
                {['🔋 Low', '⚡ Medium', '🚀 High'].map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    className={`choice ${energy === opt ? 'choice-active' : ''}`}
                    onClick={() => setEnergy(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <div className="checkin-meta-block">
              <div className="checkin-meta-label">Time to give it?</div>
              <div className="choices">
                {['15 min', '30 min', '1 hr', '2+ hrs'].map((opt) => (
                  <button
                    type="button"
                    key={opt}
                    className={`choice ${timebox === opt ? 'choice-active' : ''}`}
                    onClick={() => setTimebox(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button type="submit" disabled={!goal.trim()}>
            Open the canvas →
          </button>
        </form>

        {onSkipDump && (
          <button className="link-back" onClick={onSkipDump} style={{ marginTop: 18 }}>
            ← re-do the brain dump
          </button>
        )}
      </div>
    </div>
  );
}
