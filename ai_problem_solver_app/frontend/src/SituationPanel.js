import React, { useState } from 'react';
import { mockSituation, mockJamie } from './mockData';

function WidgetHeader({ children, badge }) {
  return (
    <div className="widget-header">
      <span>{children}</span>
      {badge != null && badge > 0 && (
        <span className="widget-badge">{badge} pending</span>
      )}
    </div>
  );
}

function WidgetRows({ rows }) {
  return (
    <div className="widget-rows">
      {rows.map(([k, v], i) => (
        <div className="widget-row" key={i}>
          <span className="widget-row-label">{k}</span>
          <span className="widget-row-value">{v}</span>
        </div>
      ))}
    </div>
  );
}

function ActivityRow({ date, body, actor, tag }) {
  return (
    <div className="activity-row">
      <div className="activity-date">{date}</div>
      <div className="activity-body">
        {body}
        {tag && <span className="activity-tag"> · {tag}</span>}
      </div>
      {actor && <div className="activity-actor">{actor}</div>}
    </div>
  );
}

function TimeEnergyWidget({ data, onOpenTray }) {
  return (
    <div className="widget">
      <WidgetHeader badge={data.pendingCount}>Time & energy</WidgetHeader>
      <div className="widget-summary">{data.summary}</div>
      <WidgetRows rows={data.rows} />
      <div className="widget-subhead">— On the calendar —</div>
      {data.calendar.map((c, i) => (
        <ActivityRow
          key={i}
          date={`${c.day} ${c.time}`}
          body={c.what}
          actor={c.byAi ? 'AI-scheduled' : 'you set'}
        />
      ))}
      {data.pendingCount > 0 && (
        <div className="pending-banner" onClick={onOpenTray}>
          <span>{data.pendingCount} pending event the AI wants to add</span>
          <span className="pending-arrow">→</span>
        </div>
      )}
    </div>
  );
}

function SkillsToolkitWidget({ data, onOpenTray }) {
  return (
    <div className="widget">
      <WidgetHeader badge={data.pendingCount}>Skills & toolkit</WidgetHeader>
      <div className="chip-row">
        <span className="chip-label">Strong</span>
        {data.strong.map((s) => (
          <span key={s} className="chip chip-strong">
            {s}
          </span>
        ))}
      </div>
      <div className="chip-row">
        <span className="chip-label">Growing</span>
        {data.growing.map((s) => (
          <span key={s} className="chip chip-growing">
            {s}
          </span>
        ))}
      </div>
      <div className="chip-row">
        <span className="chip-label">Weak</span>
        {data.weak.map((s) => (
          <span key={s} className="chip chip-weak">
            {s}
          </span>
        ))}
      </div>
      <div className="widget-subhead" style={{ marginTop: 14 }}>
        — Toolkit —
      </div>
      <div className="toolkit-list">
        {data.toolkit.map((t) => (
          <span key={t} className="toolkit-item">
            {t}
          </span>
        ))}
      </div>
      <div className="widget-subhead" style={{ marginTop: 12 }}>
        — In use —
      </div>
      {data.activity.map((a, i) => (
        <ActivityRow key={i} date={a.date} body={a.what} actor={a.tool} />
      ))}
      {data.pendingCount > 0 && (
        <div className="pending-banner" onClick={onOpenTray}>
          <span>{data.pendingCount} pending: AI wants to queue IG posts</span>
          <span className="pending-arrow">→</span>
        </div>
      )}
    </div>
  );
}

function FinancesWidget({ data, onOpenTray }) {
  return (
    <div className="widget">
      <WidgetHeader badge={data.pendingPurchase ? 1 : 0}>Finances</WidgetHeader>
      <WidgetRows rows={data.rows} />
      <div className="widget-subhead">— Money out —</div>
      {data.moneyOut.map((m, i) => (
        <ActivityRow
          key={i}
          date={m.date}
          body={m.what}
          actor={m.actor === 'ai' ? 'AI filed' : 'you bought'}
          tag={m.amount}
        />
      ))}
      <div className="widget-subhead">— Money in —</div>
      <div className="empty-state">— no sales yet —</div>
      {data.pendingPurchase && (
        <div className="pending-banner" onClick={onOpenTray}>
          <span>
            1 pending purchase: {data.pendingPurchase.name} ({data.pendingPurchase.amount})
          </span>
          <span className="pending-arrow">→</span>
        </div>
      )}
    </div>
  );
}

function NetworkWidget({ data, onOpenPerson, onOpenTray }) {
  return (
    <div className="widget">
      <WidgetHeader badge={data.pendingOutreach}>Network</WidgetHeader>
      <div className="widget-subhead">— People —</div>
      {data.people.map((p) => (
        <div
          key={p.id}
          className="asset-card"
          onClick={() => onOpenPerson(p.id)}
        >
          <div className="asset-card-header">
            <span className="asset-name">{p.name}</span>
            <span className="asset-tag">{p.tag}</span>
          </div>
          <div className="asset-status">
            {p.lastTouched} · {p.status}
          </div>
          {p.preview && <div className="asset-preview">{p.preview}</div>}
        </div>
      ))}
      {data.pendingOutreach > 0 && (
        <div className="pending-banner" onClick={onOpenTray}>
          <span>{data.pendingOutreach} pending outreach the AI wants to send</span>
          <span className="pending-arrow">→</span>
        </div>
      )}
    </div>
  );
}

