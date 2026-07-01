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
    el.textContent = info.hasKey
      ? `model: ${info.model}`
      : '⚠ no ANTHROPIC_API_KEY — set it in .env';
    el.style.color = info.hasKey ? '' : 'var(--danger)';
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

document.getElementById('plan-cancel').addEventListener('click', () => modal.classList.add('hidden'));
document.getElementById('plan-approve').addEventListener('click', () => {
  // MVP: execution is simulated. A later phase drives the OS here.
  console.log('[simulated execution] plan approved by user');
  modal.classList.add('hidden');
  addMessage('assistant', '✓ Plan approved. (Execution is simulated in this MVP — see DESIGN.md.)');
});

/* ---------- util ---------- */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
