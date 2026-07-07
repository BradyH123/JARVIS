'use strict';

/**
 * Speech-to-text via OpenAI Whisper.
 *
 * The renderer records mic audio (getUserMedia + MediaRecorder) and hands the
 * bytes to the main process, which posts them to OpenAI's transcription endpoint
 * and returns the text. Doing the HTTP call in main keeps the OpenAI key out of
 * the sandboxed web layer and avoids CORS.
 *
 * Needs its OWN key (separate from the Anthropic key) — set it in Settings.
 */

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const DEFAULT_MODEL = 'whisper-1';

/**
 * @param {Buffer}  audioBuffer  the recorded audio bytes (webm/opus, wav, m4a…)
 * @param {string}  apiKey       OpenAI API key
 * @param {object}  [opts]       { model, mimeType, filename }
 * @returns {Promise<{ok:boolean, text?:string, error?:string}>}
 */
async function transcribe(audioBuffer, apiKey, opts = {}) {
  if (!apiKey) {
    return { ok: false, error: 'No OpenAI API key set. Add one in Settings to enable voice.' };
  }
  if (!audioBuffer || !audioBuffer.length) {
    return { ok: false, error: 'No audio captured.' };
  }
  try {
    const form = new FormData();
    const blob = new Blob([audioBuffer], { type: opts.mimeType || 'audio/webm' });
    form.append('file', blob, opts.filename || 'audio.webm');
    form.append('model', opts.model || DEFAULT_MODEL);
    form.append('response_format', 'json');

    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey },
      body: form,
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      let hint = '';
      if (resp.status === 401) hint = ' (invalid OpenAI API key — check Settings)';
      else if (resp.status === 429) hint = ' (rate limited or out of OpenAI credits)';
      return { ok: false, error: `Transcription failed ${resp.status}${hint}. ${body.slice(0, 160)}`.trim() };
    }

    const data = await resp.json();
    return { ok: true, text: String(data.text || '').trim() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { transcribe };
