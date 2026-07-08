'use strict';

/**
 * Activity window — a live, readable view of what JARVIS is actually doing.
 *
 * Subscribes to the same agent:event stream the widget uses, but renders it as
 * a full timeline with per-event icons/timestamps, and keeps a "Running now"
 * panel of active tasks (ongoing / background / advisor / a foreground run) with
 * step progress. This is the "better interface to see what JARVIS is doing".
 */

const api = window.assistant || {};
const body = document.body;
const nowEl = document.getElementById('now');
const feed = document.getElementById('feed');
const taskList = document.getElementById('tasklist');
const autoscroll = document.getElementById('autoscroll');
document.getElementById('clear').addEventListener('click', () => {
  feed.innerHTML = '';
});

// Pin: keep the monitor above everything so it's watchable at all times.
const pinBtn = document.getElementById('pin');
function renderPin(on) {
  pinBtn.classList.toggle('on', !!on);
  pinBtn.textContent = on ? '📌 Pinned' : '📌 Pin';
}
if (pinBtn && api.toggleActivityOnTop) {
  pinBtn.addEventListener('click', async () => {
    const r = await api.toggleActivityOnTop();
    renderPin(r && r.onTop);
  });
  if (api.onActivityOnTop) api.onActivityOnTop(renderPin);
}

const MAX_ROWS = 500;
const tasks = new Map(); // id -> { name, meta, kind, pct, active, startedAt }

function hhmm() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
}

function setState(s) {
  body.dataset.state = s;
}

function icon(kind) {
  return (
    {
      started: '▶',
      thinking: '🧠',
      action: '➤',
      log: '·',
      'step-started': '▸',
      'step-finished': '✔',
      permission: '⏸',
      'permission-result': '☑',
      done: '✓',
      finished: '■',
      error: '✗',
      aborted: '⛔',
      max_steps: '⌛',
      'ongoing-started': '♾',
      'ongoing-cycle': '↻',
      'ongoing-finding': '📝',
      'ongoing-finishing': '✨',
      'ongoing-finished': '✅',
    }[kind] || '·'
  );
}

function rowClass(kind) {
  if (kind === 'started' || kind === 'ongoing-started') return 'started';
  if (kind === 'thinking') return 'think';
  if (kind === 'action' || kind === 'log') return 'action';
  if (kind === 'step-started' || kind === 'step-finished' || kind === 'ongoing-cycle') return 'step';
  if (kind === 'done' || kind === 'finished' || kind === 'ongoing-finished') return 'done';
  if (kind === 'error' || kind === 'aborted') return 'error';
  return 'action';
}

function addRow(kind, text, tag) {
  if (!text) return;
  const row = document.createElement('div');
  row.className = 'row ' + rowClass(kind);
  row.innerHTML =
    `<span class="time">${hhmm()}</span>` +
    `<span class="ico">${icon(kind)}</span>` +
    `<span class="txt"></span>`;
  row.querySelector('.txt').textContent = String(text) + '';
  if (tag) {
    const t = document.createElement('span');
    t.className = 'tag';
    t.textContent = tag;
    row.querySelector('.txt').appendChild(t);
  }
  feed.appendChild(row);
  while (feed.childNodes.length > MAX_ROWS) feed.removeChild(feed.firstChild);
  if (autoscroll.checked) feed.scrollTop = feed.scrollHeight;
}

function renderTasks() {
  taskList.innerHTML = '';
  if (!tasks.size) {
    taskList.innerHTML = '<div class="empty">Nothing running.</div>';
    return;
  }
  for (const t of [...tasks.values()].reverse()) {
    const el = document.createElement('div');
    el.className = 'task' + (t.active ? ' active' : '');
    el.innerHTML =
      `<div class="t-name"></div><div class="t-meta"></div>` +
      (t.pct != null ? `<div class="bar"><i style="width:${Math.max(0, Math.min(100, t.pct))}%"></i></div>` : '');
    el.querySelector('.t-name').textContent = t.name;
    el.querySelector('.t-meta').textContent = t.meta || '';
    taskList.appendChild(el);
  }
}

