'use strict';

/**
 * Phase 2 — continuous, private perception.
 *
 * A local, in-memory ring buffer of recent screen frames. This is the
 * "always watching" pillar, built privacy-first:
 *
 *   - OFF by default; the user explicitly opts in.
 *   - In-memory only — frames are NEVER written to disk and never leave the
 *     machine on their own. They are only sent to the model if the user turns a
 *     slice of the buffer into a skill (an explicit action).
 *   - Pausable at any moment, and bounded to a small number of recent frames.
 *
 * The payoff: because recent activity is already captured, the user can name an
 * action they JUST did ("turn what I just did into a skill") instead of having
 * to remember to hit record first.
 */

class WatchBuffer {
  /**
   * @param {object} opts
   * @param {Function} opts.capture   async () => { dataUrl, width, height }
   * @param {number}  [opts.intervalMs] sampling period
   * @param {number}  [opts.maxFrames]  ring-buffer size
   * @param {Function} [opts.onTick]   (status) => void, fired after each sample
   */
  constructor(opts) {
    this.capture = opts.capture;
    this.intervalMs = Number(opts.intervalMs || process.env.SA_WATCH_INTERVAL_MS || 3000);
    this.maxFrames = Number(opts.maxFrames || process.env.SA_WATCH_MAX_FRAMES || 40);
    this.onTick = opts.onTick || (() => {});
    this.frames = []; // [{ t: epochMs, dataUrl }]
    this.active = false;
    this.paused = false;
    this._timer = null;
    this._capturing = false;
  }

  start() {
    if (this.active) return this.status();
    this.active = true;
    this.paused = false;
    this._timer = setInterval(() => this._tick(), this.intervalMs);
    this._tick(); // grab one immediately
    return this.status();
  }

  stop() {
    this.active = false;
    this.paused = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this.frames = []; // dropping the buffer on stop is the private default
    return this.status();
  }

  pause() {
    this.paused = true;
    return this.status();
  }

  resume() {
    if (this.active) this.paused = false;
    return this.status();
  }

  async _tick(nowMs) {
    if (!this.active || this.paused || this._capturing) return;
    this._capturing = true;
    try {
      const shot = await this.capture();
      // Date.now() is fine in the Electron main process (not a workflow script).
      const t = typeof nowMs === 'number' ? nowMs : Date.now();
      this.frames.push({ t, dataUrl: shot.dataUrl });
      if (this.frames.length > this.maxFrames) {
        this.frames.splice(0, this.frames.length - this.maxFrames);
      }
      this.onTick(this.status());
    } catch (err) {
      this.onTick({ ...this.status(), error: err.message });
    } finally {
      this._capturing = false;
    }
  }

  /** The most recent N frame data URLs, oldest → newest. */
  recent(n) {
    const count = Math.max(1, Math.min(n || this.frames.length, this.frames.length));
    return this.frames.slice(this.frames.length - count).map((f) => f.dataUrl);
  }

  status() {
    const latest = this.frames.length ? this.frames[this.frames.length - 1] : null;
    return {
      active: this.active,
      paused: this.paused,
      count: this.frames.length,
      maxFrames: this.maxFrames,
      intervalMs: this.intervalMs,
      latest: latest ? latest.dataUrl : null,
    };
  }
}

module.exports = { WatchBuffer };
