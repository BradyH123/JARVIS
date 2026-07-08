'use strict';

/* JARVIS widget logic. Same backend API as the dashboard (window.assistant),
   but presented as an always-on-top floating core. */

const api = window.assistant;
const widget = document.getElementById('widget');
const orbLabel = document.getElementById('wx-orb-label');
const stateEl = document.getElementById('wx-state');
const subEl = document.getElementById('wx-sub');
const feed = document.getElementById('wx-feed');
const stopBtn = document.getElementById('wx-stop');

/* ---------- voice output (JARVIS speaks) ---------- */
const speech = {
  on: true,
  voice: null,
  synth: window.speechSynthesis || null,
};
function pickVoice() {
  if (!speech.synth) return;
  const voices = speech.synth.getVoices();
  if (!voices.length) return;
  // Prefer a calm, ideally British male voice for the JARVIS feel.
  const prefer = ['Daniel', 'Arthur', 'Oliver', 'Google UK English Male', 'Rishi'];
  speech.voice =
    prefer.map((n) => voices.find((v) => v.name.includes(n))).find(Boolean) ||
    voices.find((v) => /en[-_]GB/i.test(v.lang)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0];
}
if (speech.synth) {
  pickVoice();
  speech.synth.onvoiceschanged = pickVoice;
}
let lastSpoken = '';
// Keep spoken replies short: read at most the first couple of sentences (or
// ~220 chars) so a long answer doesn't turn into a monologue. The full text
// still appears in the feed — this only trims what's spoken aloud.
function speakable(text) {
  const clean = String(text)
    .replace(/[🧠➤⏸✓✗●■◇⛓]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length <= 220) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  let out = '';
  for (const s of sentences) {
    if ((out + s).length > 220) break;
    out += s;
  }
  out = (out || clean.slice(0, 220)).trim();
  return out.length < clean.length ? out + ' …' : out;
}

function say(text, { interrupt = false } = {}) {
  if (!speech.on || !speech.synth || !text) return;
  const clean = speakable(text);
  if (!clean || clean === lastSpoken) return;
  lastSpoken = clean;
  if (interrupt) speech.synth.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  if (speech.voice) u.voice = speech.voice;
  u.rate = 1.35; // brisker, more JARVIS-like delivery
  u.pitch = 0.9;
  speech.synth.speak(u);
}

const STATE = {
  idle: { color: '#3aa0ff', label: 'READY', state: 'Standing by', sub: 'Say a command or type below' },
  listening: { color: '#22d3ee', label: 'LISTEN', state: 'Listening…', sub: 'Speak your command' },
  thinking: { color: '#ffb020', label: 'THINK', state: 'Thinking…', sub: 'Routing your request' },
  running: { color: '#ffb020', label: 'ACTIVE', state: 'Working…', sub: 'Controlling your computer' },
  improving: { color: '#a86bff', label: 'REWIRE', state: 'Rewriting my code…', sub: 'Editing myself' },
  approval: { color: '#ff5c5c', label: 'HOLD', state: 'Approval needed', sub: 'Review the action below' },
  done: { color: '#4bd18a', label: 'DONE', state: 'Completed', sub: 'Ready for the next task' },
  error: { color: '#ff5c5c', label: 'ERROR', state: 'Something went wrong', sub: 'See the log below' },
};

let current = 'idle';
function setState(name, subOverride) {
  current = name;
  const s = STATE[name] || STATE.idle;
  widget.dataset.state = ['listening', 'running', 'thinking', 'improving'].includes(name)
    ? name === 'thinking' || name === 'improving'
      ? 'running'
      : name
    : name === 'approval' || name === 'done'
    ? name
    : 'idle';
  orbLabel.textContent = s.label;
  stateEl.textContent = s.state;
  subEl.textContent = subOverride || s.sub;
  orb.color = s.color;
  stopBtn.classList.toggle(
    'hidden',
    !(name === 'running' || name === 'thinking' || name === 'approval' || name === 'improving')
  );
}

/* ---------- the arc-reactor orb ---------- */
const canvas = document.getElementById('wx-orb');
const ctx = canvas.getContext('2d');
const DPR = window.devicePixelRatio || 1;
canvas.width = 240 * DPR;
canvas.height = 240 * DPR;
ctx.scale(DPR, DPR);
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const orb = { color: '#3aa0ff', t: 0, pulse: 0 };

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function drawOrb() {
  const cx = 120;
  const cy = 120;
  ctx.clearRect(0, 0, 240, 240);
  const [r, g, b] = hexToRgb(orb.color);
  const rgb = (a) => `rgba(${r},${g},${b},${a})`;

  // energy at the core rises while active
  const active = current === 'running' || current === 'thinking' || current === 'listening';
  const targetPulse = active ? 1 : 0.35;
  orb.pulse += (targetPulse - orb.pulse) * 0.08;
  const breathe = 0.5 + 0.5 * Math.sin(orb.t * (active ? 0.12 : 0.05));

  // outer glow
  const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, 96);
  glow.addColorStop(0, rgb(0.28 * orb.pulse + 0.1));
  glow.addColorStop(1, rgb(0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, 96, 0, Math.PI * 2);
  ctx.fill();

  // concentric rotating arc rings
  const rings = [
    { rad: 84, span: 1.7, speed: 0.6, width: 2 },
    { rad: 70, span: 1.1, speed: -0.9, width: 3 },
    { rad: 56, span: 2.4, speed: 1.3, width: 2 },
  ];
  rings.forEach((ring, i) => {
    const a = orb.t * ring.speed * 0.02;
    ctx.strokeStyle = rgb(0.5 + 0.3 * breathe);
    ctx.lineWidth = ring.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, ring.rad, a, a + ring.span);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, ring.rad, a + Math.PI, a + Math.PI + ring.span * 0.6);
    ctx.stroke();
    // tick marks on the outer ring
    if (i === 0) {
      for (let k = 0; k < 36; k++) {
        const ang = (k / 36) * Math.PI * 2 - a * 0.4;
        const r1 = ring.rad + 6;
        const r2 = ring.rad + 10;
        ctx.strokeStyle = rgb(0.18);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
        ctx.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2);
        ctx.stroke();
      }
    }
  });

  // inner core
  const coreR = 30 + 4 * breathe * orb.pulse;
  const core = ctx.createRadialGradient(cx, cy, 2, cx, cy, coreR);
  core.addColorStop(0, rgb(0.95));
  core.addColorStop(0.5, rgb(0.5 + 0.4 * orb.pulse));
  core.addColorStop(1, rgb(0.05));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  ctx.fill();
}

function loop() {
  orb.t += 1;
  drawOrb();
  if (!reduce) requestAnimationFrame(loop);
}
drawOrb();
if (!reduce) requestAnimationFrame(loop);

/* ---------- feed ---------- */
function log(kind, text) {
  const empty = feed.querySelector('.wx-empty');
  if (empty) empty.remove();
  const line = document.createElement('div');
  line.className = 'wx-line ' + kind;
  line.textContent = text;
  feed.appendChild(line);
  feed.scrollTop = feed.scrollHeight;
  while (feed.children.length > 60) feed.removeChild(feed.firstChild);
}
function clearFeed() {
  feed.innerHTML = '<div class="wx-empty">Activity will appear here.</div>';
}
clearFeed();

