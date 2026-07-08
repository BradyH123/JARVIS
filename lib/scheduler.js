'use strict';

/**
 * Scheduler — JARVIS acts on a schedule, not only when spoken to.
 *
 * "In 30 minutes, check my email." "Every day at 9am, open my calendar."
 * "Every Monday at 8, do research on the week's tech news." Jobs persist to
 * disk (schedules.json) so they survive restarts, and each fire simply runs the
 * job's command through JARVIS's normal command pipeline — so anything he can
 * do on demand (quick actions, background tasks, ongoing research, multi-step
 * plans) he can now do on a schedule.
 *
 * Kinds of schedule:
 *   { kind:'once',   atMs }               — fire once at a moment
 *   { kind:'every',  minutes }            — repeat every N minutes
 *   { kind:'daily',  time:'HH:MM' }       — every day at a local time
 *   { kind:'weekly', weekday:0-6, time }  — weekly (0=Sunday … 6=Saturday)
 *
 * The engine is deliberately dumb and testable: computeNext() is pure, and
 * tick(now) fires whatever is due via an injected execute(). main.js owns the
 * timer and what "execute" means.
 */

const fs = require('fs');
const path = require('path');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let FILE = null;
let jobs = [];
let seq = 0;

// Hard ceiling on scheduled jobs — a backstop against runaway pile-ups.
const MAX_JOBS = 20;

function init(dir) {
  FILE = path.join(dir, 'schedules.json');
  jobs = [];
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (Array.isArray(raw)) jobs = raw.filter((j) => j && j.id && j.command && j.spec);
  } catch {
    /* first run / unreadable → start empty */
  }
  // Recover schedules that came due while JARVIS was off: recurring jobs roll
  // forward to their next occurrence; expired one-shots fire on the first tick.
  for (const j of jobs) {
    if (j.spec.kind !== 'once' && (!j.nextAt || j.nextAt < Date.now())) {
      j.nextAt = computeNext(j.spec, Date.now());
    }
  }
  save();
  return jobs.length;
}

function save() {
  if (!FILE) return;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    // Atomic write: serialize to a temp file, then rename over the real one, so
    // a crash mid-write can't truncate schedules.json and lose every job.
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(jobs, null, 2), 'utf8');
    fs.renameSync(tmp, FILE);
  } catch {
    /* persistence is best-effort */
  }
}

function parseTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

