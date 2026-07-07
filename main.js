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
const memory = require('./lib/memory');
const { WatchBuffer } = require('./lib/monitor');

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
const pendingConfirms = new Map(); // id -> resolve(boolean) for permission gates

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
  const size = source.thumbnail.getSize();
  const jpeg = source.thumbnail.toJPEG(72); // 72% quality: small, still legible
  const dataUrl = 'data:image/jpeg;base64,' + jpeg.toString('base64');
  return { dataUrl, width: size.width, height: size.height };
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
    try {
      const result = await runSingleSession(skill, goal, send);
      send({ type: 'finished', ...result });
      return result;
    } catch (err) {
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
    const label =
      payload && payload.kind === 'open_app'
        ? `Opening ${payload.target}`
        : payload && payload.kind === 'web_search'
        ? `Searching for ${payload.target}`
        : `Opening ${payload && payload.target}`;
    send({ type: 'started', goal: label });
    const result = await quickactions.perform(payload || {});
    if (result.ok) {
      send({ type: 'done', message: result.text || 'Done.' });
      send({ type: 'finished', status: 'done', message: result.text });
      return { status: 'done', message: result.text };
    }
    // Unsupported (e.g. non-macOS): let the caller fall back to the agent.
    send({ type: 'finished', status: 'fallback' });
    return { status: 'fallback', message: result.error };
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
      const result = await improver.improve({
        goal: String(goal),
        onEvent: send,
        shouldAbort: () => sessionAbort,
      });
      send({ type: 'finished', ...result });
      return result;
    } catch (err) {
      send({ type: 'error', message: err.message });
      return { status: 'error', message: err.message };
    } finally {
      improveRunning = false;
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

  ipcMain.handle('config:info', async () => ({
    ...config.snapshot(),
    canControl: executor.isAvailable(),
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
    return { ...snap, canControl: executor.isAvailable() };
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
  registerIpc();
  createTray(); // menu-bar safety net — the widget can always be brought back
  createWidget(); // the JARVIS widget is the primary, always-on surface
  // First run (no key yet): open the workspace so the onboarding wizard is
  // actually visible. Otherwise keep it preloaded but hidden until summoned.
  createWindow(!config.getApiKey());
  registerShortcuts();

  app.on('activate', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) createWidget();
    else widgetWindow.show();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (watch) watch.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
