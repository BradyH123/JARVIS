import React, { useEffect, useState } from 'react';
import MindMap from './MindMap';
import coach from './coach';

// The hyper-focus loop. Everything here is designed so the user always
// sees exactly one reachable next step + a way to say "done" or "stuck".

export default function FocusView({
  problem,
  classification,
  plan,
  setPlan,
  onRestart,
}) {
  const [coachMsg, setCoachMsg] = useState(
    `Here's the plan. We'll do it one tiny step at a time.`,
  );
  const [showMap, setShowMap] = useState(true);
  const [celebrate, setCelebrate] = useState(false);
  const [customStep, setCustomStep] = useState('');

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

  // Periodic nudge so the user never feels alone with the task.
  useEffect(() => {
    const id = setInterval(() => {
      setCoachMsg(coach.nudge());
    }, 45000);
    return () => clearInterval(id);
  }, []);

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

    // If all steps in this milestone are now done, mark milestone done and
    // expand the next one.
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
    // For now, allow user to "jump" focus by un-marking later ones — read-only nav.
    // Keep this simple in v1: just scroll the focus card label.
    setCoachMsg(`Looking at milestone ${i + 1}: "${plan.milestones[i].label}"`);
  };
  const pickStep = (i) => {
    setCoachMsg(`Step ${i + 1}: "${activeMilestone.steps[i].label}"`);
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
          <button className="ghost small" onClick={() => setShowMap((v) => !v)}>
            {showMap ? 'Hide map' : 'Show map'}
          </button>
          <button className="ghost small" onClick={onRestart}>
            New problem
          </button>
        </div>
      </header>

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
              <div className="now-step">{activeStep.label}</div>
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
