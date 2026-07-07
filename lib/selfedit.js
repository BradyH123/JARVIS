'use strict';

/**
 * Self-editing engine — lets the assistant read and rewrite its OWN source code.
 *
 * This is the filesystem + safety layer behind the "self-improve" feature. It is
 * deliberately conservative:
 *   - Only files INSIDE the app root, with a source extension, are readable or
 *     writable. node_modules / .git / build output / backups are off-limits, and
 *     any path that resolves outside the root is rejected (no traversal).
 *   - Every change is snapshotted first (originals kept in memory + a timestamped
 *     on-disk backup) so a bad edit can be reverted wholesale.
 *   - Changes are validated (syntax-check every touched .js, then run the smoke
 *     tests) before they're considered good; the caller reverts on failure.
 *
 * It stays free of Electron deps so it can be unit-tested with plain node.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// The app's own source root — this file lives in <root>/lib/.
const ROOT = path.resolve(__dirname, '..');

// What counts as editable "source". Anything else is invisible to the engine.
const EXTS = new Set(['.js', '.html', '.css', '.json', '.md']);
// Never read, write, or descend into these.
const IGNORE_DIRS = new Set(['node_modules', '.git', 'build', 'dist', 'out', '.selfedit-backups']);
const BACKUP_DIR = path.join(ROOT, '.selfedit-backups');

/** Is `rel` a repo-relative path to an allowed source file (no traversal)? */
function isSourcePath(rel) {
  if (!rel || typeof rel !== 'string' || path.isAbsolute(rel)) return false;
  const norm = path.normalize(rel);
  if (norm.startsWith('..')) return false;
  const parts = norm.split(/[\\/]/);
  if (parts.some((p) => IGNORE_DIRS.has(p))) return false;
  return EXTS.has(path.extname(norm));
}

/** Resolve a repo-relative path to absolute, asserting it stays inside ROOT. */
function abs(rel) {
  const p = path.resolve(ROOT, rel);
  if (p !== ROOT && !p.startsWith(ROOT + path.sep)) {
    throw new Error('Path escapes app root: ' + rel);
  }
  return p;
}

/** Every editable source file in the app, as sorted repo-relative paths. */
function listSource() {
  const out = [];
  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORE_DIRS.has(e.name)) walk(full);
      } else {
        const rel = path.relative(ROOT, full);
        if (isSourcePath(rel)) out.push(rel);
      }
    }
  })(ROOT);
  return out.sort();
}

function readFile(rel) {
  if (!isSourcePath(rel)) throw new Error('Not a readable source file: ' + rel);
  return fs.readFileSync(abs(rel), 'utf8');
}

function writeFile(rel, content) {
  if (!isSourcePath(rel)) throw new Error('Not a writable source file: ' + rel);
  const p = abs(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, String(content), 'utf8');
}

/**
 * Capture the current contents of the given files so they can be restored.
 * A file that doesn't exist yet is recorded as `null` (revert = delete it).
 */
function snapshot(relPaths) {
  const originals = {};
  for (const rel of relPaths) {
    try {
      originals[rel] = fs.readFileSync(abs(rel), 'utf8');
    } catch {
      originals[rel] = null;
    }
  }
  return originals;
}

/** Restore files from a snapshot (deleting ones that didn't exist before). */
function restore(originals) {
  for (const [rel, content] of Object.entries(originals || {})) {
    const p = abs(rel);
    if (content === null) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* already gone */
      }
    } else {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content, 'utf8');
    }
  }
}

/** Persist a snapshot's originals under .selfedit-backups/<stamp>/ for recovery. */
function backup(originals, stamp) {
  const dir = path.join(BACKUP_DIR, String(stamp).replace(/[^a-zA-Z0-9_-]/g, '-'));
  for (const [rel, content] of Object.entries(originals || {})) {
    if (content === null) continue; // nothing to back up for a brand-new file
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf8');
  }
  return dir;
}

/**
 * Validate a set of changed files: syntax-check every touched .js, then — if
 * clean — run the smoke test suite. Returns { ok, errors[] }.
 *
 * We shell out with ELECTRON_RUN_AS_NODE so that when this runs inside the
 * packaged Electron binary, `process.execPath` behaves as a plain Node runtime.
 */
function validate(changedPaths) {
  const errors = [];
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };

  for (const rel of changedPaths || []) {
    if (path.extname(rel) !== '.js') continue;
    try {
      execFileSync(process.execPath, ['--check', abs(rel)], { stdio: 'pipe', env });
    } catch (e) {
      const msg = e.stderr ? e.stderr.toString() : e.message;
      errors.push('Syntax error in ' + rel + ':\n' + msg.trim());
    }
  }

  if (!errors.length) {
    const smoke = path.join(ROOT, 'test', 'smoke.js');
    if (fs.existsSync(smoke)) {
      try {
        execFileSync(process.execPath, [smoke], { stdio: 'pipe', cwd: ROOT, env });
      } catch (e) {
        const out =
          (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
        errors.push('Smoke tests failed:\n' + out.trim().slice(-2500));
      }
    }
  }

  // Gate on the eval scorecard too: a self-edit is kept only if the golden
  // invariants (safety + correctness) still pass. (Quality Blueprint §3.6/§3.8.)
  if (!errors.length) {
    const evalRunner = path.join(ROOT, 'test', 'eval', 'run.js');
    if (fs.existsSync(evalRunner)) {
      try {
        execFileSync(process.execPath, [evalRunner], { stdio: 'pipe', cwd: ROOT, env });
      } catch (e) {
        const out =
          (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
        errors.push('Eval scorecard regressed:\n' + out.trim().slice(-2500));
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  ROOT,
  isSourcePath,
  listSource,
  readFile,
  writeFile,
  snapshot,
  restore,
  backup,
  validate,
};
