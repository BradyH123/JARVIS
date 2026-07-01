'use strict';

/* Renderer logic. Talks only to window.assistant (see preload.js). */

const api = window.assistant;

/* ---------- tab switching ---------- */
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'skills') loadSkills();
  });
});

/* ---------- config banner ---------- */
(async function showConfig() {
  try {
    const info = await api.configInfo();
    const el = document.getElementById('config-status');
    if (!info.hasKey) {
      el.textContent = '⚠ no ANTHROPIC_API_KEY — set it in .env';
      el.style.color = 'var(--danger)';
    } else {
      const control = info.canControl ? '🖱 control ready' : '⚠ no OS control (see README)';
      el.textContent = `model: ${info.model} · ${control}`;
      el.style.color = info.canControl ? '' : '#ffcc66';
    }
  } catch (e) {
    /* ignore */
  }
})();

/* ---------- recording a demonstration ---------- */
let recording = false;
let frames = [];
let timer = null;
let startedAt = 0;
const FRAME_INTERVAL_MS = 1500; // one frame every 1.5s while recording

const btnRecord = document.getElementById('btn-record');
const recordMeta = document.getElementById('record-meta');
const framesStrip = document.getElementById('frames-strip');
const nameBlock = document.getElementById('name-block');

async function grabFrame() {
  try {
    const dataUrl = await api.captureFrame();
    frames.push(dataUrl);
    const img = document.createElement('img');
    img.src = dataUrl;
    framesStrip.appendChild(img);
    framesStrip.scrollLeft = framesStrip.scrollWidth;
    recordMeta.textContent = `recording… ${frames.length} frame(s), ${Math.round(
      (Date.now() - startedAt) / 1000
    )}s`;
  } catch (e) {
    recordMeta.textContent = 'capture error: ' + e.message;
  }
}

function startRecording() {
  recording = true;
  frames = [];
  framesStrip.innerHTML = '';
  nameBlock.classList.add('hidden');
  startedAt = Date.now();
  btnRecord.textContent = '■ Stop recording';
  btnRecord.classList.add('recording');
  grabFrame();
  timer = setInterval(grabFrame, FRAME_INTERVAL_MS);
}

function stopRecording() {
  recording = false;
  clearInterval(timer);
  btnRecord.textContent = '● Start recording';
  btnRecord.classList.remove('recording');
  recordMeta.textContent = `${frames.length} frame(s) captured — name it below`;
  if (frames.length > 0) nameBlock.classList.remove('hidden');
}

btnRecord.addEventListener('click', () => (recording ? stopRecording() : startRecording()));
api.onToggleRecord(() => (recording ? stopRecording() : startRecording()));

document.getElementById('btn-save').addEventListener('click', async () => {
  const name = document.getElementById('skill-name').value.trim();
  const note = document.getElementById('skill-note').value.trim();
  const status = document.getElementById('save-status');
  if (!name) {
    status.textContent = 'Please give the skill a name.';
    return;
  }
  status.textContent = 'Learning from your demonstration…';
  try {
    await api.skills.save({ name, note, frames });
    status.textContent = '✓ Saved to your skill library.';
    document.getElementById('skill-name').value = '';
    document.getElementById('skill-note').value = '';
    frames = [];
    framesStrip.innerHTML = '';
    nameBlock.classList.add('hidden');
  } catch (e) {
    status.textContent = 'Error: ' + e.message;
  }
});

/* ---------- skill library ---------- */
async function loadSkills() {
  const list = document.getElementById('skills-list');
  list.innerHTML = '<p class="muted">Loading…</p>';
  let skills = [];
  try {
    skills = await api.skills.list();
  } catch (e) {
    list.innerHTML = '<p class="muted">Error: ' + e.message + '</p>';
    return;
  }
  if (!skills.length) {
    list.innerHTML = '<p class="muted">No skills yet. Teach one on the “Teach” tab.</p>';
    return;
  }
  list.innerHTML = '';
  skills.forEach((s) => list.appendChild(renderSkill(s)));
}

function renderSkill(s) {
  const el = document.createElement('div');
  el.className = 'skill';
  const triggers = (s.trigger_phrases || []).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('');
  const steps = (s.steps || []).map((st) => `<li>${escapeHtml(st)}</li>`).join('');
  el.innerHTML = `
    <div class="skill-head">
      <span class="name">${escapeHtml(s.name)}</span>
      <span class="muted">${s.frame_count} frame(s)</span>
    </div>
    <div class="skill-body">
      <p>${escapeHtml(s.description || '')}</p>
      <p class="muted">Context: ${escapeHtml(s.app_context || 'unknown')}</p>
      ${steps ? `<ol>${steps}</ol>` : ''}
      ${triggers ? `<div>${triggers}</div>` : ''}
      <div class="skill-actions">
        <button class="run">Run</button>
        <button class="danger del">Delete</button>
      </div>
    </div>`;
  el.querySelector('.skill-head').addEventListener('click', () => el.classList.toggle('open'));
  el.querySelector('.run').addEventListener('click', () => proposePlan(s.id));
  el.querySelector('.del').addEventListener('click', async () => {
    await api.skills.remove(s.id);
    loadSkills();
  });
  return el;
}

/* ---------- assistant chat ---------- */
const chatLog = document.getElementById('chat-log');
const chatText = document.getElementById('chat-text');
const history = [];

