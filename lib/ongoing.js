'use strict';

/**
 * Ongoing tasks — JARVIS's "always online" mode.
 *
 * An open-ended request ("do research on cats") has no finite ending, so it
 * runs as an ONGOING task: a loop that keeps working cycle after cycle — each
 * from a fresh angle so the work deepens instead of repeating — accumulating
 * findings into a note in the memory vault. It NEVER stops on its own; it shows
 * as ongoing and runs until the user says stop (or until an optional time
 * budget, for "research for 10 minutes then report" style requests).
 *
 * When a task ends (stopped or time's up) it doesn't just quit: it runs an
 * ENHANCE pass that rewrites the accumulated raw notes into a polished,
 * organized report — automatically optimizing its own work after finishing.
 *
 * The actual work per cycle is injected (deps.research / deps.synthesize), so
 * this module owns only the loop mechanics and stays headless-testable. In the
 * app, research runs in the hidden background browser (lib/bgbrowser.js), so an
 * ongoing task never touches the user's screen.
 */

const fs = require('fs');
const path = require('path');

// Research angles, rotated per cycle so each pass adds something new.
const ANGLES = [
  'broad overview: the key facts, definitions, and landscape',
  'the latest news and most recent developments',
  'practical details, how-tos, numbers, and expert advice',
  'cross-check: find DIFFERENT sources and verify or correct what the notes say so far',
  'fill gaps: whatever the notes so far are missing or gloss over',
];

function pickAngle(cycle) {
  return ANGLES[(Math.max(1, cycle) - 1) % ANGLES.length];
}

function slugify(s) {
  return (
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'task'
  );
}

let seq = 0;
const tasks = new Map(); // id -> task (internal, with control fields)

/** Public, IPC-safe view of a task. */
function snapshot(t) {
  return {
    id: t.id,
    goal: t.goal,
    status: t.status,
    cycle: t.cycle,
    startedAt: t.startedAt,
    deadline: t.deadline || null,
    notePath: t.notePath,
    reportPath: t.reportPath || null,
    lastFinding: (t.lastFinding || '').slice(0, 200),
  };
}

function list() {
  return [...tasks.values()].map(snapshot);
}

function get(id) {
  const t = tasks.get(id);
  return t ? snapshot(t) : null;
}

/** Any task still actively looping? */
function anyRunning() {
  return [...tasks.values()].some((t) => t.status === 'ongoing' || t.status === 'finishing');
}

/** Request stop for one task (by id) or ALL ongoing tasks (no id). */
function stop(id) {
  let n = 0;
  for (const t of tasks.values()) {
    if (id && t.id !== id) continue;
    if (t.status === 'ongoing') {
      t.stopRequested = true;
      n++;
    }
  }
  return { stopped: n };
}

/** Abortable pause — wakes early the moment a stop is requested. */
async function pause(task, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end && !task.stopRequested) {
    await new Promise((r) => setTimeout(r, Math.min(200, end - Date.now())));
  }
}

function appendNote(task, header, body) {
  try {
    fs.mkdirSync(path.dirname(task.notePath), { recursive: true });
    if (!fs.existsSync(task.notePath)) {
      fs.writeFileSync(task.notePath, `# Ongoing research: ${task.goal}\nStarted ${task.startedAt}\n`, 'utf8');
    }
    fs.appendFileSync(task.notePath, `\n## ${header}\n${String(body || '').trim()}\n`, 'utf8');
  } catch (_) {
    /* note-keeping is best-effort; the loop must not die over disk issues */
  }
}

/**
 * Start an ongoing task. Returns the task snapshot IMMEDIATELY — the loop runs
 * detached (task.promise resolves when it fully ends, for tests/await-ers).
 *
 * @param {string} goal
 * @param {object} opts
 * @param {string}  opts.notesDir     directory for the findings note (required)
 * @param {number}  [opts.minutes]    optional time budget (finite tasks)
 * @param {number}  [opts.pauseMs]    pause between cycles (default 10s)
 * @param {number}  [opts.maxCycles]  safety valve (default 500 — days of work)
 * @param {object} deps
 * @param {Function} deps.research    async (task, angle) => {message?} — one work cycle
 * @param {Function} [deps.synthesize] async (task, notesText) => string — polish pass
 * @param {Function} [deps.onEvent]   progress events
 */
