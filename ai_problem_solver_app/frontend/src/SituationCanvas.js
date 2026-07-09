import React from 'react';
import { situation } from './mockData';

function MoneyWidget({ data }) {
  const { spent, pending, budget, pricePerSale, transactions, pendingItems } = data;
  const remaining = budget - spent - pending;
  const pctSpent = (spent / budget) * 100;
  const pctPending = (pending / budget) * 100;
  return (
    <section className="w-money">
      <div className="w-money-head">
        <span className="w-money-eyebrow">MONEY</span>
        <span className="w-money-target">→ sale = ${pricePerSale.low}–${pricePerSale.high}</span>
      </div>
      <div className="w-money-big">
        <span className="w-money-spent">${spent}</span>
        <span className="w-money-of">of ${budget}</span>
      </div>
      <div className="w-money-bar">
        <div className="w-money-bar-spent" style={{ width: `${pctSpent}%` }} />
        <div className="w-money-bar-pending" style={{ width: `${pctPending}%` }} />
      </div>
      <div className="w-money-row">
        <span className="dot dot-out" /> spent
        <span className="dot dot-pend" /> pending ${pending}
        <span className="w-money-left">${remaining} left</span>
      </div>
      <div className="w-money-ledger">
        {transactions.map((t, i) => (
          <div className="ledger-row" key={i}>
            <span className="ledger-when">{t.when}</span>
            <span className="ledger-label">{t.label}</span>
            <span className="ledger-amount">−${Math.abs(t.amount)}</span>
          </div>
        ))}
        {pendingItems.map((t, i) => (
          <div className="ledger-row ledger-pending" key={`p-${i}`}>
            <span className="ledger-when">pending</span>
            <span className="ledger-label">{t.label}</span>
            <span className="ledger-amount">−${Math.abs(t.amount)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RiskCallout({ risk }) {
  return (
    <section className="w-risk">
      <div className="w-risk-head">
        <span className="w-risk-icon">⚠</span>
        <span className="w-risk-tag">RISK · high</span>
      </div>
      <h2 className="w-risk-title">{risk.title}</h2>
      <p className="w-risk-why">{risk.why}</p>
      <div className="w-risk-fix">
        <span className="fix-arrow">↳</span> addressed by <strong>{risk.addressedBy}</strong>
      </div>
    </section>
  );
}

function YouWidget({ data }) {
  const grouped = {
    strong: data.skills.filter((s) => s.strength === 'strong'),
    growing: data.skills.filter((s) => s.strength === 'growing'),
    weak: data.skills.filter((s) => s.strength === 'weak'),
  };
  return (
    <section className="w-you">
      <header className="w-you-head">
        <span className="w-you-tag">YOU</span>
        <span className="w-you-sub">what you bring to this goal</span>
      </header>
      <div className="skill-row">
        <span className="skill-bucket">strong</span>
        <div className="skill-chips">
          {grouped.strong.map((s) => (
            <span key={s.name} className="skill skill-strong">{s.name}</span>
          ))}
        </div>
      </div>
      <div className="skill-row">
        <span className="skill-bucket">growing</span>
        <div className="skill-chips">
          {grouped.growing.map((s) => (
            <span key={s.name} className="skill skill-growing">{s.name}</span>
          ))}
        </div>
      </div>
      <div className="skill-row">
        <span className="skill-bucket">weak</span>
        <div className="skill-chips">
          {grouped.weak.map((s) => (
            <span key={s.name} className="skill skill-weak">
              {s.warn && <span className="warn">⚠</span>} {s.name}
            </span>
          ))}
        </div>
      </div>
      <div className="w-you-rule" />
      <div className="w-you-line">
        <span className="dim">tools</span> {data.tools.join(' · ')}
      </div>
      <div className="w-you-line">
        <span className="dim">time</span> {data.time}
      </div>
    </section>
  );
}

function PersonCard({ p }) {
  if (p.importance === 'high') {
    return (
      <article className="w-person w-person-big">
        <div className="w-person-avatar">{p.initial}</div>
        <div className="w-person-body">
          <div className="w-person-name">{p.name}</div>
          <div className="w-person-role">{p.role}</div>
          <div className="w-person-note">"{p.note}"</div>
          {p.tag && <div className="w-person-tag">{p.tag}</div>}
        </div>
      </article>
    );
  }
  return (
    <article className={`w-person-line ${p.importance === 'pending' ? 'w-person-line-pending' : ''}`}>
      <span className="w-person-line-avatar">{p.initial}</span>
      <span className="w-person-line-name">{p.name}</span>
      <span className="w-person-line-role">· {p.role}</span>
      {p.tag && <span className="w-person-line-tag">{p.tag}</span>}
    </article>
  );
}

function EtsyBlock({ p }) {
  return (
    <section className="w-platform w-etsy">
      <header className="w-etsy-head">
        <span className="w-etsy-name">Etsy</span>
        <span className="w-etsy-handle">{p.handle}</span>
      </header>
      <div className="w-etsy-grid">
        {Array.from({ length: p.thumbnails }).map((_, i) => (
          <div key={i} className="w-etsy-thumb">▢</div>
        ))}
      </div>
      <div className="w-etsy-stats">
        {p.stats.map((s) => (
          <div className="w-etsy-stat" key={s.label}>
            <span className="stat-val">{s.value}</span>
            <span className="stat-lbl">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function IGBlock({ p }) {
  return (
    <section className="w-platform w-ig">
      <header className="w-ig-head">
        <div className="w-ig-grad" style={{ background: p.accent }} />
        <span className="w-ig-handle">{p.handle}</span>
        <span className="w-ig-followers">412 followers</span>
      </header>
      <div className="w-ig-post">
        <div className="w-ig-thumb">▢</div>
        <div className="w-ig-meta">
          <div className="w-ig-caption">launch post · "first 3 hats up on etsy!"</div>
          <div className="w-ig-stats">♥ 47   👤 +6 followers from this</div>
        </div>
      </div>
      <div className="w-ig-audience">{p.note}</div>
    </section>
  );
}

function IntelBlock({ data }) {
  return (
    <section className="w-intel">
      <header className="w-intel-head">
        <span className="w-intel-tag">NOTES</span>
        <span className="w-intel-title">{data.title}</span>
        <span className="w-intel-when">{data.when}</span>
      </header>
      <ul className="w-intel-list">
        {data.bullets.map((b, i) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </section>
  );
}

function PendingCard({ p }) {
  return (
    <article className="w-pending">
      <span className="w-pending-tag">DECIDE</span>
      <h3 className="w-pending-title">{p.title}</h3>
      <p className="w-pending-why">{p.why}</p>
      <div className="w-pending-actions">
        {p.actions.map((a, i) => (
          <button key={i} className={i === 0 ? 'btn-primary' : 'btn-ghost'}>
            {a}
          </button>
        ))}
      </div>
    </article>
  );
}

export default function SituationCanvas() {
  const s = situation;
  return (
    <div className="situation-canvas">
      <MoneyWidget data={s.money} />

      {s.risks.map((r) => (
        <RiskCallout key={r.id} risk={r} />
      ))}

      <YouWidget data={s.you} />

      <div className="section-rule">
        <span>NETWORK</span>
      </div>
      {s.people
        .filter((p) => p.importance === 'high')
        .map((p) => (
          <PersonCard key={p.id} p={p} />
        ))}
      <div className="person-lines">
        {s.people
          .filter((p) => p.importance !== 'high')
          .map((p) => (
            <PersonCard key={p.id} p={p} />
          ))}
      </div>

      <div className="section-rule">
        <span>IN THE WORLD</span>
      </div>
      {s.platforms.map((p) =>
        p.id === 'etsy' ? <EtsyBlock key={p.id} p={p} /> : <IGBlock key={p.id} p={p} />,
      )}

      <IntelBlock data={s.intel} />

      <div className="section-rule">
        <span>AWAITING YOU</span>
      </div>
      {s.pending.map((p) => (
        <PendingCard key={p.id} p={p} />
      ))}

      <div className="canvas-tail">
        Workflow canvas — coming next.
      </div>
    </div>
  );
}
