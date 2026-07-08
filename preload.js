'use strict';

/**
 * Preload bridge. Exposes a small, explicit API to the renderer over
 * contextIsolation so the web layer can never touch Node, the filesystem, or
 * the Anthropic key directly.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistant', {
  captureFrame: () => ipcRenderer.invoke('capture-frame'),

  skills: {
    list: () => ipcRenderer.invoke('skills:list'),
    get: (id) => ipcRenderer.invoke('skills:get', id),
    save: (payload) => ipcRenderer.invoke('skills:save', payload),
    remove: (id) => ipcRenderer.invoke('skills:delete', id),
  },

  chat: (history) => ipcRenderer.invoke('assistant:chat', history),
  command: (transcript) => ipcRenderer.invoke('assistant:command', transcript),
  plan: (skillId) => ipcRenderer.invoke('assistant:plan', skillId),
  configInfo: () => ipcRenderer.invoke('config:info'),

  // Settings panel.
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    testKey: () => ipcRenderer.invoke('settings:test-key'),
  },

  // Autonomous execution — actually drives the machine.
  execute: (payload) => ipcRenderer.invoke('assistant:execute', payload),
  quick: (payload) => ipcRenderer.invoke('assistant:quick', payload),
  lookAtScreen: (question) => ipcRenderer.invoke('assistant:look', question),
  doAnything: (goal) => ipcRenderer.invoke('assistant:do', goal),
  axElements: () => ipcRenderer.invoke('ax:elements'),
  axClick: (label) => ipcRenderer.invoke('ax:click', label),
  promptClaudeCode: (text) => ipcRenderer.invoke('claudecode:prompt', text),
  arrangeWindows: () => ipcRenderer.invoke('windows:arrange'),
  listWindows: () => ipcRenderer.invoke('windows:list'),
  backgroundTask: (goal) => ipcRenderer.invoke('bgbrowser:run', goal),
  closeBackgroundBrowser: () => ipcRenderer.invoke('bgbrowser:close'),
  ongoing: {
    start: (payload) => ipcRenderer.invoke('ongoing:start', payload),
    stop: (id) => ipcRenderer.invoke('ongoing:stop', id),
    list: () => ipcRenderer.invoke('ongoing:list'),
  },
  schedule: {
    add: (payload) => ipcRenderer.invoke('schedule:add', payload),
    list: () => ipcRenderer.invoke('schedule:list'),
    remove: (id) => ipcRenderer.invoke('schedule:remove', id),
    clear: () => ipcRenderer.invoke('schedule:clear'),
  },
  onScheduleFire: (cb) => ipcRenderer.on('schedule:fire', (_e, job) => cb(job)),
  harvest: (allTabs) => ipcRenderer.invoke('webpage:harvest', allTabs),
  crawl: (opts) => ipcRenderer.invoke('webpage:crawl', opts),
  sweep: {
    run: (opts) => ipcRenderer.invoke('sweep:run', opts),
    search: (query) => ipcRenderer.invoke('sweep:search', query),
    stats: () => ipcRenderer.invoke('sweep:stats'),
    open: (filePath) => ipcRenderer.invoke('sweep:open', filePath),
  },
  content: {
    search: (query) => ipcRenderer.invoke('content:search', query),
    summarize: (payload) => ipcRenderer.invoke('content:summarize', payload),
  },
  runCommand: (payload) => ipcRenderer.invoke('assistant:shell', payload),
  transcribe: (audio) => ipcRenderer.invoke('voice:transcribe', audio),
  stop: () => ipcRenderer.invoke('assistant:stop'),
  confirm: (payload) => ipcRenderer.invoke('assistant:confirm', payload),
  onAgentEvent: (cb) => ipcRenderer.on('agent:event', (_e, evt) => cb(evt)),

  // Self-improvement — the assistant edits its own code (via Claude Code when
  // available), then relaunches to apply. selfUpdate git-pulls the latest.
  improve: {
    run: (goal) => ipcRenderer.invoke('improve:run', goal),
    viaScreen: (request) => ipcRenderer.invoke('improve:onscreen', request),
    commit: (message) => ipcRenderer.invoke('improve:commit', message),
    optimize: () => ipcRenderer.invoke('improve:optimize'),
    selfUpdate: () => ipcRenderer.invoke('improve:selfupdate'),
    relaunch: () => ipcRenderer.invoke('improve:relaunch'),
  },

  // Self-telemetry + watch-and-learn.
  telemetry: () => ipcRenderer.invoke('telemetry:summary'),
  observe: {
    start: () => ipcRenderer.invoke('observe:start'),
    stop: () => ipcRenderer.invoke('observe:stop'),
    status: () => ipcRenderer.invoke('observe:status'),
  },
  // One-tap "accept surveillance" consent (persisted; always-on across restarts).
  setSurveillance: (accepted) => ipcRenderer.invoke('surveillance:set', accepted),
  onImproveEvent: (cb) => ipcRenderer.on('improve:event', (_e, evt) => cb(evt)),

  // Memory vault (Obsidian-style long-term memory).
  memory: {
    info: () => ipcRenderer.invoke('memory:info'),
    open: () => ipcRenderer.invoke('memory:open'),
    search: (query) => ipcRenderer.invoke('memory:search', query),
    remember: (payload) => ipcRenderer.invoke('memory:remember', payload),
  },

  // Phase 3: workflows (compositions of skills/goals).
  workflows: {
    list: () => ipcRenderer.invoke('workflows:list'),
    get: (id) => ipcRenderer.invoke('workflows:get', id),
    save: (payload) => ipcRenderer.invoke('workflows:save', payload),
    remove: (id) => ipcRenderer.invoke('workflows:delete', id),
    run: (id) => ipcRenderer.invoke('workflows:run', id),
  },

  // Phase 2: continuous private capture.
  watch: {
    start: () => ipcRenderer.invoke('watch:start'),
    stop: () => ipcRenderer.invoke('watch:stop'),
    pause: () => ipcRenderer.invoke('watch:pause'),
    resume: () => ipcRenderer.invoke('watch:resume'),
    status: () => ipcRenderer.invoke('watch:status'),
    recent: (n) => ipcRenderer.invoke('watch:recent', n),
  },
  onWatchEvent: (cb) => ipcRenderer.on('watch:event', (_e, evt) => cb(evt)),

  // Widget ↔ dashboard window controls.
  openDashboard: (tab) => ipcRenderer.invoke('window:open-dashboard', tab),
  hideWidget: () => ipcRenderer.invoke('widget:hide'),
  quitApp: () => ipcRenderer.invoke('widget:quit'),
  collapseWidget: (collapsed) => ipcRenderer.invoke('widget:collapse', collapsed),
  summaryCounts: () => ipcRenderer.invoke('summary:counts'),
  onWidgetSummon: (cb) => ipcRenderer.on('widget:summon', cb),
  onWidgetCollapsed: (cb) => ipcRenderer.on('widget:collapsed', (_e, v) => cb(v)),
  onFocusTab: (cb) => ipcRenderer.on('dashboard:focus-tab', (_e, tab) => cb(tab)),

  // Global-shortcut push from main → renderer.
  onToggleRecord: (cb) => ipcRenderer.on('shortcut:toggle-record', cb),
});
