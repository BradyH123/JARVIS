'use strict';

/**
 * JARVIS dashboard — the two-page interface the user approved:
 *   ● Live       — orb, main goal, live activity feed, "next up" bar, composer
 *   🚇 Workflows — every scheduled task is a subway line in its own window;
 *                  EVERY run is a node with an expandable dashboard showing the
 *                  exact instructions JARVIS reads at that moment (editable —
 *                  one source of truth for the whole line) and past results.
 *
 * Everything is real data: the scheduler (schedules.json), ongoing research
 * tasks, and the live agent event stream. Both composers relay text to the
 * widget's full command pipeline, so the dashboard is controlled
 * conversationally — same brain, second mouth.
 */

const api = window.assistant;

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtT = (d) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const fmtD = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const rel = (ms) => {
  const m = Math.round((ms - Date.now()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `in ${m}m`;
  if (m < 60 * 24) return `in ${Math.round(m / 60)}h`;
  return `in ${Math.round(m / 1440)}d`;
};

/* ---------- tabs ---------- */
document.querySelectorAll('.tab').forEach((t) =>
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
    document.querySelectorAll('.page').forEach((p) => p.classList.toggle('on', p.id === 'page-' + t.dataset.page));
  })
);
if (api.onFocusTab) api.onFocusTab((tab) => {
  const t = document.querySelector(`.tab[data-page="${tab === 'flows' || tab === 'workflows' ? 'flows' : 'live'}"]`);
  if (t) t.click();
});
document.getElementById('open-settings').addEventListener('click', () => api.openSettings && api.openSettings());