/** Pure: when does `spec` next fire, strictly after `fromMs`? null = never. */
function computeNext(spec, fromMs) {
  const from = Number(fromMs) || Date.now();
  if (!spec || !spec.kind) return null;
  if (spec.kind === 'once') {
    return spec.atMs > from ? spec.atMs : null;
  }
  if (spec.kind === 'every') {
    const mins = Math.max(1, Number(spec.minutes) || 0);
    return from + mins * 60000;
  }
  if (spec.kind === 'daily' || spec.kind === 'weekly') {
    const t = parseTime(spec.time);
    if (!t) return null;
    const d = new Date(from);
    d.setHours(t.h, t.min, 0, 0);
    if (spec.kind === 'daily') {
      if (d.getTime() <= from) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    const wd = Number(spec.weekday);
    if (!(wd >= 0 && wd <= 6)) return null;
    let delta = (wd - d.getDay() + 7) % 7;
    if (delta === 0 && d.getTime() <= from) delta = 7;
    d.setDate(d.getDate() + delta);
    return d.getTime();
  }
  return null;
}

/**
 * Normalize a router-style "when" into a spec.
 * Accepts: { kind:'once_in', minutes } | { kind:'once_at', time } |
 *          { kind:'every', minutes } | { kind:'daily', time } |
 *          { kind:'weekly', weekday, time }
 */
function normalizeWhen(when, nowMs) {
  const now = Number(nowMs) || Date.now();
  const w = when || {};
  if (w.kind === 'once_in') {
    const mins = Number(w.minutes);
    if (!(mins > 0)) return null;
    return { kind: 'once', atMs: now + mins * 60000 };
  }
  if (w.kind === 'once_at') {
    const next = computeNext({ kind: 'daily', time: w.time }, now);
    return next ? { kind: 'once', atMs: next } : null;
  }
  if (w.kind === 'every') {
    const mins = Number(w.minutes);
    return mins > 0 ? { kind: 'every', minutes: mins } : null;
  }
  if (w.kind === 'daily') return parseTime(w.time) ? { kind: 'daily', time: w.time } : null;
  if (w.kind === 'weekly') {
    const wd = Number(w.weekday);
    return parseTime(w.time) && wd >= 0 && wd <= 6 ? { kind: 'weekly', weekday: wd, time: w.time } : null;
  }
  // Already a normalized spec? Pass it through if it computes.
  return computeNext(w, now) ? w : null;
}

/** Human-readable description of a job ("every day at 09:00 — open my email"). */
function describe(job) {
  const s = job.spec || {};
  let when = '';
  if (s.kind === 'once') when = 'once at ' + new Date(s.atMs).toLocaleString();
  else if (s.kind === 'every') when = `every ${s.minutes} minute${s.minutes === 1 ? '' : 's'}`;
  else if (s.kind === 'daily') when = 'every day at ' + s.time;
  else if (s.kind === 'weekly') when = `every ${WEEKDAYS[s.weekday] || '?'} at ${s.time}`;
  let span = '';
  if (job.expiresAt) {
    const mins = Math.max(0, Math.round((job.expiresAt - Date.now()) / 60000));
    span = mins >= 60 ? ` for ${(mins / 60).toFixed(mins % 60 ? 1 : 0)}h` : ` for ${mins}m`;
  }
  return `${when}${span} — ${job.command}`;
}

/**
 * Add a job. `when` may be router-style or an already-normalized spec.
 * @param {object} [opts]
 * @param {number} [opts.durationMinutes]  the task self-expires after this long
 *   — recurring tasks stop repeating once expired, so nothing runs forever by
 *   default. `0`/absent means it runs until cancelled.
 */
function add(command, when, opts = {}) {
  const cmd = String(command || '').trim();
  if (!cmd) return { error: 'No command to schedule.' };
  const spec = normalizeWhen(when);
  if (!spec) return { error: "I couldn't understand that schedule time." };
  // Dedupe: identical command + cadence never becomes a second job (the core
  // fix for schedules piling up and burning credits).
  const keyOf = (c, s) => c.toLowerCase() + '|' + JSON.stringify(s);
  const key = keyOf(cmd, spec);
  const dup = jobs.find((j) => keyOf(j.command, j.spec) === key);
  if (dup) return { ...dup, duplicate: true };
  // Hard cap on total jobs so nothing can flood the scheduler.
  if (jobs.length >= MAX_JOBS) {
    return { error: `You already have ${jobs.length} scheduled tasks (the max). Cancel some first — say "cancel my schedules".`, atCapacity: true };
  }
  const dur = Number(opts.durationMinutes);
  const job = {
    id: 'sch' + Date.now().toString(36) + (seq++).toString(36),
    command: cmd,
    spec,
    nextAt: spec.kind === 'once' ? spec.atMs : computeNext(spec, Date.now()),
    createdAt: Date.now(),
    // Every task can have a lifespan: after expiresAt it stops and is removed.
    expiresAt: dur > 0 ? Date.now() + dur * 60000 : null,
    // Optional structured payload (e.g. a content-reactive strategy) that the
    // firing side interprets instead of running `command` verbatim.
    meta: opts.meta && typeof opts.meta === 'object' ? opts.meta : null,
    lastRunAt: null,
    runs: 0,
  };
  if (!job.nextAt) return { error: 'That time is already in the past.' };
  jobs.push(job);
  save();
  return job;
}

function list() {
  return jobs.map((j) => ({ ...j, text: describe(j) }));
}

/** Edit a job in place — today just the command (its "strategic instructions"). */
function update(id, patch = {}) {
  const job = jobs.find((j) => j.id === id);
  if (!job) return { error: 'No such scheduled task.' };
  const cmd = String(patch.command || '').trim();
  if (cmd) job.command = cmd;
  save();
  return { ...job, text: describe(job) };
}

// Per-job run history so the dashboard can show past results under each node.
const MAX_HISTORY = 8;
function recordResult(id, result = {}) {
  const job = jobs.find((j) => j.id === id);
  if (!job) return { error: 'No such scheduled task.' };
  if (!Array.isArray(job.history)) job.history = [];
  job.history.unshift({
    at: Date.now(),
    ok: result.ok !== false,
    summary: String(result.summary || '').slice(0, 300),
  });
  job.history = job.history.slice(0, MAX_HISTORY);
  save();
  return { ok: true };
}

function remove(id) {
  const before = jobs.length;
  jobs = jobs.filter((j) => j.id !== id);
  save();
  return { removed: before - jobs.length };
}

function clear() {
  const n = jobs.length;
  jobs = [];
  save();
  return { removed: n };
}

/**
 * Fire everything due at `nowMs` via execute(job). Recurring jobs reschedule;
 * one-shots are removed after firing. Returns the fired jobs.
 */
function tick(nowMs, execute) {
  const now = Number(nowMs) || Date.now();
  const fired = [];
  let expired = 0;
  // Drop tasks whose lifespan has elapsed BEFORE firing — a duration-limited
  // task stops on time and is removed, so nothing runs forever.
  const before = jobs.length;
  jobs = jobs.filter((j) => !(j.expiresAt && now >= j.expiresAt));
  expired = before - jobs.length;

  for (const j of [...jobs]) {
    if (!j.nextAt || j.nextAt > now) continue;
    j.lastRunAt = now;
    j.runs++;
    fired.push(j);
    if (j.spec.kind === 'once') {
      jobs = jobs.filter((x) => x.id !== j.id);
    } else {
      const next = computeNext(j.spec, now);
      // If the next occurrence lands past the lifespan, retire the task now.
      if (j.expiresAt && next && next >= j.expiresAt) jobs = jobs.filter((x) => x.id !== j.id);
      else j.nextAt = next;
    }
    try {
      if (execute) execute(j);
    } catch {
      /* an execute error must not break the tick loop */
    }
  }
  if (fired.length || expired) save();
  return fired;
}

let timer = null;
let registeredExecute = null;
/** Start the timer loop. main.js calls this once with its execute handler. */
function startTicking(execute, tickMs) {
  stopTicking();
  registeredExecute = execute || null;
  timer = setInterval(() => tick(Date.now(), execute), tickMs || 30000);
  if (timer.unref) timer.unref();
}

/** Fire one job immediately ("▶ run now") without disturbing its schedule. */
function fireNow(id) {
  const job = jobs.find((j) => j.id === id);
  if (!job) return { error: 'No such scheduled task.' };
  if (!registeredExecute) return { error: 'The scheduler is not running yet.' };
  job.lastRunAt = Date.now();
  job.runs++;
  save();
  try {
    registeredExecute(job);
  } catch {
    /* same contract as tick(): an execute error must not propagate */
  }
  return { ...job, text: describe(job) };
}
function stopTicking() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { init, add, list, remove, clear, tick, startTicking, stopTicking, computeNext, normalizeWhen, describe, update, recordResult, fireNow };
