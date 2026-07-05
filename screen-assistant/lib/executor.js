'use strict';

/**
 * OS input layer — the "hands" of the assistant.
 *
 * Translates Claude computer-use actions (left_click, type, key, scroll, …) into
 * real mouse/keyboard events via nut.js. Screenshots are NOT taken here; the
 * Electron main process captures those with desktopCapturer and feeds them back
 * to the agent loop, so this module is purely about *acting*.
 *
 * Coordinates arriving here are already in REAL screen pixels — the agent scales
 * Claude's (downscaled) coordinate space up before calling us.
 *
 * nut.js needs native OS accessibility/automation permissions:
 *   - macOS: System Settings → Privacy & Security → Accessibility
 *   - Linux: an X11 session with libXtst; Wayland is not supported by nut.js
 *   - Windows: works out of the box
 */

let nut = null;
function loadNut() {
  if (nut) return nut;
  // Lazy-load so the app still starts (recorder/library work) even if the native
  // module isn't installed yet.
  // eslint-disable-next-line global-require
  nut = require('@nut-tree-fork/nut-js');
  nut.mouse.config.autoDelayMs = 2;
  nut.keyboard.config.autoDelayMs = 2;
  return nut;
}

const config = require('./config');
const actionDelayMs = () => config.getActionDelayMs();

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Map an xdotool-style key token to a nut.js Key enum value. */
function toKey(token) {
  const { Key } = loadNut();
  const t = String(token).trim();
  const lower = t.toLowerCase();

  const named = {
    return: Key.Enter,
    enter: Key.Enter,
    tab: Key.Tab,
    space: Key.Space,
    backspace: Key.Backspace,
    delete: Key.Delete,
    escape: Key.Escape,
    esc: Key.Escape,
    up: Key.Up,
    down: Key.Down,
    left: Key.Left,
    right: Key.Right,
    home: Key.Home,
    end: Key.End,
    page_up: Key.PageUp,
    pageup: Key.PageUp,
    page_down: Key.PageDown,
    pagedown: Key.PageDown,
    insert: Key.Insert,
    ctrl: Key.LeftControl,
    control: Key.LeftControl,
    alt: Key.LeftAlt,
    option: Key.LeftAlt,
    shift: Key.LeftShift,
    cmd: Key.LeftSuper,
    command: Key.LeftSuper,
    super: Key.LeftSuper,
    meta: Key.LeftSuper,
    win: Key.LeftSuper,
    minus: Key.Minus,
    plus: Key.Add,
    equal: Key.Equal,
  };
  if (named[lower]) return named[lower];

  // Single letter → Key.A..Z
  if (/^[a-z]$/.test(lower)) return Key[t.toUpperCase()];
  // Digit → Key.Num0..Num9
  if (/^[0-9]$/.test(lower)) return Key['Num' + t];
  // Function key → Key.F1..F24
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(lower)) return Key[t.toUpperCase()];

  return null;
}

async function pressCombo(spec) {
  const { keyboard } = loadNut();
  const keys = String(spec)
    .split('+')
    .map((k) => toKey(k))
    .filter(Boolean);
  if (!keys.length) throw new Error('No mappable keys in: ' + spec);
  await keyboard.pressKey(...keys);
  await keyboard.releaseKey(...keys.reverse());
}

async function moveTo(x, y) {
  const { mouse, Point } = loadNut();
  await mouse.setPosition(new Point(Math.round(x), Math.round(y)));
}

/**
 * Perform a single computer-use action in real screen pixels.
 * @param {object} action  the tool_use input, e.g. { action:'left_click', coordinate:[x,y] }
 * @returns {Promise<{ ok: boolean, text?: string, error?: string }>}
 */
async function perform(action) {
  const { mouse, keyboard, Button, Point } = loadNut();
  const a = action.action;
  const [x, y] = Array.isArray(action.coordinate) ? action.coordinate : [];

  try {
    switch (a) {
      case 'screenshot':
        break; // capture handled by caller

      case 'cursor_position': {
        const pos = await mouse.getPosition();
        return { ok: true, text: `(${pos.x}, ${pos.y})` };
      }

      case 'mouse_move':
        await moveTo(x, y);
        break;

      case 'left_click':
        if (x != null) await moveTo(x, y);
        await mouse.click(Button.LEFT);
        break;

      case 'right_click':
        if (x != null) await moveTo(x, y);
        await mouse.click(Button.RIGHT);
        break;

      case 'middle_click':
        if (x != null) await moveTo(x, y);
        await mouse.click(Button.MIDDLE);
        break;

      case 'double_click':
        if (x != null) await moveTo(x, y);
        await mouse.doubleClick(Button.LEFT);
        break;

      case 'triple_click':
        if (x != null) await moveTo(x, y);
        await mouse.click(Button.LEFT);
        await mouse.click(Button.LEFT);
        await mouse.click(Button.LEFT);
        break;

      case 'left_mouse_down':
        if (x != null) await moveTo(x, y);
        await mouse.pressButton(Button.LEFT);
        break;

      case 'left_mouse_up':
        await mouse.releaseButton(Button.LEFT);
        break;

      case 'left_click_drag': {
        const start = action.start_coordinate;
        if (Array.isArray(start)) await moveTo(start[0], start[1]);
        await mouse.pressButton(Button.LEFT);
        if (x != null) await moveTo(x, y);
        await mouse.releaseButton(Button.LEFT);
        break;
      }

      case 'type':
        await keyboard.type(action.text || '');
        break;

      case 'key':
        await pressCombo(action.text || '');
        break;

      case 'hold_key': {
        // Hold key(s) for a duration (seconds), best-effort.
        const keys = String(action.text || '')
          .split('+')
          .map(toKey)
          .filter(Boolean);
        if (keys.length) {
          await keyboard.pressKey(...keys);
          await delay(Math.min(10000, (action.duration || 1) * 1000));
          await keyboard.releaseKey(...keys.reverse());
        }
        break;
      }

      case 'scroll': {
        if (x != null) await moveTo(x, y);
        const amount = Math.max(1, action.scroll_amount || 3);
        const dir = action.scroll_direction;
        if (dir === 'up') await mouse.scrollUp(amount);
        else if (dir === 'down') await mouse.scrollDown(amount);
        else if (dir === 'left') await mouse.scrollLeft(amount);
        else if (dir === 'right') await mouse.scrollRight(amount);
        break;
      }

      case 'wait':
        await delay(Math.min(10000, (action.duration || 1) * 1000));
        break;

      default:
        return { ok: false, error: 'Unsupported action: ' + a };
    }

    // Small settle delay so the UI can react before the next screenshot.
    await delay(actionDelayMs());
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Probe whether the native input module is available. */
function isAvailable() {
  try {
    loadNut();
    return true;
  } catch {
    return false;
  }
}

module.exports = { perform, isAvailable };