function addMessage(role, text, proposedSkillId) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = text;
  if (proposedSkillId) {
    const btn = document.createElement('button');
    btn.className = 'primary run-btn';
    btn.textContent = 'Review plan';
    btn.addEventListener('click', () => proposePlan(proposedSkillId));
    div.appendChild(document.createElement('br'));
    div.appendChild(btn);
  }
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

async function sendChat() {
  const text = chatText.value.trim();
  if (!text) return;
  chatText.value = '';
  addMessage('user', text);
  history.push({ role: 'user', text });
  const thinking = document.createElement('div');
  thinking.className = 'msg assistant';
  thinking.textContent = 'thinking…';
  chatLog.appendChild(thinking);
  try {
    const res = await api.chat(history);
    thinking.remove();
    addMessage('assistant', res.reply || '(no reply)', res.proposed_skill_id);
    history.push({ role: 'assistant', text: res.reply || '' });
  } catch (e) {
    thinking.textContent = 'Error: ' + e.message;
  }
}

document.getElementById('btn-send').addEventListener('click', sendChat);
chatText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

/* ---------- plan approval ---------- */
const modal = document.getElementById('plan-modal');
const planContent = document.getElementById('plan-content');
const planTitle = document.getElementById('plan-title');

async function proposePlan(skillId) {
  currentPlanSkillId = skillId;
  modal.classList.remove('hidden');
  planTitle.textContent = 'Building plan…';
  planContent.innerHTML = '<p class="muted">Looking at your current screen…</p>';
  try {
    const p = await api.plan(skillId);
    planTitle.textContent = 'Plan: ' + p.skill.name;
    const steps = (p.plan || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('');
    const risks = (p.risks || []).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
    const clar = (p.needs_clarification || []).map((c) => `<li>${escapeHtml(c)}</li>`).join('');
    planContent.innerHTML = `
      <p>Risk: <strong class="risk-${p.risk_level}">${escapeHtml(p.risk_level)}</strong></p>
      ${steps ? `<p><strong>Steps:</strong></p><ol>${steps}</ol>` : '<p class="muted">No concrete steps produced.</p>'}
      ${risks ? `<p><strong>Risks:</strong></p><ul>${risks}</ul>` : ''}
      ${clar ? `<p><strong>Needs clarification:</strong></p><ul>${clar}</ul>` : ''}`;
  } catch (e) {
    planContent.innerHTML = '<p class="risk-high">Error: ' + escapeHtml(e.message) + '</p>';
  }
}

let currentPlanSkillId = null;

document.getElementById('plan-cancel').addEventListener('click', () => modal.classList.add('hidden'));
document.getElementById('plan-approve').addEventListener('click', () => {
  modal.classList.add('hidden');
  if (currentPlanSkillId) startRun({ skillId: currentPlanSkillId });
});

/* ---------- live autonomous run ---------- */
const runOverlay = document.getElementById('run-overlay');
const runLog = document.getElementById('run-log');
const runStatus = document.getElementById('run-status');
const runGoal = document.getElementById('run-goal');

function logRun(kind, text) {
  const line = document.createElement('div');
  line.className = 'run-line ' + kind;
  line.textContent = text;
  runLog.appendChild(line);
  runLog.scrollTop = runLog.scrollHeight;
}

async function startRun(payload) {
  runOverlay.classList.remove('hidden');
  runLog.innerHTML = '';
  runStatus.textContent = '● running';
  runStatus.className = 'run-status running';
  runGoal.textContent = payload.goal || '';
  logRun('info', 'Starting… the assistant now controls your mouse & keyboard.');
  try {
    const res = await api.execute(payload);
    if (res && res.status === 'busy') logRun('warn', 'A run is already in progress.');
    if (res && res.status === 'error') logRun('error', res.message || 'Error');
  } catch (e) {
    logRun('error', e.message);
  }
}

document.getElementById('run-stop').addEventListener('click', async () => {
  logRun('warn', 'Stop requested…');
  await api.stop();
});

api.onAgentEvent((evt) => {
  switch (evt.type) {
    case 'started':
      runGoal.textContent = evt.goal || '';
      break;
    case 'thinking':
      logRun('think', '🧠 ' + evt.text);
      break;
    case 'action':
      logRun('action', '➤ ' + (evt.detail || evt.action));
      break;
    case 'abort-requested':
      logRun('warn', 'Emergency stop received.');
      break;
    case 'aborted':
      runStatus.textContent = '■ stopped';
      runStatus.className = 'run-status stopped';
      logRun('warn', 'Run stopped.');
      break;
    case 'max_steps':
      runStatus.textContent = '■ step limit';
      runStatus.className = 'run-status stopped';
      logRun('warn', `Hit the ${evt.steps}-step safety limit.`);
      break;
    case 'error':
      runStatus.textContent = '■ error';
      runStatus.className = 'run-status stopped';
      logRun('error', evt.message || 'Error');
      break;
    case 'done':
    case 'finished':
      if (evt.type === 'done' || (evt.status && evt.status === 'done')) {
        runStatus.textContent = '✓ done';
        runStatus.className = 'run-status done';
        if (evt.message) logRun('info', '✓ ' + evt.message);
      }
      break;
    default:
      break;
  }
});

/* ---------- util ---------- */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
