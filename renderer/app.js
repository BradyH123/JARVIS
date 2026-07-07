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
    if (tab.dataset.tab === 'watch') api.watch.status().then(renderWatchStatus);
    if (tab.dataset.tab === 'workflows') loadWorkflows();
  });
});

/* ---------- config banner ---------- */
async function showConfig() {
  try {
    const info = await api.configInfo();
    const el = document.getElementById('config-status');
    if (!info.hasKey) {
      el.textContent = '⚠ no API key — click ⚙ to add one';
      el.style.color = 'var(--danger)';
    } else {
      const control = info.canControl ? '🖱 control ready' : '⚠ no OS control';
      el.textContent = `model: ${info.model} · ${control}`;
      el.style.color = info.canControl ? '' : '#ffcc66';
    }
  } catch (e) {
    /* ignore */
  }
}
showConfig();

/* ---------- settings panel ---------- */
const settingsModal = document.getElementById('settings-modal');

async function openSettings() {
  const s = await api.settings.get();
  document.getElementById('set-key').value = '';
  document.getElementById('set-model').value = s.model || '';
  document.getElementById('set-cu-model').value =
    s.computerUseModel && s.computerUseModel !== s.model ? s.computerUseModel : '';
  document.getElementById('set-maxsteps').value = s.maxSteps || 40;
  document.getElementById('set-paranoid').checked = Boolean(s.confirmEvery);
  document.getElementById('set-fullcontrol').checked = Boolean(s.fullControl);
  const modes = {
    encrypted: '🔒 key stored encrypted (OS keychain)',
    plaintext: '⚠ key stored unencrypted (no OS keychain available)',
    env: 'key loaded from environment (.env)',
    none: 'no key set yet',
  };
  document.getElementById('set-storage').textContent = modes[s.keyStorageMode] || '';
  document.getElementById('set-key-status').textContent = s.hasKey ? 'A key is currently set.' : '';
  settingsModal.classList.remove('hidden');
}

document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('set-cancel').addEventListener('click', () => settingsModal.classList.add('hidden'));

document.getElementById('set-save').addEventListener('click', async () => {
  const patch = {
    model: document.getElementById('set-model').value.trim(),
    computerUseModel: document.getElementById('set-cu-model').value.trim(),
    maxSteps: Number(document.getElementById('set-maxsteps').value) || 40,
    confirmEvery: document.getElementById('set-paranoid').checked,
    fullControl: document.getElementById('set-fullcontrol').checked,
  };
  const key = document.getElementById('set-key').value.trim();
  if (key) patch.apiKey = key;
  await api.settings.update(patch);
  settingsModal.classList.add('hidden');
  showConfig();
});

document.getElementById('set-test').addEventListener('click', async () => {
  const status = document.getElementById('set-key-status');
  const key = document.getElementById('set-key').value.trim();
  status.textContent = 'Testing…';
  // Save the key first if the user typed a new one, so the test uses it.
  if (key) await api.settings.update({ apiKey: key });
  const res = await api.settings.testKey();
  status.textContent = res.ok ? '✓ Key works.' : '✗ ' + (res.message || 'Key test failed.');
  if (key) document.getElementById('set-storage').textContent =
    (await api.settings.get()).keyStorageMode === 'encrypted'
      ? '🔒 key stored encrypted (OS keychain)'
      : '⚠ key stored unencrypted';
});

/* ---------- first-run onboarding ---------- */
const onboardModal = document.getElementById('onboard-modal');

function permGuidance(info) {
  if (info.isWayland) {
    return '⚠ You appear to be on Wayland. Mouse/keyboard control needs an X11 session — ' +
      'log in with "Xorg"/"X11" to enable control.';
  }
  if (info.platform === 'darwin') {
    return 'macOS: System Settings → Privacy & Security → enable this app under both ' +
      'Screen Recording and Accessibility, then re-check.';
  }
  if (info.platform === 'win32') return 'Windows: no extra permission needed — just re-check.';
  return 'Linux (X11): ensure libxtst is installed, then re-check.';
}

async function refreshControl(controlEl) {
  const info = await api.configInfo();
  if (info.canControl) {
    controlEl.textContent = '🖱 control ready';
    controlEl.style.color = 'var(--ok)';
  } else {
    controlEl.textContent = '⚠ no control yet';
    controlEl.style.color = '#ffcc66';
  }
  return info;
}

