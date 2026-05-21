import React, { useEffect, useState, useCallback } from 'react';
import Welcome from './Welcome';
import BrainDump from './BrainDump';
import DailyCheckIn from './DailyCheckIn';
import Workspace from './Workspace';
import coach from './coach';
import { loadState, saveState, clearState, todayKey } from './storage';

export default function App() {
  const [state, setState] = useState(() => loadState() || {});
  const [stage, setStage] = useState(() => decideStage(loadState() || {}));

  function decideStage(s) {
    if (!s.onboarded) return 'welcome';
    if (!s.brainDump) return 'dump';
    if (!s.today || s.today.date !== todayKey() || !s.today.goal) return 'daily';
    return 'canvas';
  }

  useEffect(() => {
    saveState(state);
  }, [state]);

  const beginDump = () => {
    setState((s) => ({ ...s, onboarded: true }));
    setStage('dump');
  };

  const completeDump = ({ rawText, buckets }) => {
    setState((s) => ({ ...s, brainDump: { rawText, buckets } }));
    setStage('daily');
  };

  const completeDaily = ({ goal, energy, timebox }) => {
    const classification = coach.classify(goal);
    setState((s) => ({
      ...s,
      today: {
        date: todayKey(),
        goal,
        classification,
        meta: { energy, timebox },
        workspace: null,
      },
    }));
    setStage('canvas');
  };

  const persistWorkspace = useCallback((wsState) => {
    setState((s) => {
      if (!s.today) return s;
      return { ...s, today: { ...s.today, workspace: wsState } };
    });
  }, []);

  const newDay = () => {
    if (!window.confirm('Reset everything (brain dump + today\'s map)?')) return;
    clearState();
    setState({});
    setStage('welcome');
  };

  const changeGoal = () => {
    setState((s) => ({ ...s, today: null }));
    setStage('daily');
  };

  const redoDump = () => {
    setState((s) => ({ ...s, brainDump: null }));
    setStage('dump');
  };

  return (
    <div className="app">
      {stage === 'welcome' && <Welcome onBegin={beginDump} />}
      {stage === 'dump' && (
        <BrainDump
          initialText={state.brainDump ? state.brainDump.rawText : ''}
          onComplete={completeDump}
          onBack={state.onboarded ? () => setStage('daily') : null}
        />
      )}
      {stage === 'daily' && (
        <DailyCheckIn
          buckets={state.brainDump ? state.brainDump.buckets : null}
          onSubmit={completeDaily}
          onSkipDump={redoDump}
        />
      )}
      {stage === 'canvas' && state.today && (
        <Workspace
          rootText={state.today.goal}
          classification={state.today.classification}
          initialState={state.today.workspace}
          onPersist={persistWorkspace}
          onNewDay={newDay}
          onChangeGoal={changeGoal}
          brainDump={state.brainDump ? state.brainDump.buckets : null}
          meta={state.today.meta}
        />
      )}
    </div>
  );
}
