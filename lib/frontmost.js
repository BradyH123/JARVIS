'use strict';

/**
 * Frontmost-app awareness — the basis for MECHANICAL self-preservation.
 *
 * The computer-use loop is told (in its prompt) never to quit its own window,
 * but a prompt is guidance, not a guarantee — and JARVIS once closed itself when
 * asked to "close all my tabs". This turns that into a hard check: before a
 * quit/close-window shortcut fires, we ask macOS which app is frontmost and
 * refuse if it's JARVIS itself.
 */

const { execFile } = require('child_process');

const isMac = process.platform === 'darwin';
const SELF = /\b(jarvis|assistant|electron)\b/i;

/** The name of the frontmost application ('' if unknown / non-mac). */
function frontmostApp() {
  return new Promise((resolve) => {
    if (!isMac) return resolve('');
    execFile(
      'osascript',
      ['-e', 'tell application "System Events" to get name of first application process whose frontmost is true'],
      { timeout: 4000 },
      (err, out) => resolve(err ? '' : String(out || '').trim())
    );
  });
}

/** Is this app name JARVIS itself? */
function isSelf(name) {
  return SELF.test(String(name || ''));
}

/** True when JARVIS's own window is frontmost (so a close/quit would hit us). */
async function selfIsFrontmost() {
  return isSelf(await frontmostApp());
}

module.exports = { frontmostApp, isSelf, selfIsFrontmost };
