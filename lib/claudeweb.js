'use strict';

/**
 * Prompt a Claude Code session running in a BROWSER TAB (claude.ai/code) —
 * deterministically.
 *
 * lib/claudeapp.js handles the Claude DESKTOP app; this handles the far more
 * common case of Claude Code open in a browser tab. It finds the tab across
 * any installed browser, brings it to the front, focuses the message box, types
 * the prompt with REAL keystrokes (nut.js — required because claude.ai's editor
 * is React/ProseMirror and ignores programmatic value-setting), and submits.
 *
 * Layered + defensive so it works whether or not "Allow JavaScript from Apple
 * Events" is enabled: tab selection is pure AppleScript (always works); input
 * focus is attempted first via JS injection, then via the accessibility tree,
 * then falls back to a click near the bottom of the window.
 */

const { execFile } = require('child_process');
const executor = require('./executor');
const axtree = require('./axtree');

const isMac = process.platform === 'darwin';

// Where Claude Code lives on the web. Matched case-insensitively against tab URLs.
const CLAUDE_CODE_URL = /claude\.ai\/code/i;

const CHROMIUM = ['Google Chrome', 'Arc', 'Brave Browser', 'Microsoft Edge', 'Google Chrome Canary', 'Chromium'];
const SAFARI = ['Safari'];

function osa(args, timeout) {
  return new Promise((resolve) =>
    execFile('osascript', args, { timeout: timeout || 8000 }, (e, o, se) =>
      resolve({ ok: !e, out: String(o || '').trim(), err: e ? String(se || '') || e.message : '' })
    )
  );
}
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function isRunning(app) {
  return /true/i.test((await osa(['-e', `application "${app.replace(/"/g, '')}" is running`])).out);
}

// Focus the Claude message box inside the page (best-effort; needs JS-from-Apple-
// Events). Returns "ok" if it focused something plausible.
const FOCUS_JS = `(function(){
  var el = document.querySelector('div[contenteditable="true"]')
        || document.querySelector('textarea:not([readonly])')
        || document.querySelector('[role=textbox]');
  if(!el) return 'noinput';
  el.scrollIntoView({block:'center'});
  el.focus();
  var r = el.getBoundingClientRect();
  return 'ok ' + Math.round(r.left + r.width/2) + ' ' + Math.round(r.top + r.height/2);
})()`;

function jsEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Find the browser + window holding a Claude Code tab, select that tab, and
 * bring the browser to the front. Returns { ok, app, kind } or { ok:false }.
 */
async function focusClaudeTab() {
  // Chromium: enumerate tabs, match the URL, set active tab + front window.
  for (const app of CHROMIUM) {
    if (!(await isRunning(app))) continue;
    const script =
      `tell application "${app}"\n` +
      `  set wc to count windows\n` +
      `  repeat with w from 1 to wc\n` +
      `    set tc to count tabs of window w\n` +
      `    repeat with t from 1 to tc\n` +
      `      set u to URL of tab t of window w\n` +
      `      if u contains "claude.ai/code" then\n` +
      `        set active tab index of window w to t\n` +
      `        set index of window w to 1\n` +
      `        activate\n` +
      `        return "found"\n` +
      `      end if\n` +
      `    end repeat\n` +
      `  end repeat\n` +
      `end tell\n` +
      `return "none"`;
    const r = await osa(['-e', script]);
    if (r.ok && /found/.test(r.out)) return { ok: true, app, kind: 'chromium' };
  }
  // Safari: same idea, different tab API.
  for (const app of SAFARI) {
    if (!(await isRunning(app))) continue;
    const script =
      `tell application "${app}"\n` +
      `  set wc to count windows\n` +
      `  repeat with w from 1 to wc\n` +
      `    set tc to count tabs of window w\n` +
      `    repeat with t from 1 to tc\n` +
      `      set u to URL of tab t of window w\n` +
      `      if u contains "claude.ai/code" then\n` +
      `        set current tab of window w to tab t of window w\n` +
      `        set index of window w to 1\n` +
      `        activate\n` +
      `        return "found"\n` +
      `      end if\n` +
      `    end repeat\n` +
      `  end repeat\n` +
      `end tell\n` +
      `return "none"`;
    const r = await osa(['-e', script]);
    if (r.ok && /found/.test(r.out)) return { ok: true, app, kind: 'safari' };
  }
  return { ok: false };
}