/* ---------- orb ---------- */
(function () {
  const cv = document.getElementById('orb');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  ctx.scale(2, 2);
  const CX = 85, CY = 85, ACC = '#4ab4ff', ACC2 = '#8fe3ff';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function arc(r, a0, a1, w, c, al) {
    ctx.beginPath(); ctx.arc(CX, CY, r, a0, a1);
    ctx.lineWidth = w; ctx.strokeStyle = c; ctx.globalAlpha = al; ctx.lineCap = 'round';
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  function frame(t) {
    ctx.clearRect(0, 0, 170, 170);
    const p = t / 1000;
    arc(77, 0, Math.PI * 2, 1.5, ACC, 0.14);
    for (let i = 0; i < 3; i++) {
      const rr = 69 - i * 13, spd = (i % 2 ? -1 : 1) * (0.5 + i * 0.25), off = p * spd;
      for (let s = 0; s < 3; s++) { const a = off + s * ((Math.PI * 2) / 3); arc(rr, a, a + Math.PI * 0.5, 3, i === 0 ? ACC2 : ACC, 0.55 - i * 0.12); }
    }
    const pu = reduce ? 0.5 : Math.sin(p * 2.2) * 0.5 + 0.5, cr = 19 + pu * 6;
    const g = ctx.createRadialGradient(CX, CY, 2, CX, CY, cr + 14);
    g.addColorStop(0, ACC2); g.addColorStop(0.4, ACC); g.addColorStop(1, 'rgba(74,180,255,0)');
    ctx.globalAlpha = 0.6 + pu * 0.4;
    ctx.beginPath(); ctx.arc(CX, CY, cr + 14, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(CX, CY, 9, 0, Math.PI * 2); ctx.fillStyle = '#dff3ff'; ctx.fill();
    if (!reduce) requestAnimationFrame(frame);
  }
  if (reduce) frame(700); else requestAnimationFrame(frame);
})();

/* ---------- live feed + goal card ---------- */
const feed = document.getElementById('feed');
const MAX_FEED = 120;
function log(kind, msg) {
  const d = new Date();
  const ln = document.createElement('div');
  ln.className = 'ln ' + kind;
  ln.innerHTML = `<span class="t">${fmtT(d)}</span><span>${{ think: '🧠', ok: '✓', warn: '◆', err: '✗', act: '➤', info: '·' }[kind] || '·'}</span><span class="m">${esc(msg)}</span>`;
  feed.prepend(ln);
  while (feed.children.length > MAX_FEED) feed.lastChild.remove();
}
setInterval(() => { document.getElementById('feed-clock').textContent = fmtT(new Date()); }, 1000);

const orbWord = document.getElementById('orb-word');
const orbSub = document.getElementById('orb-sub');
const goalG = document.getElementById('goal-g');
const goalS = document.getElementById('goal-s');
function setGoal(word, sub, g, s) {
  if (word) orbWord.textContent = word;
  if (sub) orbSub.textContent = sub;
  if (g) goalG.textContent = g;
  if (s) goalS.textContent = s;
}

if (api.onAgentEvent)
  api.onAgentEvent((evt) => {
    switch (evt.type) {
      case 'started': setGoal('Working', 'focused · 1 task', evt.goal || 'Working…', 'running now'); log('info', 'Starting: ' + (evt.goal || '')); break;
      case 'thinking': if (evt.text) log('think', evt.text); break;
      case 'action': log('act', evt.detail || evt.action || 'action'); break;
      case 'log': if (evt.text) log('think', evt.text); break;
      case 'step-started': log('info', `Step ${evt.index + 1}/${evt.total}: ${evt.label}`); break;
      case 'done': log('ok', evt.message || 'Done.'); setGoal('Ready', 'idle', 'Nothing running', 'tell JARVIS what to do below'); break;
      case 'error': log('err', evt.message || 'Error'); setGoal('Error', 'see feed', undefined, undefined); break;
      case 'aborted': log('warn', 'Stopped.'); setGoal('Ready', 'idle', 'Nothing running', 'stopped'); break;
      case 'ongoing-started': setGoal('Working', 'ongoing', evt.goal || 'Ongoing research', 'cycle 1 · say stop anytime'); log('info', '♾ Ongoing: ' + (evt.goal || '')); break;
      case 'ongoing-cycle': setGoal('Working', 'ongoing', undefined, `cycle ${evt.cycle} · say stop anytime`); break;
      case 'ongoing-finding': if (evt.summary) log('think', '📝 ' + evt.summary); break;
      case 'ongoing-finished': log('ok', 'Ongoing task finished.'); setGoal('Ready', 'idle', 'Nothing running', 'tell JARVIS what to do below'); refresh(); break;
      case 'finished': refresh(); break;
      default: break;
    }
  });

/* ---------- composers → the widget's command pipeline ---------- */
function wireComposer(inputId, btnId) {
  const inp = document.getElementById(inputId);
  const send = () => {
    const t = inp.value.trim();
    if (!t) return;
    inp.value = '';
    log('act', '❯ ' + t + ' → sent to JARVIS');
    api.relayCommand(t);
  };
  document.getElementById(btnId).addEventListener('click', send);
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}
wireComposer('live-cmd', 'live-send');
wireComposer('flow-cmd', 'flow-send');

/* ================== WORKFLOWS: EVERY RUN IS A NODE ================== */
const COLORS = ['#4ab4ff', '#a88bf0', '#3ecfb2', '#8d9fb8', '#ffbb5c', '#ff8fa3'];
const MAX_VISIBLE = 500;
const wins = document.getElementById('wins');
const emptywins = document.getElementById('emptywins');
const openKeys = new Set(); // node keys the user opened — survive rebuilds
const scrollTops = new Map(); // job id -> track scroll position
const liveLines = new Map(); // job id -> ts of last fire (line shows LIVE)

function titleOf(job) {
  if (job.meta && job.meta.kind === 'strategy') return '🧭 ' + (job.meta.source || 'Strategy');
  const c = String(job.command || '');
  return c.length > 44 ? c.slice(0, 42) + '…' : c;
}

function stepMsOf(spec) {
  if (!spec) return null;
  if (spec.kind === 'every') return Math.max(1, Number(spec.minutes) || 1) * 60000;
  if (spec.kind === 'daily') return 86400000;
  if (spec.kind === 'weekly') return 7 * 86400000;
  return null; // once
}

// Every future occurrence of a job, from its real nextAt, capped.
function occurrencesFor(job, cap) {
  const out = [];
  const step = stepMsOf(job.spec);
  let t = job.nextAt;
  let run = (job.runs || 0) + 1;
  while (t && out.length < cap) {
    if (job.expiresAt && t >= job.expiresAt) break;
    out.push({ when: new Date(t), run: run++ });
    if (!step) break;
    t += step;
  }
  return out;
}

function totalRunsOf(job) {
  const step = stepMsOf(job.spec);
  if (!step) return (job.runs || 0) + (job.nextAt ? 1 : 0); // one-off
  if (!job.expiresAt) return Infinity;
  return (job.runs || 0) + Math.max(0, Math.ceil((job.expiresAt - (job.nextAt || Date.now())) / step));
}

function buildWin(job, idx) {
  const color = COLORS[idx % COLORS.length];
  const total = totalRunsOf(job);
  const done = job.runs || 0;
  const pct = total === Infinity ? 0 : Math.min(100, Math.round((done / Math.max(1, total)) * 100));
  const live = liveLines.has(job.id) && Date.now() - liveLines.get(job.id) < 5 * 60000;
  const win = document.createElement('section');
  win.className = 'win' + (live ? ' focused' : '');
  win.style.setProperty('--c', color);
  win.dataset.job = job.id;
  win.innerHTML =
    `<div class="tb"><span class="m">${esc((titleOf(job)[0] || '•').toUpperCase())}</span>` +
    `<span class="tt"><b>${esc(titleOf(job))}</b><span>${esc(job.text || '')}</span></span>` +
    (live ? `<span class="live2"><i></i>live</span>` : '') + `</div>` +
    `<div class="runbar"><span class="lab"><b>${done}</b> of <b>${total === Infinity ? '∞' : total}</b> runs</span>` +
    `<span class="bar"><i style="width:${pct}%"></i></span><span class="lab">${total === Infinity ? '' : pct + '%'}</span></div>` +
    `<div class="trackwrap"><div class="track"></div></div>` +
    `<div class="swipehint">every run is a node — scroll the whole line ↓</div>`;
  const track = win.querySelector('.track');

  const occ = occurrencesFor(job, MAX_VISIBLE + 1);
  const rows = [];
  rows.push({ kind: 'now' });
  let lastDay = new Date();
  occ.slice(0, MAX_VISIBLE).forEach((o, i) => {
    if (!sameDay(o.when, lastDay)) { rows.push({ kind: 'day', label: fmtD(o.when) }); lastDay = o.when; }
    rows.push({ kind: 'node', t: fmtT(o.when), run: o.run, next: i === 0, when: `${fmtD(o.when)} ${fmtT(o.when)}`, whenMs: o.when.getTime() });
  });
  if (occ.length > MAX_VISIBLE) {
    rows.push({ kind: 'gate', label: `⧗ 500-node window full — later runs slide in as earlier runs complete` });
  }
  const termWhen = job.expiresAt ? `${fmtD(new Date(job.expiresAt))} ${fmtT(new Date(job.expiresAt))}` : null;
  rows.push({ kind: 'term', label: !stepMsOf(job.spec) ? '<b>one-off</b> — removed after it runs' : termWhen ? `<b>line ends</b> · ${esc(termWhen)} (duration reached)` : '<b>∞</b> — runs until you stop it' });

  rows.forEach((r, i) => {
    const row = document.createElement('div');
    const cls = ['row'];
    if (r.next && liveLines.has(job.id) && Date.now() - liveLines.get(job.id) < 60000) cls.push('active');
    if (['day', 'term', 'now', 'gate'].includes(r.kind)) cls.push('dashedrail');
    if (i === 0) cls.push('first');
    if (i === rows.length - 1) cls.push('last');
    row.className = cls.join(' ');
    let rail = '', main = '';
    if (r.kind === 'now') main = `<div class="nowrow"><div class="l"></div></div>`;
    else if (r.kind === 'day') main = `<div class="dayrow"><span>${esc(r.label)}</span><i></i></div>`;
    else if (r.kind === 'gate') main = `<div class="skipnode"><span class="gatepill">${esc(r.label)}</span></div>`;
    else if (r.kind === 'term') { rail = '<span class="cap"></span>'; main = `<div class="termlab">${r.label}</div>`; }
    else {
      rail = '<span class="dot"></span>';
      const key = job.id + ':' + r.run;
      main =
        `<div class="node${openKeys.has(key) ? ' open' : ''}" data-key="${esc(key)}" data-when="${esc(r.when)}" data-whenms="${r.whenMs}" data-run="${r.run}">` +
        `<div class="nh"><span class="nm">${esc(titleOf(job))}</span><span class="run">run ${r.run}${totalRunsOf(job) === Infinity ? '/∞' : '/' + totalRunsOf(job)}</span>` +
        `<span class="st">${r.next ? 'next' : 'scheduled'}</span><span class="caret">▾</span></div></div>`;
    }
    row.innerHTML = `<div class="tcol">${r.kind === 'node' ? esc(r.t || '') : ''}</div><div class="railcol">${rail}</div><div>${main}</div>`;
    track.appendChild(row);
    if (r.kind === 'node' && openKeys.has(job.id + ':' + r.run)) buildDash(row.querySelector('.node'), job);
  });

  win._job = job;
  const wrap = win.querySelector('.trackwrap');
  if (scrollTops.has(job.id)) wrap.scrollTop = scrollTops.get(job.id);
  wrap.addEventListener('scroll', () => scrollTops.set(job.id, wrap.scrollTop));
  return win;
}

// An ongoing research task gets its own line too — one live node.
function buildOngoingWin(t, idx) {
  const color = COLORS[idx % COLORS.length];
  const win = document.createElement('section');
  win.className = 'win focused';
  win.style.setProperty('--c', color);
  win.innerHTML =
    `<div class="tb"><span class="m">♾</span>` +
    `<span class="tt"><b>${esc(t.goal)}</b><span>ongoing research · notes in your vault</span></span>` +
    `<span class="live2"><i></i>cycle ${t.cycle || 1}</span></div>` +
    `<div class="runbar"><span class="lab"><b>${t.cycle || 1}</b> cycles</span><span class="bar"><i style="width:100%"></i></span></div>` +
    `<div class="trackwrap" style="height:auto;max-height:200px"><div class="track">` +
    `<div class="row first last active"><div class="tcol now">now</div><div class="railcol"><span class="dot"></span></div><div>` +
    `<div class="node open"><div class="nh"><span class="nm">Researching…</span><span class="run">cycle ${t.cycle || 1}</span><span class="st">running</span></div>` +
    `<div class="dash"><div class="dsec"><div class="k">Latest finding</div><div class="res"><div class="rr"><span class="d ok"></span>` +
    `<span class="r">${esc(t.lastFinding || 'working…')}</span><span class="meta"></span></div></div></div>` +
    `<div class="acts"><span class="sayto">tell JARVIS — <b>“stop researching”</b> ends this line</span></div></div></div></div></div>` +
    `</div></div>`;
  return win;
}

// The node dashboard: the instructions JARVIS reads AT THAT TIME (editable —
// one source of truth for every future run), past results, one button.
function buildDash(node, job) {
  if (node.querySelector('.dash')) return;
  const when = node.dataset.when || '';
  const whenMs = Number(node.dataset.whenms) || 0;
  const hist = Array.isArray(job.history) ? job.history : [];
  const results = hist.length
    ? hist.map((h) => `<div class="rr"><span class="d ${h.ok ? 'ok' : 'warn'}"></span><span class="r"><b>${esc(fmtD(new Date(h.at)))} ${esc(fmtT(new Date(h.at)))}</b> — ${esc(h.summary || (h.ok ? 'ok' : 'failed'))}</span><span class="meta"></span></div>`).join('')
    : `<div class="rr"><span></span><span class="r" style="color:var(--faint)">no runs yet — results will appear here</span><span></span></div>`;
  const dash = document.createElement('div');
  dash.className = 'dash';
  dash.innerHTML =
    `<div class="kpis"><div class="kpi"><div class="k">reads at</div><div class="v" style="font-size:10.5px">${esc(when)}</div></div>` +
    `<div class="kpi"><div class="k">fires</div><div class="v">${esc(whenMs ? rel(whenMs) : '—')}</div></div>` +
    `<div class="kpi"><div class="k">runs so far</div><div class="v">${job.runs || 0}</div></div></div>` +
    `<div class="dsec"><div class="k">Strategic instructions <span class="edit">tap to edit · or tell JARVIS</span></div>` +
    `<div class="readsat">▸ JARVIS reads this ${esc(when)}</div>` +
    `<div class="instr" contenteditable="true" spellcheck="false">${esc(job.meta && job.meta.kind === 'strategy' ? job.meta.instruction || job.command : job.command)}</div>` +
    `<div class="editnote">One source of truth — editing here (or conversationally) updates <b>every future run</b> on this line.</div></div>` +
    `<div class="dsec"><div class="k">Past results</div><div class="res">${results}</div></div>` +
    `<div class="acts"><button type="button" class="runnow">▶ run now</button>` +
    `<span class="sayto">or just tell JARVIS — <b>“skip this run”</b>, <b>“delete this line”</b></span></div>`;
  node.appendChild(dash);

  // Inline edit → the scheduler, applies to the whole line.
  const instr = dash.querySelector('.instr');
  const note = dash.querySelector('.editnote');
  instr.addEventListener('blur', async () => {
    const next = instr.textContent.trim();
    if (!next || next === job.command) return;
    const r = await api.schedule.update({ id: job.id, command: next });
    if (r && !r.error) {
      job.command = next;
      note.classList.add('saved');
      note.innerHTML = '✓ Saved — <b>every future run</b> on this line now uses these instructions.';
      log('ok', 'Workflow instructions updated: ' + next.slice(0, 60));
    } else {
      note.innerHTML = '✗ ' + esc((r && r.error) || 'Could not save.');
    }
  });
  dash.querySelector('.runnow').addEventListener('click', async () => {
    const r = await api.schedule.runNow(job.id);
    log('act', r && r.error ? r.error : '▶ Running "' + titleOf(job) + '" now…');
    setTimeout(refresh, 1500);
  });
}

// Toggle node dashboards (lazy build on first open); remember open state.
document.addEventListener('click', (e) => {
  if (e.target.closest('.dash')) return;
  const nh = e.target.closest('.nh');
  if (!nh) return;
  const node = nh.closest('.node');
  const win = nh.closest('.win');
  if (!node || !win || !win._job) return;
  buildDash(node, win._job);
  node.classList.toggle('open');
  const key = node.dataset.key;
  if (key) { if (node.classList.contains('open')) openKeys.add(key); else openKeys.delete(key); }
});

/* ---------- next-up bar ---------- */
function renderNextUp(jobs, ongoingTasks) {
  const chips = document.getElementById('nchips');
  const items = jobs
    .filter((j) => j.nextAt)
    .map((j) => ({ label: titleOf(j), at: j.nextAt }))
    .sort((a, b) => a.at - b.at)
    .slice(0, 6);
  let html = items.map((it, i) => `<span class="nchip"><b>${i + 1}</b> ${esc(it.label)} <small>${esc(rel(it.at))}</small></span>`).join('');
  for (const t of ongoingTasks) html += `<span class="nchip"><b>♾</b> ${esc(t.goal)} <small>cycle ${t.cycle || 1}</small></span>`;
  html += `<span class="nchip ghost">tell JARVIS to add or reorder…</span>`;
  chips.innerHTML = html;
  document.getElementById('ncount').textContent = `${items.length + ongoingTasks.length} queued`;
}

/* ---------- data refresh ---------- */
let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const [jobs, ongoingTasks] = await Promise.all([
      api.schedule.list().catch(() => []),
      api.ongoing.list().then((r) => (Array.isArray(r) ? r.filter((t) => t.status === 'running') : [])).catch(() => []),
    ]);
    renderNextUp(jobs, ongoingTasks);
    wins.innerHTML = '';
    jobs.forEach((j, i) => wins.appendChild(buildWin(j, i)));
    ongoingTasks.forEach((t, i) => wins.appendChild(buildOngoingWin(t, jobs.length + i)));
    emptywins.hidden = jobs.length + ongoingTasks.length > 0;
  } finally {
    refreshing = false;
  }
}

if (api.onScheduleFire)
  api.onScheduleFire((job) => {
    liveLines.set(job.id, Date.now());
    log('act', '⏰ ' + (job.text || job.command));
    setTimeout(refresh, 800);
  });

document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
setInterval(refresh, 20000);
refresh();
log('info', 'Dashboard ready — Live + Workflows.');