// Foreground and background runs are broadcast on the SAME event channel and
// can run in parallel, so they need SEPARATE slots — keyed by nature, not one
// shared id (which would orphan tasks and leak the Map). Ongoing tasks get
// their own id-keyed slots.
function runKey(evt) {
  return evt && evt.background ? 'bg' : 'fg';
}
function upsertTask(id, patch) {
  const cur = tasks.get(id) || {};
  tasks.set(id, { ...cur, ...patch });
  renderTasks();
}
function dropTask(id) {
  tasks.delete(id);
  renderTasks();
}

if (api.onAgentEvent) {
  api.onAgentEvent((evt) => {
    const bg = evt.background ? 'background' : '';
    switch (evt.type) {
      case 'started': {
        setState('running');
        nowEl.textContent = evt.goal || 'Working…';
        upsertTask(runKey(evt), { name: evt.goal || 'Task', meta: bg || 'running', active: true, pct: null });
        addRow('started', evt.goal || 'Started', bg || undefined);
        break;
      }
      case 'thinking':
        nowEl.textContent = evt.text.slice(0, 120);
        addRow('thinking', evt.text);
        break;
      case 'action':
        nowEl.textContent = evt.detail || evt.action || 'Working…';
        addRow('action', evt.detail || evt.action);
        break;
      case 'log':
        addRow('log', evt.text);
        break;
      case 'step-started':
        upsertTask(runKey(evt), { meta: `step ${evt.index + 1}/${evt.total}`, pct: ((evt.index) / evt.total) * 100, active: true });
        nowEl.textContent = `(${evt.index + 1}/${evt.total}) ${evt.label || ''}`;
        addRow('step-started', `Step ${evt.index + 1}/${evt.total}: ${evt.label || ''}`);
        break;
      case 'step-finished':
        upsertTask(runKey(evt), { pct: ((evt.index + 1) / (evt.total || evt.index + 1)) * 100 });
        addRow('step-finished', evt.label || `Step ${evt.index + 1} ${evt.status || 'done'}`);
        break;
      case 'permission':
        addRow('permission', 'Needs approval: ' + (evt.summary || ''));
        break;
      case 'done':
        addRow('done', evt.message || 'Done.');
        break;
      case 'finished':
        setState(evt.status === 'error' ? 'error' : 'done');
        nowEl.textContent = evt.status === 'error' ? 'Error' : 'Idle';
        dropTask(runKey(evt));
        break;
      case 'error':
        setState('error');
        addRow('error', evt.message || 'Error');
        break;
      case 'aborted':
        addRow('aborted', 'Stopped.');
        dropTask(runKey(evt));
        break;
      // Ongoing ("always online") tasks get their own persistent slot.
      case 'ongoing-started':
        upsertTask('og:' + evt.id, { name: '♾ ' + (evt.goal || 'Ongoing'), meta: 'ongoing', active: true, pct: null });
        addRow('ongoing-started', 'Ongoing: ' + (evt.goal || ''));
        break;
      case 'ongoing-cycle':
        upsertTask('og:' + evt.id, { meta: `cycle ${evt.cycle} · ${evt.angle || ''}`.slice(0, 60), active: true });
        addRow('ongoing-cycle', `Cycle ${evt.cycle}: ${evt.angle || ''}`);
        break;
      case 'ongoing-finding':
        addRow('ongoing-finding', evt.summary || 'found something');
        break;
      case 'ongoing-finishing':
        upsertTask('og:' + evt.id, { meta: 'polishing report…' });
        addRow('ongoing-finishing', 'Polishing the report…');
        break;
      case 'ongoing-finished':
        addRow('ongoing-finished', `Finished after ${evt.cycles} cycle(s).`);
        dropTask('og:' + evt.id);
        break;
      default:
        break;
    }
  });
}

setState('idle');
