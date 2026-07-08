'use strict';

/**
 * JARVIS's long-term memory — an Obsidian-style markdown vault.
 *
 * Everything the assistant should remember across sessions lives here as plain
 * .md files you can open directly in Obsidian (or any editor):
 *
 *   <vault>/
 *     README.md              home / index note
 *     Identity.md            who JARVIS is (his self-awareness anchor)
 *     Profile.md             durable facts about the user
 *     Conversations/         one note per day, every exchange appended
 *       2026-07-07.md
 *     Memories/              durable notes the assistant chooses to keep
 *       <slug>.md            frontmatter + body + [[wikilinks]]
 *
 * Both surfaces — the floating widget and the Assistant tab — write to and read
 * from THIS ONE vault, which is what makes them a single assistant with a shared
 * memory rather than two forgetful chatboxes.
 *
 * Electron-optional (pure fs) so it can be unit-tested without the app.
 */

const fs = require('fs');
const path = require('path');

let VAULT = null;

function init(dir) {
  VAULT = dir;
  ensureScaffold();
  return VAULT;
}
function vaultPath() {
  return VAULT;
}

function nowIso() {
  return new Date().toISOString();
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function slug(s) {
  return (
    String(s || 'note')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'note'
  );
}
function oneLine(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}
function abs(rel) {
  const p = path.resolve(VAULT, rel);
  if (p !== VAULT && !p.startsWith(VAULT + path.sep)) throw new Error('Path escapes vault: ' + rel);
  return p;
}
function ensureDirFor(rel) {
  const p = abs(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  return p;
}
function readSafe(rel) {
  try {
    return fs.readFileSync(abs(rel), 'utf8');
  } catch {
    return '';
  }
}
function writeIfAbsent(rel, content) {
  const p = abs(rel);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  }
}

function ensureScaffold() {
  if (!VAULT) return;
  fs.mkdirSync(VAULT, { recursive: true });
  fs.mkdirSync(path.join(VAULT, 'Conversations'), { recursive: true });
  fs.mkdirSync(path.join(VAULT, 'Memories'), { recursive: true });

  writeIfAbsent(
    'README.md',
    '# JARVIS Memory Vault\n\n' +
      "This is JARVIS's brain — an Obsidian-style vault. Open this folder as a vault in " +
      'Obsidian to browse it.\n\n' +
      '- [[Identity]] — who JARVIS is\n' +
      '- [[Profile]] — what he knows about you\n' +
      '- `Conversations/` — a note per day of everything you said to each other\n' +
      '- `Memories/` — durable facts and notes he chose to keep\n'
  );
  writeIfAbsent(
    'Identity.md',
    '---\ntitle: Identity\n---\n\n' +
      '# I am JARVIS\n\n' +
      'I am a single AI assistant that lives on this computer. I appear in two places, and ' +
      '**both of them are me**:\n\n' +
      '- the floating **widget** (the arc-reactor orb), and\n' +
      '- the **Assistant tab** in the workspace window.\n\n' +
      'They are two windows onto the same assistant. I share one memory across them — this ' +
      'vault — so a conversation in one is remembered in the other.\n\n' +
      'I can watch the screen, learn skills by demonstration, act on the computer through ' +
      'mouse and keyboard, edit my own source code to improve myself, and remember things ' +
      'here between sessions.\n'
  );
  writeIfAbsent(
    'Profile.md',
    '---\ntitle: Profile\n---\n\n' +
      '# About my human\n\n' +
      '_Facts I learn about you accumulate here._\n\n' +
      '- Name: Brady\n'
  );
}

/** Live counts per vault section — the basis of the Home index and Self.md. */
function stats() {
  const notes = listNotes();
  const inDir = (d) => notes.filter((r) => r.startsWith(d + path.sep)).length;
  return {
    days: inDir('Conversations'),
    memories: inDir('Memories'),
    observations: inDir('Observations'),
    research: inDir('Research'),
    learning: inDir('Learning'),
    total: notes.length,
  };
}

/**
 * Rewrite the Home/README index with live counts and links to every section —
 * the vault self-organizes so both the user (in Obsidian) and JARVIS always
 * have a current map of his memory. Called at startup.
 */
function refreshHome() {
  if (!VAULT) return;
  const s = stats();
  const lines = [
    '# JARVIS Memory Vault',
    '',
    "This is JARVIS's brain — an Obsidian-style vault. Open this folder as a vault in",
    'Obsidian to browse it. This index is auto-refreshed at every startup.',
    '',
    '- [[Identity]] — who JARVIS is',
    '- [[Self]] — his living self-model: version, capabilities, learnings, performance',
    '- [[Profile]] — what he knows about you',
    `- \`Conversations/\` — a note per day of everything you said to each other (${s.days} days)`,
    `- \`Memories/\` — durable facts and notes he chose to keep (${s.memories})`,
    `- \`Observations/\` — daily diary of what he watched you do (${s.observations} days)`,
    `- \`Research/\` — notes and reports from ongoing research tasks (${s.research})`,
    `- \`Learning/\` — his interface playbook, one note per app (${s.learning})`,
    '',
    `_${s.total} notes in total._`,
    '',
  ];
  try {
    fs.writeFileSync(abs('README.md'), lines.join('\n'), 'utf8');
  } catch {
    /* index refresh is best-effort */
  }
}

/** Walk the vault and return every .md file as a vault-relative path. */
function listNotes() {
  if (!VAULT) return [];
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
        if (e.name !== '.obsidian') walk(full);
      } else if (e.name.endsWith('.md')) {
        out.push(path.relative(VAULT, full));
      }
    }
  })(VAULT);
  return out.sort();
}