async function maybeOnboard() {
  const info = await api.configInfo();
  document.getElementById('ob-perms').textContent = permGuidance(info);
  if (info.hasKey) return; // already set up
  onboardModal.classList.remove('hidden');
  const startBtn = document.getElementById('ob-start');

  document.getElementById('ob-test').addEventListener('click', async () => {
    const status = document.getElementById('ob-key-status');
    const key = document.getElementById('ob-key').value.trim();
    if (!key) return (status.textContent = 'Paste your key first.');
    status.textContent = 'Testing…';
    await api.settings.update({ apiKey: key });
    startBtn.disabled = false; // key is saved; allow proceeding regardless of test flakiness
    const res = await api.settings.testKey();
    status.textContent = res.ok
      ? '✓ Key works and is saved (encrypted).'
      : '✗ ' + (res.message || 'Key test failed') + ' — key is still saved; you can continue.';
    showConfig();
  });

  document.getElementById('ob-recheck').addEventListener('click', () =>
    refreshControl(document.getElementById('ob-control'))
  );
  document.getElementById('ob-start').addEventListener('click', () => {
    onboardModal.classList.add('hidden');
  });
}
maybeOnboard();

// The widget can open the dashboard focused on a specific tab.
if (api.onFocusTab) {
  api.onFocusTab((tab) => {
    const btn = document.querySelector(`.tab[data-tab="${tab}"]`);
    if (btn) btn.click();
  });
}

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
    case 'step-started':
      logRun('step', `▸ Step ${evt.index + 1}/${evt.total}: ${evt.label}`);
      break;
    case 'step-finished':
      logRun(evt.status === 'done' ? 'info' : 'warn', `  step ${evt.index + 1} → ${evt.status}`);
      break;
    case 'permission':
      logRun('perm', `⏸ needs approval (${evt.risk || 'medium'}): ${evt.summary || ''}`);
      break;
    case 'confirm-request':
      showConfirm(evt);
      break;
    case 'permission-result':
      hideConfirm();
      logRun(evt.approved ? 'info' : 'warn', evt.approved ? '✓ approved' : '✗ denied');
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
      runStatus.textContent = '✓ done';
      runStatus.className = 'run-status done';
      if (evt.message) logRun('info', '✓ ' + evt.message);
      break;
    case 'finished': {
      const s = evt.status || 'done';
      if (s === 'done') {
        runStatus.textContent = '✓ done';
        runStatus.className = 'run-status done';
      } else {
        runStatus.textContent = '■ ' + s;
        runStatus.className = 'run-status stopped';
      }
      if (evt.message) logRun(s === 'done' ? 'info' : 'warn', evt.message);
      break;
    }
    default:
      break;
  }
});

/* ---------- voice control (emulates realtime voice → intent → action) ---------- */
const micBtn = document.getElementById('btn-mic');
const voiceHint = document.getElementById('voice-hint');
let recognition = null;
let listening = false;

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) {
  micBtn.disabled = true;
  micBtn.title = 'Speech recognition not available in this build — type instead';
  voiceHint.innerHTML =
    '🎙 Speech capture isn’t available in this Electron build. You can still type in the box and ' +
    'press Send to chat, or use the Skills tab to run a skill. See README for enabling speech-to-text.';
} else {
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript.trim();
    chatText.value = transcript;
    runCommand(transcript);
  };
  recognition.onerror = (e) => {
    voiceHint.textContent = 'Voice error: ' + e.error;
  };
  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎙';
  };

  micBtn.addEventListener('click', () => {
    if (listening) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
      listening = true;
      micBtn.classList.add('listening');
      micBtn.textContent = '● listening…';
    } catch (err) {
      voiceHint.textContent = 'Could not start mic: ' + err.message;
    }
  });
}

/**
 * Route a command (spoken or typed) to an action: run a skill, run a one-off
 * goal, or reply. Skills/goals go straight into the gated run overlay — the
 * per-step approval gate still protects risky actions.
 */
