'use strict';

/**
 * Speech-to-text with a choice of provider — Groq (free Whisper), OpenAI
 * (Whisper), or Deepgram. The renderer records mic audio and hands the bytes to
 * the main process, which posts them to the chosen provider and returns text.
 * Keeping the HTTP + key in main keeps the key out of the sandboxed web layer.
 *
 * Groq is the default: it runs whisper-large-v3, has a real free tier, and its
 * transcription API is OpenAI-compatible, so the same multipart upload works.
 */

// OpenAI-compatible providers: same multipart request shape, different host/model.
const OAI_COMPAT = {
  groq: { url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3' },
  openai: { url: 'https://api.openai.com/v1/audio/transcriptions', model: 'whisper-1' },
};

function keyHint(status, provider) {
  if (status === 401 || status === 403) return ` (invalid ${provider} API key — check Settings)`;
  if (status === 429) return ` (rate limited or out of ${provider} credits)`;
  return '';
}

async function viaOpenAICompatible(audioBuffer, apiKey, provider, opts) {
  const cfg = OAI_COMPAT[provider];
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: opts.mimeType || 'audio/webm' }), 'audio.webm');
  form.append('model', opts.model || cfg.model);
  form.append('response_format', 'json');

  const resp = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey },
    body: form,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { ok: false, error: `Transcription failed ${resp.status}${keyHint(resp.status, provider)}. ${body.slice(0, 160)}`.trim() };
  }
  const data = await resp.json();
  return { ok: true, text: String(data.text || '').trim() };
}

async function viaDeepgram(audioBuffer, apiKey, opts) {
  const resp = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true', {
    method: 'POST',
    headers: { Authorization: 'Token ' + apiKey, 'Content-Type': opts.mimeType || 'audio/webm' },
    body: audioBuffer,
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return { ok: false, error: `Transcription failed ${resp.status}${keyHint(resp.status, 'deepgram')}. ${body.slice(0, 160)}`.trim() };
  }
  const data = await resp.json();
  const text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  return { ok: true, text: String(text).trim() };
}

/**
 * @param {Buffer}  audioBuffer  recorded audio (webm/opus)
 * @param {string}  apiKey       the STT provider's key
 * @param {object}  [opts]       { provider: 'groq'|'openai'|'deepgram', model, mimeType }
 * @returns {Promise<{ok:boolean, text?:string, error?:string}>}
 */
async function transcribe(audioBuffer, apiKey, opts = {}) {
  const provider = (opts.provider || 'groq').toLowerCase();
  if (!apiKey) {
    return { ok: false, error: `No ${provider} API key set. Add one in Settings to enable voice.` };
  }
  if (!audioBuffer || !audioBuffer.length) {
    return { ok: false, error: 'No audio captured.' };
  }
  try {
    if (provider === 'deepgram') return await viaDeepgram(audioBuffer, apiKey, opts);
    if (OAI_COMPAT[provider]) return await viaOpenAICompatible(audioBuffer, apiKey, provider, opts);
    return { ok: false, error: `Unknown STT provider "${provider}".` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { transcribe, PROVIDERS: ['groq', 'openai', 'deepgram'] };
