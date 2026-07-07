'use strict';

/**
 * Fast path for common, deterministic tasks — no screenshots, no model-in-the-
 * loop vision cycle. "Open Google", "launch Safari", "search for X" don't need
 * the assistant to LOOK at the screen; on macOS they're a single `open` call,
 * so they should happen instantly instead of driving the slow computer-use loop.
 *
 * Everything here uses execFile (no shell) so a target string can't be injected
 * into a shell command. Non-macOS platforms return ok:false so the caller can
 * fall back to the full computer-use agent.
 */

const { execFile } = require('child_process');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000 }, (err) => {
      if (err) resolve({ ok: false, error: err.message });
      else resolve({ ok: true });
    });
  });
}

const isMac = process.platform === 'darwin';

/** Turn a loose target into a real URL, or null if it isn't one. */
function normalizeUrl(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  // Looks like a bare domain (has a dot, no spaces): example.com, youtube.com/feed
  if (/^[^\s]+\.[^\s]+$/.test(t)) return 'https://' + t.replace(/^\/+/, '');
  return null;
}

function searchUrl(query) {
  return 'https://www.google.com/search?q=' + encodeURIComponent(String(query || '').trim());
}

/** Open an application by name (e.g. "Safari", "Google Chrome", "Mail"). */
async function openApp(name) {
  if (!isMac) return { ok: false, error: 'quick open is macOS-only' };
  const app = String(name || '').trim();
  if (!app) return { ok: false, error: 'no app name' };
  const r = await run('open', ['-a', app]);
  return r.ok ? { ok: true, text: `Opened ${app}.` } : r;
}

/** Open a URL (or, if the target isn't a URL, search the web for it). */
async function openUrl(target) {
  if (!isMac) return { ok: false, error: 'quick open is macOS-only' };
  const url = normalizeUrl(target);
  if (!url) return webSearch(target);
  const r = await run('open', [url]);
  return r.ok ? { ok: true, text: `Opened ${url}.` } : r;
}

/** Open the default browser to a Google search for the query. */
async function webSearch(query) {
  if (!isMac) return { ok: false, error: 'quick open is macOS-only' };
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'no query' };
  const r = await run('open', [searchUrl(q)]);
  return r.ok ? { ok: true, text: `Searched the web for “${q}”.` } : r;
}

/**
 * Dispatch a routed quick action.
 * @param {{kind:'open_app'|'open_url'|'web_search', target:string}} action
 */
async function perform(action) {
  const kind = action && action.kind;
  const target = action && action.target;
  if (kind === 'open_app') return openApp(target);
  if (kind === 'open_url') return openUrl(target);
  if (kind === 'web_search') return webSearch(target);
  return { ok: false, error: 'unknown quick action: ' + kind };
}

module.exports = { perform, openApp, openUrl, webSearch, normalizeUrl, isSupported: () => isMac };
