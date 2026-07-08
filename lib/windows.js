'use strict';

/**
 * Window organizer (macOS) — arrange the user's open windows so JARVIS can
 * actually SEE everything.
 *
 * Two jobs:
 *   1. arrange() — tile every visible app window into a non-overlapping grid
 *      inside the work area (minus a reserved lane for JARVIS's own orb), so no
 *      window hides another. This is how "make sure he can see all the different
 *      tabs/windows" works: nothing is buried behind something else.
 *   2. list() — read every visible window's app, title and bounds, so the
 *      assistant knows what's on screen without a screenshot.
 *
 * Uses the Accessibility API via JXA/System Events (the same permission JARVIS
 * already needs for mouse/keyboard). Best-effort and defensive: hard timeouts,
 * caps, and error objects instead of throwing. Requires on-device validation.
 * Never moves or resizes JARVIS's own window.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const isMac = process.platform === 'darwin';

// Never touch JARVIS's own window(s) while organizing the screen.
const SELF_NAMES = /\b(jarvis|assistant|electron)\b/i;

// JXA: enumerate every non-minimized standard window of every visible,
// non-background app, returning app name + per-app window index + bounds.
const READ_JXA = `function run() {
  var se = Application('System Events');
  var out = [];
  var procs = [];
  try { procs = se.applicationProcesses.whose({ visible: true })(); } catch (e) { return '[]'; }
  for (var p = 0; p < procs.length && out.length < 60; p++) {
    var proc = procs[p], appName = '';
    try { appName = proc.name(); } catch (e) {}
    if (!appName) continue;
    var bg = false;
    try { bg = proc.backgroundOnly(); } catch (e) {}
    if (bg) continue;
    var wins = [];
    try { wins = proc.windows(); } catch (e) { continue; }
    for (var w = 0; w < wins.length && out.length < 60; w++) {
      var win = wins[w], pos, size, title = '', mini = false, subrole = '';
      try { mini = win.attributes.byName('AXMinimized').value(); } catch (e) {}
      if (mini) continue;
      try { subrole = win.subrole(); } catch (e) {}
      // Only real, standard windows (skip palettes, sheets, tooltips).
      if (subrole && subrole !== 'AXStandardWindow') continue;
      try { pos = win.position(); size = win.size(); } catch (e) { continue; }
      if (!pos || !size || size[0] < 120 || size[1] < 80) continue;
      try { title = win.title() || ''; } catch (e) {}
      out.push({ app: appName, index: w + 1, title: (title || '').toString().slice(0, 80),
                 x: Math.round(pos[0]), y: Math.round(pos[1]),
                 w: Math.round(size[0]), h: Math.round(size[1]) });
    }
  }
  return JSON.stringify(out);
}`;

let scriptPath = null;
function ensureScript() {
  if (scriptPath && fs.existsSync(scriptPath)) return scriptPath;
  scriptPath = path.join(os.tmpdir(), 'jarvis-windows.js');
  fs.writeFileSync(scriptPath, READ_JXA, 'utf8');
  return scriptPath;
}

function osa(args, timeout) {
  return new Promise((resolve) => {
    execFile('osascript', args, { timeout: timeout || 8000 }, (err, out, se) =>
      resolve({ ok: !err, out: String(out || '').trim(), err: err ? String(se || '') || err.message : '' })
    );
  });
}

/** Read every visible standard window with its app, title and bounds. */
function list() {
  return new Promise((resolve) => {
    if (!isMac) return resolve({ ok: false, error: 'Window management is macOS-only.', windows: [] });
    let file;
    try {
      file = ensureScript();
    } catch (e) {
      return resolve({ ok: false, error: e.message, windows: [] });
    }
    execFile('osascript', ['-l', 'JavaScript', file], { timeout: 9000, maxBuffer: 4 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) return resolve({ ok: false, error: String(errOut || err.message).slice(0, 200), windows: [] });
      let arr = [];
      try {
        arr = JSON.parse(String(out || '[]'));
      } catch {
        return resolve({ ok: false, error: 'Could not read the window list.', windows: [] });
      }
      resolve({ ok: true, windows: Array.isArray(arr) ? arr : [] });
    });
  });
}

