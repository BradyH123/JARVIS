'use strict';

/**
 * Self-telemetry — JARVIS records data about his OWN work so he can measure his
 * efficiency and use it to optimize his own code.
 *
 * Every run (an autonomous task, a quick action, a screen read, a shell command,
 * a self-improvement) appends one JSON line to telemetry.jsonl with its kind,
 * outcome, duration, and step count. `summary()` aggregates that into the numbers
 * that matter — success rate, average/worst durations per kind, the commonest
 * errors — and `summaryText()` formats it to feed straight into the
 * self-improvement prompt ("here is how you've been performing; fix the worst").
 *
 * Pure fs, Electron-optional, so it's unit-testable.
 */

const fs = require('fs');
const path = require('path');

let FILE = null;

function init(dir) {
  FILE = path.join(dir, 'telemetry.jsonl');
}

/** Record one run. entry = { kind, goal?, status, durationMs?, steps?, error? } */
function record(entry) {
  if (!FILE || !entry) return;
  try {
    fs.appendFileSync(FILE, JSON.stringify({ ...entry, at: new Date().toISOString() }) + '\n', 'utf8');
  } catch {
    /* telemetry is best-effort — never break a run over it */
  }
}

function readAll(limit = 3000) {
  if (!FILE) return [];
  let raw;
  try {
    raw = fs.readFileSync(FILE, 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.trim().split('\n').filter(Boolean).slice(-limit)) {
    try {
      out.push(JSON.parse(line));
    } catch {
      /* skip a corrupt line */
    }
  }
  return out;
}

function median(nums) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Aggregate stats over the most recent `n` runs. */
function summary(n = 800) {
  const rows = readAll(n);
  const total = rows.length;
  const okStatuses = new Set(['done', 'ok', 'success']);
  const byKind = {};
  const errorCounts = {};

  for (const r of rows) {
    const kind = r.kind || 'other';
    const k = (byKind[kind] = byKind[kind] || { count: 0, ok: 0, durations: [], steps: [] });
    k.count += 1;
    if (okStatuses.has(r.status)) k.ok += 1;
    if (Number.isFinite(r.durationMs)) k.durations.push(r.durationMs);
    if (Number.isFinite(r.steps)) k.steps.push(r.steps);
    if (r.error) {
      const key = String(r.error).split('\n')[0].slice(0, 80);
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }
  }

  const kinds = Object.entries(byKind).map(([kind, k]) => ({
    kind,
    count: k.count,
    successRate: k.count ? Math.round((k.ok / k.count) * 100) : 0,
    avgMs: k.durations.length ? Math.round(k.durations.reduce((a, b) => a + b, 0) / k.durations.length) : null,
    medianMs: median(k.durations),
    avgSteps: k.steps.length ? Math.round((k.steps.reduce((a, b) => a + b, 0) / k.steps.length) * 10) / 10 : null,
  }));
  kinds.sort((a, b) => (b.avgMs || 0) - (a.avgMs || 0));

  const okTotal = kinds.reduce((s, k) => s + Math.round((k.successRate / 100) * k.count), 0);
  const topErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([error, count]) => ({ error, count }));

  return {
    total,
    successRate: total ? Math.round((okTotal / total) * 100) : 0,
    kinds,
    topErrors,
  };
}

/** A human/model-readable digest for the self-improvement prompt or a status reply. */
function summaryText(n = 800) {
  const s = summary(n);
  if (!s.total) return 'No performance data recorded yet.';
  const lines = [`Across ${s.total} recent runs, overall success ${s.successRate}%.`, 'By kind (slowest first):'];
  for (const k of s.kinds) {
    const speed = k.avgMs != null ? `${(k.avgMs / 1000).toFixed(1)}s avg` : 'n/a';
    const steps = k.avgSteps != null ? `, ${k.avgSteps} steps avg` : '';
    lines.push(`- ${k.kind}: ${k.count} runs, ${k.successRate}% ok, ${speed}${steps}`);
  }
  if (s.topErrors.length) {
    lines.push('Most common errors:');
    for (const e of s.topErrors) lines.push(`- (${e.count}×) ${e.error}`);
  }
  return lines.join('\n');
}

module.exports = { init, record, readAll, summary, summaryText };
