'use strict';

/**
 * Electron main process.
 *
 * Responsibilities:
 *   - own the app window
 *   - capture screen frames (via desktopCapturer) on request
 *   - register a global shortcut to start/stop recording a demonstration
 *   - bridge the renderer to the skill store and to Claude
 *
 * The renderer never sees the API key or the filesystem; it only talks to the
 * whitelisted IPC channels defined here (see preload.js).
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  systemPreferences,
  Tray,
} = require('electron');

const config = require('./lib/config');
const { SkillStore } = require('./lib/skills');
const { WorkflowStore } = require('./lib/workflows');
const claude = require('./lib/claude');
const agent = require('./lib/agent');
const executor = require('./lib/executor');
const quickactions = require('./lib/quickactions');
const improver = require('./lib/improver');
const claudecode = require('./lib/claudecode');
const terminal = require('./lib/shell');
const webpage = require('./lib/webpage');
const crawler = require('./lib/crawler');
const axtree = require('./lib/axtree');
const windows = require('./lib/windows');
const claudeapp = require('./lib/claudeapp');
const transcribe = require('./lib/transcribe');
const telemetry = require('./lib/telemetry');
const sweep = require('./lib/sweep');
const content = require('./lib/content');
const memory = require('./lib/memory');
const { WatchBuffer } = require('./lib/monitor');
const { execFile } = require('child_process');

// The JARVIS repo root when running from source (main.js sits at the root).
// Self-editing via Claude Code only works from a checkout, not a packaged asar.
const REPO_DIR = __dirname;

/** Files changed in the working tree (porcelain), best-effort. */
function changedFiles() {
  return new Promise((resolve) => {
    execFile('git', ['-C', REPO_DIR, 'status', '--porcelain'], { timeout: 5000 }, (err, out) => {
      if (err) return resolve([]);
      const files = String(out || '')
        .split('\n')
        .map((l) => l.slice(3).trim())
        .filter(Boolean);
      resolve(files);
    });
  });
}

const SELF_IMPROVE_TASK = (goal) =>
  'You are working inside JARVIS\'s OWN source repository (an Electron desktop ' +
  'assistant: main process in main.js, sandboxed renderer in renderer/, logic in ' +
  'lib/). The user wants you to improve JARVIS itself.\n\n' +
  `TASK: ${goal}\n\n` +
  'Guidelines: read the relevant files first; make the smallest change that ' +
  'satisfies the task and matches the existing style; keep every file valid; do ' +
  'NOT weaken the safety model (approval gates, STOP kill switch, path guards). ' +
  'When done, run the tests with `node test/smoke.js` and make sure they pass. ' +
  'Finish with a one-line summary of what you changed.';

// Goal for driving the user's ALREADY-OPEN Claude Code session by typing into it
// (via computer-use), instead of spawning a hidden claude process. This is what
// the user wants: use the real, authenticated on-screen session.
const ONSCREEN_TASK = (request) =>
  'Hand a coding task to the Claude Code session that is ALREADY OPEN on this computer ' +
  '(a terminal window or the Claude app where `claude` / Claude Code is running). Do EXACTLY ' +
  'these steps, then STOP:\n' +
  '1. Bring that Claude Code window to the front (use the app switcher / Dock / click it). If ' +
  'you cannot find an open Claude Code session, say so and stop.\n' +
  '2. Click its message input box (usually at the bottom of that window).\n' +
  '3. Type this message VERBATIM and then press Enter/Return to send it:\n' +
  `   "${request}. Make this change in the JARVIS repository you are working in, keep the app ` +
  'working, run node test/smoke.js, and commit the change with git when the tests pass."\n' +
  '4. After pressing Enter, STOP immediately. Do not type anything else or take further ' +
  'actions — the Claude Code session will do the work from here.';

let mainWindow = null;
let widgetWindow = null; // always-on-top JARVIS widget
let tray = null; // menu-bar icon so the widget is always recoverable

function showWidget() {
  if (!widgetWindow || widgetWindow.isDestroyed()) createWidget();
  else widgetWindow.show();
  widgetWindow.focus();
}
let store = null;
let workflows = null; // Phase 3 workflow store
let watch = null; // Phase 2 always-on capture buffer
let sessionAbort = false; // kill switch for the autonomous loop
let sessionRunning = false;
let improveRunning = false; // the assistant is editing its own code
let observing = false; // watch-and-learn loop is active
let observeTimer = null;
const OBSERVE_INTERVAL_MS = 120000; // summarize the user's activity every ~2 min
const pendingConfirms = new Map(); // id -> resolve(boolean) for permission gates

// Periodically summarize recent activity into the Observations vault.
async function observeTick() {
  if (!observing || !watch) return;
  try {
    const frames = watch.recent(4);
    if (!frames || !frames.length) return;
    const note = await claude.observeActivity(frames);
    if (note) {
      memory.addObservation(note);
      broadcast('watch:event', { active: true, paused: false, learning: true, note });
    }
  } catch {
    /* best-effort learning — never disrupt the app */
  }
}
function startObserving() {
  if (observing) return;
  if (watch) watch.start();
  observing = true;
  observeTimer = setInterval(observeTick, OBSERVE_INTERVAL_MS);
  setTimeout(observeTick, 8000); // a first observation shortly after starting
}
function stopObserving() {
  observing = false;
  if (observeTimer) {
    clearInterval(observeTimer);
    observeTimer = null;
  }
  if (watch) watch.stop();
}

function resolveAllConfirms(value) {
  for (const resolve of pendingConfirms.values()) resolve(value);
  pendingConfirms.clear();
}

/**
 * Run one autonomous session (a single skill or goal). Shared by the single-run
 * IPC and the workflow runner so every entry point goes through the same gated
 * path. Does NOT own sessionRunning/sessionAbort — the caller sets those so a
 * workflow can span multiple sessions under one lifecycle.
 */
async function runSingleSession(skill, goal, send) {
  const objective = goal || (skill ? skill.name : null);
  if (!objective) return { status: 'error', message: 'No goal or skill provided.' };
  return agent.runSession({
    goal: objective,
    skill,
    capture: captureSized,
    execute: executor.perform,
    onEvent: send,
    shouldAbort: () => sessionAbort,
    // Fails safe: a stopped run or closed window resolves pending prompts denied.
    confirm: ({ summary, risk }) =>
      new Promise((resolve) => {
        if (sessionAbort) return resolve(false);
        const id = crypto.randomUUID();
        pendingConfirms.set(id, resolve);
        send({ type: 'confirm-request', id, summary, risk });
      }),
  });
}

function nowIso() {
  return new Date().toISOString();
}

/** Send an event to every open window so the widget and dashboard stay in sync. */
function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

// The full dashboard (tabs). Created hidden; the widget is the primary surface.
function createWindow(show) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (show) mainWindow.show();
    return mainWindow;
  }
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    title: 'Screen Assistant',
    backgroundColor: '#0f1115',
    show: Boolean(show),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
  return mainWindow;
}

const WIDGET_FULL = { width: 360, height: 520 };
const WIDGET_MINI = { width: 132, height: 132 };
let widgetCollapsed = false;
let saveWidgetTimer = null;

// The always-on-top JARVIS widget: frameless, transparent, floats over work.
function createWidget() {
  const wa = screen.getPrimaryDisplay().workArea;
  const saved = config.getWidgetState();
  widgetCollapsed = Boolean(saved.collapsed);
  const size = widgetCollapsed ? WIDGET_MINI : WIDGET_FULL;

  widgetWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: Number.isFinite(saved.x) ? saved.x : wa.x + wa.width - 384,
    y: Number.isFinite(saved.y) ? saved.y : wa.y + wa.height - 552,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    title: 'Assistant',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  widgetWindow.setAlwaysOnTop(true, 'floating');
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  widgetWindow.loadFile(path.join(__dirname, 'renderer', 'widget.html'));

  // Persist position (debounced) whenever the user drags the widget.
  widgetWindow.on('move', () => {
    clearTimeout(saveWidgetTimer);
    saveWidgetTimer = setTimeout(() => {
      if (!widgetWindow || widgetWindow.isDestroyed()) return;
      const [x, y] = widgetWindow.getPosition();
      config.setWidgetState({ x, y });
    }, 400);
  });

  // Tell the renderer its initial collapsed state once it's ready.
  widgetWindow.webContents.on('did-finish-load', () => {
    widgetWindow.webContents.send('widget:collapsed', widgetCollapsed);
  });
}

