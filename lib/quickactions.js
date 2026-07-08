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
const path = require('path');

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

/**
 * Find an installed .app bundle whose name matches (fuzzily) — so "Ableton Live"
 * opens "Ableton Live 12 Suite.app", "photoshop" opens "Adobe Photoshop 2024",
 * etc. Uses Spotlight metadata (mdfind), preferring /Applications and the
 * shortest / closest name.
 */
async function findAppBundle(name) {
  const q = String(name || '').replace(/["']/g, '').trim();
  if (!q) return null;
  // Match app bundles whose filename contains the query, case-insensitively.
  const r = await runOut('mdfind', [
    `kMDItemContentTypeTree == 'com.apple.application' && kMDItemFSName == '*${q}*.app'c`,
  ]);
  let paths = (r.output || '').split('\n').map((s) => s.trim()).filter((p) => p.endsWith('.app'));
  if (!paths.length) {
    // Broader fallback: any file named like the app.
    const r2 = await runOut('mdfind', [`kMDItemFSName == '*${q}*.app'c`]);
    paths = (r2.output || '').split('\n').map((s) => s.trim()).filter((p) => p.endsWith('.app'));
  }
  if (!paths.length) return null;
  paths.sort((a, b) => {
    const rank = (p) => (/\/Applications\//.test(p) ? 0 : /\/System\//.test(p) ? 2 : 1);
    return rank(a) - rank(b) || a.length - b.length;
  });
  return paths[0];
}

/** Open an application by name — exact first, then a fuzzy bundle search. */
async function openApp(name) {
  if (!isMac) return { ok: false, error: 'quick open is macOS-only' };
  const app = String(name || '').trim();
  if (!app) return { ok: false, error: 'no app name' };
  // 1) Fast path: exact / near-exact name.
  const r = await run('open', ['-a', app]);
  if (r.ok) return { ok: true, text: `Opened ${app}.` };
  // 2) Fuzzy: find the real bundle (handles version suffixes, vendor prefixes).
  const bundle = await findAppBundle(app);
  if (bundle) {
    const r2 = await run('open', [bundle]);
    if (r2.ok) return { ok: true, text: `Opened ${path.basename(bundle, '.app')}.` };
  }
  return { ok: false, error: `I couldn't find an app matching "${app}".` };
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

// Never quit/close JARVIS itself — this is the guard that stops "close my tabs"
// from shutting the assistant down.
const SELF_NAMES = /\b(jarvis|assistant|electron)\b/i;
const BROWSERS = ['Google Chrome', 'Safari', 'Arc', 'Brave Browser', 'Microsoft Edge', 'Firefox'];

/** Run a command capturing stdout (for AppleScript queries). */
function runOut(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000 }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: String(stdout || '').trim(), error: err ? String(stderr || '') || err.message : '' });
    });
  });
}

async function isRunning(app) {
  const r = await runOut('osascript', ['-e', `application "${app.replace(/"/g, '')}" is running`]);
  return /true/i.test(r.output);
}

/** Quit an application by name (e.g. "close my browser"). Never quits JARVIS. */
async function quitApp(name) {
  const app = String(name || '').trim();
  if (!app) return { ok: false, error: 'no app name' };
  // Self-preservation check comes first, on every platform.
  if (SELF_NAMES.test(app)) return { ok: false, error: "I won't quit myself." };
  if (!isMac) return { ok: false, error: 'quit is macOS-only' };
  if (!(await isRunning(app))) return { ok: true, text: `${app} isn't running.` };
  const r = await runOut('osascript', ['-e', `tell application "${app.replace(/"/g, '')}" to quit`]);
  return r.ok ? { ok: true, text: `Quit ${app}.` } : { ok: false, error: r.error || 'quit failed' };
}

/**
 * Close the tabs of a browser window (a specific browser, or the first running
 * one we find). Uses targeted AppleScript so it never touches JARVIS's window.
 */
async function closeTabs(browser) {
  if (!isMac) return { ok: false, error: 'close-tabs is macOS-only' };
  const wanted = String(browser || '').trim();
  const list = wanted ? [wanted] : BROWSERS;
  for (const b of list) {
    if (SELF_NAMES.test(b)) continue;
    if (!(await isRunning(b))) continue;
    const script = /safari/i.test(b)
      ? `tell application "${b}" to close every tab of front window`
      : `tell application "${b}" to close (every tab of front window)`;
    const r = await runOut('osascript', ['-e', script]);
    if (r.ok) return { ok: true, text: `Closed the tabs in ${b}.` };
  }
  return { ok: false, error: 'No open browser window found to close tabs in.' };
}

/**
 * Dispatch a routed quick action.
 * @param {{kind:string, target:string}} action
 */
async function perform(action) {
  const kind = action && action.kind;
  const target = action && action.target;
  if (kind === 'open_app') return openApp(target);
  if (kind === 'open_url') return openUrl(target);
  if (kind === 'web_search') return webSearch(target);
  if (kind === 'quit_app') return quitApp(target);
  if (kind === 'close_tabs') return closeTabs(target);
  return { ok: false, error: 'unknown quick action: ' + kind };
}

module.exports = {
  perform,
  openApp,
  openUrl,
  webSearch,
  quitApp,
  closeTabs,
  normalizeUrl,
  isSupported: () => isMac,
};
