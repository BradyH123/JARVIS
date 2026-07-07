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
  stop: () => ipcRenderer.invoke('assistant:stop'),
  confirm: (payload) => ipcRenderer.invoke('assistant:confirm', payload),
  onAgentEvent: (cb) => ipcRenderer.on('agent:event', (_e, evt) => cb(evt)),

  // Self-improvement — the assistant edits its own code, then relaunches to apply.
  improve: {
    run: (goal) => ipcRenderer.invoke('improve:run', goal),
    relaunch: () => ipcRenderer.invoke('improve:relaunch'),
  },
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