// Collapse/expand the widget to the floating-orb mini-mode, keeping the
// bottom-right corner anchored so it doesn't jump across the screen.
function setWidgetCollapsed(collapsed) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  widgetCollapsed = Boolean(collapsed);
  const [x, y] = widgetWindow.getPosition();
  const [w, h] = widgetWindow.getSize();
  const next = widgetCollapsed ? WIDGET_MINI : WIDGET_FULL;
  widgetWindow.setBounds({
    x: x + (w - next.width),
    y: y + (h - next.height),
    width: next.width,
    height: next.height,
  });
  config.setWidgetState({ collapsed: widgetCollapsed });
  widgetWindow.webContents.send('widget:collapsed', widgetCollapsed);
}

// A menu-bar / system-tray icon. This is the safety net: however the widget is
// hidden or collapsed, the tray always brings it back.
function createTray() {
  if (tray) return;
  let icon = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png'));
  if (!icon.isEmpty()) {
    icon = icon.resize({ width: 18, height: 18 });
    icon.setTemplateImage(true);
  }
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Screen Assistant');
  const menu = Menu.buildFromTemplate([
    { label: 'Show assistant', click: () => showWidget() },
    { label: 'Open workspace', click: () => createWindow(true) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  // A left-click just brings the widget back — the common case.
  tray.on('click', () => showWidget());
}

/**
 * Capture a single screenshot of the primary display and return it as a JPEG
 * data URL. JPEG is ~5-10x smaller than PNG for screen content, which cuts both
 * the model token bill and IPC/storage overhead with no meaningful accuracy
 * loss for UI grounding. Thumbnail size is capped to the model's target width.
 */
async function captureSized() {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.size;
  const scale = Math.min(1, config.getTargetWidth() / width);

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    },
  });

  if (!sources.length) throw new Error('No screen source available to capture.');
  // Primary display first if we can identify it, else the first source.
  const source =
    sources.find((s) => String(s.display_id) === String(primary.id)) || sources[0];
  const jpeg = source.thumbnail.toJPEG(72); // 72% quality: small, still legible
  const dataUrl = 'data:image/jpeg;base64,' + jpeg.toString('base64');
  // Report the display's LOGICAL size (points), NOT the downscaled thumbnail's
  // pixel size. This is the coordinate space nut.js actually moves the mouse in
  // on macOS/Retina — the agent scales the model's click coordinates back into
  // it, so clicks must land in points, not thumbnail pixels. Returning thumbnail
  // pixels here compresses every click toward the top-left (missed targets).
  return { dataUrl, width, height };
}

async function captureFrame() {
  return (await captureSized()).dataUrl;
}

