import React, { useState } from 'react';
import ProblemInput from './ProblemInput';
import BrainDump from './BrainDump';
import ClarifyForm from './ClarifyForm';
import FocusView from './FocusView';
import coach from './coach';

// Stages of the guided flow:
//   input     -> user types a raw problem OR starts a brain dump
//   dump      -> triage Now/Later/Trash (only if user chose brain dump)
//   clarify   -> 2-3 questions to expand understanding (skipped from dump)
//   focus     -> rolling "next step" loop with a live mind map
//
// State is held here so the user can step back without losing work.

export default function App() {
  const [stage, setStage] = useState('input');
  const [problem, setProblem] = useState('');
  const [dumpText, setDumpText] = useState('');
  const [classification, setClassification] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [plan, setPlan] = useState(null);
  const [paralysis, setParalysis] = useState(false);

  const handleProblemSubmit = (text) => {
    const c = coach.classify(text);
    setProblem(text);
    setClassification(c);
    setQuestions(coach.clarifyingQuestions(text, c));
    setParalysis(coach.detectParalysis(text));
    setStage('clarify');
  };

  const handleBrainDump = (text) => {
    setDumpText(text);
    setStage('dump');
  };

  const handleDumpPick = (item) => {
    // Skip clarify — the user is already overwhelmed. Go straight to focus
    // with an auto-decomposition.
    const c = coach.classify(item);
    setProblem(item);
    setClassification(c);
    setParalysis(true); // they came in via dump → assume overwhelm
    setPlan(coach.decompose(item, c, { outcome: item, timebox: '15 min' }));
    setStage('focus');
  };

  const handleClarifySubmit = (answers) => {
    setPlan(coach.decompose(problem, classification, answers));
    setStage('focus');
  };

  const restart = () => {
    setStage('input');
    setProblem('');
    setDumpText('');
    setClassification(null);
    setQuestions([]);
    setPlan(null);
    setParalysis(false);
  };

  return (
    <div className="app">
      {stage === 'input' && (
        <ProblemInput
          onSubmit={handleProblemSubmit}
          onBrainDump={handleBrainDump}
        />
      )}
      {stage === 'dump' && (
        <BrainDump
          rawText={dumpText}
          onPick={handleDumpPick}
          onBack={() => setStage('input')}
        />
      )}
      {stage === 'clarify' && (
        <ClarifyForm
          problem={problem}
          classification={classification}
          questions={questions}
          onSubmit={handleClarifySubmit}
          onBack={() => setStage('input')}
        />
      )}
      {stage === 'focus' && plan && (
        <FocusView
          problem={problem}
          classification={classification}
          plan={plan}
          setPlan={setPlan}
          paralysis={paralysis}
          onRestart={restart}
        />
      )}
    </div>
  );
}
