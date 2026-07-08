'use strict';

/**
 * Task engine — the core of JARVIS.
 *
 * Everything JARVIS does is a TASK on one queue that he drains by TICKING. The
 * chat box creates/modifies tasks; scheduled tasks drop a run onto the queue
 * when they come due; and on every tick JARVIS activates the single most
 * important task, runs it to completion, then pulls the next — staying focused
 * on ONE thing at a time (which is also the credit-safety guarantee: no
 * overlapping runs).
 *
 * Every task has a FREQUENCY and a DURATION:
 *   - frequency: `once` (a single work item) or recurring (`every`/`daily`/
 *     `weekly`) — a recurring task lives in the scheduled section and enqueues a
 *     run each time it's due.
 *   - duration: a lifespan after which the task retires. `Infinity`/null makes a
 *     recurring task NEVER-ENDING.
 *
 * Priority + preemption: a task the USER just asked for outranks background /
 * scheduled work. If something is already active and the user asks for another
 * task, the new one takes over and the interrupted user task is re-queued to
 * resume — "do the most recent, remember the other."
 *
 * Pure-ish and headless-testable: the actual work is injected as `runTask`;
 * `tick(now)` is deterministic given a clock. main.js owns the timer, the clock,
 * and what running a task means.
 */

const scheduler = require('./scheduler'); // reuse computeNext/normalizeWhen timing

let seq = 0;

// Priority bands (higher runs first).
const PRIO = { user: 100, advisor: 60, schedule: 40, background: 20 };

class TaskEngine {
  /**
   * @param {object} opts
   * @param {(task:object, ctl:{shouldAbort:()=>boolean}) => Promise<{status?:string,message?:string}>} opts.runTask
   * @param {(evt:object)=>void} [opts.onEvent]
   */
  constructor(opts = {}) {
    this.runTask = opts.runTask || (async () => ({ status: 'done' }));
    this.onEvent = opts.onEvent || (() => {});
    this.tasks = []; // all tasks (queued / active / scheduled / done)
    this.activeId = null;
    this._token = 0; // guards against a stale run completing after preemption
    this._abort = false;
    this._timer = null;
  }

  _emit(type, extra) {
    this.onEvent({ type, ...extra });
  }

  /**
   * Create a task.
   * @param {object} t
   * @param {string} t.title            short label
   * @param {string} t.command          what JARVIS should actually do
   * @param {object} [t.when]           recurring cadence (scheduler normalizeWhen input); omit for a one-off
   * @param {number} [t.durationMinutes] lifespan; omit / Infinity = never-ending (recurring only)
   * @param {string} [t.context]        the goal / why behind it
   * @param {string} [t.source]         'user' | 'advisor' | 'schedule' | 'background'
   * @param {boolean} [t.preempt]       if user asks mid-task, take over now (default true for user)
   */
  add(t = {}) {
    const now = Date.now();
    const command = String(t.command || t.title || '').trim();
    if (!command) return { error: 'A task needs something to do.' };
    const source = t.source || 'user';
    const spec = t.when ? scheduler.normalizeWhen(t.when, now) : null;
    const recurring = Boolean(spec && spec.kind !== 'once');
    const durMin = t.durationMinutes;
    const infinite = durMin == null || durMin === Infinity || Number(durMin) <= 0;

    const task = {
      id: 'tk' + now.toString(36) + (seq++).toString(36),
      title: String(t.title || command).slice(0, 120),
      command,
      context: String(t.context || '').slice(0, 400),
      source,
      priority: PRIO[source] != null ? PRIO[source] : PRIO.user,
      kind: recurring ? 'recurring' : 'once',
      when: recurring ? spec : null,
      durationMinutes: infinite ? null : Number(durMin),
      expiresAt: infinite ? null : now + Number(durMin) * 60000,
      createdAt: now,
      requestedAt: now,
      runs: 0,
      lastResult: null,
      status: recurring ? 'scheduled' : 'queued',
      nextAt: recurring ? scheduler.computeNext(spec, now) : null,
    };
    this.tasks.push(task);

    // A brand-new USER one-off preempts the current task (unless told not to).
    const wantsPreempt = t.preempt !== false && source === 'user' && !recurring;
    if (wantsPreempt && this.activeId) {
      task.priority = PRIO.user + 1; // ahead of any other queued user task
      this._preemptActive();
    }
    this._emit('task-added', { task: this._view(task) });
    // Start immediately when idle — a chat task shouldn't wait for the next tick.
    this._maybeActivate(now);
    return this._view(task);
  }

  /** Re-queue the active task and free the slot so a higher-priority one runs. */
  _preemptActive() {
    const act = this.tasks.find((x) => x.id === this.activeId);
    if (!act) return;
    act._preempted = true;
    act.status = 'queued'; // resume it later, after the newer task
    this._abort = true; // the in-flight run's shouldAbort will observe this
    this._token++; // orphan that run's completion so it isn't marked done
    this.activeId = null;
    this._emit('task-requeued', { task: this._view(act) });
  }

  /** Activate the next-highest queued task if nothing is currently active. */
  _maybeActivate(now) {
    if (this.activeId) return;
    const next = this.tasks.filter((x) => x.status === 'queued').sort(this._order)[0];
    if (next) this._activate(next, now || Date.now());
  }

  /** Public view (no internal underscores / functions). */
  _view(t) {
    return {
      id: t.id, title: t.title, command: t.command, context: t.context, source: t.source,
      priority: t.priority, kind: t.kind, when: t.when, durationMinutes: t.durationMinutes,
      expiresAt: t.expiresAt, status: t.status, nextAt: t.nextAt, runs: t.runs,
      lastResult: t.lastResult, requestedAt: t.requestedAt,
    };
  }

