'use strict';

/**
 * Runtime configuration store — the shippable replacement for hand-editing .env.
 *
 * Resolution order for every setting:
 *   1. value saved from the in-app Settings panel (settings.json in userData)
 *   2. environment variable (.env still works for developers)
 *   3. built-in default
 *
 * The API key is stored encrypted with Electron's safeStorage (OS keychain-
 * backed) when available; we fall back to plaintext-in-userData only if the OS
 * provides no encryption, and report which mode is active so the UI can say so.
 *
 * This module is Electron-optional: outside Electron (tests) it still works,
 * just without encryption.
 */

const fs = require('fs');
const path = require('path');

let settingsPath = null;
let settings = {};

function safeStorageOrNull() {
  try {
    // eslint-disable-next-line global-require
    const { safeStorage } = require('electron');
    return safeStorage && safeStorage.isEncryptionAvailable() ? safeStorage : null;
  } catch {
    return null;
  }
}

function init(userDataDir) {
  settingsPath = path.join(userDataDir, 'settings.json');
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    settings = {};
  }
}

function persist() {
  if (!settingsPath) return;
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
}

/** Generic getter: saved setting → env var → default. */
function value(name, envName, fallback) {
  if (settings[name] !== undefined && settings[name] !== '') return settings[name];
  if (envName && process.env[envName]) return process.env[envName];
  return fallback;
}

// ---- API key (special-cased for encryption) ----

function setApiKey(plain) {
  const ss = safeStorageOrNull();
  if (!plain) {
    delete settings.apiKeyEnc;
    delete settings.apiKeyPlain;
  } else if (ss) {
    settings.apiKeyEnc = ss.encryptString(plain).toString('base64');
    delete settings.apiKeyPlain;
  } else {
    settings.apiKeyPlain = plain;
    delete settings.apiKeyEnc;
  }
  persist();
}

function getApiKey() {
  if (settings.apiKeyEnc) {
    const ss = safeStorageOrNull();
    if (ss) {
      try {
        return ss.decryptString(Buffer.from(settings.apiKeyEnc, 'base64'));
      } catch {
        /* corrupted or different machine — fall through */
      }
    }
  }
  if (settings.apiKeyPlain) return settings.apiKeyPlain;
  return process.env.ANTHROPIC_API_KEY || null;
}

function keyStorageMode() {
  if (settings.apiKeyEnc) return 'encrypted';
  if (settings.apiKeyPlain) return 'plaintext';
  if (process.env.ANTHROPIC_API_KEY) return 'env';
  return 'none';
}

// ---- OpenAI key (for Whisper voice transcription) — same encryption pattern ----

function setOpenAIKey(plain) {
  const ss = safeStorageOrNull();
  if (!plain) {
    delete settings.openaiEnc;
    delete settings.openaiPlain;
  } else if (ss) {
    settings.openaiEnc = ss.encryptString(plain).toString('base64');
    delete settings.openaiPlain;
  } else {
    settings.openaiPlain = plain;
    delete settings.openaiEnc;
  }
  persist();
}

function getOpenAIKey() {
  if (settings.openaiEnc) {
    const ss = safeStorageOrNull();
    if (ss) {
      try {
        return ss.decryptString(Buffer.from(settings.openaiEnc, 'base64'));
      } catch {
        /* fall through */
      }
    }
  }
  if (settings.openaiPlain) return settings.openaiPlain;
  return process.env.OPENAI_API_KEY || null;
}

// ---- Typed getters used across the app ----

const getModel = () => value('model', 'ANTHROPIC_MODEL', 'claude-sonnet-5');
// Model tiering (Quality Blueprint §3.4): intent routing is simple classification,
// so run it on a fast, cheap model by default and reserve the main model for
// reasoning/vision. Big latency win on the most frequent call.
const getRouterModel = () =>
  value('routerModel', 'SA_ROUTER_MODEL', 'claude-haiku-4-5-20251001');
// Which speech-to-text provider the voice key belongs to. Groq (free Whisper)
// by default; also 'openai' or 'deepgram'.
const getSttProvider = () => String(value('sttProvider', 'SA_STT_PROVIDER', 'groq')).toLowerCase();
const getComputerUseModel = () =>
  value('computerUseModel', 'SA_COMPUTER_USE_MODEL', getModel());
const getComputerToolType = () =>
  value('computerToolType', 'SA_COMPUTER_TOOL_TYPE', 'computer_20251124');
