'use strict';

/**
 * Filesystem sweep — index the user's files and apps so JARVIS can find and open
 * things INSTANTLY instead of searching live every time.
 *
 * It records metadata only (path, name, extension, size, modified time) — NOT
 * file contents — which keeps the sweep fast and low-risk while still powering
 * quick "find/open my …" lookups. The index is written to disk and cached in
 * memory; `search()` ranks matches by name/recency/app.
 *
 * Blocking-safe: the walk yields to the event loop periodically so the widget
 * stays responsive during a big sweep. Pure fs (Electron-optional / testable).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let INDEX_DIR = null;
let cache = null;

function init(dir) {
  INDEX_DIR = dir;
}
function indexPath() {
  return INDEX_DIR ? path.join(INDEX_DIR, 'file-index.jsonl') : null;
}

// Directories that are noise or huge — never descend into these.
const EXCLUDES = new Set([
  'node_modules', '.git', 'Library', '.Trash', '.cache', '.npm', '.cargo', '.rustup',
  'venv', '.venv', '__pycache__', '.next', 'dist', 'build', '.gradle', '.m2',
  'DerivedData', 'Caches', 'System', 'Volumes', '.vscode', '.idea',
]);

function existing(paths) {
  return paths.filter((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

/** The folders a normal sweep covers (common user folders + Applications). */
function defaultRoots() {
  const home = os.homedir();
  return existing([
    path.join(home, 'Desktop'),
    path.join(home, 'Documents'),
    path.join(home, 'Downloads'),
    path.join(home, 'Pictures'),
    path.join(home, 'Movies'),
    path.join(home, 'Music'),
    '/Applications',
  ]);
}

/**
 * Walk the filesystem and build the index.
 * @param {object}   [opts] { roots, everything, maxFiles, onProgress, shouldAbort }
 * @returns {Promise<Array>}
 */
async function sweep(opts = {}) {
  const roots =
    opts.roots && opts.roots.length
      ? existing(opts.roots)
      : opts.everything
      ? existing([os.homedir(), '/Applications'])
      : defaultRoots();
  const maxFiles = Math.min(opts.maxFiles || 200000, 1000000);
  const onProgress = opts.onProgress || (() => {});
  const shouldAbort = opts.shouldAbort || (() => false);

  const out = [];
  const stack = [...roots];
  let sinceYield = 0;

  while (stack.length && out.length < maxFiles) {
    if (shouldAbort()) break;
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const name = e.name;
      if (name.startsWith('.')) continue; // skip hidden/system dotfiles
      const full = path.join(dir, name);
      if (e.isDirectory()) {
        if (EXCLUDES.has(name)) continue;
        if (name.endsWith('.app')) {
          out.push({ path: full, name, ext: 'app', app: true, size: 0, mtime: 0 });
          continue; // treat an app bundle as one entry; don't descend
        }
        stack.push(full);
      } else if (e.isFile()) {
        let st;
        try {
          st = fs.statSync(full);
        } catch {
          continue;
        }
        out.push({ path: full, name, ext: path.extname(name).slice(1).toLowerCase(), size: st.size, mtime: Math.round(st.mtimeMs) });
        if (out.length >= maxFiles) break;
      }
    }
    if (++sinceYield >= 400) {
      sinceYield = 0;
      onProgress({ found: out.length, current: dir });
      await new Promise((r) => setImmediate(r)); // keep the UI responsive
    }
  }

  cache = out;
  save(out);
  return out;
}

function save(list) {
  const p = indexPath();
  if (!p) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, list.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}

function load() {
  if (cache) return cache;
  const p = indexPath();
  if (!p) return [];
  try {
    cache = fs
      .readFileSync(p, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    cache = [];
  }
  return cache;
}

/** Rank index entries against a query (all terms must match name or path). */
function search(query, limit = 25) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const hits = [];
  for (const r of load()) {
    const nl = r.name.toLowerCase();
    const hay = nl + ' ' + r.path.toLowerCase();
    if (!terms.every((t) => hay.includes(t))) continue;
    let score = 0;
    if (nl === q) score += 20;
    if (nl.includes(q)) score += 10;
    if (nl.startsWith(terms[0])) score += 5;
    if (r.app) score += 4;
    score += Math.min(4, (r.mtime || 0) / 1e12); // slight recency boost
    hits.push({ path: r.path, name: r.name, ext: r.ext, app: !!r.app, mtime: r.mtime || 0, score });
  }
  hits.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  return hits.slice(0, limit);
}

function stats() {
  const list = load();
  const byExt = {};
  for (const r of list) byExt[r.ext || '?'] = (byExt[r.ext || '?'] || 0) + 1;
  const topTypes = Object.entries(byExt).sort((a, b) => b[1] - a[1]).slice(0, 12);
  return { total: list.length, indexPath: indexPath(), topTypes };
}

module.exports = { init, sweep, search, stats, load, defaultRoots };