/** Evenly sample at most `max` items from an array (keeps first and last). */
function sampleFrames(frames, max) {
  if (frames.length <= max) return frames;
  const step = (frames.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(frames[Math.round(i * step)]);
  return out;
}

function registerIpc() {
  ipcMain.handle('capture-frame', async () => {
    return captureFrame();
  });

  ipcMain.handle('skills:list', async () => store.list());

  ipcMain.handle('skills:delete', async (_e, id) => store.remove(id));

  ipcMain.handle('skills:get', async (_e, id) => store.get(id));

  // Save a demonstration: ask Claude to generalize it, then persist.
  ipcMain.handle('skills:save', async (_e, payload) => {
    const { name, note, frames } = payload || {};
    const allFrames = frames || [];
    const learned = await claude.understandDemonstration(allFrames, { name, note });
    // Keep only a representative sample on disk (evenly spaced) so skills.json
    // doesn't balloon — the generalized steps, not the pixels, are the value.
    const kept = sampleFrames(allFrames, 8);
    const skill = {
      id: crypto.randomUUID(),
      name: name || 'Untitled action',
      note: note || '',
      frames: kept,
      created_at: nowIso(),
      ...learned,
    };
    return store.add(skill);
  });

  ipcMain.handle('assistant:chat', async (_e, history) => {
    const hist = history || [];
    const result = await claude.chat(hist, store.contextForPrompt());
    // Persist this exchange to the shared memory vault so BOTH surfaces recall it.
    const lastUser = [...hist].reverse().find((m) => m.role === 'user');
    if (lastUser) memory.logTurn('user', lastUser.text, 'assistant tab');
    if (result.reply) memory.logTurn('assistant', result.reply, 'assistant tab');
    return result;
  });

  // Voice/NL command → intent routing (skill, workflow, goal, or reply).
  ipcMain.handle('assistant:command', async (_e, transcript) => {
    memory.logTurn('user', String(transcript || ''), 'widget');
    const routed = await claude.routeCommand(
      String(transcript || ''),
      store.contextForPrompt(),
      workflows.contextForPrompt(store)
    );
    // Log what JARVIS decided so the memory reflects both surfaces' activity.
    if (routed.action === 'reply' && routed.message) {
      memory.logTurn('assistant', routed.message, 'widget');
    } else if (routed.action !== 'reply') {
      const detail = routed.goal || routed.request || routed.target || routed.skill_id || '';
      memory.logTurn('assistant', `(${routed.action}) ${detail}`.trim(), 'widget');
    }
    if (routed.action === 'skill') {
      const skill = store.get(routed.skill_id);
      routed.skill_name = skill ? skill.name : null;
      if (!skill) {
        routed.action = 'reply';
        routed.message = "I couldn't find that skill anymore.";
      }
    } else if (routed.action === 'workflow') {
      const wf = workflows.get(routed.workflow_id);
      routed.workflow_name = wf ? wf.name : null;
      if (!wf) {
        routed.action = 'reply';
        routed.message = "I couldn't find that workflow anymore.";
      }
    }
    return routed;
  });

  // --- Phase 3: workflow library CRUD ---
  ipcMain.handle('workflows:list', async () => workflows.list());
  ipcMain.handle('workflows:get', async (_e, id) => workflows.get(id));
  ipcMain.handle('workflows:save', async (_e, payload) => {
    const wf = {
      id: crypto.randomUUID(),
      name: (payload && payload.name) || 'Untitled workflow',
      description: (payload && payload.description) || '',
      trigger_phrases: (payload && payload.trigger_phrases) || [],
      steps: (payload && payload.steps) || [],
      created_at: nowIso(),
    };
    return workflows.add(wf);
  });
  ipcMain.handle('workflows:delete', async (_e, id) => workflows.remove(id));

  // Build (but do not run) an execution plan for a skill against the live screen.
  ipcMain.handle('assistant:plan', async (_e, skillId) => {
    const skill = store.get(skillId);
    if (!skill) throw new Error('Skill not found: ' + skillId);
    let screenshot = null;
    try {
      screenshot = await captureFrame();
    } catch {
      /* planning can proceed without a screenshot */
    }
    const plan = await claude.planExecution(skill, screenshot);
    return { skill: { id: skill.id, name: skill.name }, ...plan };
  });

  // Autonomously execute a goal (optionally guided by a learned skill) by
  // driving the real mouse/keyboard. Progress streams to the renderer over the
  // 'agent:event' channel. Requires the native input module + user approval.
  ipcMain.handle('assistant:execute', async (e, payload) => {
    const { skillId, goal } = payload || {};
    if (sessionRunning || improveRunning) return { status: 'busy' };
    if (!executor.isAvailable()) {
      return {
        status: 'error',
        message:
          'Native input module not available. Run "npm install" so @nut-tree-fork/nut-js ' +
          'builds, and grant OS accessibility permission. See README.',
      };
    }

    const skill = skillId ? store.get(skillId) : null;
    const objective = goal || (skill ? skill.name : null);
    if (!objective) return { status: 'error', message: 'No goal or skill provided.' };

    const send = (evt) => broadcast('agent:event', evt);

    sessionAbort = false;
    sessionRunning = true;
    send({ type: 'started', goal: objective });
    memory.logTurn('assistant', `(started task) ${objective}`, 'widget');
    const startedAt = Date.now();
    try {
      const result = await runSingleSession(skill, goal, send);
      // Record the outcome so JARVIS remembers what he actually completed.
      memory.logTurn('assistant', `(task ${result.status}) ${objective}`, 'widget');
      telemetry.record({ kind: 'task', goal: objective, status: result.status, steps: result.steps, durationMs: Date.now() - startedAt });
      send({ type: 'finished', ...result });
      return result;
    } catch (err) {
      memory.logTurn('assistant', `(task failed) ${objective}: ${err.message}`, 'widget');
      telemetry.record({ kind: 'task', goal: objective, status: 'error', error: err.message, durationMs: Date.now() - startedAt });
      send({ type: 'error', message: err.message });
      return { status: 'error', message: err.message };
    } finally {
      sessionRunning = false;
    }
  });

  // Run a saved workflow: each step is a gated autonomous session; halt if a
  // step ends anything other than 'done' (abort/error/step-cap).
  ipcMain.handle('workflows:run', async (e, workflowId) => {
    if (sessionRunning || improveRunning) return { status: 'busy' };
    if (!executor.isAvailable()) {
      return { status: 'error', message: 'Native input module not available. See README.' };
    }
    const wf = workflows.get(workflowId);
    if (!wf) return { status: 'error', message: 'Workflow not found.' };

    const { runnable, missing } = workflows.resolveSteps(workflowId, store);
    const send = (evt) => broadcast('agent:event', evt);

    sessionAbort = false;
    sessionRunning = true;
    send({ type: 'started', goal: `Workflow: ${wf.name}`, workflow: true });
    if (missing.length) {
      send({ type: 'thinking', text: `${missing.length} step(s) reference missing skills and were skipped.` });
    }

    let last = { status: 'done' };
    try {
      for (let i = 0; i < runnable.length; i++) {
        if (sessionAbort) {
          last = { status: 'aborted' };
          break;
        }
        const step = runnable[i];
        send({ type: 'step-started', index: i, total: runnable.length, label: step.label });
        last = await runSingleSession(step.skill, step.goal, send);
        send({ type: 'step-finished', index: i, status: last.status, label: step.label });
        if (last.status !== 'done') {
          send({ type: 'thinking', text: `Halting workflow: step ${i + 1} ended '${last.status}'.` });
          break;
        }
      }
      send({ type: 'finished', ...last, workflow: true });
      return last;
    } catch (err) {
      send({ type: 'error', message: err.message });
      return { status: 'error', message: err.message };
    } finally {
      sessionRunning = false;
    }
  });

  ipcMain.handle('assistant:stop', async () => {
    sessionAbort = true;
    resolveAllConfirms(false); // unblock any pending permission prompt as denied
    return { stopped: true };
  });

  // Fast path: instant open-app / open-url / web-search with no screenshot loop.
  // Falls back to the full agent (via a returned flag) when unsupported.
  ipcMain.handle('assistant:quick', async (_e, payload) => {
    const send = (evt) => broadcast('agent:event', evt);
    const k = payload && payload.kind;
    const t = payload && payload.target;
    const label =
      k === 'open_app'
        ? `Opening ${t}`
        : k === 'web_search'
        ? `Searching for ${t}`
        : k === 'quit_app'
        ? `Closing ${t}`
        : k === 'close_tabs'
        ? 'Closing browser tabs'
        : `Opening ${t}`;
    send({ type: 'started', goal: label });
    const qStart = Date.now();
    const result = await quickactions.perform(payload || {});
    telemetry.record({ kind: 'quick', goal: `${k} ${t || ''}`.trim(), status: result.ok ? 'done' : 'error', error: result.ok ? undefined : result.error, durationMs: Date.now() - qStart });
    if (result.ok) {
      memory.logTurn('assistant', `(done) ${result.text || label}`, 'widget');
      send({ type: 'done', message: result.text || 'Done.' });
      send({ type: 'finished', status: 'done', message: result.text });
      return { status: 'done', message: result.text };
    }
    // Unsupported (e.g. non-macOS): let the caller fall back to the agent.
    send({ type: 'finished', status: 'fallback' });
    return { status: 'fallback', message: result.error };
  });

  // How wide a lane to keep clear on the right for JARVIS's own orb — the width
  // of the widget plus a margin, measured from its live position so tiled
  // windows never end up hidden behind it.
  function reservedLaneWidth() {
    try {
      const wa = screen.getPrimaryDisplay().workArea;
      if (widgetWindow && !widgetWindow.isDestroyed()) {
        const [wx] = widgetWindow.getPosition();
        const [ww] = widgetWindow.getSize();
        // Only reserve when the orb is docked toward the right edge.
        if (wx + ww > wa.x + wa.width - 40) return Math.max(150, wa.x + wa.width - wx + 16);
      }
    } catch (_) {}
    return 150;
  }

  // Organize the user's windows into a non-overlapping grid so JARVIS can see
  // every open tab/window — reserving a lane for his own orb.
  ipcMain.handle('windows:arrange', async () => {
    const send = (evt) => broadcast('agent:event', evt);
    send({ type: 'started', goal: 'Organizing your windows' });
    const wa = screen.getPrimaryDisplay().workArea;
    const t0 = Date.now();
    const res = await windows.arrange(wa, { reserveRight: reservedLaneWidth() });
    telemetry.record({ kind: 'windows', goal: 'arrange', status: res.ok ? 'done' : 'error', error: res.ok ? undefined : res.error, durationMs: Date.now() - t0 });
    const msg = res.ok ? res.text : res.error || "I couldn't organize the windows.";
    memory.logTurn('assistant', `(windows) ${msg}`, 'widget');
    send({ type: res.ok ? 'done' : 'error', message: msg });
    send({ type: 'finished', status: res.ok ? 'done' : 'error', message: msg });
    return { status: res.ok ? 'done' : 'error', message: msg };
  });

  // List every visible window (app, title, bounds) — screenshot-free awareness.
  ipcMain.handle('windows:list', async () => {
    const res = await windows.list();
    return res;
  });

  // Ask the user to approve something mid-run (reuses the confirm gate).
  const askConfirm = (send, summary, risk) =>
    new Promise((resolve) => {
      if (sessionAbort) return resolve(false);
      const id = crypto.randomUUID();
      pendingConfirms.set(id, resolve);
      send({ type: 'confirm-request', id, summary, risk: risk || 'medium' });
    });

  // "Do almost anything": plan a complex request into steps and execute them in
  // order across every capability, gated + STOP-able. The orchestrator.
  ipcMain.handle('assistant:do', async (_e, goal) => {
    if (sessionRunning || improveRunning) return { status: 'busy' };
    const g = String(goal || '').trim();
    if (!g) return { status: 'error', message: 'What should I do?' };
    const send = (evt) => broadcast('agent:event', evt);
    sessionAbort = false;
    sessionRunning = true;
    send({ type: 'started', goal: g });
    memory.logTurn('user', g, 'widget');
    const t0 = Date.now();
    try {
      send({ type: 'thinking', text: 'Planning the steps…' });
      const steps = await claude.planTasks(g);
      if (!steps.length) {
        const m = "I couldn't turn that into steps. Try rephrasing, or ask for one thing at a time.";
        send({ type: 'error', message: m });
        send({ type: 'finished', status: 'error', message: m });
        return { status: 'error', message: m };
      }
      send({ type: 'thinking', text: 'Plan:\n' + steps.map((s, i) => `${i + 1}. ${s.why || s.capability}`).join('\n') });

      for (let i = 0; i < steps.length; i++) {
        if (sessionAbort) break;
        const s = steps[i] || {};
        const a = s.args || {};
        const cap = s.capability;
        send({ type: 'step-started', index: i, total: steps.length, label: s.why || cap });
        let r = '';
        try {
          if (cap === 'quick_action') {
            const q = await quickactions.perform(a);
            r = q.text || q.error || 'done';
          } else if (cap === 'run_command') {
            const cmd = String(a.command || '').trim();
            if (!cmd) r = '(no command)';
            else {
              const dangerous = terminal.looksDangerous(cmd);
              let ok = true;
              if (dangerous || !config.getFullControl()) ok = await askConfirm(send, 'Run: ' + cmd, dangerous ? 'high' : 'medium');
              if (!ok) r = '(denied)';
              else {
                const res = await terminal.run(cmd, { cwd: REPO_DIR, onData: (c) => send({ type: 'log', text: String(c).slice(0, 200) }), shouldAbort: () => sessionAbort });
                r = (res.output || '').slice(-300) || (res.ok ? 'done' : 'failed');
              }
            }
          } else if (cap === 'find_file') {
            const hits = sweep.search(a.query || '', 5);
            r = hits.length ? hits.map((h) => h.name).join(', ') : '(no match)';
          } else if (cap === 'search_content') {
            const cs = await content.searchContent(a.query || '', { limit: 8 });
            r = cs.ok && cs.results.length ? cs.results.map((f) => f.name).join(', ') : '(none)';
          } else if (cap === 'read_screen') {
            const shot = await captureFrame();
            r = await claude.describeScreen(a.question || 'Summarize what is on screen.', shot);
          } else if (cap === 'crawl') {
            let url = a.url;
            if (!url) {
              const t = await webpage.readActiveTab().catch(() => ({}));
              url = t && t.url;
            }
            const pages = url ? await crawler.crawl({ startUrl: url, maxDepth: a.depth || 2, shouldAbort: () => sessionAbort }) : [];
            r = `crawled ${pages.length} pages`;
          } else if (cap === 'harvest') {
            const h = await webpage.harvestActiveTab();
            r = h.ok ? `harvested ${h.title || h.url}` : h.error || 'failed';
          } else if (cap === 'click_element') {
            const ax = await axtree.elements();
            const el = ax.ok ? axtree.match(ax.elements, a.label) : null;
            if (el) {
              await executor.perform({ action: 'left_click', coordinate: [el.x, el.y] });
              r = 'clicked ' + el.label;
            } else {
              r = ax.ok ? `no "${a.label}" element found` : ax.error;
            }
          } else if (cap === 'organize_windows') {
            const wa = screen.getPrimaryDisplay().workArea;
            const w = await windows.arrange(wa, { reserveRight: reservedLaneWidth() });
            r = w.ok ? w.text : w.error || 'failed';
          } else if (cap === 'computer') {
            const res = await runSingleSession(null, a.goal || g, send);
            r = res.status;
          } else if (cap === 'reply') {
            r = a.message || '';
            if (r) send({ type: 'thinking', text: r });
          } else {
            r = '(unknown step)';
          }
        } catch (e) {
          r = 'error: ' + e.message;
        }
        send({ type: 'step-finished', index: i, status: 'done', label: (s.why || cap) + (r ? ' — ' + String(r).slice(0, 140) : '') });
        memory.logTurn('assistant', `(step ${i + 1}/${steps.length}: ${cap}) ${String(r).slice(0, 160)}`, 'widget');
      }

      const status = sessionAbort ? 'aborted' : 'done';
      telemetry.record({ kind: 'orchestrate', goal: g.slice(0, 80), status, steps: steps.length, durationMs: Date.now() - t0 });
      send({ type: 'done', message: status === 'aborted' ? 'Stopped.' : 'Finished the task.' });
      send({ type: 'finished', status });
      return { status, steps: steps.length };
    } catch (err) {
      send({ type: 'error', message: err.message });
      send({ type: 'finished', status: 'error', message: err.message });
      return { status: 'error', message: err.message };
    } finally {
      sessionRunning = false;
    }
  });

  // Look at the screen and ANSWER / summarize (a one-shot vision read, not the
  // action loop). This is why "summarize this tab" never returned anything before
  // — it was going to the action loop, which has nothing to click.
  ipcMain.handle('assistant:look', async (_e, question) => {
    const send = (evt) => broadcast('agent:event', evt);
    const q = String(question || '').trim() || 'Summarize what is on my screen.';
    send({ type: 'started', goal: 'Looking at your screen' });
    const lookStart = Date.now();
    try {
      let answer;
      // Prefer the ACTUAL page: pull the live DOM (text + interface map) from the
      // active browser tab — far richer than a screenshot. Fall back to vision.
      const page = await webpage.readActiveTab().catch(() => ({ ok: false }));
      if (page.ok && (page.text || (page.interface && page.interface.length))) {
        send({ type: 'action', detail: `📄 read the live page code — ${page.browser}: ${page.title || page.url}` });
        answer = await claude.answerFromPage(q, page);
      } else {
        send({ type: 'action', detail: '👁 reading the screen…' });
        const shot = await captureFrame();
        answer = await claude.describeScreen(q, shot);
        if (page.needsPermission) {
          answer =
            (answer || '') +
            `\n\n(For full page code + interface mapping, ${page.error})`;
        }
      }
      if (!answer || !answer.trim()) {
        answer =
          "I couldn't read the page or screen. Make sure the tab is visible (and Screen " +
          'Recording permission is granted in System Settings).';
      }
      memory.logTurn('user', q, 'widget');
      memory.logTurn('assistant', answer, 'widget');
      telemetry.record({ kind: 'look', goal: q, status: 'done', durationMs: Date.now() - lookStart });
      send({ type: 'done', message: answer });
      send({ type: 'finished', status: 'done', message: answer });
      return { status: 'done', answer };
    } catch (err) {
      telemetry.record({ kind: 'look', goal: q, status: 'error', error: err.message, durationMs: Date.now() - lookStart });
      send({ type: 'error', message: err.message });
      send({ type: 'finished', status: 'error', message: err.message });
      return { status: 'error', message: err.message };
    }
  });

  // Full data harvest: pull EVERYTHING from the page(s) the user is on and save
  // it to disk (JSON in the vault's Harvests/ folder), for one tab or all tabs.
  const saveHarvest = (pages) => {
    const base = memory.vaultPath()
      ? path.join(memory.vaultPath(), 'Harvests')
      : path.join(app.getPath('userData'), 'Harvests');
    fs.mkdirSync(base, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const files = [];
    pages.forEach((p, i) => {
      const slug =
        String(p.title || p.url || 'page-' + i)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 50) || 'page';
      const file = path.join(base, `${stamp}-${slug}.json`);
      fs.writeFileSync(file, JSON.stringify(p, null, 2), 'utf8');
      files.push(file);
    });
    return { dir: base, files };
  };
  const totals = (pages) =>
    pages.reduce(
      (a, p) => {
        const c = p.counts || {};
        a.links += c.links || 0;
        a.images += c.images || 0;
        a.tables += c.tables || 0;
        a.chars += (p.text || '').length;
        return a;
      },
      { links: 0, images: 0, tables: 0, chars: 0 }
    );

  ipcMain.handle('webpage:harvest', async (_e, allTabs) => {
    const send = (evt) => broadcast('agent:event', evt);
    send({ type: 'started', goal: allTabs ? 'Pulling all data from every open tab' : 'Pulling all data from this page' });
    send({ type: 'action', detail: '📥 extracting page data…' });
    try {
      const res = allTabs ? await webpage.harvestAllTabs() : await webpage.harvestActiveTab();
      const pages = res.pages || (res.ok ? [res] : []);
      if (!res.ok || !pages.length) {
        const msg = res.error || 'Nothing to harvest.';
        send({ type: 'error', message: msg });
        send({ type: 'finished', status: 'error', message: msg });
        return { status: 'error', message: msg };
      }
      const { dir, files } = saveHarvest(pages);
      const t = totals(pages);
      const msg =
        `Pulled ${pages.length} page(s): ${t.links} links, ${t.images} images, ${t.tables} tables, ` +
        `${Math.round(t.chars / 1000)}k chars of text + full HTML. Saved to ${dir}.`;
      memory.logTurn('assistant', `(harvested ${pages.length} page(s)) ${pages.map((p) => p.url).join(', ')}`.slice(0, 500), 'widget');
      telemetry.record({ kind: 'harvest', goal: allTabs ? 'all tabs' : 'active tab', status: 'done' });
      send({ type: 'done', message: msg });
      send({ type: 'finished', status: 'done', message: msg });
      return { status: 'done', dir, files, pages: pages.length, totals: t };
    } catch (err) {
      send({ type: 'error', message: err.message });
      send({ type: 'finished', status: 'error', message: err.message });
      return { status: 'error', message: err.message };
    }
  });

  // Filesystem sweep: index the user's files/apps so find/open is instant.
  ipcMain.handle('sweep:run', async (_e, payload) => {
    if (sessionRunning || improveRunning) return { status: 'busy' };
    const send = (evt) => broadcast('agent:event', evt);
    sessionAbort = false;
    sessionRunning = true;
    send({ type: 'started', goal: payload && payload.everything ? 'Full sweep of my computer' : 'Indexing my files' });
    const t0 = Date.now();
    try {
      const list = await sweep.sweep({
        everything: payload && payload.everything,
        onProgress: (p) => send({ type: 'log', text: `indexed ${p.found} files… ${p.current}`.slice(0, 200) }),
        shouldAbort: () => sessionAbort,
      });
      const s = sweep.stats();
      const secs = Math.round((Date.now() - t0) / 1000);
      const msg = `Indexed ${list.length} files/apps in ${secs}s — I can now find and open them instantly.`;
      telemetry.record({ kind: 'sweep', goal: 'index', status: 'done', steps: list.length, durationMs: Date.now() - t0 });
      memory.logTurn('assistant', `(swept the computer: ${list.length} files indexed)`, 'widget');
      send({ type: 'done', message: msg });
      send({ type: 'finished', status: 'done', message: msg });
      return { status: 'done', total: list.length, stats: s };
    } catch (err) {
      send({ type: 'error', message: err.message });
      send({ type: 'finished', status: 'error', message: err.message });
      return { status: 'error', message: err.message };
    } finally {
      sessionRunning = false;
    }
  });
  ipcMain.handle('sweep:search', async (_e, query) => sweep.search(String(query || ''), 25));

  // Accessibility-tree grounding: list actionable native UI elements, and click
  // one BY LABEL using its real screen coordinates (Quality Blueprint §3.2).
  ipcMain.handle('ax:elements', async () => axtree.elements());
  ipcMain.handle('ax:click', async (_e, label) => {
    if (!executor.isAvailable()) return { ok: false, error: 'Native input control is not available.' };
    const send = (evt) => broadcast('agent:event', evt);
    const ax = await axtree.elements();
    if (!ax.ok) return { ok: false, error: ax.error };
    const el = axtree.match(ax.elements, label);
    if (!el) {
      const visible = ax.elements.map((e) => e.label).filter(Boolean).slice(0, 10).join(', ');
      return { ok: false, error: `No "${label}" here. I can see: ${visible || '(nothing labelled)'}` };
    }
    send({ type: 'action', detail: `🎯 click "${el.label}"` });
    const r = await executor.perform({ action: 'left_click', coordinate: [el.x, el.y] });
    return r.ok ? { ok: true, label: el.label } : { ok: false, error: r.error };
  });

  // Content search — find files whose CONTENTS match (Spotlight), and
  // read/summarize a specific document.
  ipcMain.handle('content:search', async (_e, query) => content.searchContent(String(query || ''), { limit: 40 }));
  ipcMain.handle('content:summarize', async (_e, payload) => {
    const send = (evt) => broadcast('agent:event', evt);
    const q = String((payload && payload.query) || '').trim();
    const question = (payload && payload.question) || `Summarize this document.`;
    send({ type: 'started', goal: 'Reading a document' });
    send({ type: 'action', detail: '🔎 finding the document…' });
    try {
      // Prefer an explicit path; else find by content; else by filename index.
      let file = payload && payload.path;
      if (!file && q) {
        const cs = await content.searchContent(q, { limit: 1 });
        if (cs.ok && cs.results.length) file = cs.results[0].path;
        else {
          const idx = sweep.search(q, 1);
          if (idx.length) file = idx[0].path;
        }
      }
      if (!file) {
        const msg = `I couldn't find a document matching "${q}".`;
        send({ type: 'error', message: msg });
        send({ type: 'finished', status: 'error', message: msg });
        return { status: 'error', message: msg };
      }
      send({ type: 'action', detail: '📖 reading ' + path.basename(file) });
      const rt = await content.readText(file);
      if (!rt.ok) {
        send({ type: 'error', message: rt.error });
        send({ type: 'finished', status: 'error', message: rt.error });
        return { status: 'error', message: rt.error };
      }
      const answer = await claude.answerFromText(question, path.basename(file), rt.text);
      memory.logTurn('user', question + ' (' + path.basename(file) + ')', 'widget');
      memory.logTurn('assistant', answer, 'widget');
      telemetry.record({ kind: 'read-doc', goal: path.basename(file), status: 'done' });
      send({ type: 'done', message: `📄 ${path.basename(file)}\n\n${answer}` });
      send({ type: 'finished', status: 'done', message: answer });
      return { status: 'done', file, answer };
    } catch (err) {
      send({ type: 'error', message: err.message });
      send({ type: 'finished', status: 'error', message: err.message });
      return { status: 'error', message: err.message };
    }
  });
  ipcMain.handle('sweep:stats', async () => sweep.stats());
  // Open an indexed file/app (only paths that exist).
  ipcMain.handle('sweep:open', async (_e, filePath) => {
    const p = String(filePath || '');
    if (!p || !fs.existsSync(p)) return { ok: false, error: 'File not found.' };
    await shell.openPath(p);
    memory.logTurn('assistant', `(opened) ${p}`, 'widget');
    return { ok: true };
  });

  // DEEP crawl: follow links from the current page (or a URL) several levels deep
  // and harvest every page, saved to a per-crawl folder. Polite + abortable.
  ipcMain.handle('webpage:crawl', async (_e, payload) => {
    if (sessionRunning || improveRunning) return { status: 'busy' };
    const send = (evt) => broadcast('agent:event', evt);
    let startUrl = payload && payload.startUrl;
    if (!startUrl) {
      const active = await webpage.readActiveTab().catch(() => ({}));
      startUrl = active && active.url;
    }
    if (!startUrl) {
      const msg = 'No starting URL — open the page you want to crawl, or give me a URL.';
      send({ type: 'finished', status: 'error', message: msg });
      return { status: 'error', message: msg };
    }

    const depth = payload && payload.depth;
    const maxPages = payload && payload.maxPages;
    sessionAbort = false;
    sessionRunning = true;
    send({ type: 'started', goal: `Deep crawl from ${startUrl}` });
    memory.logTurn('assistant', `(deep crawl) ${startUrl}`, 'widget');
    const crawlStart = Date.now();
    try {
      const pages = await crawler.crawl({
        startUrl,
        maxDepth: depth,
        maxPages,
        onProgress: (p) =>
          send({ type: 'log', text: `[${p.done} done · ${p.queued} queued · d${p.depth}] ${p.url}`.slice(0, 200) }),
        shouldAbort: () => sessionAbort,
      });
      if (!pages.length) {
        const msg = 'Crawl returned no pages (site blocked it, or nothing linkable).';
        send({ type: 'error', message: msg });
        send({ type: 'finished', status: 'error', message: msg });
        return { status: 'error', message: msg };
      }
      // Save all pages under one crawl folder + an index.
      const base = memory.vaultPath()
        ? path.join(memory.vaultPath(), 'Harvests')
        : path.join(app.getPath('userData'), 'Harvests');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const host = (() => {
        try {
          return new URL(startUrl).hostname;
        } catch {
          return 'site';
        }
      })();
      const dir = path.join(base, `crawl-${stamp}-${host}`);
      fs.mkdirSync(dir, { recursive: true });
      pages.forEach((p, i) => {
        const slug = String(p.title || p.url || 'page-' + i)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 50);
        fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(3, '0')}-${slug || 'page'}.json`), JSON.stringify(p, null, 2), 'utf8');
      });
      fs.writeFileSync(
        path.join(dir, '_index.json'),
        JSON.stringify({ startUrl, pages: pages.map((p) => ({ url: p.url, title: p.title, depth: p.depth, links: p.counts.links, chars: p.counts.chars })) }, null, 2),
        'utf8'
      );
      const totalChars = pages.reduce((a, p) => a + (p.text || '').length, 0);
      const totalLinks = pages.reduce((a, p) => a + p.counts.links, 0);
      const secs = Math.round((Date.now() - crawlStart) / 1000);
      const msg = `Deep crawl done: ${pages.length} pages, ${totalLinks} links, ${Math.round(totalChars / 1000)}k chars in ${secs}s. Saved to ${dir}.`;
      telemetry.record({ kind: 'crawl', goal: host, status: 'done', steps: pages.length, durationMs: Date.now() - crawlStart });
      memory.logTurn('assistant', `(crawled ${pages.length} pages of ${host})`, 'widget');
      send({ type: 'done', message: msg });
      send({ type: 'finished', status: 'done', message: msg });
      return { status: 'done', dir, pages: pages.length };
    } catch (err) {
      send({ type: 'error', message: err.message });
      send({ type: 'finished', status: 'error', message: err.message });
      return { status: 'error', message: err.message };
    } finally {
      sessionRunning = false;
    }
  });

  // Terminal capability: run a real shell command and stream its output. This is
  // powerful, so destructive-looking commands ALWAYS ask for approval (even in
  // Full Control); STOP kills the process; output is streamed and logged.
  ipcMain.handle('assistant:shell', async (_e, payload) => {
    if (sessionRunning || improveRunning) return { status: 'busy' };
    const command = String((payload && payload.command) || '').trim();
    if (!command) return { status: 'error', message: 'No command.' };
    const why = (payload && payload.why) || '';
    const send = (evt) => broadcast('agent:event', evt);

    const dangerous = terminal.looksDangerous(command);
    // Approve if: not Full Control (always ask), or the command looks destructive
    // (ask even in Full Control). STOP still applies during execution.
    if (dangerous || !config.getFullControl()) {
      const summary = `Run in Terminal: ${command}${why ? '  — ' + why : ''}`;
      send({ type: 'permission', summary, risk: dangerous ? 'high' : 'medium' });
      const approved = await new Promise((resolve) => {
        const id = crypto.randomUUID();
        pendingConfirms.set(id, resolve);
        send({ type: 'confirm-request', id, summary, risk: dangerous ? 'high' : 'medium' });
      });
      send({ type: 'permission-result', approved });
      if (!approved) {
        send({ type: 'finished', status: 'aborted' });
        return { status: 'denied' };
      }
    }

    sessionAbort = false;
    sessionRunning = true;
    send({ type: 'started', goal: `$ ${command}` });
    memory.logTurn('assistant', `(ran command) ${command}`, 'widget');
    const shStart = Date.now();
    try {
      const res = await terminal.run(command, {
        cwd: REPO_DIR,
        onData: (chunk) => send({ type: 'log', text: String(chunk).slice(0, 400) }),
        shouldAbort: () => sessionAbort,
      });
      telemetry.record({ kind: 'shell', goal: command.slice(0, 80), status: res.ok ? 'done' : 'error', durationMs: Date.now() - shStart });
      const tail = res.output ? res.output.slice(-600) : '';
      if (res.ok) {
        send({ type: 'done', message: tail || 'Command finished.' });
        send({ type: 'finished', status: 'done', message: tail });
      } else {
        const why2 = res.timedOut ? 'timed out' : res.aborted ? 'stopped' : `exit ${res.code}`;
        send({ type: 'error', message: `Command ${why2}. ${tail}`.trim() });
        send({ type: 'finished', status: 'error', message: tail });
      }
      return { status: res.ok ? 'done' : 'error', output: res.output, code: res.code };
    } catch (err) {
      send({ type: 'error', message: err.message });
      send({ type: 'finished', status: 'error', message: err.message });
      return { status: 'error', message: err.message };
    } finally {
      sessionRunning = false;
    }
  });

  // --- Self-improvement: the assistant edits its own source code ---
  // Claude reads/rewrites files in the app's own tree (guarded by lib/selfedit),
  // the change is validated (syntax + smoke tests), and reverted if it fails.
  // Progress streams on 'improve:event'. A successful change needs a relaunch to
  // load the new code (improve:relaunch), which the renderer offers.
  ipcMain.handle('improve:run', async (_e, goal) => {
    if (sessionRunning || improveRunning) return { status: 'busy' };
    if (!goal || !String(goal).trim()) {
      return { status: 'error', message: 'Describe what to improve.' };
    }
    const send = (evt) => broadcast('improve:event', evt);
    sessionAbort = false;
    improveRunning = true;
    send({ type: 'started', goal: String(goal) });
    try {
      let result;
      // Prefer Claude Code (full agentic coding on the real repo) when it's
      // installed; otherwise fall back to the built-in API editor.
      if (claudecode.isAvailable()) {
        send({ type: 'thinking', text: 'Using Claude Code to work on my own repository…' });
        const cc = await claudecode.improve({
          task: SELF_IMPROVE_TASK(String(goal)),
          cwd: REPO_DIR,
          model: config.getModel(),
          apiKey: config.getApiKey(), // hand Claude Code JARVIS's working key
          onEvent: send,
          shouldAbort: () => sessionAbort,
        });
        const changed = await changedFiles();
        result = {
          status: cc.status,
          summary: cc.summary || (cc.status === 'done' ? 'Change complete.' : ''),
          message: cc.message,
          changed,
          engine: 'claude-code',
        };
      } else {
        result = await improver.improve({
          goal: String(goal),
          onEvent: send,
          shouldAbort: () => sessionAbort,
        });
        result.engine = 'builtin';
      }
      send({ type: 'finished', ...result });
      return result;
    } catch (err) {
      send({ type: 'error', message: err.message });
      return { status: 'error', message: err.message };
    } finally {
      improveRunning = false;
    }
  });

  // Preferred self-improvement: drive the user's ALREADY-OPEN Claude Code session
  // by typing the request into it (computer-use), instead of spawning a hidden
  // claude process. Uses the real, authenticated on-screen session.
  ipcMain.handle('improve:onscreen', async (_e, request) => {
    if (sessionRunning || improveRunning) return { status: 'busy' };
    if (!executor.isAvailable()) {
      return { status: 'error', message: 'Native input control is not available (see README).' };
    }
    const req = String(request || '').trim();
    if (!req) return { status: 'error', message: 'Describe what to improve.' };

    const send = (evt) => broadcast('agent:event', evt);
    sessionAbort = false;
    sessionRunning = true;
    send({ type: 'started', goal: 'Handing this to your Claude Code session' });
    memory.logTurn('assistant', `(delegated to on-screen Claude Code) ${req}`, 'widget');
    try {
      // Prefer the DETERMINISTIC path: activate Claude Code, click its input,
      // type the request, submit. Fall back to the visual agent if that fails.
      const promptText =
        `${req}. Make this change in the JARVIS repository you're working in, keep the app ` +
        'working, run node test/smoke.js, and commit when the tests pass.';
      const direct = await claudeapp.promptClaudeCode(promptText, send).catch((e) => ({ ok: false, error: e.message }));
      let result;
      if (direct.ok) {
        send({ type: 'thinking', text: `Prompted ${direct.app}. It will make the change — say "upload yourself" then "reload yourself" when it's done.` });
        result = { status: 'done', engine: 'claude-app', app: direct.app };
      } else {
        send({ type: 'thinking', text: `Direct prompt didn't work (${direct.error}); using the visual approach.` });
        result = await runSingleSession(null, ONSCREEN_TASK(req), send);
      }
      memory.logTurn('assistant', `(delegated task ${result.status}) ${req}`, 'widget');
      send({ type: 'finished', ...result });
      return result;
    } catch (err) {
      send({ type: 'error', message: err.message });
      return { status: 'error', message: err.message };
    } finally {
      sessionRunning = false;
    }
  });

  // Directly type ANY prompt into the Claude Code app and submit it.
  ipcMain.handle('claudecode:prompt', async (_e, text) => {
    if (sessionRunning || improveRunning) return { status: 'busy' };
    const send = (evt) => broadcast('agent:event', evt);
    sessionAbort = false;
    sessionRunning = true;
    send({ type: 'started', goal: 'Prompting Claude Code' });
    try {
      const r = await claudeapp.promptClaudeCode(String(text || ''), send);
      if (r.ok) {
        const msg = `Prompted ${r.app}.`;
        memory.logTurn('assistant', `(prompted Claude Code) ${String(text || '').slice(0, 120)}`, 'widget');
        send({ type: 'done', message: msg });
        send({ type: 'finished', status: 'done', message: msg });
        return { status: 'done', app: r.app };
      }
      send({ type: 'error', message: r.error });
      send({ type: 'finished', status: 'error', message: r.error });
      return { status: 'error', message: r.error };
    } catch (err) {
      send({ type: 'error', message: err.message });
      send({ type: 'finished', status: 'error', message: err.message });
      return { status: 'error', message: err.message };
    } finally {
      sessionRunning = false;
    }
  });

  // Upload: stage, commit, and push whatever the on-screen Claude Code session
  // changed, so the new version is saved to GitHub. Then the user can reload.
  ipcMain.handle('improve:commit', async (_e, message) => {
    const send = (evt) => broadcast('improve:event', evt);
    send({ type: 'started', goal: 'Uploading my new code' });
    const msg = String(message || 'JARVIS self-improvement').replace(/"/g, "'").slice(0, 200);
    return new Promise((resolve) => {
      // Chain add → commit → push through the login shell so git creds resolve.
      const script = `cd "${REPO_DIR}" && git add -A && git commit -m "${msg}" && git push`;
      execFile(terminal.loginShell().cmd, [terminal.loginShell().flag, script], { timeout: 120000 }, (err, out, errOut) => {
        const text = (String(out || '') + String(errOut || '')).trim();
        if (err && !/nothing to commit/i.test(text)) {
          send({ type: 'error', message: 'Upload failed: ' + text.slice(-200) });
          send({ type: 'finished', status: 'error', message: text.slice(-200) });
          return resolve({ status: 'error', message: text });
        }
        const nothing = /nothing to commit/i.test(text);
        send({ type: 'finished', status: 'done', summary: nothing ? 'Nothing new to upload.' : 'Uploaded to GitHub.', changed: [], engine: 'git' });
        resolve({ status: 'done', nothing });
      });
    });
  });

  // Self-update: pull the latest code from git, then relaunch to apply it.
  ipcMain.handle('improve:selfupdate', async () => {
    if (sessionRunning || improveRunning) return { status: 'busy' };
    const send = (evt) => broadcast('improve:event', evt);
    send({ type: 'started', goal: 'Updating myself from git' });
    return new Promise((resolve) => {
      execFile('git', ['-C', REPO_DIR, 'pull', '--ff-only'], { timeout: 60000 }, (err, out, errOut) => {
        const text = String(out || '') + String(errOut || '');
        if (err) {
          send({ type: 'error', message: 'git pull failed: ' + text.trim().slice(0, 200) });
          send({ type: 'finished', status: 'error', message: text.trim().slice(0, 200) });
          return resolve({ status: 'error', message: text.trim() });
        }
        const upToDate = /up to date/i.test(text);
        send({ type: 'thinking', text: upToDate ? 'Already up to date.' : 'Pulled updates: ' + text.trim().slice(0, 200) });
        send({ type: 'finished', status: 'done', summary: upToDate ? 'Already up to date.' : 'Updated — reload to apply.', changed: [], engine: 'git' });
        resolve({ status: 'done', upToDate });
      });
    });
  });

  // JARVIS's own performance data (efficiency of his runs).
  ipcMain.handle('telemetry:summary', async () => ({
    text: telemetry.summaryText(),
    ...telemetry.summary(),
  }));

  // Data-driven self-optimization: take the performance summary and have the
  // on-screen Claude Code session improve the code that's slowest / least
  // reliable. This is "gather data on my work and use it to optimize my code".
  ipcMain.handle('improve:optimize', async () => {
    if (sessionRunning || improveRunning) return { status: 'busy' };
    if (!executor.isAvailable()) {
      return { status: 'error', message: 'Native input control is not available (see README).' };
    }
    const stats = telemetry.summaryText();
    const request =
      'Optimize your own code using YOUR REAL PERFORMANCE DATA below. Identify the slowest ' +
      'and least-reliable kinds of run and make targeted improvements to reduce their latency ' +
      'and failures (fewer screenshots, faster paths, better error handling). Keep all tests ' +
      'passing.\n\nPERFORMANCE DATA:\n' + stats;
    const send = (evt) => broadcast('agent:event', evt);
    sessionAbort = false;
    sessionRunning = true;
    send({ type: 'started', goal: 'Optimizing myself from my performance data' });
    send({ type: 'thinking', text: stats });
    memory.logTurn('assistant', '(self-optimization run) using performance data', 'widget');
    try {
      const result = await runSingleSession(null, ONSCREEN_TASK(request), send);
      send({ type: 'finished', ...result });
      return result;
    } catch (err) {
      send({ type: 'error', message: err.message });
      return { status: 'error', message: err.message };
    } finally {
      sessionRunning = false;
    }
  });

  // Relaunch the app so freshly self-edited code takes effect.
  ipcMain.handle('improve:relaunch', async () => {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });

  // --- Memory vault (JARVIS's Obsidian-style long-term memory) ---
  ipcMain.handle('memory:info', async () => ({
    path: memory.vaultPath(),
    notes: memory.listNotes().length,
  }));
  // Reveal the vault in Finder/Explorer so the user can open it in Obsidian.
  ipcMain.handle('memory:open', async () => {
    const p = memory.vaultPath();
    if (p) await shell.openPath(p);
    return { ok: Boolean(p), path: p };
  });
  ipcMain.handle('memory:search', async (_e, query) => memory.search(String(query || ''), 8));
  ipcMain.handle('memory:remember', async (_e, payload) => {
    const { title, body, aboutUser } = payload || {};
    if (aboutUser) {
      memory.rememberAboutUser(body);
      return { ok: true, where: 'Profile.md' };
    }
    return { ok: true, where: memory.remember({ title, body }) };
  });

  // Voice: transcribe recorded mic audio via OpenAI Whisper. The renderer records
  // and sends the bytes; the key + HTTP stay in main.
  ipcMain.handle('voice:transcribe', async (_e, audio) => {
    try {
      const buf = Buffer.from(audio);
      return await transcribe.transcribe(buf, config.getOpenAIKey(), { provider: config.getSttProvider() });
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Renderer's answer to a confirm-request.
  ipcMain.handle('assistant:confirm', async (_e, { id, approved }) => {
    const resolve = pendingConfirms.get(id);
    if (resolve) {
      pendingConfirms.delete(id);
      resolve(Boolean(approved));
    }
    return { ok: true };
  });

  // --- Phase 2: continuous private capture ---
  ipcMain.handle('watch:start', async () => watch.start());
  ipcMain.handle('watch:stop', async () => watch.stop());
  ipcMain.handle('watch:pause', async () => watch.pause());
  ipcMain.handle('watch:resume', async () => watch.resume());
  ipcMain.handle('watch:status', async () => watch.status());
  ipcMain.handle('watch:recent', async (_e, n) => watch.recent(n));

  // Watch-and-learn: while active, periodically summarize what the user is doing
  // into the Observations vault so JARVIS learns how humans use interfaces.
  ipcMain.handle('observe:start', async () => {
    startObserving();
    return { ok: true, observing: true };
  });
  ipcMain.handle('observe:stop', async () => {
    stopObserving();
    return { ok: true, observing: false };
  });
  ipcMain.handle('observe:status', async () => ({ observing }));

  ipcMain.handle('config:info', async () => ({
    ...config.snapshot(),
    canControl: executor.isAvailable(),
    canSelfImprove: claudecode.isAvailable(),
    // On macOS, mouse/keyboard control needs Accessibility permission (false
    // here = clicks/keys are silently ignored). We check without re-prompting.
    axTrusted:
      process.platform === 'darwin' && systemPreferences.isTrustedAccessibilityClient
        ? systemPreferences.isTrustedAccessibilityClient(false)
        : true,
    platform: process.platform,
    isWayland:
      process.platform === 'linux' &&
      (process.env.XDG_SESSION_TYPE === 'wayland' || Boolean(process.env.WAYLAND_DISPLAY)),
  }));

  // --- Settings panel ---
  ipcMain.handle('settings:get', async () => config.snapshot());
  ipcMain.handle('settings:update', async (_e, patch) => {
    const snap = config.update(patch || {});
    // Apply live-tunable watch settings to the running buffer.
    if (watch) {
      watch.intervalMs = config.getWatchIntervalMs();
      watch.maxFrames = config.getWatchMaxFrames();
    }
    // Honour the "always watch" consent live: start/stop the learn loop.
    if (patch && patch.alwaysWatch !== undefined) {
      if (config.getAlwaysWatch()) startObserving();
      else stopObserving();
    }
    return { ...snap, canControl: executor.isAvailable() };
  });

  // One-tap consent from the widget: accept/stop always-on surveillance. Persists
  // the choice so it holds across restarts.
  ipcMain.handle('surveillance:set', async (_e, accepted) => {
    config.update({ alwaysWatch: Boolean(accepted) });
    if (accepted) startObserving();
    else stopObserving();
    return { ok: true, alwaysWatch: config.getAlwaysWatch() };
  });
  // Validate a key by making a tiny real call, so users get instant feedback.
  ipcMain.handle('settings:test-key', async () => {
    try {
      await claude.chat([{ role: 'user', text: 'Reply with the single word: ok' }], 'No skills.');
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  });

  // --- Window controls (widget ↔ dashboard) ---
  ipcMain.handle('window:open-dashboard', async (_e, tab) => {
    const win = createWindow(true);
    win.show();
    win.focus();
    if (tab) win.webContents.send('dashboard:focus-tab', tab);
    return { ok: true };
  });
  ipcMain.handle('widget:hide', async () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.hide();
    return { ok: true };
  });
  ipcMain.handle('widget:collapse', async (_e, collapsed) => {
    setWidgetCollapsed(collapsed);
    return { collapsed: widgetCollapsed };
  });
  ipcMain.handle('widget:quit', async () => {
    app.quit();
    return { ok: true };
  });
  // Live counts for the widget's "all my work" summary.
  ipcMain.handle('summary:counts', async () => ({
    skills: store.list().length,
    workflows: workflows.list().length,
    running: sessionRunning || improveRunning,
    watching: watch ? watch.status().active : false,
  }));
}

function registerShortcuts() {
  // Toggle the demonstration recorder from anywhere.
  const ok = globalShortcut.register('CommandOrControl+Shift+R', () => {
    broadcast('shortcut:toggle-record');
  });
  if (!ok) console.warn('Could not register global shortcut Ctrl/Cmd+Shift+R');

  // Emergency stop for the autonomous loop — works even when the app isn't focused.
  const stopOk = globalShortcut.register('CommandOrControl+Shift+X', () => {
    sessionAbort = true;
    resolveAllConfirms(false);
    broadcast('agent:event', { type: 'abort-requested' });
  });
  if (!stopOk) console.warn('Could not register emergency-stop shortcut Ctrl/Cmd+Shift+X');

  // Summon the widget (and jump straight into voice) from anywhere.
  const summonOk = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) createWidget();
    else widgetWindow.show();
    widgetWindow.focus();
    broadcast('widget:summon');
  });
  if (!summonOk) console.warn('Could not register summon shortcut Ctrl/Cmd+Shift+Space');
}

app.whenReady().then(() => {
  config.init(app.getPath('userData'));
  store = new SkillStore(path.join(app.getPath('userData'), 'skills.json'));
  workflows = new WorkflowStore(path.join(app.getPath('userData'), 'workflows.json'));
  // JARVIS's long-term memory: an Obsidian-style vault. Put it somewhere the user
  // can find and open in Obsidian (Documents), falling back to app storage.
  let vaultDir;
  try {
    vaultDir = path.join(app.getPath('documents'), 'JARVIS Vault');
  } catch {
    vaultDir = path.join(app.getPath('userData'), 'JARVIS Vault');
  }
  memory.init(vaultDir);
  telemetry.init(app.getPath('userData'));
  sweep.init(path.join(app.getPath('userData'), 'index'));
  watch = new WatchBuffer({
    capture: captureSized,
    intervalMs: config.getWatchIntervalMs(),
    maxFrames: config.getWatchMaxFrames(),
    onTick: (status) => broadcast('watch:event', status),
  });
  // Ask macOS for microphone access up front so the voice button's permission
  // path works (this does NOT fix Electron's lack of a speech-to-text backend,
  // but it makes the OS prompt appear instead of a silent 'not-allowed').
  if (process.platform === 'darwin' && systemPreferences.askForMediaAccess) {
    systemPreferences.askForMediaAccess('microphone').catch(() => {});
  }
  // CRITICAL for clicking/typing: nut.js mouse & keyboard events are SILENTLY
  // ignored by macOS unless the app has Accessibility permission. Prompt for it
  // up front (passing true opens the System Settings prompt if not yet granted),
  // so the agent's clicks actually land instead of doing nothing.
  if (process.platform === 'darwin' && systemPreferences.isTrustedAccessibilityClient) {
    try {
      const trusted = systemPreferences.isTrustedAccessibilityClient(true);
      if (!trusted) console.warn('Accessibility permission not yet granted — mouse/keyboard control will not work until you enable JARVIS in System Settings → Privacy & Security → Accessibility.');
    } catch {
      /* ignore */
    }
  }
  registerIpc();
  createTray(); // menu-bar safety net — the widget can always be brought back
  createWidget(); // the JARVIS widget is the primary, always-on surface
  // First run (no key yet): open the workspace so the onboarding wizard is
  // actually visible. Otherwise keep it preloaded but hidden until summoned.
  createWindow(!config.getApiKey());
  registerShortcuts();

  // If the user has accepted always-on surveillance, begin watching & learning
  // immediately — no need to ask each session.
  if (config.getAlwaysWatch()) startObserving();

  app.on('activate', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) createWidget();
    else widgetWindow.show();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (observeTimer) clearInterval(observeTimer);
  if (watch) watch.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