  /** Change a task's duration; Infinity / 0 / null makes it never-ending. */
  setDuration(id, minutes) {
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return { error: 'No such task.' };
    const infinite = minutes == null || minutes === Infinity || Number(minutes) <= 0;
    t.durationMinutes = infinite ? null : Number(minutes);
    t.expiresAt = infinite ? null : Date.now() + Number(minutes) * 60000;
    this._emit('task-updated', { task: this._view(t) });
    return this._view(t);
  }

  remove(id) {
    const before = this.tasks.length;
    if (this.activeId === id) {
      this._preemptActive();
      this.activeId = null;
    }
    this.tasks = this.tasks.filter((x) => x.id !== id);
    this._emit('task-removed', { id });
    return { removed: before - this.tasks.length };
  }

  /** Stop everything: drop the queue and abort the active task. */
  stopAll() {
    this._abort = true;
    this._token++; // orphan any in-flight run
    const active = this.tasks.find((x) => x.id === this.activeId);
    if (active) active.status = 'done';
    this.activeId = null;
    // Keep scheduled (recurring) tasks; clear pending one-off queue items.
    this.tasks = this.tasks.filter((x) => x.kind === 'recurring' && x.status === 'scheduled');
    this._emit('task-stop-all', {});
    return { ok: true };
  }

  list() {
    const active = this.tasks.find((x) => x.id === this.activeId) || null;
    return {
      active: active ? this._view(active) : null,
      queue: this.tasks.filter((x) => x.status === 'queued').sort(this._order).map((x) => this._view(x)),
      scheduled: this.tasks.filter((x) => x.kind === 'recurring').map((x) => this._view(x)),
    };
  }

  _order(a, b) {
    return b.priority - a.priority || a.requestedAt - b.requestedAt;
  }

  /**
   * One tick: retire expired tasks, enqueue due scheduled runs, and — if idle —
   * activate the next task. Returns a small summary for tests/telemetry.
   */
  tick(nowMs) {
    const now = Number(nowMs) || Date.now();

    // 1) Retire expired tasks (finite duration elapsed). Never-ending tasks
    // (expiresAt null) are immune.
    const expired = this.tasks.filter((x) => x.expiresAt && now >= x.expiresAt);
    if (expired.length) {
      for (const e of expired) this._emit('task-expired', { id: e.id, title: e.title });
      this.tasks = this.tasks.filter((x) => !(x.expiresAt && now >= x.expiresAt));
      if (expired.some((e) => e.id === this.activeId)) this.activeId = null;
    }

    // 2) Enqueue due scheduled runs (one pending run per scheduled task).
    for (const s of this.tasks.filter((x) => x.kind === 'recurring' && x.status === 'scheduled')) {
      if (!s.nextAt || s.nextAt > now) continue;
      const alreadyPending = this.tasks.some((x) => x.parentId === s.id && (x.status === 'queued' || x.id === this.activeId));
      if (!alreadyPending) {
        this.tasks.push({
          id: 'tk' + now.toString(36) + (seq++).toString(36),
          title: s.title, command: s.command, context: s.context, source: s.source || 'schedule',
          priority: PRIO[s.source] != null ? PRIO[s.source] : PRIO.schedule,
          kind: 'once', when: null, durationMinutes: null, expiresAt: null,
          createdAt: now, requestedAt: now, runs: 0, lastResult: null, status: 'queued', nextAt: null,
          parentId: s.id,
        });
      }
      const next = scheduler.computeNext(s.when, now);
      if (s.expiresAt && next && next >= s.expiresAt) {
        // Last run scheduled; retire the recurring task after this occurrence.
        s.status = 'done';
      } else {
        s.nextAt = next;
      }
      s.runs++;
    }

    // 3) If idle, activate the next-highest task.
    this._maybeActivate(now);

    return { active: this.activeId, queued: this.tasks.filter((x) => x.status === 'queued').length };
  }

  _activate(task, now) {
    this.activeId = task.id;
    task.status = 'active';
    task.startedAt = now || Date.now();
    task.runs++;
    this._abort = false;
    const token = ++this._token;
    this._emit('task-active', { task: this._view(task), context: task.context });

    Promise.resolve()
      .then(() => this.runTask(this._view(task), { shouldAbort: () => this._abort || token !== this._token }))
      .then(
        (res) => this._complete(task.id, token, res || { status: 'done' }),
        (err) => this._complete(task.id, token, { status: 'error', message: (err && err.message) || String(err) })
      );
  }

  _complete(id, token, res) {
    // Ignore a completion from a run we already orphaned (preempted/stop-all);
    // a preempted task was already re-queued in _preemptActive.
    if (token !== this._token) {
      const t = this.tasks.find((x) => x.id === id);
      if (t) t._preempted = false;
      return;
    }
    const t = this.tasks.find((x) => x.id === id);
    if (t) {
      t.lastResult = res;
      t.status = 'done';
      this._emit('task-done', { task: this._view(t), result: res });
      // One-off done tasks are pruned; recurring parents already persist.
      this.tasks = this.tasks.filter((x) => x.id !== id);
    }
    if (this.activeId === id) this.activeId = null;
    // Immediately pick up the next task so the queue drains without waiting a tick.
    this.tick(Date.now());
  }

  startTicking(tickMs) {
    this.stopTicking();
    this._timer = setInterval(() => this.tick(Date.now()), tickMs || 1500);
    if (this._timer.unref) this._timer.unref();
  }
  stopTicking() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
}

module.exports = { TaskEngine, PRIO };
