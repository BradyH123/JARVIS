import React, { useState } from 'react';
import ChatSurface from './ChatSurface';
import SituationPanel from './SituationPanel';
import PendingTray from './PendingTray';
import { mockGoal, mockMessages, mockPending } from './mockData';

export default function App() {
  const [panelOpen, setPanelOpen] = useState(true);
  const [trayOpen, setTrayOpen] = useState(false);

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-title">{mockGoal.title}</div>
          <div className="header-meta">
            Day 4 · last touched {mockGoal.lastTouchedRelative} · {mockGoal.stepsDone} steps done
          </div>
        </div>
        <div className="header-actions">
          <button
            className="pill-btn has-badge"
            onClick={() => setTrayOpen(true)}
          >
            Pending
            <span className="badge">{mockPending.length}</span>
          </button>
          <button
            className="pill-btn"
            onClick={() => setPanelOpen((v) => !v)}
          >
            {panelOpen ? 'Hide Situation' : 'Situation →'}
          </button>
        </div>
      </header>

      <div className="split">
        <ChatSurface messages={mockMessages} />
        {panelOpen && (
          <SituationPanel
            onClose={() => setPanelOpen(false)}
            onOpenTray={() => setTrayOpen(true)}
          />
        )}
      </div>

      {trayOpen && <PendingTray onClose={() => setTrayOpen(false)} />}
    </div>
  );
}
