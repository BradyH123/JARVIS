'use strict';

/**
 * Prompt the Claude Code app directly — deterministically.
 *
 * Instead of relying on the visual computer-use loop to find the Claude Code
 * window, this activates the app, finds its message input via the accessibility
 * tree, clicks it, types the prompt, and presses Return. Far more reliable for
 * "click into Claude Code and prompt it".
 */

const { execFile } = require('child_process');
const executor = require('./executor');
const axtree = require('./axtree');
const claudeweb = require('./claudeweb');

const isMac = process.platform === 'darwin';
// The desktop app that hosts Claude Code is usually just "Claude".
const APP_CANDIDATES = ['Claude', 'Claude Code'];

function osa(args, timeout) {
  return new Promise((r) =>
    execFile('osascript', args, { timeout: timeout || 6000 }, (e, o, se) =>
      r({ ok: !e, out: String(o || '').trim(), err: e ? String(se || '') || e.message : '' })
    )
  );
}
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function isRunning(app) {
  const r = await osa(['-e', `application "${app}" is running`]);
  return /true/i.test(r.out);
}

/** Find the running Claude app's name, or null. */
async function findApp() {
  for (const c of APP_CANDIDATES) {
    if (await isRunning(c)) return c;
  }
  return null;
}

/**
 * Type a prompt into the Claude Code app and submit it.
 * @param {string}   text
 * @param {Function} [onEvent]
 * @returns {Promise<{ok:boolean, app?:string, error?:string}>}
 */
async function promptClaudeCode(text, onEvent = () => {}) {
  if (!isMac) return { ok: false, error: 'Prompting the Claude app is macOS-only.' };
  const prompt = String(text || '').trim();
  if (!prompt) return { ok: false, error: 'No prompt text.' };
  if (!executor.isAvailable()) return { ok: false, error: 'Native input control is not available.' };

  const app = await findApp();
  if (!app) {
    // No desktop app — the session is very likely a browser tab (claude.ai/code).
    onEvent({ type: 'action', detail: 'no Claude Code app; checking your browser tabs' });
    const web = await claudeweb.promptClaudeCodeWeb(prompt, onEvent);
    if (web.ok) return web;
    return { ok: false, error: web.error || 'No Claude Code session (app or browser tab) found — open one first.' };
  }

  onEvent({ type: 'action', detail: `bringing ${app} to the front` });
  await osa(['-e', `tell application "${app}" to activate`]);
  await delay(650);

  // With Claude now frontmost, read its actionable elements and click the input.
  const ax = await axtree.elements();
  let input = null;
  if (ax.ok && ax.elements.length) {
    input =
      ax.elements.find((e) => /textarea|searchfield|combobox/.test(e.role)) ||
      ax.elements.find((e) => /textfield/.test(e.role)) ||
      // Fallback: the lowest text-ish element is usually the message box.
      ax.elements.filter((e) => /text/.test(e.role)).sort((a, b) => b.y - a.y)[0];
  }
  if (input) {
    onEvent({ type: 'action', detail: 'clicking the Claude Code message box' });
    await executor.perform({ action: 'left_click', coordinate: [input.x, input.y] });
    await delay(200);
  }

  onEvent({ type: 'action', detail: 'typing the prompt into Claude Code' });
  await executor.perform({ action: 'type', text: prompt });
  await delay(150);
  await executor.perform({ action: 'key', text: 'return' });
  return { ok: true, app };
}

module.exports = { promptClaudeCode, findApp };
