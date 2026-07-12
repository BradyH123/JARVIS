'use strict';

/* Shift Scheduler frontend — vanilla JS, no build step.
   State arrives from /api/state and stays fresh via /api/events (SSE). */

// ---------- Client state ----------

let state = null;
let me = localStorage.getItem('ss_me') || null;         // employee id
let managerPin = sessionStorage.getItem('ss_pin') || null; // verified PIN while unlocked
let tab = 'schedule';
let weekOffset = 0;
let myOnly = false;
let identityPrompted = false;

const $ = (sel) => document.querySelector(sel);

// ---------- Small helpers ----------

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v !== undefined && v !== null) node[k] = v;
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

function dayNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function dateFromDayNumber(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function toMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fmtTime12(time) {
  let [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return m === 0 ? `${h} ${suffix}` : `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

function fmtRange(shift) {
  const overnight = toMinutes(shift.end) <= toMinutes(shift.start);
  return `${fmtTime12(shift.start)}–${fmtTime12(shift.end)}${overnight ? ' (+1)' : ''}`;
}

function fmtDate(dateStr, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return new Date(dayNumber(dateStr) * 86400000).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

function describeShift(shift) {
  return `${fmtDate(shift.date)} · ${fmtRange(shift)}`;
}

function ago(ts) {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const employeeById = (id) => state.employees.find((e) => e.id === id);
const shiftById = (id) => state.shifts.find((s) => s.id === id);
const empName = (id) => employeeById(id)?.name || 'Someone';
const empColor = (id) => employeeById(id)?.color || 'var(--muted)';
const openTradeForShift = (shiftId) =>
  state.trades.find((t) => t.shiftId === shiftId && (t.status === 'open' || t.status === 'pending'));

// ---------- API ----------

async function api(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (managerPin) headers['X-Manager-Pin'] = managerPin;
  const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Perform a mutation, sync state, re-render, toast the outcome.
async function act(method, path, body, successMsg) {
  try {
    const res = await api(method, path, body);
    if (res.state) state = res.state;
    render();
    if (successMsg) toast(successMsg, 'ok');
    return res;
  } catch (err) {
    toast(err.message, 'error');
    return null;
  }
}

function toast(message, kind = '') {
  const node = el('div', { class: `toast ${kind}` }, message);
  $('#toastRoot').append(node);
  setTimeout(() => node.remove(), 3600);
}

// ---------- Modal ----------

function closeModal() {
  $('#modalRoot').replaceChildren();
}

function modal(title, subtitle, ...content) {
  const box = el('div', { class: 'modal' },
    el('button', { class: 'close-x', onclick: closeModal, title: 'Close' }, '✕'),
    el('h3', {}, title),
    subtitle ? el('p', { class: 'sub' }, subtitle) : null,
    ...content,
  );
  const backdrop = el('div', {
    class: 'modal-backdrop',
    onclick: (e) => { if (e.target === backdrop) closeModal(); },
  }, box);
  $('#modalRoot').replaceChildren(backdrop);
  return box;
}

// ---------- Identity ----------

function setMe(id) {
  me = id;
  if (id) localStorage.setItem('ss_me', id);
  else localStorage.removeItem('ss_me');
  render();
}

function identityModal(dismissable = true) {
  const box = modal('Who are you?', 'Pick your name so the schedule knows which shifts are yours.');
  for (const emp of state.employees) {
    box.append(el('button', {
      class: 'identity-btn',
      onclick: () => { setMe(emp.id); closeModal(); },
    }, el('span', { class: 'dot', style: `--emp:${emp.color}` }), emp.name));
  }
  if (state.employees.length === 0) {
    box.append(el('p', { class: 'sub' }, 'No employees yet — the manager needs to add the team first.'));
  }
  box.append(el('button', {
    class: 'btn ghost',
    style: 'width:100%;margin-top:6px',
    onclick: () => { closeModal(); pinModal(); },
  }, '🔑 I’m the manager'));
  if (!dismissable) box.querySelector('.close-x').remove();
}

function pinModal() {
  const input = el('input', { type: 'password', placeholder: 'Manager PIN', autocomplete: 'off', inputMode: 'numeric' });
  const box = modal('Manager access', 'Enter the manager PIN to unlock scheduling controls.');
  const submit = async () => {
    const pin = input.value.trim();
    if (!pin) return;
    try {
      managerPin = pin;
      await api('POST', '/api/manager/verify', {});
      sessionStorage.setItem('ss_pin', pin);
      closeModal();
      tab = 'manager';
      render();
      toast('Manager mode unlocked', 'ok');
    } catch {
      managerPin = null;
      toast('Wrong PIN', 'error');
      input.value = '';
      input.focus();
    }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  box.append(
    el('div', { class: 'field' }, input),
    el('div', { class: 'form-actions' },
      el('button', { class: 'btn primary', style: 'flex:1', onclick: submit }, 'Unlock')),
  );
  setTimeout(() => input.focus(), 50);
}

function lockManager() {
  managerPin = null;
  sessionStorage.removeItem('ss_pin');
  if (tab === 'manager') tab = 'schedule';
  render();
  toast('Manager mode locked');
}

function whoMenu() {
  const current = me ? employeeById(me) : null;
  const box = modal('Your profile', null);
  if (current) {
    box.append(el('p', { class: 'sub' }, 'Signed in as ', el('strong', {}, current.name), '.'));
  }
  box.append(el('button', { class: 'identity-btn', onclick: () => { closeModal(); identityModal(); } },
    '👤 ', current ? 'Switch person' : 'Choose who you are'));
  if (current) {
    box.append(el('button', {
      class: 'identity-btn',
      onclick: () => { closeModal(); calendarFeedModal(current); },
    }, '📆 Add my shifts to my phone’s calendar'));
  }
  box.append(el('button', {
    class: 'identity-btn',
    onclick: () => { closeModal(); managerPin ? lockManager() : pinModal(); },
  }, managerPin ? '🔓 Lock manager mode' : '🔑 Manager access'));
}

function calendarFeedModal(emp) {
  const url = `${location.origin}/api/ics?employeeId=${emp.id}`;
  const box = modal('Calendar feed', 'Subscribe to this link in Google Calendar, Apple Calendar, or Outlook and your shifts appear automatically (updates may take a few hours to sync).');
  box.append(
    el('div', { class: 'copy-box' },
      el('code', {}, url),
      el('button', {
        class: 'btn small', onclick: async () => {
          try { await navigator.clipboard.writeText(url); toast('Link copied', 'ok'); }
          catch { toast('Copy failed — long-press the link to copy it', 'error'); }
        },
      }, 'Copy')),
    el('p', { class: 'sub', style: 'margin-top:12px' },
      'Google Calendar: Settings → Add calendar → From URL. iPhone: Settings → Calendar → Accounts → Add Subscribed Calendar.'),
  );
}

// ---------- Schedule view ----------

function weekStartDayNumber() {
  const today = dayNumber(todayStr());
  const dow = new Date(today * 86400000).getUTCDay(); // 0 = Sun
  const startDow = state.settings.weekStart === 'sun' ? 0 : 1;
  const back = (dow - startDow + 7) % 7;
  return today - back + weekOffset * 7;
}

function renderSchedule(view) {
  if (state.employees.length === 0) {
    view.append(el('div', { class: 'card' },
      el('div', { class: 'empty' },
        el('span', { class: 'big' }, '👋'),
        el('strong', {}, 'Welcome to your team schedule!'),
        el('p', {}, 'To get started, unlock the Manager tab and add your team. The default PIN is 1234 — change it in Settings.'),
        el('button', { class: 'btn primary', onclick: () => { managerPin ? (tab = 'manager', render()) : pinModal(); } }, 'Set up my team'),
      )));
    return;
  }

  // Privacy: employees only see days they work, and the coworkers on them.
  const privacy = state.settings.coworkersOnly && !managerPin;
  if (privacy && !me) {
    view.append(el('div', { class: 'card' },
      el('div', { class: 'empty' },
        el('span', { class: 'big' }, '🗓️'),
        el('strong', {}, 'Pick your name to see your schedule'),
        el('p', {}, 'This schedule is private — you’ll see your own shifts and the people working alongside you.'),
        el('button', { class: 'btn primary', onclick: () => identityModal() }, 'Choose who you are'),
      )));
    return;
  }
  const myWorkDays = privacy ? new Set(state.shifts.filter((s) => s.employeeId === me).map((s) => s.date)) : null;

  const start = weekStartDayNumber();
  const today = dayNumber(todayStr());

  const startDate = dateFromDayNumber(start);
  const endDate = dateFromDayNumber(start + 6);
  const label = `${fmtDate(startDate, { month: 'short', day: 'numeric' })} – ${fmtDate(endDate, { month: 'short', day: 'numeric' })}`;

  const controls = el('div', { class: 'week-controls' },
    el('button', { class: 'btn small nav-btn', onclick: () => { weekOffset -= 1; render(); } }, '‹'),
    el('span', { class: 'week-label' }, label),
    el('button', { class: 'btn small nav-btn', onclick: () => { weekOffset += 1; render(); } }, '›'),
    weekOffset !== 0 ? el('button', { class: 'btn small', onclick: () => { weekOffset = 0; render(); } }, 'Today') : null,
    me ? el('button', {
      class: `toggle-chip ${myOnly ? 'on' : ''}`,
      onclick: () => { myOnly = !myOnly; render(); },
    }, myOnly ? '✓ My shifts' : 'My shifts') : null,
    managerPin ? el('button', {
      class: 'btn small',
      title: 'Copy every shift this week to next week',
      onclick: async () => {
        const res = await act('POST', '/api/shifts/copy-week', { fromWeekStart: startDate });
        if (res) toast(`Copied ${res.copied} shift${res.copied === 1 ? '' : 's'} to next week${res.skipped ? ` (${res.skipped} skipped — overlaps)` : ''}`, 'ok');
      },
    }, 'Copy week →') : null,
  );
  view.append(controls);
  if (privacy) {
    view.append(el('p', { class: 'privacy-hint' },
      '🔒 You only see days you work — and who’s working with you.'));
  }

  const grid = el('div', { class: 'week-grid' });
  for (let i = 0; i < 7; i++) {
    const dayNum = start + i;
    const dateStr = dateFromDayNumber(dayNum);
    let dayShifts = state.shifts
      .filter((s) => s.date === dateStr)
      .sort((a, b) => toMinutes(a.start) - toMinutes(b.start) || a.end.localeCompare(b.end));
    if (privacy && !myWorkDays.has(dateStr)) dayShifts = [];
    if (myOnly && me) dayShifts = dayShifts.filter((s) => s.employeeId === me);

    const col = el('div', {
      class: `day-col ${dayNum === today ? 'today' : ''} ${dayNum < today ? 'past' : ''} ${dayShifts.length === 0 && !managerPin ? 'empty-day' : ''}`,
    });
    col.append(el('div', { class: 'day-head' },
      el('span', {}, fmtDate(dateStr, { weekday: 'short' })),
      el('span', { class: 'num' }, String(new Date(dayNum * 86400000).getUTCDate())),
    ));

    for (const s of dayShifts) {
      const trade = openTradeForShift(s.id);
      col.append(el('button', {
        class: `shift-card ${s.employeeId === me ? 'mine' : ''}`,
        style: `--emp:${empColor(s.employeeId)}`,
        onclick: () => shiftModal(s.id),
      },
        el('span', { class: 'time' }, fmtRange(s)),
        el('span', { class: 'who' }, s.employeeId === me ? 'You' : empName(s.employeeId)),
        s.note ? el('span', { class: 'note' }, s.note) : null,
        trade ? el('span', { class: 'flag' }, trade.status === 'pending' ? '⏳ Trade awaiting approval' : '🔁 Up for trade') : null,
      ));
    }
    if (managerPin) {
      col.append(el('button', { class: 'add-slot', onclick: () => addShiftModal(dateStr) }, '＋'));
    }
    grid.append(col);
  }
  view.append(grid);
}

// ---------- Shift modal ----------

function shiftModal(shiftId) {
  const s = shiftById(shiftId);
  if (!s) return;
  const emp = employeeById(s.employeeId);
  const trade = openTradeForShift(s.id);
  const mine = s.employeeId === me;

  const box = modal(
    mine ? 'Your shift' : `${emp ? emp.name : 'Unassigned'}’s shift`,
    null,
    el('ul', { class: 'detail-list' },
      el('li', {}, el('span', { class: 'k' }, 'Who'), el('span', {}, el('span', { class: 'dot', style: `--emp:${empColor(s.employeeId)};margin-right:6px` }), empName(s.employeeId))),
      el('li', {}, el('span', { class: 'k' }, 'When'), fmtDate(s.date, { weekday: 'long', month: 'long', day: 'numeric' })),
      el('li', {}, el('span', { class: 'k' }, 'Hours'), fmtRange(s)),
      s.note ? el('li', {}, el('span', { class: 'k' }, 'Role/Note'), s.note) : null,
      trade ? el('li', {}, el('span', { class: 'k' }, 'Status'), el('span', { class: 'pill warn' }, trade.status === 'pending' ? 'Trade awaiting manager approval' : 'Up for trade')) : null,
    ),
  );

  const actions = el('div', { class: 'trade-actions' });
  if (mine && !trade) {
    actions.append(el('button', {
      class: 'btn primary',
      onclick: async () => {
        closeModal();
        const res = await act('POST', '/api/trades', { shiftId: s.id, employeeId: me }, 'Shift posted to the trade board');
        if (res) { tab = 'trades'; render(); }
      },
    }, '🔁 Put up for trade'));
  }
  if (trade) {
    actions.append(el('button', {
      class: 'btn',
      onclick: () => { closeModal(); tab = 'trades'; render(); },
    }, 'View on trade board'));
  }
  if (managerPin) {
    actions.append(el('button', { class: 'btn', onclick: () => { closeModal(); editShiftModal(s.id); } }, '✎ Edit'));
    actions.append(el('button', {
      class: 'btn danger',
      onclick: async () => {
        if (!confirm('Delete this shift?')) return;
        closeModal();
        await act('DELETE', `/api/shifts/${s.id}`, undefined, 'Shift deleted');
      },
    }, 'Delete'));
  }
  if (actions.children.length) box.append(actions);
}

function shiftFormFields(defaults = {}) {
  const empSel = el('select', {},
    ...state.employees.map((e) => el('option', { value: e.id, selected: e.id === defaults.employeeId }, e.name)));
  const date = el('input', { type: 'date', value: defaults.date || todayStr() });
  const start = el('input', { type: 'time', value: defaults.start || '09:00' });
  const end = el('input', { type: 'time', value: defaults.end || '17:00' });
  const note = el('input', { type: 'text', placeholder: 'e.g. Register, Kitchen…', value: defaults.note || '', maxLength: 120 });
  const grid = el('div', { class: 'form-grid' },
    el('div', { class: 'field' }, el('label', {}, 'Employee'), empSel),
    el('div', { class: 'field' }, el('label', {}, 'Date'), date),
    el('div', { class: 'field' }, el('label', {}, 'Start'), start),
    el('div', { class: 'field' }, el('label', {}, 'End'), end),
    el('div', { class: 'field', style: 'grid-column:1/-1' }, el('label', {}, 'Role / note (optional)'), note),
  );
  return { grid, values: () => ({ employeeId: empSel.value, date: date.value, start: start.value, end: end.value, note: note.value }) };
}

function addShiftModal(dateStr) {
  const box = modal('Add shift', null);
  const form = shiftFormFields({ date: dateStr });
  box.append(form.grid, el('div', { class: 'form-actions' },
    el('button', {
      class: 'btn primary', style: 'flex:1',
      onclick: async () => {
        const res = await act('POST', '/api/shifts', form.values(), 'Shift added');
        if (res) closeModal();
      },
    }, 'Add shift'),
    el('button', {
      class: 'btn',
      onclick: async () => {
        await act('POST', '/api/shifts', form.values(), 'Shift added — add another');
      },
    }, 'Add + another'),
  ));
}

function editShiftModal(shiftId) {
  const s = shiftById(shiftId);
  if (!s) return;
  const box = modal('Edit shift', null);
  const form = shiftFormFields(s);
  box.append(form.grid, el('div', { class: 'form-actions' },
    el('button', {
      class: 'btn primary', style: 'flex:1',
      onclick: async () => {
        const res = await act('PATCH', `/api/shifts/${s.id}`, form.values(), 'Shift updated');
        if (res) closeModal();
      },
    }, 'Save changes'),
  ));
}

// ---------- Trades view ----------

function renderTrades(view) {
  const open = state.trades.filter((t) => t.status === 'open');
  const pending = state.trades.filter((t) => t.status === 'pending');
  const closed = state.trades
    .filter((t) => t.status === 'completed')
    .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0))
    .slice(0, 5);

  if (pending.length) {
    const card = el('div', { class: 'card' },
      el('h2', {}, '⏳ Waiting for manager approval'),
      el('p', { class: 'sub' }, managerPin ? 'Approve or deny these accepted trades.' : 'These trades were accepted and are waiting for the manager.'));
    for (const t of pending) card.append(tradeCard(t));
    view.append(card);
  }

  const openCard = el('div', { class: 'card' },
    el('h2', {}, 'Shift trades'),
    el('p', { class: 'sub' }, 'Tap one of your shifts on the Schedule to post it here.'));
  if (open.length === 0) {
    openCard.append(el('div', { class: 'empty' }, el('span', { class: 'big' }, '🎉'), 'No open trades right now.'));
  } else {
    for (const t of open.slice().sort((a, b) => b.createdAt - a.createdAt)) openCard.append(tradeCard(t));
  }
  view.append(openCard);

  if (closed.length) {
    const hist = el('div', { class: 'card' }, el('h2', {}, 'Recent activity'));
    for (const t of closed) {
      hist.append(el('div', { class: 'history-item' },
        `${t.summary || 'Trade closed.'} `,
        el('span', { style: 'opacity:.7' }, t.resolvedAt ? ago(t.resolvedAt) : '')));
    }
    view.append(hist);
  }
}

function tradeCard(t) {
  const s = shiftById(t.shiftId);
  const ownerName = empName(t.employeeId);
  const mineTrade = t.employeeId === me;

  const card = el('div', { class: 'card trade-card', style: `--emp:${empColor(t.employeeId)}` },
    el('div', { class: 'trade-head' },
      el('span', { class: 'dot', style: `--emp:${empColor(t.employeeId)}` }),
      el('span', { class: 'shift-desc' }, s ? describeShift(s) : 'Shift removed'),
      el('span', {}, mineTrade ? 'your shift' : `${ownerName}’s shift`),
      s && s.note ? el('span', { class: 'pill' }, s.note) : null,
      el('span', { class: 'ago' }, ago(t.createdAt)),
    ),
    t.note ? el('p', { class: 'trade-note' }, `“${t.note}”`) : null,
  );

  // Offers
  for (const o of t.offers) {
    const offered = o.offeredShiftId ? shiftById(o.offeredShiftId) : null;
    const row = el('div', { class: 'offer-row' },
      el('span', { class: 'dot', style: `--emp:${empColor(o.employeeId)}` }),
      el('span', { class: 'desc' },
        el('strong', {}, o.employeeId === me ? 'You' : empName(o.employeeId)),
        offered ? ` offered to swap for ${describeShift(offered)}` : ' offered to cover it (no swap)'),
    );
    if (t.status === 'pending' && o.id === t.acceptedOfferId) {
      row.append(el('span', { class: 'pill ok' }, 'Accepted — awaiting approval'));
    } else if (mineTrade && t.status === 'open') {
      row.append(el('button', {
        class: 'btn small ok',
        onclick: () => act('POST', `/api/trades/${t.id}/accept`, { offerId: o.id, employeeId: me },
          state.settings.requireApproval ? 'Accepted — sent to manager for approval' : 'Trade complete!'),
      }, 'Accept'));
    } else if (o.employeeId === me && t.status === 'open') {
      row.append(el('button', {
        class: 'btn small',
        onclick: () => act('POST', `/api/trades/${t.id}/retract-offer`, { employeeId: me }, 'Offer withdrawn'),
      }, 'Withdraw'));
    }
    card.append(row);
  }
  if (t.offers.length === 0 && t.status === 'open') {
    card.append(el('p', { class: 'sub', style: 'margin:10px 0 0' }, 'No offers yet.'));
  }

  // Actions
  const actions = el('div', { class: 'trade-actions' });
  if (t.status === 'open' && me && !mineTrade && !t.offers.some((o) => o.employeeId === me)) {
    actions.append(
      el('button', {
        class: 'btn primary',
        onclick: () => act('POST', `/api/trades/${t.id}/offers`, { employeeId: me }, `Offered to cover ${ownerName}’s shift`),
      }, 'Cover it'),
      el('button', { class: 'btn', onclick: () => swapPickerModal(t) }, 'Offer swap'),
    );
  }
  if (t.status === 'open' && mineTrade) {
    actions.append(el('button', {
      class: 'btn danger',
      onclick: () => act('POST', `/api/trades/${t.id}/cancel`, { employeeId: me }, 'Trade withdrawn'),
    }, 'Withdraw'));
  }
  if (t.status === 'pending' && managerPin) {
    actions.append(
      el('button', { class: 'btn ok', onclick: () => act('POST', `/api/trades/${t.id}/approve`, {}, 'Trade approved and applied') }, '✓ Approve'),
      el('button', { class: 'btn danger', onclick: () => act('POST', `/api/trades/${t.id}/deny`, {}, 'Trade denied — reopened') }, 'Deny'),
    );
  }
  if (t.status === 'pending' && mineTrade) {
    actions.append(el('button', {
      class: 'btn danger',
      onclick: () => act('POST', `/api/trades/${t.id}/cancel`, { employeeId: me }, 'Trade withdrawn'),
    }, 'Withdraw'));
  }
  if (actions.children.length) card.append(actions);
  return card;
}

function swapPickerModal(t) {
  const target = shiftById(t.shiftId);
  const today = dayNumber(todayStr());
  const candidates = state.shifts
    .filter((s) => s.employeeId === me && s.id !== t.shiftId && dayNumber(s.date) >= today && !openTradeForShift(s.id))
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

  const box = modal('Offer a swap',
    target ? `Pick one of your shifts to give ${empName(t.employeeId)} in exchange for ${describeShift(target)}.` : 'Pick one of your shifts to offer.');
  if (candidates.length === 0) {
    box.append(el('p', { class: 'sub' }, 'You have no upcoming shifts available to swap. You can still offer to cover the shift without a swap.'));
  }
  for (const s of candidates) {
    box.append(el('button', {
      class: 'identity-btn',
      onclick: async () => {
        closeModal();
        await act('POST', `/api/trades/${t.id}/offers`, { employeeId: me, offeredShiftId: s.id }, 'Swap offered');
      },
    }, el('span', { class: 'dot', style: `--emp:${empColor(me)}` }), describeShift(s), s.note ? ` · ${s.note}` : ''));
  }
}

// ---------- Manager view ----------

function renderManager(view) {
  if (!managerPin) {
    view.append(el('div', { class: 'card' },
      el('div', { class: 'empty' },
        el('span', { class: 'big' }, '🔒'),
        el('strong', {}, 'Manager area'),
        el('p', {}, 'Add employees, assign shifts, and approve trades. Unlock with the manager PIN.'),
        el('button', { class: 'btn primary', onclick: pinModal }, 'Unlock'))));
    return;
  }

  // Pending approvals
  const pending = state.trades.filter((t) => t.status === 'pending');
  if (pending.length) {
    const card = el('div', { class: 'card' }, el('h2', {}, `⏳ Trades to approve (${pending.length})`));
    for (const t of pending) card.append(tradeCard(t));
    view.append(card);
  }

  // Employees
  const empCard = el('div', { class: 'card' },
    el('h2', {}, `Team (${state.employees.length})`));
  for (const emp of state.employees) {
    empCard.append(el('div', { class: 'emp-row' },
      el('span', { class: 'dot', style: `--emp:${emp.color}` }),
      el('span', { class: 'name' }, emp.name),
      el('button', { class: 'icon-btn', title: 'Rename', onclick: () => renameModal(emp) }, '✎'),
      el('button', {
        class: 'icon-btn', title: 'Remove',
        onclick: async () => {
          if (!confirm(`Remove ${emp.name}? Their shifts will be deleted too.`)) return;
          await act('DELETE', `/api/employees/${emp.id}`, undefined, `${emp.name} removed`);
        },
      }, '✕'),
    ));
  }
  const nameInput = el('input', { type: 'text', placeholder: 'Add a person…', maxLength: 60 });
  const addEmp = async () => {
    const name = nameInput.value.trim();
    if (!name) return;
    const res = await act('POST', '/api/employees', { name }, `${name} added`);
    if (res) { nameInput.value = ''; nameInput.focus(); }
  };
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addEmp(); });
  empCard.append(el('div', { class: 'inline-row', style: 'margin-top:10px' },
    nameInput, el('button', { class: 'btn primary', onclick: addEmp }, 'Add')));
  view.append(empCard);

  // Share
  view.append(el('div', { class: 'card' },
    el('h2', {}, 'Share with your team'),
    el('p', { class: 'sub' }, 'Post this link in your group chat. To add shifts, tap ＋ on any day in the Schedule.'),
    el('div', { class: 'copy-box' },
      el('code', {}, location.origin),
      el('button', {
        class: 'btn small', onclick: async () => {
          try { await navigator.clipboard.writeText(location.origin); toast('Link copied', 'ok'); }
          catch { toast('Copy failed', 'error'); }
        },
      }, 'Copy')),
  ));

  // Settings (collapsed by default)
  const bizInput = el('input', {
    type: 'text', value: state.settings.businessName, maxLength: 80,
    onchange: () => act('PATCH', '/api/settings', { businessName: bizInput.value }, 'Saved'),
  });
  const approvalCheck = el('input', {
    type: 'checkbox', checked: state.settings.requireApproval,
    onchange: () => act('PATCH', '/api/settings', { requireApproval: approvalCheck.checked },
      approvalCheck.checked ? 'Trades now need your approval' : 'Trades apply instantly now'),
  });
  const privacyCheck = el('input', {
    type: 'checkbox', checked: state.settings.coworkersOnly,
    onchange: () => act('PATCH', '/api/settings', { coworkersOnly: privacyCheck.checked },
      privacyCheck.checked ? 'Employees now only see days they work' : 'Everyone can see the full schedule now'),
  });
  const weekSel = el('select', { onchange: () => act('PATCH', '/api/settings', { weekStart: weekSel.value }, 'Week start updated') },
    el('option', { value: 'mon', selected: state.settings.weekStart === 'mon' }, 'Monday'),
    el('option', { value: 'sun', selected: state.settings.weekStart === 'sun' }, 'Sunday'));
  const pinInput = el('input', { type: 'password', placeholder: 'New PIN (4+ characters)', autocomplete: 'new-password' });

  view.append(el('div', { class: 'card' },
    el('details', {},
      el('summary', {}, 'Settings'),
      el('div', { class: 'settings-body' },
        el('div', { class: 'form-grid' },
          el('div', { class: 'field' }, el('label', {}, 'Business name'), bizInput),
          el('div', { class: 'field' }, el('label', {}, 'Week starts on'), weekSel),
        ),
        el('label', { class: 'check-row', style: 'margin-top:8px' }, approvalCheck,
          el('span', {}, 'Require my approval for trades', el('span', { class: 'hint' }, 'Accepted trades wait for you before the schedule changes.'))),
        el('label', { class: 'check-row' }, privacyCheck,
          el('span', {}, 'Employees only see days they work', el('span', { class: 'hint' }, 'Each person sees their own shifts plus whoever works alongside them. You always see everything.'))),
        el('div', { class: 'inline-row', style: 'margin-top:8px' },
          pinInput,
          el('button', {
            class: 'btn', onclick: async () => {
              const res = await act('PATCH', '/api/settings', { newPin: pinInput.value }, 'PIN changed');
              if (res) { managerPin = pinInput.value.trim(); sessionStorage.setItem('ss_pin', managerPin); pinInput.value = ''; }
            },
          }, 'Change PIN')),
      ),
    ),
  ));
}

function renameModal(emp) {
  const input = el('input', { type: 'text', value: emp.name, maxLength: 60 });
  const box = modal(`Rename ${emp.name}`, null);
  const save = async () => {
    const res = await act('PATCH', `/api/employees/${emp.id}`, { name: input.value }, 'Renamed');
    if (res) closeModal();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  box.append(el('div', { class: 'field' }, input),
    el('div', { class: 'form-actions' }, el('button', { class: 'btn primary', style: 'flex:1', onclick: save }, 'Save')));
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

// ---------- Render root ----------

function render() {
  if (!state) return;

  // If our selected employee was removed, reset identity.
  if (me && !employeeById(me)) setMe(null);

  document.title = `${state.settings.businessName} — Schedule`;
  $('#bizName').textContent = state.settings.businessName;

  const current = me ? employeeById(me) : null;
  $('#whoChip').textContent = current ? current.name : (managerPin ? 'Manager' : 'Who are you?');

  const openCount = state.trades.filter((t) => t.status === 'open').length +
    (managerPin ? state.trades.filter((t) => t.status === 'pending').length : 0);
  const badge = $('#tradeBadge');
  badge.classList.toggle('hidden', openCount === 0);
  badge.textContent = String(openCount);

  for (const btn of document.querySelectorAll('.tab')) {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  }

  const view = $('#view');
  view.replaceChildren();
  if (tab === 'schedule') renderSchedule(view);
  else if (tab === 'trades') renderTrades(view);
  else renderManager(view);
}

// ---------- Boot ----------

function connectEvents() {
  const es = new EventSource('/api/events');
  es.onopen = () => $('#liveDot').classList.remove('off');
  es.onerror = () => $('#liveDot').classList.add('off'); // EventSource auto-reconnects
  es.onmessage = (e) => {
    try {
      state = JSON.parse(e.data);
      render();
    } catch { /* ignore malformed frame */ }
  };
}

async function boot() {
  for (const btn of document.querySelectorAll('.tab')) {
    btn.addEventListener('click', () => { tab = btn.dataset.tab; render(); });
  }
  $('#whoChip').addEventListener('click', whoMenu);

  const res = await fetch('/api/state').then((r) => r.json());
  state = res.state;

  // Re-verify a remembered PIN (it may have been changed elsewhere).
  if (managerPin) {
    try { await api('POST', '/api/manager/verify', {}); }
    catch { managerPin = null; sessionStorage.removeItem('ss_pin'); }
  }

  render();
  connectEvents();

  if (!me && !managerPin && state.employees.length > 0 && !identityPrompted) {
    identityPrompted = true;
    identityModal();
  }
}

boot().catch((err) => {
  document.body.innerHTML = `<p style="padding:40px;text-align:center">Couldn’t load the schedule (${err.message}). Refresh to try again.</p>`;
});