/**
 * Compute a tidy grid layout for N windows inside a rectangle. Roughly square:
 * cols = ceil(sqrt(N)), so 1→1×1, 2→2×1, 3-4→2×2, 5-6→3×2, 7-9→3×3, etc.
 * Returns an array of { x, y, w, h } cells (row-major).
 */
function gridCells(n, area, gap) {
  const cells = [];
  if (n <= 0) return cells;
  const g = gap == null ? 8 : gap;
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = Math.floor((area.width - g * (cols + 1)) / cols);
  const cellH = Math.floor((area.height - g * (rows + 1)) / rows);
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    // Last row: center any leftover windows so the grid doesn't look ragged.
    const inRow = Math.min(cols, n - r * cols);
    const rowOffset = Math.floor(((cols - inRow) * (cellW + g)) / 2);
    cells.push({
      x: area.x + g + c * (cellW + g) + (r === rows - 1 ? rowOffset : 0),
      y: area.y + g + r * (cellH + g),
      w: cellW,
      h: cellH,
    });
  }
  return cells;
}

/** Move + resize one window by app name and per-app window index. */
async function place(app, index, cell) {
  const safeApp = String(app).replace(/"/g, '\\"');
  const script =
    `tell application "System Events" to tell process "${safeApp}"\n` +
    `  set position of window ${index} to {${cell.x}, ${cell.y}}\n` +
    `  set size of window ${index} to {${cell.w}, ${cell.h}}\n` +
    `end tell`;
  return osa(['-e', script], 6000);
}

/**
 * Tile all visible windows so none overlaps and everything is fully in view.
 *
 * @param {{x:number,y:number,width:number,height:number}} workArea  usable screen area
 * @param {object} [opts]
 * @param {number} [opts.reserveRight]  px lane on the right to leave clear for the orb
 * @param {number} [opts.gap]           px gap between tiles
 * @param {string[]} [opts.exclude]     extra app names to leave untouched
 */
async function arrange(workArea, opts = {}) {
  if (!isMac) return { ok: false, error: 'Window management is macOS-only.' };
  const wa = workArea || { x: 0, y: 0, width: 1440, height: 900 };
  const reserveRight = Number.isFinite(opts.reserveRight) ? opts.reserveRight : 150;
  const gap = Number.isFinite(opts.gap) ? opts.gap : 8;
  const extra = (opts.exclude || []).map((s) => String(s).toLowerCase());

  const { ok, windows, error } = await list();
  if (!ok) return { ok: false, error };

  // Keep only windows we should tile: not JARVIS, not explicitly excluded.
  const targets = windows.filter(
    (w) => !SELF_NAMES.test(w.app) && !extra.includes(String(w.app).toLowerCase())
  );
  if (!targets.length) return { ok: true, arranged: 0, text: 'No windows to organize.' };

  // The tiling area is the work area minus the reserved orb lane on the right.
  const area = {
    x: wa.x,
    y: wa.y,
    width: Math.max(320, wa.width - reserveRight),
    height: wa.height,
  };
  const cells = gridCells(targets.length, area, gap);

  let arranged = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const r = await place(t.app, t.index, cells[i]);
    if (r.ok) arranged++;
  }
  const apps = [...new Set(targets.slice(0, arranged).map((t) => t.app))];
  return {
    ok: true,
    arranged,
    total: targets.length,
    text: arranged
      ? `Organized ${arranged} window${arranged === 1 ? '' : 's'} into a grid${apps.length ? ' (' + apps.slice(0, 6).join(', ') + ')' : ''}.`
      : "I found windows but couldn't move them — check Accessibility permission.",
  };
}

module.exports = { list, arrange, gridCells, isSupported: () => isMac };
