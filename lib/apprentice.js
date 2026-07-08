'use strict';

/**
 * Apprentice — JARVIS's specialty: learning to use external applications.
 *
 * Three ways he learns an app, from most to least active:
 *
 *   1. LESSONS — the user teaches him: "let me show you how to sidechain in
 *      Ableton". JARVIS starts a lesson, watches the screen while the user
 *      demonstrates, and when they say "done teaching" he distills the frames
 *      into workflow steps + interface patterns in his playbook (and optionally
 *      a reusable skill). He can also ASK for a lesson himself: every time he
 *      fails at something in an app, the gap is recorded — "I don't know how to
 *      X in Y" — and he requests a demonstration next time it matters.
 *
 *   2. EXPLORATION — "go study Ableton": he brings the app up, reads its
 *      accessibility tree (buttons, fields, menus with real coordinates), and
 *      records the interface inventory into the playbook — structural knowledge
 *      before ever clicking anything.
 *
 *   3. PASSIVE WATCHING — the existing watch-and-study loop keeps adding
 *      patterns while the user simply works (lib/learning.js).
 *
 * This module owns the lesson lifecycle, frame sampling, and the gap ledger —
 * all headless-testable; the caller injects capture/distill/record/vault-dir.
 */

const fs = require('fs');
const path = require('path');

// A lesson keeps at most this many frames — sampled evenly, so a 10-minute
// demonstration still distills from a bounded, cheap set.
const MAX_LESSON_FRAMES = 24;

let lesson = null; // { app, question, startedAt, frames: [{t, dataUrl}], everyNth, counter }
let GAPS_FILE = null;
let gaps = [];
let gseq = 0;

function init(dir) {
  GAPS_FILE = path.join(dir, 'Learning', 'gaps.json');
  gaps = [];
  try {
    const raw = JSON.parse(fs.readFileSync(GAPS_FILE, 'utf8'));
    if (Array.isArray(raw)) gaps = raw;
  } catch {
    /* first run */
  }
}

function saveGaps() {
  if (!GAPS_FILE) return;
  try {
    fs.mkdirSync(path.dirname(GAPS_FILE), { recursive: true });
    const tmp = GAPS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(gaps.slice(-100), null, 2), 'utf8');
    fs.renameSync(tmp, GAPS_FILE);
  } catch {
    /* best-effort */
  }
}

// ---- Gap ledger: what JARVIS knows he can't do yet -------------------------

/** Record "I couldn't do `want` in `app`" (deduped per app+want). */
function recordGap(app, want) {
  const a = String(app || '').trim();
  const w = String(want || '').trim();
  if (!w) return null;
  const key = (a + '|' + w).toLowerCase().replace(/[^a-z0-9| ]/g, '').slice(0, 140);
  const dup = gaps.find((g) => g.key === key && !g.resolved);
  if (dup) {
    dup.count++;
    saveGaps();
    return dup;
  }
  const gap = { id: 'gap' + Date.now().toString(36) + (gseq++).toString(36), key, app: a, want: w, count: 1, createdAt: Date.now(), resolved: false };
  gaps.push(gap);
  saveGaps();
  return gap;
}

function listGaps() {
  return gaps.filter((g) => !g.resolved).sort((a, b) => b.count - a.count);
}

function resolveGap(id) {
  const g = gaps.find((x) => x.id === id);
  if (g) {
    g.resolved = true;
    saveGaps();
  }
  return Boolean(g);
}

/** The question JARVIS most wants answered ("show me how to X in Y"). */
function nextQuestion() {
  const g = listGaps()[0];
  if (!g) return null;
  return { id: g.id, app: g.app, want: g.want, ask: `Can you show me how to ${g.want}${g.app ? ` in ${g.app}` : ''}? Say "teach me" and demonstrate — I'll watch and learn it.` };
}

// ---- Lesson lifecycle ------------------------------------------------------

/** Begin a lesson. The user will now demonstrate; frames arrive via noteFrame. */
function begin(question, app) {
  lesson = {
    app: String(app || '').trim(),
    question: String(question || '').trim() || 'how this app is used',
    startedAt: Date.now(),
    frames: [],
    everyNth: 1,
    counter: 0,
  };
  return { ok: true, app: lesson.app, question: lesson.question };
}

function isActive() {
  return Boolean(lesson);
}

/**
 * Feed a screen frame while a lesson is running. Evenly thins itself: when the
 * buffer fills, keep every other frame and double the sampling stride — so any
 * demo length distills from ≤ MAX_LESSON_FRAMES spread across the whole demo.
 */
function noteFrame(dataUrl) {
  if (!lesson || !dataUrl) return;
  lesson.counter++;
  if ((lesson.counter - 1) % lesson.everyNth !== 0) return;
  lesson.frames.push(dataUrl);
  if (lesson.frames.length > MAX_LESSON_FRAMES) {
    lesson.frames = lesson.frames.filter((_, i) => i % 2 === 0);
    lesson.everyNth *= 2;
  }
}

/**
 * End the lesson and hand back what to distill. Caller runs the model call and
 * then records the result via lib/learning + optionally saves a skill.
 */
function finish() {
  if (!lesson) return { ok: false, error: 'No lesson is running.' };
  const done = { ok: true, app: lesson.app, question: lesson.question, frames: lesson.frames.slice(), durationMs: Date.now() - lesson.startedAt };
  lesson = null;
  return done;
}

function cancel() {
  lesson = null;
  return { ok: true };
}

function status() {
  return lesson
    ? { active: true, app: lesson.app, question: lesson.question, frames: lesson.frames.length, startedAt: lesson.startedAt }
    : { active: false };
}

module.exports = { init, begin, noteFrame, finish, cancel, status, isActive, recordGap, listGaps, resolveGap, nextQuestion, MAX_LESSON_FRAMES };