/* ---------- window controls ---------- */
document.getElementById('wx-dash').addEventListener('click', () => api.openDashboard());
// 📊 toggles the single widget between normal and big "monitor" size — one
// window with the orb and the full activity feed. No second window.
let widgetExpanded = false;
if (api.onWidgetExpanded) {
  api.onWidgetExpanded((v) => {
    widgetExpanded = !!v;
    document.body.classList.toggle('expanded', widgetExpanded);
    const b = document.getElementById('wx-activity');
    if (b) b.title = widgetExpanded ? 'Shrink back to the compact orb' : 'Expand into the full activity monitor';
  });
}
{
  const actBtn = document.getElementById('wx-activity');
  if (actBtn && api.expandWidget) actBtn.addEventListener('click', () => api.expandWidget(!widgetExpanded));
}
document.getElementById('wx-hide').addEventListener('click', () => api.hideWidget());
document.getElementById('wx-quit').addEventListener('click', () => api.quitApp());

/* ---------- collapse / expand (floating-orb mini-mode) ---------- */
let collapsed = false;
function applyCollapsed(v) {
  collapsed = Boolean(v);
  document.body.classList.toggle('collapsed', collapsed);
}
document.getElementById('wx-collapse').addEventListener('click', () => api.collapseWidget(true));
// When collapsed, double-clicking the orb expands it again.
document.getElementById('widget').addEventListener('dblclick', () => {
  if (collapsed) api.collapseWidget(false);
});
if (api.onWidgetCollapsed) api.onWidgetCollapsed(applyCollapsed);
// A summon (global shortcut) always pops the widget back to full size.
if (api.onWidgetSummon) api.onWidgetSummon(() => collapsed && api.collapseWidget(false));
document.getElementById('wx-open-skills').addEventListener('click', () => api.openDashboard('skills'));
document.getElementById('wx-open-wf').addEventListener('click', () => api.openDashboard('workflows'));
const memBtn = document.getElementById('wx-open-memory');
if (memBtn && api.memory) {
  memBtn.addEventListener('click', async () => {
    log('info', 'Opening my memory vault…');
    await api.memory.open();
  });
}

/* ---------- always-on surveillance consent ---------- */
const survBtn = document.getElementById('wx-surveil');
function renderSurveil(on) {
  if (!survBtn) return;
  survBtn.classList.toggle('active', on);
  survBtn.textContent = on ? '👁 watching (on)' : '👁 accept surveillance';
}
async function refreshSurveil() {
  try {
    const s = await api.settings.get();
    renderSurveil(Boolean(s.alwaysWatch));
  } catch {
    /* ignore */
  }
}
if (survBtn && api.setSurveillance) {
  refreshSurveil();
  survBtn.addEventListener('click', async () => {
    const s = await api.settings.get().catch(() => ({}));
    if (s.alwaysWatch) {
      await api.setSurveillance(false);
      renderSurveil(false);
      log('info', 'Turned off always-on watching.');
      say('I will stop always watching.', { interrupt: true });
      return;
    }
    // First time: a clear consent before enabling continuous surveillance.
    const ok = window.confirm(
      'Accept always-on surveillance?\n\n' +
        'JARVIS will ALWAYS watch your screen (starting now and every launch) and continuously ' +
        'study how you use your apps, saving short text summaries to his memory to learn and ' +
        'optimize himself. Screenshots stay on your computer — only text notes are kept.\n\n' +
        'You can turn this off any time from this button.'
    );
    if (!ok) return;
    await api.setSurveillance(true);
    renderSurveil(true);
    log('info', '👁 Always-on watching accepted — I am now studying how you work.');
    say('Surveillance accepted. I am always watching and learning now.', { interrupt: true });
  });
}
stopBtn.addEventListener('click', () => {
  log('warn', 'Stop requested…');
  api.stop();
});

/* ---------- counts ---------- */
async function refreshCounts() {
  try {
    const c = await api.summaryCounts();
    document.getElementById('wx-skills-n').textContent = c.skills;
    document.getElementById('wx-wf-n').textContent = c.workflows;
  } catch {
    /* ignore */
  }
}
refreshCounts();
setInterval(refreshCounts, 4000);

// Startup permission check: on macOS, clicking/typing silently does NOTHING
// without Accessibility permission — warn the user clearly if it's missing.
(async () => {
  try {
    const info = await api.configInfo();
    if (info && info.platform === 'darwin' && info.axTrusted === false) {
      log('warn', "⚠ I can't control the mouse/keyboard yet. Enable JARVIS in System Settings › Privacy & Security › Accessibility, then relaunch.");
      say('I need accessibility permission to click and type. Enable me in System Settings, privacy, accessibility, then relaunch.', { interrupt: true });
      setState('idle', 'Grant Accessibility permission to click/type');
    } else if (info && info.canControl === false) {
      log('warn', '⚠ Native input module not available — run npm install.');
    }
  } catch {
    /* ignore */
  }
})();

/* ---------- live "watching" (REC) indicator ---------- */
const recEl = document.getElementById('wx-rec');
if (api.onWatchEvent) {
  api.onWatchEvent((s) => {
    recEl.classList.toggle('hidden', !(s && s.active && !s.paused));
    // Quiet studying: surface a line only when something NEW was learned.
    if (s && s.learning && s.learned > 0) {
      log('think', `📚 Studied ${s.app || 'your work'} — ${s.learned} new pattern${s.learned === 1 ? '' : 's'} in my playbook.`);
    }
  });
}