/** Ask the active tab's page to focus its input; return click coords if it can. */
async function focusInputViaJs(app, kind) {
  const js = jsEscape(FOCUS_JS);
  const script =
    kind === 'safari'
      ? `tell application "Safari" to do JavaScript "${js}" in front document`
      : `tell application "${app}" to execute front window's active tab javascript "${js}"`;
  const r = await osa(['-e', script]);
  if (!r.ok) return { ok: false };
  const m = /^ok\s+(\d+)\s+(\d+)/.exec(r.out);
  if (m) return { ok: true, x: parseInt(m[1], 10), y: parseInt(m[2], 10), viewport: true };
  return { ok: /^ok/.test(r.out), focused: /^ok/.test(r.out) };
}

/**
 * Type a prompt into the Claude Code browser tab and submit it.
 * @param {string} text
 * @param {Function} [onEvent]
 * @returns {Promise<{ok:boolean, app?:string, error?:string}>}
 */
async function promptClaudeCodeWeb(text, onEvent = () => {}) {
  if (!isMac) return { ok: false, error: 'Prompting the Claude Code tab is macOS-only.' };
  const prompt = String(text || '').trim();
  if (!prompt) return { ok: false, error: 'No prompt text.' };
  if (!executor.isAvailable()) return { ok: false, error: 'Native input control is not available.' };

  onEvent({ type: 'action', detail: 'looking for a Claude Code tab in your browser' });
  const tab = await focusClaudeTab();
  if (!tab.ok) return { ok: false, error: 'No Claude Code tab (claude.ai/code) found open in a browser.' };
  await delay(650); // let the browser come forward and the tab paint

  // 1) Try to focus the input via injected JS (most reliable when allowed).
  let clicked = false;
  const jsFocus = await focusInputViaJs(tab.app, tab.kind).catch(() => ({ ok: false }));
  if (jsFocus.ok && jsFocus.focused && !jsFocus.viewport) {
    clicked = true; // page focused the element for us
  }

  // 2) Otherwise, find the input in the accessibility tree and click it.
  if (!clicked) {
    const ax = await axtree.elements().catch(() => ({ ok: false }));
    if (ax.ok && ax.elements.length) {
      const input =
        ax.elements.find((e) => /textarea|textfield|combobox|searchfield/.test(e.role)) ||
        ax.elements.filter((e) => /text/.test(e.role)).sort((a, b) => b.y - a.y)[0];
      if (input) {
        onEvent({ type: 'action', detail: 'clicking the Claude Code message box' });
        await executor.perform({ action: 'left_click', coordinate: [input.x, input.y] });
        clicked = true;
      }
    }
  }

  // 3) Last resort: the composer is at the bottom-centre of the focused window.
  if (!clicked) {
    const b = await windowBottomCenter(tab.app).catch(() => null);
    if (b) {
      onEvent({ type: 'action', detail: 'clicking near the message box' });
      await executor.perform({ action: 'left_click', coordinate: [b.x, b.y] });
      clicked = true;
    }
  }
  await delay(180);

  onEvent({ type: 'action', detail: 'typing the prompt into Claude Code' });
  await executor.perform({ action: 'type', text: prompt });
  await delay(150);
  await executor.perform({ action: 'key', text: 'return' });
  return { ok: true, app: tab.app + ' (web)' };
}

/** Screen coords near the bottom-centre of the frontmost window of `app`. */
async function windowBottomCenter(app) {
  const script =
    `tell application "System Events" to tell process "${app.replace(/"/g, '')}"\n` +
    `  set p to position of window 1\n` +
    `  set s to size of window 1\n` +
    `  return (item 1 of p) & "," & (item 2 of p) & "," & (item 1 of s) & "," & (item 2 of s)\n` +
    `end tell`;
  const r = await osa(['-e', script]);
  const nums = (r.out || '').split(',').map((n) => parseInt(n, 10));
  if (nums.length === 4 && nums.every((n) => Number.isFinite(n))) {
    const [x, y, w, h] = nums;
    return { x: Math.round(x + w / 2), y: Math.round(y + h - 60) };
  }
  return null;
}

module.exports = { promptClaudeCodeWeb, focusClaudeTab, CLAUDE_CODE_URL };
