import React, { useState, useCallback } from 'react';
import Workspace from './Workspace';
import { loadState, saveState, clearState } from './storage';

export default function App() {
  const [tick, setTick] = useState(0);
  const initial = loadState();

  const persist = useCallback((s) => {
    saveState(s);
  }, []);

  const reset = useCallback(() => {
    if (!window.confirm('Reset the whole canvas?')) return;
    clearState();
    setTick((t) => t + 1);
  }, []);

  return (
    <div className="app">
      <Workspace
        key={tick}
        initialState={initial}
        onPersist={persist}
        onReset={reset}
      />
    </div>
  );
}
