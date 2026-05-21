import React, { useEffect, useState, useRef } from 'react';
import MindMap from './MindMap';
import coach from './coach';

// The hyper-focus loop. Everything here is designed so the user always
// sees exactly one reachable next step + a way to say "done" or "stuck".

const BODY_DOUBLE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export default function FocusView({
  problem,
  classification,
  plan,
  setPlan,
  paralysis,
  onRestart,
}) {
  const [coachMsg, setCoachMsg] = useState(
    paralysis
      ? "Hey. You're not stuck — you just haven't started. The first step is small on purpose."
      : "Here's the plan. We'll do it one tiny step at a time.",
  );
  const [showMap, setShowMap] = useState(true);
  const [celebrate, setCelebrate] = useState(false);
  const [customStep, setCustomStep] = useState('');
  const [bodyDouble, setBodyDouble] = useState(false);
  const [checkIn, setCheckIn] = useState(null); // { prompt } | null
  const bodyDoubleTimer = useRef(null);

  // Find the first incomplete milestone, and the first incomplete step in it.
  const activeMilestoneIdx = plan.milestones.findIndex((m) => m.status !== 'done');
  const activeMilestone =
    activeMilestoneIdx === -1
      ? plan.milestones[plan.milestones.length - 1]
      : plan.milestones[activeMilestoneIdx];
  const activeStepIdx =
    activeMilestone && activeMilestone.steps.length
      ? activeMilestone.steps.findIndex((s) => s.status !== 'done')
      : -1;
  const activeStep =
    activeStepIdx >= 0 ? activeMilestone.steps[activeStepIdx] : null;

  const isFirstStep =
    activeMilestoneIdx === 0 &&
    activeStepIdx === 0 &&
    activeStep &&
    plan.milestones.every(
      (m, i) =>
        i > 0 || m.steps.every((s) => s.status === 'pending'),
    );

  const quest = activeStep ? coach.questFor(activeStep.label) : null;

  // Periodic nudge so the user never feels alone with the task.
  useEffect(() => {
    const id = setInterval(() => {
      setCoachMsg(coach.nudge());
    }, 45000);
    return () => clearInterval(id);
  }, []);

  // Body Double mode: every N minutes pop a non-blocking check-in.
  useEffect(() => {
    if (bodyDoubleTimer.current) {
      clearInterval(bodyDoubleTimer.current);
      bodyDoubleTimer.current = null;
    }
    if (bodyDouble) {
      bodyDoubleTimer.current = setInterval(() => {
        setCheckIn({ prompt: coach.bodyDoublePrompt() });
      }, BODY_DOUBLE_INTERVAL_MS);
    }
    return () => {
      if (bodyDoubleTimer.current) clearInterval(bodyDoubleTimer.current);
    };
  }, [bodyDouble]);

  const totalSteps = plan.milestones.reduce(
    (n, m) => n + (m.steps.length || 0),
    0,
  );
  const doneSteps = plan.milestones.reduce(
    (n, m) => n + m.steps.filter((s) => s.status === 'done').length,
    0,
  );
  const milestonesDone = plan.milestones.filter((m) => m.status === 'done').length;

  const completeStep = () => {
    if (!activeStep) return;
    const next = JSON.parse(JSON.stringify(plan));
    next.milestones[activeMilestoneIdx].steps[activeStepIdx].status = 'done';

    const stepsLeft = next.milestones[activeMilestoneIdx].steps.some(
      (s) => s.status !== 'done',
    );
    if (!stepsLeft) {
      next.milestones[activeMilestoneIdx].status = 'done';
      const nextIdx = activeMilestoneIdx + 1;
      if (nextIdx < next.milestones.length && next.milestones[nextIdx].steps.length === 0) {
        next.milestones[nextIdx].steps = coach.expandMilestone(
          classification,
          nextIdx,
        );
      }
    }

    setPlan(next);
    setCoachMsg(coach.encouragement());
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 500);
  };

  const skipStep = () => {
    if (!activeStep) return;
    const next = JSON.parse(JSON.stringify(plan));
    next.milestones[activeMilestoneIdx].steps[activeStepIdx].status = 'skipped';
    setPlan(next);
    setCoachMsg(
      'Skipped — that\'s fine. The next one is even smaller. Tap when ready.',
    );
  };

  const addCustomStep = (e) => {
    e.preventDefault();
    const trimmed = customStep.trim();
    if (!trimmed) return;
    const next = JSON.parse(JSON.stringify(plan));
    const insertAt = activeStepIdx === -1
      ? next.milestones[activeMilestoneIdx].steps.length
      : activeStepIdx;
    next.milestones[activeMilestoneIdx].steps.splice(insertAt, 0, {
      id: `c${Date.now()}`,
      label: trimmed,
      status: 'pending',
    });
    setPlan(next);
    setCustomStep('');
    setCoachMsg('Added — your step is now the next one.');
  };

  const pickMilestone = (i) => {
    setCoachMsg(`Looking at milestone ${i + 1}: "${plan.milestones[i].label}"`);
  };
  const pickStep = (i) => {
    setCoachMsg(`Step ${i + 1}: "${activeMilestone.steps[i].label}"`);
  };

  const respondCheckIn = (status) => {
    setCoachMsg(coach.bodyDoubleReply(status));
    setCheckIn(null);
  };

  const allDone = activeMilestoneIdx === -1;

  return (
    <div className="focus">
      <header className="focus-header">
        <div className="focus-header-left">
          <div className="classification-pill">
            {classification.icon} {classification.label}
          </div>
          <div className="focus-outcome">{plan.outcome}</div>
        </div>
        <div className="focus-header-right">
          <div className="progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${totalSteps ? (doneSteps / totalSteps) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="progress-text">
              {doneSteps} / {totalSteps} steps · {milestonesDone} /{' '}
              {plan.milestones.length} milestones
            </div>
          </div>
          <button
            className={`ghost small ${bodyDouble ? 'toggle-on' : ''}`}
            onClick={() => setBodyDouble((v) => !v)}
            title="When on, I'll check in every 10 minutes"
          >
            🤝 Body double: {bodyDouble ? 'On' : 'Off'}
          </button>
          <button className="ghost small" onClick={() => setShowMap((v) => !v)}>
            {showMap ? 'Hide map' : 'Show map'}
          </button>
          <button className="ghost small" onClick={onRestart}>
            New problem
          </button>
        </div>
      </header>

      {checkIn && (
        <div className="checkin-banner">
          <div className="checkin-prompt">💬 {checkIn.prompt}</div>
          <div className="checkin-actions">
            <button className="primary small" onClick={() => respondCheckIn('good')}>
              ✓ Crushing it
            </button>
            <button className="ghost small" onClick={() => respondCheckIn('stuck')}>
              😵 Stuck
            </button>
            <button className="ghost small" onClick={() => respondCheckIn('distracted')}>
              🌀 Distracted
            </button>
          </div>
        </div>
      )}

      <div className="focus-main">
        <div className={`now-card ${celebrate ? 'celebrate' : ''}`}>
          <div className="now-label">RIGHT NOW</div>
          {allDone ? (
            <>
              <div className="now-step done-state">
                🎉 You did the whole plan.
              </div>
              <div className="now-sub">
                Look back at what you got done. That was real work.
              </div>
              <div className="now-actions">
                <button onClick={onRestart}>Start something new</button>
              </div>
            </>
          ) : activeStep ? (
            <>
              <div className="now-milestone">
                Milestone {activeMilestoneIdx + 1} of {plan.milestones.length}:{' '}
                <strong>{activeMilestone.label}</strong>
              </div>
              {isFirstStep && paralysis && (
                <div className="paralysis-banner">
                  This is ridiculously small on purpose. Just do this one
                  physical thing. The rest follows.
                </div>
              )}
              <div className="now-step">{activeStep.label}</div>
              {quest && (
                <div className="quest-row">
                  <span className="quest-badge">🎯 {quest.title}</span>
                  <span className="quest-reward">🏆 {quest.reward}</span>
                </div>
              )}
              <div className="now-sub">
                Just this one. It is small on purpose.
              </div>
              <div className="now-actions">
                <button className="primary big" onClick={completeStep}>
                  ✓ Done
                </button>
                <button className="ghost" onClick={skipStep}>
                  Skip / stuck
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="now-step">
                This milestone needs more steps.
              </div>
              <div className="now-sub">
                Add one tiny next action you can do.
              </div>
            </>
          )}

          <div className="coach-line">💬 {coachMsg}</div>

          <form className="add-step" onSubmit={addCustomStep}>
            <input
              type="text"
              value={customStep}
              onChange={(e) => setCustomStep(e.target.value)}
              placeholder="Add your own micro-step (do it before the suggested one)"
            />
            <button type="submit" disabled={!customStep.trim()}>
              + Add
            </button>
          </form>
        </div>

        {showMap && (
          <div className="map-wrap">
            <div className="map-title">Your map</div>
            <MindMap
              plan={plan}
              activeMilestoneIdx={Math.max(0, activeMilestoneIdx)}
              activeStepIdx={Math.max(0, activeStepIdx)}
              onPickMilestone={pickMilestone}
              onPickStep={pickStep}
            />
          </div>
        )}
      </div>
    </div>
  );
}
