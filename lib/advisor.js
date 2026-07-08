'use strict';

/**
 * Advisor loop — read advice, then ACTUALLY DO it.
 *
 * The user has JARVIS consult an external advisor (e.g. Pulsia AI) for what to
 * do next for their business. Reading the advice is only half of it: this
 * closes the loop by turning the advice into concrete tasks, executing each one,
 * and remembering what's been done so a repeating schedule ("ask Pulsia every 3
 * minutes and do what it says") makes real progress instead of re-doing the same
 * things or stalling after reading.
 *
 * This module owns the PURE bits — dedupe keys and the done-list persistence —
 * so the loop logic is testable headless. main.js injects reading the page,
 * extracting tasks, executing them, and reporting.
 */

const fs = require('fs');
const path = require('path');

/** Stable key for a task so trivially-reworded repeats collapse. */
function taskKey(task) {
  return String(task || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

/**
 * Which of `tasks` are new vs a set of already-seen keys. PURE — it does NOT
 * mark anything seen (the caller records a task as done only AFTER it actually
 * runs and succeeds, so capped/failed tasks aren't lost forever). Also dedupes
 * within the batch so the same task listed twice yields one entry.
 */
function filterNew(tasks, seenKeys) {
  const out = [];
  const batch = new Set();
  for (const t of tasks || []) {
    const k = taskKey(t.task || t);
    if (!k || seenKeys.has(k) || batch.has(k)) continue;
    batch.add(k);
    out.push(t);
  }
  return out;
}

function doneFile(dir) {
  return path.join(dir, 'Advisor', 'done.json');
}

/** Load the persisted set of completed task keys (survives restarts). */
function loadDone(dir) {
  try {
    const arr = JSON.parse(fs.readFileSync(doneFile(dir), 'utf8'));
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

/** Persist the completed-task keys. */
function saveDone(dir, seenKeys) {
  try {
    const p = doneFile(dir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    // Cap so it can't grow unbounded over weeks of 3-minute cycles.
    const keys = [...seenKeys].slice(-1000);
    fs.writeFileSync(p, JSON.stringify(keys), 'utf8');
  } catch {
    /* best-effort */
  }
}

/** Append a dated progress-log entry the user (and JARVIS) can review. */
function logProgress(dir, cycle) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const p = path.join(dir, 'Advisor', `progress-${day}.md`);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    if (!fs.existsSync(p)) fs.writeFileSync(p, `# Advisor progress — ${day}\n`, 'utf8');
    const stamp = new Date().toISOString().slice(11, 16);
    const lines = [`\n## ${stamp} — ${cycle.summary || 'advice'}`];
    for (const r of cycle.results || []) {
      lines.push(`- [${r.status}] ${r.task}${r.detail ? ' — ' + r.detail : ''}`);
    }
    if (!(cycle.results || []).length) lines.push('- (no new action items this cycle)');
    fs.appendFileSync(p, lines.join('\n') + '\n', 'utf8');
    return p;
  } catch {
    return null;
  }
}

module.exports = { taskKey, filterNew, loadDone, saveDone, logProgress };
