'use strict';

/**
 * Interface learning — JARVIS studies how the user works.
 *
 * While always-on watching is active, JARVIS periodically studies recent screen
 * frames and distills them into a persistent INTERFACE PLAYBOOK in the memory
 * vault (Learning/<App>.md): how each app's interface is laid out, the idioms
 * and shortcuts the user relies on, and the workflows they repeat. Unlike the
 * Observations diary (a chronological "what happened"), the playbook is
 * knowledge — organized by app, deduplicated, and small enough to inject into
 * the computer-use agent's prompt. That's the loop that makes watching useful:
 * JARVIS operates interfaces better BECAUSE he watched how a human does it.
 *
 * Plain files, no database: the vault stays browsable in Obsidian, and each
 * pattern is one bullet line so dedupe is a set-membership test.
 */

const fs = require('fs');
const path = require('path');

let DIR = null; // <vault>/Learning

function init(dir) {
  DIR = dir;
  try {
    fs.mkdirSync(DIR, { recursive: true });
  } catch {
    /* best-effort */
  }
}

function ready() {
  return Boolean(DIR);
}

/** "Google Chrome" → "Google Chrome.md" (safe filename). */
function fileFor(app) {
  const name = String(app || 'General').replace(/[\\/:*?"<>|]/g, '').trim() || 'General';
  return path.join(DIR, name + '.md');
}

function normalize(line) {
  return String(line || '').replace(/\s+/g, ' ').trim();
}

/** Case/punct-insensitive key so trivially-rephrased duplicates collapse. */
function dedupeKey(line) {
  const n = normalize(line).toLowerCase();
  // Unicode-aware strip (\p{L}\p{N}) so non-Latin patterns (CJK, Cyrillic…)
  // keep their identity instead of all collapsing to ''.
  const stripped = n.replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
  return (stripped || n).slice(0, 120);
}

function readLines(file) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n');
  } catch {
    return [];
  }
}

// Per-app playbooks are capped so a year of watching can't grow one file into
// something too big to inject or skim. Oldest patterns fall off first.
const MAX_PATTERNS_PER_APP = 120;

/**
 * Merge one study result into the playbook.
 * @param {{app?:string, task?:string, patterns?:string[], habits?:string[], workflow?:string[]}} study
 * @returns {{added:number, app:string}} how many NEW patterns were kept
 */
function record(study) {
  if (!ready() || !study) return { added: 0, app: '' };
  const app = normalize(study.app) || 'General';
  const file = fileFor(app);

  const candidates = [].concat(study.patterns || [], study.habits || []);
  // A repeated workflow is itself a pattern worth one line (same caps apply).
  if (Array.isArray(study.workflow) && study.workflow.length > 1) {
    const task = study.task ? ` (${normalize(study.task).slice(0, 60)})` : '';
    candidates.push((`Workflow${task}: ` + study.workflow.map(normalize).join(' → ')).slice(0, 280));
  }
  const incoming = candidates.map(normalize).filter((l) => l.length > 8 && l.length < 300);
  if (!incoming.length) return { added: 0, app };

  let lines = readLines(file);
  // Never reset an existing file: the vault is user-editable (Obsidian), so a
  // reworded heading or added frontmatter must not wipe learned patterns —
  // just make sure a heading exists somewhere near the top.
  if (!lines.some((l) => l.trim())) {
    lines = [`# ${app} — interface playbook`, ''];
  } else if (!lines[0].startsWith('#')) {
    lines.unshift(`# ${app} — interface playbook`, '');
  }
  const seen = new Set(lines.filter((l) => l.startsWith('- ')).map((l) => dedupeKey(l.slice(2))));
  let added = 0;
  for (const l of incoming) {
    const key = dedupeKey(l);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    lines.push('- ' + l);
    added++;
  }
  if (!added) return { added: 0, app };

  // Enforce the cap: drop the OLDEST bullets (top of the list) first.
  const bullets = lines.filter((l) => l.startsWith('- '));
  if (bullets.length > MAX_PATTERNS_PER_APP) {
    let toDrop = bullets.length - MAX_PATTERNS_PER_APP;
    lines = lines.filter((l) => {
      if (toDrop > 0 && l.startsWith('- ')) {
        toDrop--;
        return false;
      }
      return true;
    });
  }
  try {
    fs.writeFileSync(file, lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n', 'utf8');
  } catch {
    return { added: 0, app };
  }
  return { added, app };
}

function listApps() {
  if (!ready()) return [];
  try {
    return fs
      .readdirSync(DIR)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3));
  } catch {
    return [];
  }
}

function patternsFor(app) {
  return readLines(fileFor(app))
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2));
}

/**
 * A compact playbook block for prompt injection. If `app` is given (or a list
 * of app names), that app's patterns come first; General and other recently
 * studied apps fill the remaining budget. Newest patterns win within an app.
 * @returns {string} '' when nothing has been learned yet
 */
function playbook(app, maxChars = 1600) {
  if (!ready()) return '';
  const asked = (Array.isArray(app) ? app : app ? [app] : []).map(normalize).filter(Boolean);
  const all = listApps();
  // Fuzzy-resolve requested app names against playbook files: process names and
  // studied names rarely match exactly ("Google Chrome" vs "Chrome", "Live" vs
  // "Ableton Live"), so match case-insensitively in either direction.
  const resolveApp = (w) => {
    const wl = w.toLowerCase();
    return (
      all.find((a) => a.toLowerCase() === wl) ||
      all.find((a) => a.toLowerCase().includes(wl) || wl.includes(a.toLowerCase()))
    );
  };
  const wanted = [...new Set(asked.map(resolveApp).filter(Boolean))];
  // Priority: requested apps → General → most recently modified rest.
  const rest = all
    .filter((a) => !wanted.includes(a) && a !== 'General')
    .map((a) => {
      let m = 0;
      try {
        m = fs.statSync(fileFor(a)).mtimeMs;
      } catch {
        /* keep 0 */
      }
      return { a, m };
    })
    .sort((x, y) => y.m - x.m)
    .map((x) => x.a);
  const order = [...wanted, ...(all.includes('General') && !wanted.includes('General') ? ['General'] : []), ...rest];

  const out = [];
  let remaining = maxChars;
  for (const a of order) {
    if (remaining < 60) break; // no meaningful room left
    // Newest learnings are at the bottom of each file — take from the end.
    const pats = patternsFor(a).slice(-12).reverse();
    if (!pats.length) continue;
    const header = `${a}:`;
    const block = [header];
    let r = remaining - header.length - 2; // block separator allowance
    for (const p of pats) {
      const line = '• ' + p;
      if (line.length + 1 > r) continue; // skip an oversized line, keep filling
      block.push(line);
      r -= line.length + 1;
    }
    if (block.length < 2) continue; // nothing fit for this app
    const text = block.join('\n');
    out.push(text);
    remaining -= text.length + 2;
  }
  return out.join('\n\n');
}

/** Human summary for "what have you learned about how I work?". */
function stats() {
  const apps = listApps();
  const perApp = apps
    .map((a) => ({ app: a, patterns: patternsFor(a).length }))
    .filter((x) => x.patterns > 0)
    .sort((x, y) => y.patterns - x.patterns);
  const total = perApp.reduce((n, x) => n + x.patterns, 0);
  return { apps: perApp, total };
}

module.exports = { init, record, playbook, stats, listApps, patternsFor, dedupeKey, MAX_PATTERNS_PER_APP };