/* ---------- command routing ---------- */
async function runCommand(text) {
  if (!text.trim()) return;
  log('action', '❯ ' + text);
  // STOP comes before everything — typed or spoken, it always obeys instantly.
  if (/^\s*(stop|halt|cancel|abort|stand down|that'?s enough|enough)\s*[.!]?\s*$/i.test(text)) {
    log('warn', 'Stop requested…');
    await api.stop();
    setState('idle');
    return;
  }

  // Open the live Activity view — "show me what you're doing", "open activity".
  if (api.openActivity && /^\s*(open|show( me)?|bring up|pop open)\s+(the\s+|your\s+|my\s+)?(activity|activity (view|window|feed|log)|what (you'?re|you are|your) doing|live (view|feed|log))\b|^\s*what are you doing\??\s*$/i.test(text)) {
    log('info', '📊 Opening the live Activity view…');
    await api.openActivity();
    setState('idle');
    return;
  }
  // Ongoing / continuous research — "do nonstop research on X", "keep
  // researching X", "research X for an hour". MUST come before the local
  // file-search fast-paths below, which otherwise hijack the word "research"
  // into a Spotlight search of the user's own files. This is web research.
  if (
    api.ongoing &&
    (/\b(nonstop|non-stop|continuous(ly)?|ongoing|constantly|forever|indefinitely|around the clock)\b/i.test(text) &&
      /\bresearch(ing)?\b/i.test(text)) ||
    (/^\s*(do|start|begin|keep|run|perform)\b/i.test(text) && /\bresearch(ing)?\b/i.test(text) && /\b(on|about|into)\b/i.test(text)) ||
    /\bkeep\s+(researching|studying|monitoring|tracking|digging into|looking into)\b/i.test(text)
  ) {
    // Parse an optional time budget → minutes ("an hour", "2 hours", "30 min").
    let minutes;
    const hr = /(\d+(?:\.\d+)?|an?|half an?|a couple(?: of)?|few)\s*(hours?|hrs?)/i.exec(text);
    const mn = /(\d+)\s*(minutes?|mins?)\b/i.exec(text);
    if (hr) {
      const w = hr[1].toLowerCase();
      const v = /^an?$/.test(w) ? 1 : /half/.test(w) ? 0.5 : /couple/.test(w) ? 2 : /few/.test(w) ? 3 : parseFloat(w);
      minutes = Math.round(v * 60);
    } else if (mn) {
      minutes = parseInt(mn[1], 10);
    }
    log('info', '♾ Starting ongoing research' + (minutes ? ` for ~${minutes} min` : '') + ' — say stop anytime.');
    say('Starting ongoing research' + (minutes ? ` for about ${minutes} minutes` : '') + '. I\'ll keep going until you say stop.', { interrupt: true });
    await api.ongoing.start({ goal: text, minutes });
    return;
  }
  // Fast path: screen reads/summaries go STRAIGHT to the vision read, bypassing
  // the intent router (which sometimes replied "I'll do it" without an answer).
  // This is why "summarize this tab" said done but never reported back.
  // Filesystem sweep — index files/apps so find & open are instant.
  if (
    api.sweep &&
    /\b(sweep|index|scan|catalog|reindex)\b.*\b(computer|mac|files?|drive|documents?|everything|hard\s?drive|my stuff)\b/i.test(text)
  ) {
    const everything = /everything|whole|entire|all of|hard\s?drive/i.test(text);
    log('info', everything ? '🗂 Full sweep of your computer…' : '🗂 Indexing your files…');
    say(everything ? 'Doing a full sweep of your computer.' : 'Indexing your files so finding things is instant.', { interrupt: true });
    await api.sweep.run({ everything });
    return;
  }
  // Summarize / read a specific document (find it, extract text, summarize).
  if (
    api.content &&
    /\b(summari[sz]e|read|what does|tell me about)\b.*\b(my|the|this|that)\s+(file|document|doc|pdf|note|report|paper|essay|resume|contract|spreadsheet|letter|memo)\b/i.test(text)
  ) {
    const q = text
      .replace(/^\s*\w+\s+/i, '')
      .replace(/\b(my|the|this|that|a|an|file|document|doc|pdf|note|report|paper|essay|contract|spreadsheet|letter|memo|about|says|say)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    log('info', '🔎 Finding and reading that document…');
    say('Finding and reading that document.', { interrupt: true });
    await api.content.summarize({ query: q, question: text });
    return;
  }
  // Content search — search INSIDE files (Spotlight): "find files that mention X",
  // "search my files for X", "find the doc about X".
  if (
    api.content &&
    !/\bresearch(ing)?\b/i.test(text) && // "research" = web task, not a file search
    (/\b(files?|docs?|documents?|pdfs?|notes?)\b.*\b(mention|about|contain|that (say|mention)|with|for)\b|\bsearch my (files?|computer|docs?|drive) for\b|\bfind (the )?(doc|document|file|pdf|note)s?\b.*\b(about|that|mention|with|containing)\b/i.test(text))
  ) {
    const q = text
      .replace(/^\s*(find|search|locate|which|what|show me)\b/i, '')
      .replace(/\b(the |my |a )?(files?|docs?|documents?|pdfs?|notes?)\b/gi, ' ')
      .replace(/\b(that )?(mention(s|ing)?|contain(s|ing)?|about|for|with|say(s|ing)?)\b/gi, ' ')
      .replace(/\b(in|inside|on) (my|the) (computer|mac|files?|drive)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (q) {
      log('info', `🔎 Searching inside your files for "${q}"…`);
      say('Searching inside your files.', { interrupt: true });
      const r = await api.content.search(q);
      if (r && r.ok && r.results && r.results.length) {
        log('info', `Found ${r.results.length} file(s) mentioning "${q}":`);
        r.results.slice(0, 8).forEach((f) => log('think', '📄 ' + f.name + '  —  ' + f.path));
        say(`Found ${r.results.length} files mentioning ${q}. Top: ${r.results[0].name}.`);
      } else {
        log('warn', (r && r.error) || `No files mention "${q}".`);
        say(`I couldn't find files mentioning ${q}.`, { interrupt: true });
      }
      setState('idle');
      return;
    }
  }
  // Find / open a file from the index. Only hijack "open" when it clearly means a
  // FILE (has an extension or file-ish words) — "open Safari/email" still routes.
  {
    const isFindVerb = /^\s*(find|locate|where('s| is)|search for)\b/i.test(text);
    const isOpenFile =
      /^\s*open\b/i.test(text) &&
      /(\.\w{2,5}\b|\bfile\b|\bdocument\b|\bpdf\b|\bspreadsheet\b|\bphoto\b|\bimage\b|\bfolder\b|\bthe file\b|\bresume\b)/i.test(text);
    // Skip local file search for web/research/create intents — those belong to
    // the router (run_goal / ongoing_task), not a Spotlight lookup of my files.
    const isWebOrTask = /\b(on (the )?web|internet|google|online|research(ing)?|create|build|write|generate)\b/i.test(text);
    if (api.sweep && (isFindVerb || isOpenFile) && !isWebOrTask) {
      const query = text
        .replace(/^\s*(find|locate|where('s| is)|search for|open)\b/i, '')
        .replace(/\b(my|the|a|an|file|files|document|documents|folder|on my (computer|mac|drive))\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (query) {
        const results = await api.sweep.search(query);
        if (!results || !results.length) {
          log('warn', `No indexed match for "${query}". Say "index my files" first if you haven't.`);
          say(`I couldn't find ${query} in my index.`, { interrupt: true });
          setState('idle');
          return;
        }
        if (isOpenFile || /\bopen\b/i.test(text)) {
          log('info', 'Opening ' + results[0].name);
          say('Opening ' + results[0].name, { interrupt: true });
          await api.sweep.open(results[0].path);
          setState('idle');
          return;
        }
        log('info', `Found ${results.length} for "${query}":`);
        results.slice(0, 6).forEach((r) => log('think', (r.app ? '📱 ' : '📄 ') + r.name + '  —  ' + r.path));
        say(`Found ${results.length}. Top match: ${results[0].name}.`);
        setState('idle');
        return;
      }
    }
  }
  // DEEP crawl — follow links across the site. Checked before single-page harvest.
  if (
    api.crawl &&
    /(crawl|deep|go deep|follow (the |all )?links|whole (site|website)|entire (site|website)|every page|all the pages|as (deep|much) as (possible|you can))/i.test(text)
  ) {
    // Depth from phrasing: "very deep" → deeper; an explicit "N levels/pages".
    let depth = 2;
    let maxPages = 50;
    if (/very deep|as deep as|really deep|super deep|max/i.test(text)) {
      depth = 4;
      maxPages = 200;
    } else if (/\bdeep\b/i.test(text)) {
      depth = 3;
      maxPages = 100;
    }
    const dm = /(\d+)\s*(levels?|deep)/i.exec(text);
    if (dm) depth = Math.min(parseInt(dm[1], 10) || depth, 5);
    const pm = /(\d+)\s*pages?/i.exec(text);
    if (pm) maxPages = Math.min(parseInt(pm[1], 10) || maxPages, 500);
    log('info', `🕸 Deep crawl (depth ${depth}, up to ${maxPages} pages)…`);
    say('Starting a deep crawl. This can take a while — say stop to end it.', { interrupt: true });
    await api.crawl({ depth, maxPages });
    return;
  }
  // Full data harvest — pull ALL data from the page(s). Checked before the
  // summarize fast-path so "pull all the data" doesn't get read as a summary.
  if (
    api.harvest &&
    /(harvest|scrape|grab|pull|extract|get|download)\b.*(all|every|everything|the data|all data|the page|this (site|page|website)|tables?|links?|the html|the code)/i.test(text) &&
    !/summari[sz]e/i.test(text)
  ) {
    const allTabs = /(all|every|each)\s+(my\s+)?(tabs?|pages?|sites?|windows?)/i.test(text);
    log('info', allTabs ? '📥 Pulling all data from every open tab…' : '📥 Pulling all data from this page…');
    say(allTabs ? 'Pulling all the data from every open tab.' : 'Pulling all the data from this page.', { interrupt: true });
    await api.harvest(allTabs);
    return;
  }
  if (
    api.lookAtScreen &&
    /(summari[sz]e|what does (this|it) (say|mean|show)|what('| i)?s on (my|the) screen|what is on (my|the) screen|read (this|it|the|my screen)|look at (this|it|my screen|the screen|the tab|this tab)|what am i (looking at|seeing)|describe (this|my screen|the screen)|this (page|website|site|tab|article)|pull (the|this).*(code|page|html|dom)|(map|inspect).*(interface|page|site|website)|(interface|dom|source) of (this|the))/i.test(
      text
    )
  ) {
    log('info', '📄 Reading the live page…');
    say('Reading the page.', { interrupt: true });
    await api.lookAtScreen(text);
    return;
  }
  // Fast path: "reload/restart yourself" applies self-edited code immediately,
  // without a round-trip to the intent router.
  if (/^\s*(reload|restart|relaunch)\s+(yourself|jarvis|the app)?\s*$/i.test(text)) {
    say('Reloading to apply my new code.', { interrupt: true });
    log('info', 'Relaunching…');
    await api.improve.relaunch();
    return;
  }
  if (/^\s*(update|upgrade)\s+(yourself|jarvis|the app)?\s*$/i.test(text)) {
    say('Pulling my latest code from git.', { interrupt: true });
    await api.improve.selfUpdate();
    return;
  }
  if (/^\s*(upload|commit|save|push)\s+(yourself|jarvis|your code|the changes)?\s*$/i.test(text)) {
    say('Committing and pushing my new code.', { interrupt: true });
    log('info', 'Uploading my changes to GitHub…');
    await api.improve.commit();
    return;
  }
  if (/^\s*optimize\s+(yourself|jarvis|your code)?\s*$/i.test(text) && api.improve.optimize) {
    say('Analyzing my performance data and optimizing my own code.', { interrupt: true });
    log('info', '📊 Optimizing myself from my performance data…');
    await api.improve.optimize();
    return;
  }
  // Persistent always-on watching: explicit phrases, or bare "watch me"-style
  // commands with nothing after them. "Watch me do this" (a one-shot demo)
  // falls through to the session-only observe handler below.
  if (
    (/^\s*(accept surveillance|always watch\b.*|watch\b.+\bat all times.*|keep watching)\s*[.!]?\s*$|^\s*(watch|study)\s+(me|my screen|everything|how i work)\s*[.!]?\s*$/i.test(text)) &&
    api.setSurveillance
  ) {
    await api.setSurveillance(true);
    renderSurveil(true);
    say('Always watching from now on — even after restarts — and studying how you work. Say stop watching to end it.', { interrupt: true });
    log('info', '👁 Always-on watching (persists across restarts) — studying how you work into my interface playbook.');
    setState('idle', 'Watching & studying');
    return;
  }
  if (/^\s*(watch|learn|study)\s+(me|how i work|my workflow|what i do)\b/i.test(text) && api.observe) {
    await api.observe.start();
    say('Watching how you work and learning. Say stop watching to end.', { interrupt: true });
    log('info', '👁 Watching and learning from how you work (saved to my Observations).');
    setState('idle', 'Watching & learning');
    return;
  }
  if (/^\s*stop\s+(watching|learning|observing|surveillance)\b/i.test(text)) {
    if (api.setSurveillance) await api.setSurveillance(false);
    else if (api.observe) await api.observe.stop();
    if (typeof renderSurveil === 'function') renderSurveil(false);
    say('Stopped watching.', { interrupt: true });
    log('info', 'Stopped watch-and-learn.');
    setState('idle');
    return;
  }
  // Self-diagnosis — "where are you struggling", "what's your weakest", "diagnose
  // yourself". Reads telemetry + conversation logs for the biggest friction.
  if (api.diagnose && /\b(where (are you|do you|are u) struggl|what.*(struggl|weak|worst|failing|going wrong|need.*improv)|diagnose (yourself|your)|self.?diagnos|your (weak(est)?|worst) (spot|area|point)|what.*(bad|worst) at)\b/i.test(text)) {
    log('info', '🩺 Diagnosing where I struggle most…');
    const d = await api.diagnose();
    (d.text || 'Not enough data yet.').split('\n').forEach((l) => l.trim() && log('think', l));
    say((d.summary || 'I need more data to tell where I struggle.').slice(0, 240), { interrupt: true });
    setState('idle');
    return;
  }
  // "What have you learned (about how I work)?" — the interface playbook.
  // Anchored to the whole utterance so content questions ("what did you learn
  // about my meeting notes?") still reach the memory-aware router.
  if (
    api.learningSummary &&
    /^\s*(what (have|did) you learn(ed)?( about (me|how i work|my (apps|workflow|habits)))?|what do you know about (how i work|my (apps|workflow|habits))|show (me )?(your |the )?playbook)\s*\??\s*$/i.test(text)
  ) {
    const s = await api.learningSummary();
    if (!s.total) {
      log('info', "Nothing in my playbook yet — turn on watching (👁) and I'll study as you work.");
      say("I haven't studied enough yet. Turn on watching and I'll learn as you work.");
    } else {
      log('info', `📚 I've learned ${s.total} interface pattern${s.total === 1 ? '' : 's'} across ${s.apps.length} app${s.apps.length === 1 ? '' : 's'}:`);
      s.apps.slice(0, 6).forEach((a) => log('think', `• ${a.app} — ${a.patterns} patterns`));
      (s.sample || []).forEach((x) => log('think', '  e.g. ' + x));
      say(`I've learned ${s.total} patterns across ${s.apps.length} apps, and I use them whenever I drive your computer.`);
    }
    setState('idle');
    return;
  }
  if (/^\s*(how are you doing|your stats|show.*stats|performance|how efficient)\b/i.test(text) && api.telemetry) {
    const t = await api.telemetry();
    log('think', t.text || 'No data yet.');
    say((t.text || 'No performance data yet.').split('\n')[0]);
    setState('idle');
    return;
  }
  // Instant "close/quit <app>" — no overthinking. (Not tabs; not a pronoun.)
  const quitM = /^\s*(?:quit|close|exit|kill)\s+(?:the\s+)?(.+?)(?:\s+app)?\s*$/i.exec(text);
  if (api.quick && quitM && quitM[1]) {
    const target = quitM[1].trim();
    const isTabsOrSelf = /^(all\s+)?(my\s+)?tabs?$/i.test(target) || /\btabs?\b/i.test(text) || /^(it|this|that|the window|window|everything)$/i.test(target);
    if (!isTabsOrSelf && target.length >= 2) {
      log('info', 'Closing ' + target + '…');
      say('Closing ' + target + '.', { interrupt: true });
      await api.quick({ kind: 'quit_app', target });
      return;
    }
  }
  // Schedule management — list and cancel (creation goes through the router,
  // which parses the natural-language time into a structured schedule).
  if (api.schedule && /^\s*(what('s| is| do i have)? |list |show )?(my )?(scheduled( tasks?| actions?)?|schedules?|reminders?)\??\s*$/i.test(text)) {
    const l = await api.schedule.list();
    if (!l.length) {
      log('info', 'Nothing scheduled.');
      say('Nothing is scheduled right now.');
    } else {
      log('info', `${l.length} scheduled:`);
      l.forEach((j) => log('think', '⏰ ' + j.text));
      say(`You have ${l.length} scheduled task${l.length === 1 ? '' : 's'}.`);
    }
    setState('idle');
    return;
  }
  if (api.schedule && /^\s*(cancel|clear|delete|remove)\s+(all\s+)?(my\s+)?(the\s+)?(scheduled( tasks?| actions?)?|schedules?|reminders?)\s*$/i.test(text)) {
    const r = await api.schedule.clear();
    log('info', `Cancelled ${r.removed} scheduled task(s).`);
    say(r.removed ? 'Cancelled all scheduled tasks.' : 'There was nothing scheduled.', { interrupt: true });
    setState('idle');
    return;
  }
  // Schedule FROM advice — "read Pulsia and schedule the tasks it recommends",
  // "set up a schedule from ChatGPT's advice". Explicit: turns on-screen advice
  // into recurring scheduled tasks (each with a duration). Checked before the
  // act-on-advice path so "schedule … advice" routes here, not to do-it-now.
  {
    const sfa = /\bschedul\w*\b.*\b(advice|recommendations?|tasks?|what (it|pulsia|polsia|chat\s?gpt|the ai))\b|\b(from|based on)\b.*\b(advice|what (pulsia|polsia|it|chat\s?gpt) (says|said|recommends))\b.*\bschedul/i;
    if (api.schedule && api.schedule.fromAdvice && sfa.test(text) && /\bschedul/i.test(text)) {
      const m = /\b(pulsia|polsia|chat\s?gpt|claude|google)\b/i.exec(text);
      const source = m ? m[0].replace(/\s+/g, '') : 'the advisor on screen';
      log('info', '📅 Reading the advice and building a schedule…');
      say('Reading the advice and scheduling the tasks it recommends.', { interrupt: true });
      await api.schedule.fromAdvice({ source });
      return;
    }
  }
  // Act on advice — "do what Pulsia says", "listen to the advice and do it",
  // "act on what it's telling you". Reads the advice on screen, extracts the
  // concrete tasks, DOES them, and reports back. This is what a repeating
  // schedule fires, so it's a fast-path (no router round-trip).
  {
    const adv = /\b(do|act on|follow|carry out|execute|listen to)\b.*\b(advice|recommendation|suggestion|what (it|pulsia|polsia|the ai|it'?s)|instructions?)\b|\bdo what (pulsia|polsia|it|the (ai|advisor)|he|she)\b|\bwhat (pulsia|polsia|it) (says|said|recommends|tells? (me|you))\b/i;
    if (api.advisorCycle && adv.test(text)) {
      const m = /\b(pulsia|polsia)\b/i.exec(text);
      const source = m ? 'Pulsia' : 'the advisor on screen';
      log('info', '🎯 Reading the advice and acting on it…');
      say('Reading the advice and actually doing it now.', { interrupt: true });
      await api.advisorCycle({ source });
      return;
    }
  }
  // Background web task — "in the background, …", "quietly …", "while I keep
  // working, …", "without taking over my screen, …". Runs in a hidden browser.
  const bgM = /^\s*(?:in the background|behind the scenes|quietly|without (?:taking over|using) (?:my )?(?:screen|mouse)|while i(?:'m| am)? (?:keep )?(?:working|using|busy)[^,]*)[,:]?\s*(.+)/i.exec(text);
  if (api.backgroundTask && bgM && bgM[1] && bgM[1].trim().length > 3) {
    log('info', '🕶 Working in the background — your screen stays free.');
    say('On it in the background. Keep working — I won\'t touch your screen.', { interrupt: true });
    await api.backgroundTask(bgM[1].trim());
    return;
  }
  // Instant "organize/arrange/tile my windows", "clean up my screen", "line up
  // my windows", "fix my window layout" — tile everything so all tabs show.
  if (api.arrangeWindows && /^\s*(organi[sz]e|arrange|tile|line up|clean up|fix|sort out|tidy)\b.*\b(windows?|screen|tabs?|layout|desktop)\b|^\s*(organi[sz]e|arrange|tile)\s+my\b|i can'?t see (all )?(my )?(the )?(tabs?|windows?)/i.test(text)) {
    log('info', '🪟 Organizing your windows…');
    say('Organizing your windows so I can see everything.', { interrupt: true });
    await api.arrangeWindows();
    return;
  }
  // Prompt the Claude Code app directly: "prompt claude code: …", "tell claude
  // code to …", "in claude code, …", "ask claude to …".
  const ccM = /^\s*(?:prompt|tell|ask|in)\s+claude(?:\s+code)?[,:]?\s*(?:to\s+)?(.+)/i.exec(text);
  if (api.promptClaudeCode && ccM && ccM[1] && ccM[1].trim().length > 2) {
    log('info', '⌨️ Prompting Claude Code…');
    say('Typing that into Claude Code.', { interrupt: true });
    await api.promptClaudeCode(ccM[1].trim());
    return;
  }
  // Explicit orchestrator trigger: "do this: …", "do everything: …", "handle this
  // for me: …", "for me, …" → plan-and-execute multi-step.
  const doM = /^\s*(do (this|everything|all of this|the following)|handle (this|it) for me|take care of|for me[,:])\s*[:\-]?\s*(.+)/i.exec(text);
  if (api.doAnything && doM && doM[4] && doM[4].trim().length > 3) {
    log('info', '🧩 Multi-step task…');
    say('On it. Planning the steps.', { interrupt: true });
    await api.doAnything(doM[4].trim());
    return;
  }
  // Grounded click by label (accessibility tree) — "click the Send button".
  if (api.axClick && /^\s*click(\s+on)?(\s+the)?\s+.+/i.test(text) && !/\bhttps?:\/\//i.test(text)) {
    const m = /^\s*click(?:\s+on)?(?:\s+the)?\s+(.+?)(?:\s+(button|field|tab|link|icon|menu|checkbox|box))?\s*$/i.exec(text);
    const label = m ? m[1].trim() : '';
    if (label) {
      log('info', '🎯 Clicking "' + label + '"…');
      const r = await api.axClick(label);
      if (r && r.ok) say('Clicked ' + r.label + '.');
      else {
        log('warn', (r && r.error) || 'Could not find that element.');
        say("I couldn't find that to click.", { interrupt: true });
      }
      setState('idle');
      return;
    }
  }
  if (api.axElements && /^\s*(what can i click|list (the )?(buttons|elements|controls)|what('| i)?s clickable)/i.test(text)) {
    const r = await api.axElements();
    if (r && r.ok && r.elements.length) {
      log('info', `${r.elements.length} things I can click in ${r.app}:`);
      r.elements.slice(0, 14).forEach((e) => e.label && log('think', `• ${e.role}: ${e.label}`));
    } else {
      log('warn', (r && r.error) || 'No elements read (grant Accessibility permission).');
    }
    setState('idle');
    return;
  }
  setState('thinking');
  try {
    const routed = await api.command(text);
    if (routed.action === 'skill') {
      log('info', 'Running skill: ' + (routed.skill_name || routed.skill_id));
      await api.execute({ skillId: routed.skill_id, goal: routed.skill_name });
    } else if (routed.action === 'workflow') {
      log('info', 'Running workflow: ' + (routed.workflow_name || routed.workflow_id));
      await api.workflows.run(routed.workflow_id);
    } else if (routed.action === 'quick_action') {
      // Instant path (open app / site / search) — no screenshot loop.
      const r = await api.quick({ kind: routed.kind, target: routed.target });
      if (r && r.status === 'fallback') {
        // Not supported on this OS — fall back to the visual agent.
        log('info', 'Falling back to full control for: ' + routed.target);
        await api.execute({ goal: `${routed.kind.replace('_', ' ')} ${routed.target}` });
      }
    } else if (routed.action === 'look_at_screen') {
      log('info', '👁 Looking at your screen…');
      say('Looking at your screen.', { interrupt: true });
      await api.lookAtScreen(routed.question); // answer streams back via agent:event (done)
    } else if (routed.action === 'run_command') {
      log('info', '$ ' + routed.command);
      say('Running that in the terminal.', { interrupt: true });
      await api.runCommand({ command: routed.command, why: routed.why });
    } else if (routed.action === 'complex_task') {
      log('info', '🧩 Multi-step task: ' + routed.goal);
      say('On it. Planning the steps.', { interrupt: true });
      await api.doAnything(routed.goal);
    } else if (routed.action === 'goal') {
      log('info', 'Goal: ' + routed.goal);
      await api.execute({ goal: routed.goal });
    } else if (routed.action === 'self_improve') {
      // Drive the user's OPEN Claude Code session (type into it) rather than
      // spawning a hidden claude process.
      log('info', '🛠 Handing this to your Claude Code session: ' + routed.request);
      say('Opening your Claude Code session and typing the request in.', { interrupt: true });
      await api.improve.viaScreen(routed.request);
      log('info', 'Sent. When Claude Code finishes, say "upload yourself" then "reload yourself".');
    } else if (routed.action === 'schedule_task') {
      const job = await api.schedule.add({ command: routed.command, when: routed.when });
      if (job && job.error) {
        log('warn', job.error);
        say(job.error, { interrupt: true });
      } else {
        log('info', '⏰ Scheduled: ' + (job.text || routed.command));
        say('Scheduled — ' + (job.text || routed.command) + '.', { interrupt: true });
      }
      setState('idle');
    } else if (routed.action === 'ongoing_task') {
      const mins = routed.minutes ? ` for ${routed.minutes} minutes` : '';
      log('info', '♾ Ongoing task started' + mins + ' — I will keep working until you say stop.');
      say('Starting an ongoing task' + mins + '. I\'ll keep at it until you tell me to stop.', { interrupt: true });
      await api.ongoing.start({ goal: routed.goal, minutes: routed.minutes });
    } else if (routed.action === 'schedule_from_advice') {
      log('info', '📅 Reading the advice and building a schedule…');
      say('Reading the advice and scheduling the tasks it recommends.', { interrupt: true });
      await api.schedule.fromAdvice({ source: routed.source || 'the advisor on screen' });
    } else if (routed.action === 'act_on_advice') {
      log('info', '🎯 Reading the advice and acting on it…');
      say('Reading the advice and actually doing it now.', { interrupt: true });
      await api.advisorCycle({ source: routed.source || 'the advisor on screen' });
    } else if (routed.action === 'background_task') {
      log('info', '🕶 Working in the background — your screen stays free.');
      say('On it in the background. Keep working — I won\'t touch your screen.', { interrupt: true });
      await api.backgroundTask(routed.goal);
    } else if (routed.action === 'organize_windows') {
      log('info', '🪟 Organizing your windows…');
      say('Organizing your windows so I can see everything.', { interrupt: true });
      await api.arrangeWindows();
    } else if (routed.action === 'set_autonomy') {
      await api.settings.update({ fullControl: routed.enabled });
      const msg = routed.enabled
        ? 'Full Control on — I will act autonomously without asking. Say STOP any time.'
        : 'Full Control off — I will ask before risky actions.';
      log('info', (routed.enabled ? '🔓 ' : '🔒 ') + msg);
      say(msg, { interrupt: true });
      setState('idle', routed.enabled ? 'Full Control ON' : 'Approval mode');
    } else {
      // Safety net: if the router "replied" with a PROMISE to act ("I'll…",
      // "one sec", "let me open…") instead of doing it, actually do it — run
      // the original command through the multi-step orchestrator. This is the
      // fix for "it just says one sec and never acts".
      const promise = /\b(i'?ll|i will|let me|one sec(ond)?|hang on|hold on|on it|give me a (sec|moment)|i'?m going to|i can (search|open|find|check|look)|searching|looking (it )?up|checking|opening|let'?s (open|search|go))\b/i;
      if (api.doAnything && routed.message && promise.test(routed.message)) {
        log('info', '⚡ Acting on that (not just talking about it)…');
        say("On it.", { interrupt: true });
        await api.doAnything(text);
      } else {
        log('think', routed.message || '(no reply)');
        say(routed.message || '');
        setState('idle');
      }
    }
  } catch (e) {
    if (/API key/i.test(e.message || '')) {
      log('warn', 'No API key yet — opening the workspace so you can add one.');
      say('You need to add your A P I key first. Opening settings.', { interrupt: true });
      setState('idle', 'Add your key in Settings (⚙), then try again');
      api.openDashboard();
    } else {
      log('error', e.message);
      setState('error');
    }
  }
}

const cmd = document.getElementById('wx-cmd');
document.getElementById('wx-send').addEventListener('click', () => {
  const t = cmd.value.trim();
  cmd.value = '';
  runCommand(t);
});
cmd.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const t = cmd.value.trim();
    cmd.value = '';
    runCommand(t);
  }
});

/* ---------- voice (click-to-talk via OpenAI Whisper) ----------
 * Click the mic to arm continuous listening. Each turn: record from the mic,
 * auto-stop on ~1.4s of silence, send the audio to Whisper (main → OpenAI),
 * run the transcript as a command, then listen again. JARVIS won't record while
 * he's speaking (so he doesn't hear himself), and turns wait for the current
 * task to finish before the next capture. */
const micBtn = document.getElementById('wx-mic');
let listening = false; // armed for continuous listening
let capturing = false; // a record cycle is currently active
let mediaStream = null;

function setMic(on) {
  micBtn.classList.toggle('listening', on);
  micBtn.textContent = on ? '● live' : '🎙';
}

async function captureOnce() {
  if (capturing || !listening) return;
  capturing = true;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    capturing = false;
    disarmVoice();
    log('warn', 'Microphone blocked — allow it in System Settings › Privacy & Security › Microphone.');
    say('I need microphone permission. Enable it in System Settings.', { interrupt: true });
    return;
  }
  mediaStream = stream;
  let rec;
  try {
    rec = new MediaRecorder(stream);
  } catch {
    capturing = false;
    stream.getTracks().forEach((t) => t.stop());
    disarmVoice();
    log('error', 'Audio recording is not available in this build.');
    return;
  }
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size) chunks.push(e.data);
  };

  // Silence detection so a turn ends naturally without a second click.
  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  const analyser = ac.createAnalyser();
  analyser.fftSize = 512;
  ac.createMediaStreamSource(stream).connect(analyser);
  const buf = new Uint8Array(analyser.fftSize);
  let spoke = false;
  let lastLoud = Date.now();
  const started = Date.now();
  const SILENCE_MS = 1400; // trailing silence that ends a turn
  const LOUD = 0.02; // RMS threshold that counts as speech
  const MAX_MS = 15000; // hard cap on one turn
  const NO_SPEECH_MS = 4500; // give up if nothing was said
  const monitor = setInterval(() => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);
    const now = Date.now();
    if (rms > LOUD) {
      spoke = true;
      lastLoud = now;
    }
    const endTurn =
      (spoke && now - lastLoud > SILENCE_MS) ||
      now - started > MAX_MS ||
      (!spoke && now - started > NO_SPEECH_MS);
    if (endTurn && rec.state === 'recording') rec.stop();
  }, 120);

  rec.onstop = async () => {
    clearInterval(monitor);
    try {
      ac.close();
    } catch {
      /* ignore */
    }
    stream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    capturing = false;

    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    if (spoke && blob.size > 800) {
      setState('thinking', 'Transcribing…');
      const audio = await blob.arrayBuffer();
      const res = await api.transcribe(audio);
      if (res && res.ok && res.text) {
        await runCommand(res.text);
      } else if (res && /api key set/i.test(res.error || '')) {
        disarmVoice();
        log('warn', 'Add your voice (STT) key in Settings (⚙) — Groq is free. Then click the mic again.');
        say('Add your voice key in settings to use voice.', { interrupt: true });
        api.openDashboard();
        return;
      } else if (res && res.error) {
        log('error', res.error);
        if (current === 'thinking') setState('idle');
      }
    } else if (current === 'thinking' || current === 'listening') {
      setState('idle');
    }
    if (listening) scheduleNext();
  };

  setState('listening', 'Listening… (speak, then pause)');
  rec.start();
}

// Wait until JARVIS isn't speaking, then record the next turn.
function scheduleNext() {
  const tick = () => {
    if (!listening) return;
    if (speech.synth && speech.synth.speaking) return setTimeout(tick, 300);
    captureOnce();
  };
  setTimeout(tick, 250);
}

function armVoice() {
  if (listening) return;
  listening = true;
  setMic(true);
  say('Listening.', { interrupt: true });
  scheduleNext();
}
function disarmVoice() {
  listening = false;
  setMic(false);
  try {
    if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
  } catch {
    /* ignore */
  }
  if (current === 'listening' || current === 'thinking') setState('idle');
}

micBtn.addEventListener('click', () => (listening ? disarmVoice() : armVoice()));
if (api.onWidgetSummon) api.onWidgetSummon(() => armVoice());

/* ---------- approval gate ---------- */
const confirmBox = document.getElementById('wx-confirm');
const confirmMsg = document.getElementById('wx-confirm-msg');
let pendingConfirmId = null;
let reloadPending = false; // the confirm box is offering a post-self-edit reload
function showConfirm(evt) {
  pendingConfirmId = evt.id;
  confirmMsg.innerHTML = `<strong>Approve (${evt.risk || 'medium'} risk)?</strong><br>${escapeHtml(evt.summary || '')}`;
  confirmBox.classList.remove('hidden');
  setState('approval');
}
function hideConfirm() {
  confirmBox.classList.add('hidden');
  pendingConfirmId = null;
  reloadPending = false;
}
document.getElementById('wx-approve').addEventListener('click', async () => {
  if (reloadPending) {
    hideConfirm();
    log('info', 'Relaunching to apply…');
    await api.improve.relaunch();
    return;
  }
  if (pendingConfirmId) await api.confirm({ id: pendingConfirmId, approved: true });
  hideConfirm();
  setState('running');
});
document.getElementById('wx-deny').addEventListener('click', async () => {
  if (reloadPending) {
    hideConfirm();
    log('info', 'Not reloading yet — say "reload yourself" when ready.');
    setState('idle', 'Say "reload yourself" to apply');
    return;
  }
  if (pendingConfirmId) await api.confirm({ id: pendingConfirmId, approved: false });
  hideConfirm();
  setState('running');
});

/* ---------- agent event stream ---------- */
api.onAgentEvent((evt) => {
  switch (evt.type) {
    case 'started':
      clearFeed();
      setState('running', evt.goal || '');
      log('info', 'Starting: ' + (evt.goal || ''));
      say('On it. ' + (evt.goal || ''), { interrupt: true });
      break;
    case 'thinking':
      log('think', '🧠 ' + evt.text);
      say(evt.text); // narrate the model's reasoning
      break;
    case 'action':
      log('action', '➤ ' + (evt.detail || evt.action));
      break;
    case 'log':
      // streamed terminal output
      if (evt.text) log('think', evt.text);
      break;
    case 'step-started':
      log('info', `▸ Step ${evt.index + 1}/${evt.total}: ${evt.label}`);
      say(`Step ${evt.index + 1}: ${evt.label}`);
      break;
    case 'permission':
      log('perm', '⏸ ' + (evt.summary || 'needs approval'));
      say('I need your approval to ' + (evt.summary || 'continue'), { interrupt: true });
      break;
    case 'confirm-request':
      showConfirm(evt);
      break;
    case 'permission-result':
      hideConfirm();
      log(evt.approved ? 'info' : 'warn', evt.approved ? '✓ approved' : '✗ denied');
      break;
    case 'abort-requested':
    case 'aborted':
      log('warn', 'Stopped.');
      say('Stopped.', { interrupt: true });
      setState('idle');
      break;
    case 'error':
      log('error', evt.message || 'Error');
      say('Sorry, I hit an error.', { interrupt: true });
      setState('error');
      break;
    case 'done':
      if (evt.message) log('info', '✓ ' + evt.message);
      say(evt.message || 'Done.');
      setState('done');
      setTimeout(() => current === 'done' && setState('idle'), 4000);
      break;
    // Ongoing ("always online") task lifecycle — shows as ONGOING, never idles
    // out on its own; only 'ongoing-finished' releases the state.
    case 'ongoing-started':
      setState('running', '♾ ONGOING — say "stop" anytime');
      log('info', '♾ Ongoing: ' + (evt.goal || '') + ' → notes in your memory vault');
      break;
    case 'ongoing-cycle':
      setState('running', `♾ ONGOING — cycle ${evt.cycle} · say "stop" anytime`);
      log('info', `♾ Cycle ${evt.cycle}: ${evt.angle || ''}`);
      break;
    case 'ongoing-finding':
      if (evt.summary) log('think', '📝 ' + evt.summary);
      break;
    case 'ongoing-error':
      log('warn', 'Cycle hit a snag (continuing): ' + (evt.message || ''));
      break;
    case 'ongoing-finishing':
      setState('running', '♾ Polishing the work into a report…');
      log('info', '♾ Enhancing the accumulated notes into a polished report…');
      break;
    case 'ongoing-finished':
      log('info', `♾ ${evt.status === 'stopped' ? 'Stopped' : 'Finished'} after ${evt.cycles} cycle(s). ` + (evt.reportPath ? 'Polished report saved to your memory vault.' : 'Notes saved to your memory vault.'));
      say(evt.status === 'stopped' ? 'Stopped. I polished what I had into a report in your memory vault.' : 'All done — the report is in your memory vault.', { interrupt: true });
      setState('done');
      setTimeout(() => current === 'done' && setState('idle'), 4000);
      break;
    case 'finished':
      if (evt.status && evt.status !== 'done') {
        setState(evt.status === 'aborted' ? 'idle' : 'error');
      } else {
        setState('done');
        setTimeout(() => current === 'done' && setState('idle'), 4000);
      }
      refreshCounts();
      break;
    default:
      break;
  }
});

/* ---------- self-improvement event stream ---------- */
if (api.onImproveEvent) {
  api.onImproveEvent((evt) => {
    switch (evt.type) {
      case 'started':
        clearFeed();
        setState('improving', evt.goal || '');
        log('info', '🛠 Improving myself: ' + (evt.goal || ''));
        break;
      case 'thinking':
        log('think', '🧠 ' + evt.text);
        break;
      case 'action':
        // Claude Code tool activity (edits, bash, reads, greps).
        log('action', '➤ ' + (evt.text || ''));
        break;
      case 'log':
        log('think', evt.text || '');
        break;
      case 'read':
        log('action', '👁 read ' + evt.path);
        break;
      case 'write':
        log('action', '✎ edited ' + evt.path);
        say('Editing ' + prettyPath(evt.path));
        break;
      case 'validating':
        log('info', '⚙ Validating my changes…');
        say('Testing my new code.');
        break;
      case 'validated':
        log('info', '✓ Changes pass syntax + tests.');
        break;
      case 'validation-failed':
        log('warn', '✗ Validation failed — trying to fix it.');
        break;
      case 'error':
        log('error', evt.message || 'Self-improve error');
        say('Sorry, I could not improve myself. ' + shortErr(evt.message), { interrupt: true });
        setState('error');
        break;
      case 'finished':
        handleImproveFinished(evt);
        break;
      default:
        break;
    }
  });
}

function prettyPath(p) {
  return String(p || '').split('/').pop();
}
function shortErr(m) {
  return String(m || '').split('\n')[0].slice(0, 120);
}

function handleImproveFinished(evt) {
  if (evt.status === 'done') {
    const files = (evt.changed || []).length;
    log('info', `✅ Self-improvement done — ${files} file(s) changed. ${evt.summary || ''}`);
    say(
      'Done improving myself. ' +
        (evt.summary || '') +
        ' Say "reload yourself" to apply the changes.',
      { interrupt: true }
    );
    setState('done', 'Say "reload yourself" to apply');
    showReloadPrompt();
  } else if (evt.status === 'aborted') {
    log('warn', 'Self-improvement stopped — changes reverted.');
    say('Stopped. I rolled my code back.', { interrupt: true });
    setState('idle');
  } else {
    const why =
      evt.status === 'validation-failed'
        ? "the change didn't pass my tests"
        : evt.status === 'incomplete'
        ? "I couldn't finish the change"
        : evt.message || 'an error';
    log('error', `Self-improvement failed (${why}). ${evt.reverted ? 'Code reverted.' : ''}`);
    say('I could not safely make that change, so I reverted my code.', { interrupt: true });
    setState('error');
  }
}

// Offer a one-click reload after a successful self-edit (reusing the confirm UI).
function showReloadPrompt() {
  confirmMsg.innerHTML =
    '<strong>Reload to apply my new code?</strong><br>' +
    'I rewrote my own source. Reloading restarts me with the changes.';
  confirmBox.classList.remove('hidden');
  reloadPending = true;
}

// A schedule came due — run its command exactly as if the user typed it, so a
// schedule can trigger anything JARVIS can do (quick actions, ongoing tasks…).
if (api.onScheduleFire) {
  api.onScheduleFire((job) => {
    log('info', '⏰ Scheduled task fired: ' + (job.text || job.command));
    say('Time for your scheduled task.', { interrupt: true });
    runCommand(job.command);
  });
}

setState('idle');

/* ---------- voice mute toggle + greeting ---------- */
const voiceBtn = document.getElementById('wx-voice');
if (voiceBtn) {
  if (!speech.synth) {
    voiceBtn.disabled = true;
    voiceBtn.textContent = '🔇';
    voiceBtn.title = 'Speech synthesis not available in this build';
  } else {
    voiceBtn.addEventListener('click', () => {
      speech.on = !speech.on;
      voiceBtn.textContent = speech.on ? '🔊' : '🔇';
      if (!speech.on) speech.synth.cancel();
      else say('Voice on.', { interrupt: true });
    });
  }
}
// Greet once, after voices have had a moment to load.
if (speech.synth) setTimeout(() => say('Assistant online. Ready when you are.'), 800);

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
