'use strict';

/**
 * Content search & extraction — search INSIDE files, and read a file's text so
 * JARVIS can summarize/answer about it.
 *
 * Search uses macOS Spotlight (`mdfind`), which already indexes file *contents*
 * (including PDFs, Word docs, Pages, etc.) — so "find the doc that mentions the
 * Q3 budget" is instant with zero heavy dependencies.
 *
 * Extraction reads a specific file's text: plain-text/code directly, rich docs
 * via `textutil`, PDFs via `pdftotext` when available (graceful message if not).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const isMac = process.platform === 'darwin';

const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'xml', 'yml', 'yaml', 'ini',
  'js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'sh',
  'css', 'html', 'htm', 'tex', 'srt', 'vtt', 'sql', 'env', 'toml',
]);
const RICH_EXT = new Set(['rtf', 'rtfd', 'doc', 'docx', 'odt', 'pages', 'webarchive', 'html', 'htm']);

function runOut(cmd, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs || 20000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || ''), err: err ? String(stderr || '') || err.message : '' });
    });
  });
}

/**
 * Search inside files via Spotlight. Returns files whose CONTENT matches.
 * @param {string} query
 * @param {object} [opts] { scope, limit }
 */
async function searchContent(query, opts = {}) {
  if (!isMac) return { ok: false, error: 'Content search needs macOS Spotlight.' };
  const q = String(query || '').trim();
  if (!q) return { ok: false, error: 'No query.' };
  const scope = opts.scope || os.homedir();
  const r = await runOut('mdfind', ['-onlyin', scope, q]);
  if (!r.ok) return { ok: false, error: r.err || 'Spotlight search failed.' };
  const results = r.out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, opts.limit || 40)
    .map((p) => ({ path: p, name: path.basename(p), ext: path.extname(p).slice(1).toLowerCase() }));
  return { ok: true, results };
}

/**
 * Extract a file's text so it can be summarized/answered about.
 * @param {string} filePath
 * @param {number} [maxChars=200000]
 */
async function readText(filePath, maxChars = 200000) {
  const p = String(filePath || '');
  if (!p || !fs.existsSync(p)) return { ok: false, error: 'File not found.' };
  const ext = path.extname(p).slice(1).toLowerCase();
  try {
    if (TEXT_EXT.has(ext) || !ext) {
      return { ok: true, text: fs.readFileSync(p, 'utf8').slice(0, maxChars) };
    }
    if (isMac && RICH_EXT.has(ext)) {
      const r = await runOut('textutil', ['-convert', 'txt', '-stdout', p]);
      if (r.ok && r.out.trim()) return { ok: true, text: r.out.slice(0, maxChars) };
    }
    if (isMac && ext === 'pdf') {
      const r = await runOut('pdftotext', [p, '-']);
      if (r.ok && r.out.trim()) return { ok: true, text: r.out.slice(0, maxChars) };
      return {
        ok: false,
        error:
          'To read PDF text directly, install poppler (`brew install poppler`). ' +
          'Content search already reads PDFs via Spotlight, though.',
      };
    }
    // Last resort: try a raw UTF-8 read.
    return { ok: true, text: fs.readFileSync(p, 'utf8').slice(0, maxChars) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { searchContent, readText, TEXT_EXT };
