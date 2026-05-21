import React, { useEffect, useState, useCallback } from 'react';
import Welcome from './Welcome';
import BrainDump from './BrainDump';
import DailyCheckIn from './DailyCheckIn';
import Canvas from './Canvas';
import coach from './coach';
import { loadState, saveState, clearState, todayKey } from './storage';

// Stages:
//   welcome -> first time greeting
//   dump    -> full brain dump
//   daily   -> "what's today's win?"
//   canvas  -> the interactive map
//
// State shape persisted to localStorage:
//   {
//     onboarded: bool,
//     brainDump: { rawText, buckets: {now,later,trash} },
//     today: {
//       date,            // 'YYYY-MM-DD'
//       goal,            // string
//       classification,  // {type,label,icon}
//       meta,            // {energy, timebox}
//       nodes,           // canvas nodes
//     }
//   }

export default function App() {
  const [state, setState] = useState(() => loadState() || {});
  const [stage, setStage] = useState(() => decideStage(loadState() || {}));

  function decideStage(s) {
    if (!s.onboarded) return 'welcome';
    if (!s.brainDump) return 'dump';
    if (!s.today || s.today.date !== todayKey() || !s.today.goal) return 'daily';
    return 'canvas';
  }

  // Persist any state change
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
        nodes: null, // canvas will build initial
      },
    }));
    setStage('canvas');
  };

  const persistNodes = useCallback((nodes) => {
    setState((s) => {
      if (!s.today) return s;
      return { ...s, today: { ...s.today, nodes } };
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
        <Canvas
          rootText={state.today.goal}
          classification={state.today.classification}
          initialNodes={state.today.nodes}
          onPersist={persistNodes}
          onNewDay={newDay}
          onChangeGoal={changeGoal}
          brainDump={state.brainDump ? state.brainDump.buckets : null}
          meta={state.today.meta}
        />
      )}
    </div>
  );
}
