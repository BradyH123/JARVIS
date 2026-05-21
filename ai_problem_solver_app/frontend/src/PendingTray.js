import React from 'react';
import { mockPending } from './mockData';

export default function PendingTray({ onClose }) {
  const bySection = mockPending.reduce((acc, p) => {
    (acc[p.section] = acc[p.section] || []).push(p);
    return acc;
  }, {});

  return (
    <div className="tray" onClick={onClose}>
      <div className="tray-inner" onClick={(e) => e.stopPropagation()}>
        <div className="tray-header">
          <div className="tray-title">Pending external actions · {mockPending.length}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="tray-body">
          {Object.entries(bySection).map(([section, items]) => (
            <div key={section}>
              <div className="tray-section">{section}</div>
              {items.map((p) => (
                <div key={p.id} className="tray-item">
                  <div className="tray-item-title">{p.title}</div>
                  <div className="tray-item-blurb">{p.blurb}</div>
                  {p.draft && <div className="tray-item-draft">{p.draft}</div>}
                  <div className="tray-item-actions">
                    {p.actions.map((a, i) => (
                      <button
                        key={i}
                        className={i === 0 ? 'primary-btn small' : 'ghost-btn small'}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="tray-footer">
          <button className="ghost-btn" onClick={onClose}>
            Close
          </button>
          <button className="primary-btn">Approve all</button>
        </div>
      </div>
    </div>
  );
}