function GoalIntelWidget({ data, onOpenTray }) {
  return (
    <div className="widget">
      <WidgetHeader badge={data.pendingPosts}>Goal intel · Hat business</WidgetHeader>
      <div className="widget-subhead">— Audience candidates —</div>
      {data.audienceCandidates.map((a, i) => (
        <div key={i} className="audience-row">
          <span className="audience-dot">·</span>
          <span>{a.label}</span>
          <span className="audience-tag">({a.tag})</span>
        </div>
      ))}
      <div className="widget-rows" style={{ marginTop: 10 }}>
        <div className="widget-row">
          <span className="widget-row-label">Price band</span>
          <span className="widget-row-value">{data.priceBand}</span>
        </div>
        <div className="widget-row">
          <span className="widget-row-label">Comp shops studied</span>
          <span className="widget-row-value">{data.compShopsStudied}</span>
        </div>
      </div>
      <div className="risk-flag">
        <span className="risk-label">Risk flag:</span> {data.riskFlag}
      </div>
      <div className="widget-subhead" style={{ marginTop: 14 }}>
        — In the world —
      </div>
      {data.outbound.map((o, i) => (
        <div key={i} className="outbound-card">
          <div className="outbound-header">
            <span className="outbound-date">{o.date}</span>
            <span className="outbound-what">{o.what}</span>
          </div>
          <div className="outbound-stats">{o.stats}</div>
          <div className="outbound-signal">→ {o.signal}</div>
        </div>
      ))}
      {data.pendingPosts > 0 && (
        <div className="pending-banner" onClick={onOpenTray}>
          <span>{data.pendingPosts} draft posts ready for next week</span>
          <span className="pending-arrow">→</span>
        </div>
      )}
    </div>
  );
}

function PersonDetail({ person, onClose }) {
  return (
    <div className="drill" onClick={onClose}>
      <div className="drill-inner" onClick={(e) => e.stopPropagation()}>
        <div className="drill-header">
          <button className="drill-back" onClick={onClose}>
            ← Back
          </button>
          <div className="drill-title">
            Network / {person.name}
          </div>
        </div>
        <div className="drill-body">
          <div className="person-summary">
            <div className="person-name-large">{person.name}</div>
            <div className="person-tag-line">{person.tag}</div>
            <div className="person-meta-row">
              <span>Best contact: <strong>{person.bestContact}</strong></span>
              <span className="dot">·</span>
              <span>{person.relationship}</span>
              <span className="dot">·</span>
              <span>{person.owes}</span>
            </div>
          </div>

          <div className="drill-subhead">— Thread —</div>
          {person.thread.map((t, i) => (
            <div
              key={i}
              className={`thread-msg thread-msg-${t.actor === 'you' ? 'you' : 'them'}`}
            >
              <div className="thread-msg-meta">
                {t.when} · {t.actor === 'you' ? 'YOU' : person.name.toUpperCase()}
              </div>
              <div className="thread-msg-body">
                {t.body.split('\n').map((line, j) => (
                  <div key={j}>{line || ' '}</div>
                ))}
              </div>
              {t.draftedByAi && (
                <div className="drafted-by-ai">drafted by AI, you sent</div>
              )}
            </div>
          ))}

          <div className="drill-subhead">— Waiting —</div>
          <div className="upcoming-card">
            <div className="upcoming-when">
              {person.upcoming.when} · {person.upcoming.what}
            </div>
            <div className="upcoming-where">{person.upcoming.where}</div>
            <div className="upcoming-actions">
              <button className="text-btn">Add prep notes</button>
              <button className="text-btn">Reschedule</button>
            </div>
          </div>

          <div className="drill-subhead">— AI notes about {person.name} —</div>
          <ul className="notes-list">
            {person.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function SituationPanel({ onClose, onOpenTray }) {
  const [openPersonId, setOpenPersonId] = useState(null);
  const openPerson = openPersonId === 'jamie' ? mockJamie : null;

  return (
    <div className="panel-region">
      <div className="panel-header">
        <div className="panel-title">Situation</div>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>
      <div className="panel-body">
        <TimeEnergyWidget data={mockSituation.timeEnergy} onOpenTray={onOpenTray} />
        <SkillsToolkitWidget data={mockSituation.skillsToolkit} onOpenTray={onOpenTray} />
        <FinancesWidget data={mockSituation.finances} onOpenTray={onOpenTray} />
        <NetworkWidget
          data={mockSituation.network}
          onOpenPerson={(id) => setOpenPersonId(id)}
          onOpenTray={onOpenTray}
        />
        <GoalIntelWidget data={mockSituation.goalIntel} onOpenTray={onOpenTray} />
      </div>
      {openPerson && (
        <PersonDetail person={openPerson} onClose={() => setOpenPersonId(null)} />
      )}
    </div>
  );
}
