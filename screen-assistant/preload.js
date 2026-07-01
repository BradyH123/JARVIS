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

  // Autonomous execution — actually drives the machine.
  execute: (payload) => ipcRenderer.invoke('assistant:execute', payload),
  stop: () => ipcRenderer.invoke('assistant:stop'),
  confirm: (payload) => ipcRenderer.invoke('assistant:confirm', payload),
  onAgentEvent: (cb) => ipcRenderer.on('agent:event', (_e, evt) => cb(evt)),

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

  // Global-shortcut push from main → renderer.
  onToggleRecord: (cb) => ipcRenderer.on('shortcut:toggle-record', cb),
});
