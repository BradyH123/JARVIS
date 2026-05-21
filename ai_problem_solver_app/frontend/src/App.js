import React, { useState } from 'react';
import Canvas from './Canvas';
import ChatDrawer from './ChatDrawer';
import PendingTray from './PendingTray';
import { mockGoal, mockPending } from './mockData';

export default function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-title">{mockGoal.title}</div>
          <div className="header-meta">
            Day 4 · {mockGoal.lastTouchedRelative} · {mockGoal.frontsInMotion} fronts
          </div>
        </div>
        <div className="header-actions">
          <button
            className="pill-btn has-badge"
            onClick={() => setTrayOpen(true)}
          >
            Pending<span className="badge">{mockPending.length}</span>
          </button>
        </div>
      </header>

      <main className="canvas-scroll">
        <Canvas onOpenChat={() => setChatOpen(true)} />
      </main>

      <div className="bottom-bar">
        <button
          className="bottom-btn"
          onClick={() => setChatOpen(true)}
        >
          <span className="bottom-icon">◐</span>
          <span>Chat</span>
        </button>
        <div className="bottom-hint">Tap any node · pinch nothing yet</div>
      </div>

      <ChatDrawer open={chatOpen} onClose={() => setChatOpen(false)} />
      {trayOpen && <PendingTray onClose={() => setTrayOpen(false)} />}
    </div>
  );
}