/**
 * Create or update a durable memory note.
 * @returns {string} the vault-relative path written
 */
function remember({ title, body, tags = [], links = [] }) {
  if (!VAULT) return null;
  const name = slug(title || (body || '').slice(0, 40));
  const rel = path.join('Memories', name + '.md');
  const p = ensureDirFor(rel);
  const front = [
    '---',
    'title: ' + (title || name),
    'created: ' + nowIso(),
    'tags: [' + (tags || []).map(slug).join(', ') + ']',
    '---',
    '',
  ].join('\n');
  const related =
    links && links.length ? '\n\nRelated: ' + links.map((l) => `[[${l}]]`).join(' ') : '';
  fs.writeFileSync(p, front + (body || '') + related + '\n', 'utf8');
  return rel;
}

/** Append a durable fact about the user to Profile.md. */
function rememberAboutUser(fact) {
  if (!VAULT || !fact) return;
  const p = ensureDirFor('Profile.md');
  if (!fs.existsSync(p)) writeIfAbsent('Profile.md', '# About my human\n\n');
  fs.appendFileSync(p, `- ${oneLine(fact)}\n`, 'utf8');
}

/** Append one turn of conversation to today's note. `surface` = 'widget'|'assistant'. */
function logTurn(role, text, surface) {
  if (!VAULT || !text) return;
  const rel = path.join('Conversations', today() + '.md');
  const p = ensureDirFor(rel);
  if (!fs.existsSync(p)) fs.writeFileSync(p, `# Conversation — ${today()}\n\n`, 'utf8');
  const who = role === 'assistant' ? 'JARVIS' : 'You';
  const tag = surface ? ` _(${surface})_` : '';
  fs.appendFileSync(p, `- **${who}**${tag}: ${oneLine(text)}\n`, 'utf8');
}

/**
 * Save an observation of the user working — what app/interface and how — to a
 * daily Observations note. This is how JARVIS learns to use human interfaces by
 * watching. Kept separate from conversation logs.
 */
function addObservation(text) {
  if (!VAULT || !text) return;
  const rel = path.join('Observations', today() + '.md');
  const p = ensureDirFor(rel);
  if (!fs.existsSync(p)) fs.writeFileSync(p, `# Observations — ${today()}\n\n`, 'utf8');
  const stamp = new Date().toISOString().slice(11, 16);
  fs.appendFileSync(p, `- ${stamp} — ${oneLine(text)}\n`, 'utf8');
}

/** All daily conversation notes, oldest → newest. */
function conversationFiles() {
  return listNotes()
    .filter((r) => r.startsWith('Conversations' + path.sep))
    .sort();
}

/**
 * The last N conversation lines, spanning the most recent days (not just today)
 * so JARVIS actually remembers previous chats and completed actions.
 */
function recentConversation(maxLines = 30) {
  const files = conversationFiles().slice(-7); // up to a week of context
  let lines = [];
  for (const rel of files) {
    for (const l of readSafe(rel).split('\n')) if (l.startsWith('- ')) lines.push(l);
  }
  return lines.slice(-maxLines);
}

/** Keyword search across the whole vault. Returns [{path, excerpt}]. */
function search(query, limit = 6) {
  if (!VAULT || !query) return [];
  const q = String(query).toLowerCase();
  const hits = [];
  for (const rel of listNotes()) {
    const txt = readSafe(rel);
    const lc = txt.toLowerCase();
    const inBody = lc.indexOf(q);
    if (inBody >= 0 || rel.toLowerCase().includes(q)) {
      const at = inBody >= 0 ? inBody : 0;
      const excerpt = oneLine(txt.slice(Math.max(0, at - 80), at + 160));
      hits.push({ path: rel, excerpt });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}

/**
 * A compact digest of memory to inject into system prompts, so every reply is
 * grounded in what JARVIS already knows and what was just said.
 */
function contextForPrompt() {
  if (!VAULT) return '';
  const parts = [];
  const profile = readSafe('Profile.md').replace(/^---[\s\S]*?---\n/, '').trim();
  if (profile) parts.push('What you know about your human (Profile.md):\n' + profile.slice(0, 1200));

  const memTitles = listNotes()
    .filter((r) => r.startsWith('Memories' + path.sep))
    .map((r) => '[[' + path.basename(r, '.md') + ']]');
  if (memTitles.length) parts.push('Your memory notes: ' + memTitles.slice(0, 40).join(', '));

  const days = conversationFiles().length;
  const recent = recentConversation(30);
  if (recent.length) {
    parts.push(
      `Recent conversation & actions (across your last ${Math.min(days, 7)} active day(s), ` +
        'newest last):\n' +
        recent.join('\n')
    );
  }

  return parts.join('\n\n').trim();
}

module.exports = {
  init,
  vaultPath,
  listNotes,
  remember,
  rememberAboutUser,
  addObservation,
  logTurn,
  recentConversation,
  search,
  contextForPrompt,
  stats,
  refreshHome,
};