async function runCommand(text) {
  addMessage('user', '🎙 ' + text);
  const thinking = document.createElement('div');
  thinking.className = 'msg assistant';
  thinking.textContent = 'routing…';
  chatLog.appendChild(thinking);
  try {
    const routed = await api.command(text);
    thinking.remove();
    if (routed.action === 'skill') {
      addMessage('assistant', `Running skill: ${routed.skill_name || routed.skill_id}`);
      startRun({ skillId: routed.skill_id, goal: routed.skill_name });
    } else if (routed.action === 'workflow') {
      addMessage('assistant', `Running workflow: ${routed.workflow_name || routed.workflow_id}`);
      startWorkflowRun(routed.workflow_id, routed.workflow_name);
    } else if (routed.action === 'goal') {
      addMessage('assistant', `On it — working toward: ${routed.goal}`);
      startRun({ goal: routed.goal });
    } else {
      addMessage('assistant', routed.message || '(no reply)');
    }
  } catch (e) {
    thinking.remove();
    addMessage('assistant', 'Error: ' + e.message);
  }
}

/* ---------- risky-action confirmation ---------- */
const confirmBox = document.getElementById('confirm-box');
const confirmMsg = document.getElementById('confirm-msg');
let pendingConfirmId = null;

function showConfirm(evt) {
  pendingConfirmId = evt.id;
  confirmMsg.innerHTML =
    `<strong class="risk-${evt.risk || 'medium'}">Approval needed (${escapeHtml(evt.risk || 'medium')} risk)</strong><br>` +
    escapeHtml(evt.summary || 'The assistant wants to perform a sensitive action.');
  confirmBox.classList.remove('hidden');
}
function hideConfirm() {
  confirmBox.classList.add('hidden');
  pendingConfirmId = null;
}
async function answerConfirm(approved) {
  if (!pendingConfirmId) return;
  await api.confirm({ id: pendingConfirmId, approved });
  hideConfirm();
}
document.getElementById('confirm-approve').addEventListener('click', () => answerConfirm(true));
document.getElementById('confirm-deny').addEventListener('click', () => answerConfirm(false));

/* ---------- watch tab (Phase 2) ---------- */
const watchToggle = document.getElementById('watch-toggle');
const watchPause = document.getElementById('watch-pause');
const watchMeta = document.getElementById('watch-meta');
const watchThumb = document.getElementById('watch-thumb');
const watchEmpty = document.getElementById('watch-empty');
let watching = false;
let watchPaused = false;

function renderWatchStatus(s) {
  watching = s.active;
  watchPaused = s.paused;
  watchToggle.textContent = s.active ? '■ Stop watching' : '▶ Start watching';
  watchToggle.classList.toggle('on', s.active);
  watchPause.disabled = !s.active;
  watchPause.textContent = s.paused ? 'Resume' : 'Pause';
  watchMeta.textContent = s.active
    ? `${s.paused ? 'paused' : 'watching'} · ${s.count}/${s.maxFrames} frames buffered`
    : 'off';
  if (s.latest) {
    watchThumb.src = s.latest;
    watchThumb.style.display = 'block';
    watchEmpty.style.display = 'none';
  } else {
    watchThumb.style.display = 'none';
    watchEmpty.style.display = 'block';
  }
}

watchToggle.addEventListener('click', async () => {
  renderWatchStatus(watching ? await api.watch.stop() : await api.watch.start());
});
watchPause.addEventListener('click', async () => {
  renderWatchStatus(watchPaused ? await api.watch.resume() : await api.watch.pause());
});
api.onWatchEvent((s) => renderWatchStatus(s));

// Turn buffered recent activity into a skill: pull frames, jump to Teach.
document.getElementById('watch-teach-btn').addEventListener('click', async () => {
  const n = Number(document.getElementById('watch-frames-n').value) || 12;
  const recent = await api.watch.recent(n);
  if (!recent || !recent.length) {
    watchMeta.textContent = 'nothing buffered yet — start watching first';
    return;
  }
  frames = recent.slice();
  framesStrip.innerHTML = '';
  recent.forEach((src) => {
    const img = document.createElement('img');
    img.src = src;
    framesStrip.appendChild(img);
  });
  nameBlock.classList.remove('hidden');
  recordMeta.textContent = `${recent.length} frame(s) pulled from watch buffer — name it below`;
  document.querySelector('.tab[data-tab="record"]').click();
});

/* ---------- workflows (Phase 3) ---------- */
let wfSteps = []; // builder state: [{type:'skill', skill_id, label} | {type:'goal', goal, label}]