function start(goal, opts, deps) {
  const g = String(goal || '').trim();
  if (!g) return { error: 'No goal for the ongoing task.' };
  if (!opts || !opts.notesDir) return { error: 'No notes directory configured.' };
  const onEvent = (deps && deps.onEvent) || (() => {});
  const research = deps && deps.research;
  if (typeof research !== 'function') return { error: 'No research capability wired.' };

  const id = 'og' + Date.now().toString(36) + (seq++).toString(36);
  const startedAt = new Date().toISOString();
  const task = {
    id,
    goal: g,
    status: 'ongoing',
    cycle: 0,
    startedAt,
    stopRequested: false,
    deadline: opts.minutes ? Date.now() + opts.minutes * 60000 : null,
    notePath: path.join(opts.notesDir, `${slugify(g)}-${new Date().toISOString().slice(0, 10)}.md`),
    reportPath: null,
    lastFinding: '',
  };
  tasks.set(id, task);
  const pauseMs = Number.isFinite(opts.pauseMs) ? opts.pauseMs : 10000;
  const maxCycles = Number.isFinite(opts.maxCycles) ? opts.maxCycles : 500;

  task.promise = (async () => {
    onEvent({ type: 'ongoing-started', id, goal: g, deadline: task.deadline, notePath: task.notePath });
    while (!task.stopRequested && task.cycle < maxCycles && (!task.deadline || Date.now() < task.deadline)) {
      task.cycle++;
      const angle = pickAngle(task.cycle);
      onEvent({ type: 'ongoing-cycle', id, goal: g, cycle: task.cycle, angle });
      try {
        const r = await research(task, angle);
        const finding = (r && (r.message || r.text)) || '';
        if (finding.trim()) {
          task.lastFinding = finding.trim();
          appendNote(task, `Cycle ${task.cycle} — ${angle} (${new Date().toISOString()})`, finding);
          onEvent({ type: 'ongoing-finding', id, cycle: task.cycle, summary: finding.slice(0, 300) });
        } else {
          appendNote(task, `Cycle ${task.cycle} — ${angle}`, '(no new findings this cycle)');
        }
      } catch (e) {
        // One bad cycle never kills an ongoing task — note it and continue.
        appendNote(task, `Cycle ${task.cycle} — error`, e.message || String(e));
        onEvent({ type: 'ongoing-error', id, cycle: task.cycle, message: e.message });
      }
      if (!task.stopRequested) await pause(task, pauseMs);
    }

    // Finishing: enhance/optimize the accumulated work into a polished report.
    const timeUp = task.deadline && Date.now() >= task.deadline;
    task.status = 'finishing';
    onEvent({ type: 'ongoing-finishing', id, reason: task.stopRequested ? 'stopped' : timeUp ? 'time' : 'max-cycles' });
    if (deps.synthesize && task.cycle > 0) {
      try {
        const notes = fs.existsSync(task.notePath) ? fs.readFileSync(task.notePath, 'utf8') : '';
        if (notes.trim()) {
          const report = await deps.synthesize(task, notes);
          if (report && report.trim()) {
            task.reportPath = task.notePath.replace(/\.md$/, '-report.md');
            fs.writeFileSync(task.reportPath, `# Report: ${task.goal}\n\n${report.trim()}\n`, 'utf8');
          }
        }
      } catch (_) {
        /* polish is best-effort — the raw notes still exist */
      }
    }
    task.status = task.stopRequested ? 'stopped' : 'done';
    onEvent({ type: 'ongoing-finished', id, goal: g, status: task.status, cycles: task.cycle, notePath: task.notePath, reportPath: task.reportPath });
    return snapshot(task);
  })();

  return snapshot(task);
}

/** Await a task's loop (tests / callers that want the end). */
function promiseOf(id) {
  const t = tasks.get(id);
  return t ? t.promise : null;
}

/** Drop finished tasks from the registry (keeps list() tidy). */
function prune() {
  for (const [id, t] of tasks) {
    if (t.status === 'stopped' || t.status === 'done') tasks.delete(id);
  }
}

module.exports = { start, stop, list, get, anyRunning, promiseOf, prune, pickAngle, slugify, ANGLES };