const getComputerBeta = () =>
  value('computerBeta', 'SA_COMPUTER_BETA', 'computer-use-2025-11-24');
const getMaxSteps = () => Number(value('maxSteps', 'SA_MAX_STEPS', 40));
const getActionDelayMs = () => Number(value('actionDelayMs', 'SA_ACTION_DELAY_MS', 220));
const getTargetWidth = () => Number(value('targetWidth', 'SA_TARGET_WIDTH', 1280));
const getConfirmEvery = () => {
  const v = value('confirmEvery', 'SA_CONFIRM_EVERY', false);
  return v === true || /^(1|true|yes)$/i.test(String(v));
};
// Full Control: skip per-action approval prompts entirely (the STOP kill switch
// still always works). Defaults ON so JARVIS has full access to the computer by
// default; turn it off (Settings, or say "ask before acting") to restore the
// per-action approval gate. A saved setting always wins over this default.
const getFullControl = () => {
  const v = value('fullControl', 'SA_FULL_CONTROL', true);
  return v === true || /^(1|true|yes)$/i.test(String(v));
};
// "Accept surveillance" consent: when on, JARVIS always watches and learns from
// the moment he launches (no need to ask each session). Off by default — the
// user opts in explicitly. Frames stay local; only text summaries are saved.
const getAlwaysWatch = () => {
  const v = value('alwaysWatch', 'SA_ALWAYS_WATCH', false);
  return v === true || /^(1|true|yes)$/i.test(String(v));
};
const getWatchIntervalMs = () => Number(value('watchIntervalMs', 'SA_WATCH_INTERVAL_MS', 3000));
const getWatchMaxFrames = () => Number(value('watchMaxFrames', 'SA_WATCH_MAX_FRAMES', 40));
// How many recent screenshots to keep in the model's context each turn.
const getKeepImages = () => Math.max(1, Number(value('keepImages', 'SA_KEEP_IMAGES', 3)));

/** Everything the Settings UI needs (never includes the key itself). */
function snapshot() {
  return {
    hasKey: Boolean(getApiKey()),
    keyStorageMode: keyStorageMode(),
    hasOpenAIKey: Boolean(getOpenAIKey()),
    sttProvider: getSttProvider(),
    model: getModel(),
    computerUseModel: getComputerUseModel(),
    maxSteps: getMaxSteps(),
    confirmEvery: getConfirmEvery(),
    fullControl: getFullControl(),
    alwaysWatch: getAlwaysWatch(),
    watchIntervalMs: getWatchIntervalMs(),
    watchMaxFrames: getWatchMaxFrames(),
  };
}

/** Apply updates from the Settings UI. `apiKey` handled separately/encrypted. */
function update(patch) {
  const allowed = [
    'model',
    'sttProvider',
    'computerUseModel',
    'maxSteps',
    'confirmEvery',
    'fullControl',
    'alwaysWatch',
    'watchIntervalMs',
    'watchMaxFrames',
  ];
  for (const k of allowed) {
    if (patch[k] !== undefined) settings[k] = patch[k];
  }
  if (patch.apiKey !== undefined) setApiKey(String(patch.apiKey || '').trim());
  if (patch.openaiApiKey !== undefined) setOpenAIKey(String(patch.openaiApiKey || '').trim());
  if (patch.apiKey === undefined && patch.openaiApiKey === undefined) persist();
  return snapshot();
}

// --- Widget window state (position + collapsed mini-mode) ---
const getWidgetState = () => settings.widget || {};
function setWidgetState(patch) {
  settings.widget = { ...(settings.widget || {}), ...patch };
  persist();
}

// --- Activity monitor window state (size + position + always-on-top pin) ---
const getActivityState = () => settings.activity || {};
function setActivityState(patch) {
  settings.activity = { ...(settings.activity || {}), ...patch };
  persist();
}

module.exports = {
  init,
  update,
  snapshot,
  getWidgetState,
  setWidgetState,
  getActivityState,
  setActivityState,
  getApiKey,
  getOpenAIKey,
  setOpenAIKey,
  getSttProvider,
  getModel,
  getRouterModel,
  getComputerUseModel,
  getComputerToolType,
  getComputerBeta,
  getMaxSteps,
  getActionDelayMs,
  getTargetWidth,
  getConfirmEvery,
  getFullControl,
  getAlwaysWatch,
  getWatchIntervalMs,
  getWatchMaxFrames,
  getKeepImages,
};