async function loadWorkflows() {
  // Populate the skill picker.
  const select = document.getElementById('wf-skill-select');
  const skills = await api.skills.list();
  select.innerHTML = '<option value="">— pick a taught skill —</option>';
  skills.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  });
  // Render saved workflows.
  const list = document.getElementById('wf-list');
  const wfs = await api.workflows.list();
  if (!wfs.length) {
    list.innerHTML = '<p class="muted">No workflows yet. Build one above.</p>';
    return;
  }
  list.innerHTML = '';
  wfs.forEach((w) => list.appendChild(renderWorkflow(w)));
}

function renderWorkflowSteps() {
  const ol = document.getElementById('wf-steps');
  ol.innerHTML = '';
  wfSteps.forEach((step, i) => {
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="wf-step-label"><span class="wf-kind">[${step.type}]</span> ${escapeHtml(step.label)}</span>`;
    const rm = document.createElement('button');
    rm.className = 'danger';
    rm.textContent = '✕';
    rm.addEventListener('click', () => {
      wfSteps.splice(i, 1);
      renderWorkflowSteps();
    });
    li.appendChild(rm);
    ol.appendChild(li);
  });
}

document.getElementById('wf-add-skill').addEventListener('click', () => {
  const select = document.getElementById('wf-skill-select');
  if (!select.value) return;
  wfSteps.push({ type: 'skill', skill_id: select.value, label: select.options[select.selectedIndex].text });
  renderWorkflowSteps();
});
document.getElementById('wf-add-goal').addEventListener('click', () => {
  const input = document.getElementById('wf-goal-input');
  const goal = input.value.trim();
  if (!goal) return;
  wfSteps.push({ type: 'goal', goal, label: goal });
  input.value = '';
  renderWorkflowSteps();
});
document.getElementById('wf-save').addEventListener('click', async () => {
  const name = document.getElementById('wf-name').value.trim();
  const status = document.getElementById('wf-save-status');
  if (!name) return (status.textContent = 'Give the workflow a name.');
  if (!wfSteps.length) return (status.textContent = 'Add at least one step.');
  const steps = wfSteps.map((s) => (s.type === 'skill' ? { type: 'skill', skill_id: s.skill_id } : { type: 'goal', goal: s.goal }));
  await api.workflows.save({
    name,
    description: document.getElementById('wf-desc').value.trim(),
    trigger_phrases: [name.toLowerCase()],
    steps,
  });
  status.textContent = '✓ Saved.';
  document.getElementById('wf-name').value = '';
  document.getElementById('wf-desc').value = '';
  wfSteps = [];
  renderWorkflowSteps();
  loadWorkflows();
});

function renderWorkflow(w) {
  const el = document.createElement('div');
  el.className = 'skill';
  const steps = (w.steps || [])
    .map((s) => `<li>${s.type === 'skill' ? '[skill] ' + escapeHtml(s.skill_id) : '[goal] ' + escapeHtml(s.goal || '')}</li>`)
    .join('');
  el.innerHTML = `
    <div class="skill-head">
      <span class="name">${escapeHtml(w.name)}</span>
      <span class="muted">${(w.steps || []).length} step(s)</span>
    </div>
    <div class="skill-body">
      <p>${escapeHtml(w.description || '')}</p>
      <ol>${steps}</ol>
      <div class="skill-actions">
        <button class="run">Run workflow</button>
        <button class="danger del">Delete</button>
      </div>
    </div>`;
  el.querySelector('.skill-head').addEventListener('click', () => el.classList.toggle('open'));
  el.querySelector('.run').addEventListener('click', () => startWorkflowRun(w.id, w.name));
  el.querySelector('.del').addEventListener('click', async () => {
    await api.workflows.remove(w.id);
    loadWorkflows();
  });
  return el;
}

async function startWorkflowRun(workflowId, name) {
  runOverlay.classList.remove('hidden');
  runLog.innerHTML = '';
  runStatus.textContent = '● running';
  runStatus.className = 'run-status running';
  runGoal.textContent = 'Workflow: ' + (name || '');
  logRun('info', 'Starting workflow — the assistant now controls your mouse & keyboard.');
  try {
    const res = await api.workflows.run(workflowId);
    if (res && res.status === 'busy') logRun('warn', 'A run is already in progress.');
    if (res && res.status === 'error') logRun('error', res.message || 'Error');
  } catch (e) {
    logRun('error', e.message);
  }
}

/* ---------- util ---------- */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
