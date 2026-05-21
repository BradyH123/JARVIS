import React from 'react';
import SituationCanvas from './SituationCanvas';
import { situation } from './mockData';

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-title">{situation.goalTitle}</div>
          <div className="header-meta">Situation · Day {situation.day}</div>
        </div>
      </header>

      <main className="canvas-scroll">
        <SituationCanvas />
      </main>
    </div>
  );
}
