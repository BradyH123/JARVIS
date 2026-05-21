import React, { useState } from 'react';
import coach from './coach';

export default function BrainDump({ initialText, onComplete, onBack }) {
  const [text, setText] = useState(initialText || '');
  const [showTriage, setShowTriage] = useState(false);

  const buckets = showTriage ? coach.triageDump(text) : null;

  const submit = (e) => {
    e.preventDefault();
    if (text.trim().split(/[\n•]+/).filter((s) => s.trim()).length < 1) return;
    setShowTriage(true);
  };

  const confirm = () => {
    onComplete({ rawText: text, buckets });
  };

  if (showTriage) {
    return (
      <div className="screen">
        <div className="braindump">
          <button className="link-back" onClick={() => setShowTriage(false)}>
            ← edit dump
          </button>
          <h2>Here's what I see in your head.</h2>
          <p className="clarify-sub">
            I split it into Now / Later / Trash. We'll pull from the Now list
            for today's focus.
          </p>

          <div className="bucket-row">
            <section className="bucket bucket-now">
              <header className="bucket-header">
                <span className="bucket-title">🔥 Now</span>
                <span className="bucket-count">{buckets.now.length}</span>
              </header>
              <ul className="bucket-list">
                {buckets.now.map((it, i) => (
                  <li key={i} className="bucket-item bucket-item-now">
                    <div className="bucket-item-text">{it}</div>
                    <div className="bucket-item-next">
                      → {coach.actionableNextStep(it)}
                    </div>
                  </li>
                ))}
                {buckets.now.length === 0 && (
                  <p className="bucket-empty">
                    Nothing urgent. That's a win on its own.
                  </p>
                )}
              </ul>
            </section>
            <section className="bucket bucket-later">
              <header className="bucket-header">
                <span className="bucket-title">⏳ Later</span>
                <span className="bucket-count">{buckets.later.length}</span>
              </header>
              <ul className="bucket-list">
                {buckets.later.map((it, i) => (
                  <li key={i} className="bucket-item">
                    <div className="bucket-item-text">{it}</div>
                  </li>
                ))}
                {buckets.later.length === 0 && (
                  <p className="bucket-empty">Empty.</p>
                )}
              </ul>
            </section>
            <section className="bucket bucket-trash">
              <header className="bucket-header">
                <span className="bucket-title">🗑️ Trash</span>
                <span className="bucket-count">{buckets.trash.length}</span>
              </header>
              <ul className="bucket-list">
                {buckets.trash.map((it, i) => (
                  <li key={i} className="bucket-item bucket-item-trash">
                    <div className="bucket-item-text">{it}</div>
                  </li>
                ))}
                {buckets.trash.length === 0 && (
                  <p className="bucket-empty">Nothing fluff.</p>
                )}
              </ul>
            </section>
          </div>

          <div className="clarify-actions">
            <button className="ghost" onClick={() => setShowTriage(false)}>
              Add more
            </button>
            <button className="primary" onClick={confirm}>
              Looks right — pick today's win →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div className="welcome">
        {onBack && (
          <button className="link-back" onClick={onBack}>
            ← back
          </button>
        )}
        <div className="welcome-eyebrow">Brain dump</div>
        <h1 className="welcome-title">Empty your head.</h1>
        <p className="welcome-sub">
          Everything you're carrying. One per line. Don't think — just type.
          I'll sort it.
        </p>
        <form onSubmit={submit} className="welcome-form">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              'Pay the credit card bill\nReply to mom\'s text\nFigure out summer plans\nFinish the chemistry lab\nClean the kitchen\nMaybe learn guitar someday\n...'
            }
            rows={12}
          />
          <button type="submit" disabled={text.trim().length < 3}>
            Sort it →
          </button>
        </form>
      </div>
    </div>
  );
}
