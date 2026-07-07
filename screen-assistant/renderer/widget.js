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

const STATE = {
  idle: { color: '#3aa0ff', label: 'READY', state: 'Standing by', sub: 'Say a command or type below' },
  listening: { color: '#22d3ee', label: 'LISTEN', state: 'Listening…', sub: 'Speak your command' },
  thinking: { color: '#ffb020', label: 'THINK', state: 'Thinking…', sub: 'Routing your request' },
  running: { color: '#ffb020', label: 'ACTIVE', state: 'Working…', sub: 'Controlling your computer' },
  approval: { color: '#ff5c5c', label: 'HOLD', state: 'Approval needed', sub: 'Review the action below' },
  done: { color: '#4bd18a', label: 'DONE', state: 'Completed', sub: 'Ready for the next task' },
  error: { color: '#ff5c5c', label: 'ERROR', state: 'Something went wrong', sub: 'See the log below' },
};

let current = 'idle';
function setState(name, subOverride) {
  current = name;
  const s = STATE[name] || STATE.idle;
  widget.dataset.state = ['listening', 'running', 'thinking'].includes(name)
    ? name === 'thinking'
      ? 'running'
      : name
    : name === 'approval' || name === 'done'
    ? name
    : 'idle';
  orbLabel.textContent = s.label;
  stateEl.textContent = s.state;
  subEl.textContent = subOverride || s.sub;
  orb.color = s.color;
  stopBtn.classList.toggle('hidden', !(name === 'running' || name === 'thinking' || name === 'approval'));
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

/* ---------- live "watching" (REC) indicator ---------- */
const recEl = document.getElementById('wx-rec');
if (api.onWatchEvent) {
  api.onWatchEvent((s) => recEl.classList.toggle('hidden', !(s && s.active && !s.paused)));
}

/* ---------- command routing ---------- */
async function runCommand(text) {
  if (!text.trim()) return;
  log('action', '❯ ' + text);
  setState('thinking');
  try {
    const routed = await api.command(text);
    if (routed.action === 'skill') {
      log('info', 'Running skill: ' + (routed.skill_name || routed.skill_id));
      await api.execute({ skillId: routed.skill_id, goal: routed.skill_name });
    } else if (routed.action === 'workflow') {
      log('info', 'Running workflow: ' + (routed.workflow_name || routed.workflow_id));
      await api.workflows.run(routed.workflow_id);
    } else if (routed.action === 'goal') {
      log('info', 'Goal: ' + routed.goal);
      await api.execute({ goal: routed.goal });
    } else {
      log('think', routed.message || '(no reply)');
      setState('idle');
    }
  } catch (e) {
    log('error', e.message);
    setState('error');
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

/* ---------- voice ---------- */
const micBtn = document.getElementById('wx-mic');
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;
if (!SR) {
  micBtn.disabled = true;
  micBtn.title = 'Speech not available in this build — type instead';
} else {
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.onresult = (e) => {
    const t = e.results[0][0].transcript.trim();
    runCommand(t);
  };
  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove('listening');
    if (current === 'listening') setState('idle');
  };
  const startVoice = () => {
    if (listening) return recognition.stop();
    try {
      recognition.start();
      listening = true;
      micBtn.classList.add('listening');
      setState('listening');
    } catch {
      /* already started */
    }
  };
  micBtn.addEventListener('click', startVoice);
  api.onWidgetSummon(() => startVoice());
}

/* ---------- approval gate ---------- */
const confirmBox = document.getElementById('wx-confirm');
const confirmMsg = document.getElementById('wx-confirm-msg');
let pendingConfirmId = null;
function showConfirm(evt) {
  pendingConfirmId = evt.id;
  confirmMsg.innerHTML = `<strong>Approve (${evt.risk || 'medium'} risk)?</strong><br>${escapeHtml(evt.summary || '')}`;
  confirmBox.classList.remove('hidden');
  setState('approval');
}
function hideConfirm() {
  confirmBox.classList.add('hidden');
  pendingConfirmId = null;
}
document.getElementById('wx-approve').addEventListener('click', async () => {
  if (pendingConfirmId) await api.confirm({ id: pendingConfirmId, approved: true });
  hideConfirm();
  setState('running');
});
document.getElementById('wx-deny').addEventListener('click', async () => {
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
      break;
    case 'thinking':
      log('think', '🧠 ' + evt.text);
      break;
    case 'action':
      log('action', '➤ ' + (evt.detail || evt.action));
      break;
    case 'step-started':
      log('info', `▸ Step ${evt.index + 1}/${evt.total}: ${evt.label}`);
      break;
    case 'permission':
      log('perm', '⏸ ' + (evt.summary || 'needs approval'));
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
      setState('idle');
      break;
    case 'error':
      log('error', evt.message || 'Error');
      setState('error');
      break;
    case 'done':
      if (evt.message) log('info', '✓ ' + evt.message);
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

setState('idle');

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
