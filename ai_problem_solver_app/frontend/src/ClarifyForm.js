import React, { useState } from 'react';

export default function ClarifyForm({ problem, classification, questions, onSubmit, onBack }) {
  const [answers, setAnswers] = useState({});

  const update = (id, value) => setAnswers((a) => ({ ...a, [id]: value }));

  const submit = (e) => {
    e.preventDefault();
    onSubmit(answers);
  };

  const skip = () => onSubmit(answers);

  return (
    <div className="screen">
      <div className="clarify">
        <button className="link-back" onClick={onBack}>
          ← back
        </button>
        <div className="classification">
          <span className="classification-icon">{classification.icon}</span>
          <div>
            <div className="classification-label">
              {classification.label}
            </div>
            <div className="classification-problem">"{problem}"</div>
          </div>
        </div>
        <h2>A couple of quick questions to lock this in.</h2>
        <p className="clarify-sub">
          Skip anything you don't know — I'll work with whatever you give me.
        </p>

        <form onSubmit={submit} className="clarify-form">
          {questions.map((q) => (
            <div key={q.id} className="question">
              <label className="question-prompt">{q.prompt}</label>
              <div className="question-hint">{q.hint}</div>
              {q.type === 'text' && (
                <input
                  type="text"
                  value={answers[q.id] || ''}
                  onChange={(e) => update(q.id, e.target.value)}
                  placeholder="Your answer (optional)"
                />
              )}
              {q.type === 'choice' && (
                <div className="choices">
                  {q.options.map((opt) => (
                    <button
                      type="button"
                      key={opt}
                      className={`choice ${
                        answers[q.id] === opt ? 'choice-active' : ''
                      }`}
                      onClick={() => update(q.id, opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="clarify-actions">
            <button type="button" className="ghost" onClick={skip}>
              Skip the rest
            </button>
            <button type="submit">Make me a plan →</button>
          </div>
        </form>
      </div>
    </div>
  );
}
