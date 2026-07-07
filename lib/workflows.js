'use strict';

/**
 * Phase 3 — workflows: named compositions of taught skills and ad-hoc goals.
 *
 * A workflow is the "large-scale plan" pillar: an ordered list of steps the
 * assistant executes one after another, each step going through the same gated
 * autonomous run as a single skill. Persistence mirrors SkillStore (plain JSON
 * in Electron's userData dir).
 *
 * Step shapes:
 *   { type: 'skill', skill_id: 'uuid' }   — run a taught skill
 *   { type: 'goal',  goal: 'text' }        — run a one-off objective
 */

const fs = require('fs');
const path = require('path');

class WorkflowStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.workflows = this._load();
  }

  _load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  _persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.workflows, null, 2), 'utf8');
  }

  list() {
    return this.workflows;
  }

  get(id) {
    return this.workflows.find((w) => w.id === id) || null;
  }

  add(workflow) {
    this.workflows.push(workflow);
    this._persist();
    return workflow;
  }

  remove(id) {
    const before = this.workflows.length;
    this.workflows = this.workflows.filter((w) => w.id !== id);
    const changed = this.workflows.length !== before;
    if (changed) this._persist();
    return changed;
  }

  /**
   * Resolve a workflow's steps against the skill store into runnable units.
   * Missing skills are surfaced, not silently skipped — the caller decides.
   * @returns {{ runnable: Array<{label:string, goal:string, skill:object|null}>, missing: string[] }}
   */
  resolveSteps(id, skillStore) {
    const wf = this.get(id);
    if (!wf) return { runnable: [], missing: ['workflow ' + id] };
    const runnable = [];
    const missing = [];
    for (const step of wf.steps || []) {
      if (step.type === 'skill') {
        const skill = skillStore.get(step.skill_id);
        if (!skill) {
          missing.push(step.skill_id);
          continue;
        }
        runnable.push({ label: skill.name, goal: skill.name, skill });
      } else if (step.type === 'goal' && step.goal) {
        runnable.push({ label: step.goal, goal: step.goal, skill: null });
      }
    }
    return { runnable, missing };
  }

  /** Compact text block for the intent router / chat context. */
  contextForPrompt(skillStore) {
    if (this.workflows.length === 0) return 'No workflows defined yet.';
    return this.workflows
      .map((w, i) => {
        const steps = (w.steps || [])
          .map((s, j) => {
            if (s.type === 'skill') {
              const sk = skillStore.get(s.skill_id);
              return `      ${j + 1}. [skill] ${sk ? sk.name : '(missing: ' + s.skill_id + ')'}`;
            }
            return `      ${j + 1}. [goal] ${s.goal}`;
          })
          .join('\n');
        const triggers = (w.trigger_phrases || []).join('", "');
        return [
          `Workflow ${i + 1} — id: ${w.id}`,
          `  name: ${w.name}`,
          w.description ? `  description: ${w.description}` : null,
          triggers ? `  invoked by phrases like: "${triggers}"` : null,
          steps ? `  steps:\n${steps}` : null,
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');
  }
}

module.exports = { WorkflowStore };
