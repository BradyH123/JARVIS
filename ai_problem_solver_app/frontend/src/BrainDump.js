import React from 'react';
import coach from './coach';

// Triage view: take the brain dump, show Now/Later/Trash columns,
// each Now item gets a 1-sentence actionable next step. Tapping a Now
// item drops the user straight into focus mode for that item.

export default function BrainDump({ rawText, onPick, onBack }) {
  const buckets = coach.triageDump(rawText);
  const hasNow = buckets.now.length > 0;

  return (
    <div className="screen">
      <div className="braindump">
        <button className="link-back" onClick={onBack}>
          ← back
        </button>
        <h2>Here's what's in your head.</h2>
        <p className="clarify-sub">
          I sorted it. Pick a <strong>Now</strong> item and we'll start. The
          rest will be here when you come back.
        </p>

        <div className="bucket-row">
          <section className="bucket bucket-now">
            <header className="bucket-header">
              <span className="bucket-title">🔥 Now</span>
              <span className="bucket-count">{buckets.now.length}</span>
            </header>
            {hasNow ? (
              <ul className="bucket-list">
                {buckets.now.map((item, i) => (
                  <li key={i} className="bucket-item bucket-item-now">
                    <div className="bucket-item-text">{item}</div>
                    <div className="bucket-item-next">
                      → {coach.actionableNextStep(item)}
                    </div>
                    <button
                      className="primary small"
                      onClick={() => onPick(item)}
                    >
                      Start this one
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="bucket-empty">
                Nothing screamed "urgent." Pick one from Later if you want to
                move on something.
              </p>
            )}
          </section>

          <section className="bucket bucket-later">
            <header className="bucket-header">
              <span className="bucket-title">⏳ Later</span>
              <span className="bucket-count">{buckets.later.length}</span>
            </header>
            <ul className="bucket-list">
              {buckets.later.map((item, i) => (
                <li key={i} className="bucket-item">
                  <div className="bucket-item-text">{item}</div>
                  <button
                    className="ghost small"
                    onClick={() => onPick(item)}
                  >
                    Do this one anyway
                  </button>
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
              {buckets.trash.map((item, i) => (
                <li key={i} className="bucket-item bucket-item-trash">
                  <div className="bucket-item-text">{item}</div>
                </li>
              ))}
              {buckets.trash.length === 0 && (
                <p className="bucket-empty">Nothing obviously fluff.</p>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
