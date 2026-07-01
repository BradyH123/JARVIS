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
  screen,
} = require('electron');

const { SkillStore } = require('./lib/skills');
const claude = require('./lib/claude');
const agent = require('./lib/agent');
const executor = require('./lib/executor');
const { WatchBuffer } = require('./lib/monitor');

let mainWindow = null;
let store = null;
let watch = null; // Phase 2 always-on capture buffer
let sessionAbort = false; // kill switch for the autonomous loop
let sessionRunning = false;
const pendingConfirms = new Map(); // id -> resolve(boolean) for permission gates

function resolveAllConfirms(value) {
  for (const resolve of pendingConfirms.values()) resolve(value);
  pendingConfirms.clear();
}

function nowIso() {
  return new Date().toISOString();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    title: 'Screen Assistant',
    backgroundColor: '#0f1115',
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
}

/**
 * Capture a single screenshot of the primary display and return it as a PNG
 * data URL. Thumbnail size is capped so frames stay small enough to store and
 * to send to the model.
 */
async function captureSized() {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.size;
  const scale = Math.min(1, 1280 / width);

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
  return { dataUrl: source.thumbnail.toDataURL(), width: size.width, height: size.height };
}

async function captureFrame() {
  return (await captureSized()).dataUrl;
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
    const learned = await claude.understandDemonstration(frames || [], { name, note });
    const skill = {
      id: crypto.randomUUID(),
      name: name || 'Untitled action',
      note: note || '',
      frames: frames || [],
      created_at: nowIso(),
      ...learned,
    };
    return store.add(skill);
  });

  ipcMain.handle('assistant:chat', async (_e, history) => {
    return claude.chat(history || [], store.contextForPrompt());
  });

  // Voice/NL command → intent routing (run a skill, run a goal, or reply).
  ipcMain.handle('assistant:command', async (_e, transcript) => {
    const routed = await claude.routeCommand(String(transcript || ''), store.contextForPrompt());
    if (routed.action === 'skill') {
      const skill = store.get(routed.skill_id);
      routed.skill_name = skill ? skill.name : null;
      if (!skill) routed.action = 'reply'; // stale id → don't run
      if (!skill) routed.message = "I couldn't find that skill anymore.";
    }
    return routed;
  });

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
    if (sessionRunning) return { status: 'busy' };
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

    const send = (evt) => {
      if (!e.sender.isDestroyed()) e.sender.send('agent:event', evt);
    };

    sessionAbort = false;
    sessionRunning = true;
    send({ type: 'started', goal: objective });
    try {
      const result = await agent.runSession({
        goal: objective,
        skill,
        capture: captureSized,
        execute: executor.perform,
        onEvent: send,
        shouldAbort: () => sessionAbort,
        // Human confirmation gate for risky actions. Fails safe: a stopped run
        // or a closed window resolves pending prompts as denied.
        confirm: ({ summary, risk }) =>
          new Promise((resolve) => {
            if (sessionAbort) return resolve(false);
            const id = crypto.randomUUID();
            pendingConfirms.set(id, resolve);
            send({ type: 'confirm-request', id, summary, risk });
          }),
      });
      send({ type: 'finished', ...result });
      return result;
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
    model: claude.DEFAULT_MODEL,
    computerUseModel: agent.MODEL,
    maxSteps: agent.MAX_STEPS,
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
    canControl: executor.isAvailable(),
  }));
}

function registerShortcuts() {
  // Toggle the demonstration recorder from anywhere.
  const ok = globalShortcut.register('CommandOrControl+Shift+R', () => {
    if (mainWindow) {
      mainWindow.webContents.send('shortcut:toggle-record');
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
  if (!ok) console.warn('Could not register global shortcut Ctrl/Cmd+Shift+R');

  // Emergency stop for the autonomous loop — works even when the app isn't focused.
  const stopOk = globalShortcut.register('CommandOrControl+Shift+X', () => {
    sessionAbort = true;
    resolveAllConfirms(false);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('agent:event', { type: 'abort-requested' });
    }
  });
  if (!stopOk) console.warn('Could not register emergency-stop shortcut Ctrl/Cmd+Shift+X');
}

app.whenReady().then(() => {
  store = new SkillStore(path.join(app.getPath('userData'), 'skills.json'));
  watch = new WatchBuffer({
    capture: captureSized,
    onTick: (status) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('watch:event', status);
      }
    },
  });
  registerIpc();
  createWindow();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (watch) watch.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
