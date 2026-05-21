import React from 'react';

// A simple horizontal/vertical hybrid tree:
//   - The outcome sits at the top.
//   - Milestones row out across the width.
//   - The active milestone "fans down" to its current steps.
// Connector lines are drawn with SVG so the layout stays responsive.

export default function MindMap({
  plan,
  activeMilestoneIdx,
  activeStepIdx,
  onPickMilestone,
  onPickStep,
}) {
  if (!plan) return null;
  const { outcome, milestones } = plan;
  const active = milestones[activeMilestoneIdx];

  return (
    <div className="mindmap">
      <div className="mindmap-outcome" title={outcome}>
        <div className="mindmap-outcome-label">Goal</div>
        <div className="mindmap-outcome-text">{outcome}</div>
      </div>

      <div className="mindmap-trunk" />

      <div className="mindmap-row">
        {milestones.map((m, i) => {
          const isActive = i === activeMilestoneIdx;
          const done = m.status === 'done';
          return (
            <button
              key={m.id}
              className={`mindmap-node ${isActive ? 'is-active' : ''} ${
                done ? 'is-done' : ''
              }`}
              onClick={() => onPickMilestone(i)}
              title={m.label}
            >
              <div className="mindmap-node-idx">{done ? '✓' : i + 1}</div>
              <div className="mindmap-node-label">{m.label}</div>
            </button>
          );
        })}
      </div>

      {active && active.steps.length > 0 && (
        <>
          <div className="mindmap-branch" />
          <div className="mindmap-row mindmap-row-steps">
            {active.steps.map((s, i) => {
              const isActive = i === activeStepIdx;
              const done = s.status === 'done';
              return (
                <button
                  key={s.id}
                  className={`mindmap-leaf ${isActive ? 'is-active' : ''} ${
                    done ? 'is-done' : ''
                  }`}
                  onClick={() => onPickStep(i)}
                  title={s.label}
                >
                  <span className="leaf-marker">{done ? '✓' : i + 1}</span>
                  <span className="leaf-label">{s.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
