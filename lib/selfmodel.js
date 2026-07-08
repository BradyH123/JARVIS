'use strict';

/**
 * Self-model — JARVIS's living sense of self.
 *
 * Identity.md answers "who am I" (static self-concept). This module maintains
 * Self.md: "what am I RIGHT NOW" — the version of his own code he's running,
 * his full capability inventory, what he's learned from watching the user, how
 * he's been performing, and the shape of his memory. It refreshes at startup
 * and after self-improvements, and a compact summary is injected into his
 * prompts so his self-awareness is grounded in live facts rather than vibes:
 * ask "what can you do?" and the answer comes from the actual inventory; ask
 * "what version are you?" and it's the real git commit.
 *
 * Pure fs + injected facts (no git/Electron calls in here) so it's testable.
 */

const fs = require('fs');
const path = require('path');

let FILE = null;

// The canonical capability inventory — one source of truth for "what can I do".
const CAPABILITIES = [
  'Open/close apps, sites and searches instantly (fuzzy app-name matching)',
  'Full mouse & keyboard control of the entire screen, in any app',
  'Background browser — do web tasks off-screen while the user keeps working',
  'Ongoing always-on tasks that keep working until told to stop, then self-polish a report',
  'Scheduled actions — once, daily, weekly, or every N minutes; survive restarts',
  'Watch-and-study — learn the user\'s apps and habits into an interface playbook',
  'Deep website crawling, full-page data harvesting, and page summarization',
  'Filesystem index, content search inside files, and document reading',
  'Voice — hears commands (Whisper) and speaks replies aloud',
  'Organize windows into a grid so every tab is visible',
  'Prompt the Claude Code app directly to edit and improve my own source code',
  'Persistent Obsidian-style memory vault shared across all my surfaces',
];

function init(vaultDir) {
  FILE = path.join(vaultDir, 'Self.md');
}

/**
 * Rewrite Self.md from live facts. All fields optional; missing ones are
 * simply omitted so a partial refresh never erases sections with garbage.
 * @param {object} facts
 * @param {string} [facts.version]        e.g. "a1b2c3d Improve clicks (2026-07-08)"
 * @param {{total:number, apps:Array<{app:string,patterns:number}>}} [facts.learning]
 * @param {string} [facts.performance]    telemetry summaryText()
 * @param {{days?:number, memories?:number, observations?:number, research?:number}} [facts.memoryStats]
 * @param {string[]} [facts.recentImprovements]  last few self-change commit titles
 */
function refresh(facts = {}) {
  if (!FILE) return { ok: false };
  const parts = ['---', 'title: Self', '---', '', '# My living self-model', '', `Updated: ${new Date().toISOString()}`, ''];

  if (facts.version) {
    parts.push('## The code I am running', '', '- ' + facts.version, '');
  }
  if (Array.isArray(facts.recentImprovements) && facts.recentImprovements.length) {
    parts.push('## My recent self-improvements', '', ...facts.recentImprovements.slice(0, 8).map((t) => '- ' + t), '');
  }
  parts.push('## What I can do', '', ...CAPABILITIES.map((c) => '- ' + c), '');
  if (facts.learning && facts.learning.total > 0) {
    const top = (facts.learning.apps || [])
      .slice(0, 5)
      .map((a) => `${a.app} (${a.patterns})`)
      .join(', ');
    parts.push('## What I have learned from watching', '', `- ${facts.learning.total} interface patterns across ${(facts.learning.apps || []).length} apps${top ? ` — top: ${top}` : ''}`, '');
  }
  if (facts.performance) {
    parts.push('## How I have been performing', '', ...String(facts.performance).split('\n').map((l) => (l.startsWith('-') ? l : '- ' + l)), '');
  }
  if (facts.memoryStats) {
    const m = facts.memoryStats;
    const bits = [];
    if (m.days) bits.push(`${m.days} days of conversations`);
    if (m.memories) bits.push(`${m.memories} durable memories`);
    if (m.observations) bits.push(`${m.observations} observation days`);
    if (m.research) bits.push(`${m.research} research notes`);
    if (bits.length) parts.push('## The shape of my memory', '', '- ' + bits.join(', '), '');
  }

  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, parts.join('\n') + '\n', 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Compact self-summary for prompt injection ('' when never refreshed). Keeps
 * the version + a one-line capability sweep + learning/memory one-liners.
 */
function summary(maxChars = 900) {
  if (!FILE) return '';
  let text = '';
  try {
    text = fs.readFileSync(FILE, 'utf8');
  } catch {
    return '';
  }
  // Strip frontmatter and collapse headings into "Label: content" lines.
  const body = text.replace(/^---[\s\S]*?---\n/, '');
  const out = [];
  let section = '';
  for (const line of body.split('\n')) {
    const h = /^##\s+(.+)$/.exec(line);
    if (h) {
      section = h[1];
      continue;
    }
    if (line.startsWith('- ') && section) {
      // Capabilities are long — compress to a count + first few.
      if (/what i can do/i.test(section)) continue;
      out.push(`${section}: ${line.slice(2)}`);
    }
  }
  out.unshift(`I can: ${CAPABILITIES.length} capabilities incl. full computer control, background browser, ongoing tasks, schedules, watch-and-study, self-improvement.`);
  return out.join('\n').slice(0, maxChars);
}

module.exports = { init, refresh, summary, CAPABILITIES };
