import React, { useState } from 'react';
import ProblemInput from './ProblemInput';
import ClarifyForm from './ClarifyForm';
import FocusView from './FocusView';
import coach from './coach';

// Stages of the guided flow:
//   input    -> user types in a raw problem
//   clarify  -> 2-3 questions to expand understanding
//   focus    -> rolling "next step" loop with a live mind map
//
// State is held here so the user can step back without losing work.

export default function App() {
  const [stage, setStage] = useState('input');
  const [problem, setProblem] = useState('');
  const [classification, setClassification] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [plan, setPlan] = useState(null);

  const handleProblemSubmit = (text) => {
    const c = coach.classify(text);
    setProblem(text);
    setClassification(c);
    setQuestions(coach.clarifyingQuestions(text, c));
    setStage('clarify');
  };

  const handleClarifySubmit = (answers) => {
    setPlan(coach.decompose(problem, classification, answers));
    setStage('focus');
  };

  const restart = () => {
    setStage('input');
    setProblem('');
    setClassification(null);
    setQuestions([]);
    setPlan(null);
  };

  return (
    <div className="app">
      {stage === 'input' && <ProblemInput onSubmit={handleProblemSubmit} />}
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
          onRestart={restart}
        />
      )}
    </div>
  );
}
