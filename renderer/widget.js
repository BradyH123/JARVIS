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
  // Fast path: "reload/restart yourself" applies self-edited code immediately,
  // without a round-trip to the intent router.
  if (/^\s*(reload|restart|relaunch)\s+(yourself|jarvis|the app)?\s*$/i.test(text)) {
    say('Reloading to apply my new code.', { interrupt: true });
    log('info', 'Relaunching…');
    await api.improve.relaunch();
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
    } else if (routed.action === 'goal') {
      log('info', 'Goal: ' + routed.goal);
      await api.execute({ goal: routed.goal });
    } else if (routed.action === 'self_improve') {
      log('info', '🛠 Improving myself: ' + routed.request);
      say('Editing my own code now. ' + routed.request, { interrupt: true });
      await api.improve.run(routed.request);
    } else if (routed.action === 'set_autonomy') {
      await api.settings.update({ fullControl: routed.enabled });
      const msg = routed.enabled
        ? 'Full Control on — I will act autonomously without asking. Say STOP any time.'
        : 'Full Control off — I will ask before risky actions.';
      log('info', (routed.enabled ? '🔓 ' : '🔒 ') + msg);
      say(msg, { interrupt: true });
      setState('idle', routed.enabled ? 'Full Control ON' : 'Approval mode');
    } else {
      log('think', routed.message || '(no reply)');
      say(routed.message || '');
      setState('idle');
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

/* ---------- voice (click-to-toggle, always-on listening) ---------- */
const micBtn = document.getElementById('wx-mic');
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false; // is the mic armed (user toggled it on)?
let voiceUnavailable = false; // set once we learn STT can't work in this build
if (!SR) {
  micBtn.disabled = true;
  micBtn.title = 'Speech not available in this build — type instead';
} else {
  recognition = new SR();
  recognition.lang = 'en-US';
  recognition.continuous = true; // keep listening across pauses
  recognition.interimResults = false;

  recognition.onresult = (e) => {
    // Ignore input while JARVIS is speaking — otherwise the mic hears his own
    // voice and loops. (STOP is always available via button / global shortcut.)
    if (speech.synth && speech.synth.speaking) return;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (!e.results[i].isFinal) continue;
      const t = e.results[i][0].transcript.trim();
      if (t) runCommand(t);
    }
  };
  // The engine still auto-stops on long silence even in continuous mode —
  // if the user hasn't toggled off, restart so it truly always listens.
  recognition.onend = () => {
    if (listening) {
      try {
        recognition.start();
      } catch {
        /* will retry on next end */
      }
    } else {
      micBtn.classList.remove('listening');
      micBtn.textContent = '🎙';
      if (current === 'listening') setState('idle');
    }
  };
  recognition.onerror = (ev) => {
    // 'no-speech'/'aborted' are benign; onend handles the restart.
    if (ev.error === 'not-allowed') {
      listening = false;
      voiceUnavailable = true;
      micBtn.classList.remove('listening');
      log('warn', 'Microphone permission denied — enable it for the app in System Settings › Privacy › Microphone.');
      say('I need microphone permission. Enable it in System Settings, then click the mic again.', { interrupt: true });
    } else if (ev.error === 'network' || ev.error === 'service-not-allowed') {
      // The real Electron limitation: Chromium's speech recognizer has no cloud
      // backend in this build, so it can't transcribe. Stop the silent retry
      // loop and tell the user plainly instead of pretending to listen.
      listening = false;
      voiceUnavailable = true;
      micBtn.classList.remove('listening');
      micBtn.textContent = '🎙';
      micBtn.title = 'Click to dictate with macOS (Fn Fn), or just type';
      if (current === 'listening') setState('idle', 'Tip: Fn Fn to dictate, or type');
      log('warn', "Built-in voice recognition isn't available (Electron has no speech backend). Use macOS Dictation — press Fn (🌐) twice in the box — or type. Everything else works the same.");
      say("I can't transcribe directly here. Press the fn key twice to dictate into the box.", { interrupt: true });
    } else if (ev.error === 'audio-capture') {
      listening = false;
      voiceUnavailable = true;
      micBtn.classList.remove('listening');
      log('warn', 'No microphone found.');
      say('I could not find a microphone.', { interrupt: true });
    }
  };

  function startListening() {
    if (listening) return;
    if (voiceUnavailable) {
      // Electron can't transcribe, but macOS Dictation can — it types into the
      // focused field. Focus the command box and point the user at it so they
      // still get real voice input with no extra service.
      cmd.focus();
      log('info', '🎙 Use macOS Dictation: press the Fn (🌐) key twice, speak, then Enter. I\'ll do the rest.');
      say('Press the fn key twice to dictate into the box, then hit enter.', { interrupt: true });
      return;
    }
    listening = true;
    micBtn.classList.add('listening');
    micBtn.textContent = '● live';
    try {
      recognition.start();
    } catch {
      /* already started */
    }
    setState('listening');
    say('Listening.', { interrupt: true });
  }
  function stopListening() {
    listening = false;
    micBtn.classList.remove('listening');
    micBtn.textContent = '🎙';
    try {
      recognition.stop();
    } catch {
      /* ignore */
    }
    if (current === 'listening') setState('idle');
  }

  micBtn.addEventListener('click', () => (listening ? stopListening() : startListening()));
  api.onWidgetSummon(() => startListening());
}

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
