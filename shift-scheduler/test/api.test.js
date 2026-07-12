'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createServer } = require('../server.js');

let app;
let base;
const PIN = '9999';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'shift-test-'));

before(async () => {
  app = createServer({ dataDir, managerPin: PIN });
  const port = await app.listen(0);
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function call(method, pathname, body, { pin } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (pin) headers['X-Manager-Pin'] = pin;
  const res = await fetch(base + pathname, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const mgr = { pin: PIN };
const ids = {}; // filled in as tests run

test('manager auth is enforced', async () => {
  const denied = await call('POST', '/api/employees', { name: 'Alice' });
  assert.strictEqual(denied.status, 403);
  const wrongPin = await call('POST', '/api/employees', { name: 'Alice' }, { pin: '0000' });
  assert.strictEqual(wrongPin.status, 403);
  const verify = await call('POST', '/api/manager/verify', {}, mgr);
  assert.strictEqual(verify.status, 200);
});

test('manager can add employees; duplicates rejected', async () => {
  for (const name of ['Alice', 'Bob', 'Cara']) {
    const res = await call('POST', '/api/employees', { name }, mgr);
    assert.strictEqual(res.status, 200);
    ids[name] = res.data.employee.id;
  }
  const dup = await call('POST', '/api/employees', { name: 'alice' }, mgr);
  assert.strictEqual(dup.status, 409);
});

test('manager can create shifts; overlaps rejected', async () => {
  const mk = (employeeId, date, start, end) =>
    call('POST', '/api/shifts', { employeeId, date, start, end }, mgr);

  const a = await mk(ids.Alice, '2026-07-20', '09:00', '17:00');
  assert.strictEqual(a.status, 200);
  ids.aliceShift = a.data.shift.id;

  const b = await mk(ids.Bob, '2026-07-21', '10:00', '18:00');
  assert.strictEqual(b.status, 200);
  ids.bobShift = b.data.shift.id;

  const c = await mk(ids.Cara, '2026-07-22', '12:00', '20:00');
  assert.strictEqual(c.status, 200);
  ids.caraShift = c.data.shift.id;

  const clash = await mk(ids.Alice, '2026-07-20', '16:00', '22:00');
  assert.strictEqual(clash.status, 409);
  assert.match(clash.data.error, /overlap/i);

  const badTime = await call('POST', '/api/shifts', { employeeId: ids.Alice, date: '2026-07-25', start: '25:00', end: '17:00' }, mgr);
  assert.strictEqual(badTime.status, 400);
});

test('overnight shifts overlap across midnight', async () => {
  const night = await call('POST', '/api/shifts',
    { employeeId: ids.Alice, date: '2026-07-23', start: '22:00', end: '02:00' }, mgr);
  assert.strictEqual(night.status, 200);
  // 01:00–03:00 the next day overlaps the tail of the overnight shift.
  const clash = await call('POST', '/api/shifts',
    { employeeId: ids.Alice, date: '2026-07-24', start: '01:00', end: '03:00' }, mgr);
  assert.strictEqual(clash.status, 409);
  await call('DELETE', `/api/shifts/${night.data.shift.id}`, undefined, mgr);
});

test('employees can only trade their own shifts', async () => {
  const res = await call('POST', '/api/trades', { shiftId: ids.aliceShift, employeeId: ids.Bob });
  assert.strictEqual(res.status, 403);
});

test('swap trade: post → offer → accept reassigns both shifts', async () => {
  const posted = await call('POST', '/api/trades', { shiftId: ids.aliceShift, employeeId: ids.Alice });
  assert.strictEqual(posted.status, 200);
  const tradeId = posted.data.trade.id;

  const dupPost = await call('POST', '/api/trades', { shiftId: ids.aliceShift, employeeId: ids.Alice });
  assert.strictEqual(dupPost.status, 409);

  const offer = await call('POST', `/api/trades/${tradeId}/offers`,
    { employeeId: ids.Bob, offeredShiftId: ids.bobShift });
  assert.strictEqual(offer.status, 200);

  // Only the owner can accept.
  const notOwner = await call('POST', `/api/trades/${tradeId}/accept`,
    { offerId: offer.data.offer.id, employeeId: ids.Bob });
  assert.strictEqual(notOwner.status, 403);

  const accepted = await call('POST', `/api/trades/${tradeId}/accept`,
    { offerId: offer.data.offer.id, employeeId: ids.Alice });
  assert.strictEqual(accepted.status, 200);

  const shifts = accepted.data.state.shifts;
  assert.strictEqual(shifts.find((s) => s.id === ids.aliceShift).employeeId, ids.Bob);
  assert.strictEqual(shifts.find((s) => s.id === ids.bobShift).employeeId, ids.Alice);
  const trade = accepted.data.state.trades.find((t) => t.id === tradeId);
  assert.strictEqual(trade.status, 'completed');
  assert.match(trade.summary, /swapped/);
});

test('cover trade with manager approval flow', async () => {
  await call('PATCH', '/api/settings', { requireApproval: true }, mgr);

  const posted = await call('POST', '/api/trades', { shiftId: ids.caraShift, employeeId: ids.Cara });
  const tradeId = posted.data.trade.id;
  const offer = await call('POST', `/api/trades/${tradeId}/offers`, { employeeId: ids.Bob });
  const accepted = await call('POST', `/api/trades/${tradeId}/accept`,
    { offerId: offer.data.offer.id, employeeId: ids.Cara });
  assert.strictEqual(accepted.status, 200);
  assert.strictEqual(accepted.data.pendingApproval, true);

  // Shift unchanged until approval.
  assert.strictEqual(accepted.data.state.shifts.find((s) => s.id === ids.caraShift).employeeId, ids.Cara);

  const notMgr = await call('POST', `/api/trades/${tradeId}/approve`, {});
  assert.strictEqual(notMgr.status, 403);

  const approved = await call('POST', `/api/trades/${tradeId}/approve`, {}, mgr);
  assert.strictEqual(approved.status, 200);
  assert.strictEqual(approved.data.state.shifts.find((s) => s.id === ids.caraShift).employeeId, ids.Bob);

  await call('PATCH', '/api/settings', { requireApproval: false }, mgr);
});

test('accepting a conflicting offer is blocked', async () => {
  // Bob now owns Alice's old Mon shift (09:00–17:00 on 2026-07-20).
  // Give Cara a shift that overlaps it, then have Cara offer to cover a
  // new Bob shift at the same time — accept must fail with a conflict.
  const cara = await call('POST', '/api/shifts',
    { employeeId: ids.Cara, date: '2026-07-20', start: '08:00', end: '12:00' }, mgr);
  assert.strictEqual(cara.status, 200);

  const posted = await call('POST', '/api/trades', { shiftId: ids.aliceShift, employeeId: ids.Bob });
  const tradeId = posted.data.trade.id;
  const offer = await call('POST', `/api/trades/${tradeId}/offers`, { employeeId: ids.Cara });
  const accepted = await call('POST', `/api/trades/${tradeId}/accept`,
    { offerId: offer.data.offer.id, employeeId: ids.Bob });
  assert.strictEqual(accepted.status, 409);
  assert.match(accepted.data.error, /double-book/);

  await call('POST', `/api/trades/${tradeId}/cancel`, { employeeId: ids.Bob });
});

test('copy-week duplicates shifts one week later', async () => {
  const res = await call('POST', '/api/shifts/copy-week', { fromWeekStart: '2026-07-20' }, mgr);
  assert.strictEqual(res.status, 200);
  assert.ok(res.data.copied >= 1);
  const copied = res.data.state.shifts.filter((s) => s.date === '2026-07-27');
  assert.ok(copied.length >= 1);
});

test('deleting an employee cascades to shifts, trades, and offers', async () => {
  const res = await call('DELETE', `/api/employees/${ids.Cara}`, undefined, mgr);
  assert.strictEqual(res.status, 200);
  const st = res.data.state;
  assert.ok(!st.employees.some((e) => e.id === ids.Cara));
  assert.ok(!st.shifts.some((s) => s.employeeId === ids.Cara));
  for (const t of st.trades) {
    assert.ok(!(t.offers || []).some((o) => o.employeeId === ids.Cara));
    if (t.status === 'open' || t.status === 'pending') {
      assert.notStrictEqual(t.employeeId, ids.Cara);
    }
  }
});

test('ICS feed serves per-employee calendar', async () => {
  const res = await fetch(`${base}/api/ics?employeeId=${ids.Bob}`);
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/calendar/);
  const body = await res.text();
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.match(body, /BEGIN:VEVENT/);
});

test('state endpoint never leaks the manager PIN', async () => {
  const res = await call('GET', '/api/state');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(JSON.stringify(res.data).includes(PIN), false);
  assert.strictEqual(res.data.state.settings.managerPin, undefined);
});

test('data survives a restart (JSON persistence)', async () => {
  const beforeState = (await call('GET', '/api/state')).data.state;
  await app.close();
  app = createServer({ dataDir, managerPin: PIN });
  const port = await app.listen(0);
  base = `http://127.0.0.1:${port}`;
  const afterState = (await call('GET', '/api/state')).data.state;
  assert.deepStrictEqual(afterState.employees, beforeState.employees);
  assert.deepStrictEqual(afterState.shifts, beforeState.shifts);
});

test('SSE stream sends state snapshots on change', async () => {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/events`, { signal: controller.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = '';
  async function nextFrame() {
    while (!buffer.includes('\n\n')) {
      const { value } = await reader.read();
      buffer += decoder.decode(value, { stream: true });
    }
    const idx = buffer.indexOf('\n\n');
    const frame = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 2);
    return frame;
  }

  const first = await nextFrame(); // initial snapshot
  assert.match(first, /^data: /);

  await call('POST', '/api/employees', { name: 'Dave' }, mgr);
  let update = await nextFrame();
  while (!update.startsWith('data: ')) update = await nextFrame(); // skip pings
  const payload = JSON.parse(update.slice(6));
  assert.ok(payload.employees.some((e) => e.name === 'Dave'));
  controller.abort();
});
