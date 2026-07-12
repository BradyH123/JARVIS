'use strict';

// Shift Scheduler — zero-dependency Node server.
// Serves the web app, a JSON API, and a live-update stream (Server-Sent Events).
// State lives in a single JSON file so the whole thing runs with `node server.js`.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = 100 * 1024;
const MAX_EMPLOYEES = 200;
const MAX_SHIFTS = 20000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Distinct, readable colors assigned to employees round-robin.
const COLORS = [
  '#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2',
  '#dc2626', '#65a30d', '#c026d3', '#0d9488', '#ea580c', '#4f46e5',
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function newId() {
  return crypto.randomBytes(6).toString('hex');
}

function isValidDate(str) {
  if (!DATE_RE.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Days since epoch for a YYYY-MM-DD string (pure date math, no timezones).
function dayNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function dateFromDayNumber(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

function toMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// Absolute [start, end) minute range of a shift. Overnight shifts
// (end <= start, e.g. 22:00–02:00) spill into the next day.
function shiftRange(shift) {
  const base = dayNumber(shift.date) * 1440;
  const start = base + toMinutes(shift.start);
  let end = base + toMinutes(shift.end);
  if (end <= start) end += 1440;
  return [start, end];
}

function rangesOverlap(a, b) {
  return a[0] < b[1] && b[0] < a[1];
}

function fmtTime12(time) {
  let [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return m === 0 ? `${h} ${suffix}` : `${h}:${String(m).padStart(2, '0')} ${suffix}`;
}

function fmtShift(shift) {
  const [y, m, d] = shift.date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${day} ${fmtTime12(shift.start)}–${fmtTime12(shift.end)}`;
}

function defaultDb() {
  return {
    version: 0,
    settings: {
      businessName: 'Team Schedule',
      managerPin: '1234',
      requireApproval: false,
      weekStart: 'mon', // 'mon' | 'sun'
    },
    employees: [], // {id, name, color}
    shifts: [],    // {id, employeeId, date, start, end, note}
    trades: [],    // see routes below
  };
}

function createServer(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  const dbPath = path.join(dataDir, 'db.json');
  const pinOverride = options.managerPin || process.env.MANAGER_PIN || null;

  let db = loadDb();
  const sseClients = new Set();

  function loadDb() {
    fs.mkdirSync(dataDir, { recursive: true });
    let loaded = defaultDb();
    try {
      const raw = fs.readFileSync(dbPath, 'utf8');
      const parsed = JSON.parse(raw);
      loaded = { ...defaultDb(), ...parsed, settings: { ...defaultDb().settings, ...(parsed.settings || {}) } };
    } catch {
      // First run or unreadable file: start fresh.
    }
    if (pinOverride) loaded.settings.managerPin = String(pinOverride);
    return loaded;
  }

  function saveDb() {
    const tmp = dbPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, dbPath);
  }

  // Everything the clients see. The manager PIN never leaves the server.
  function publicState() {
    const { managerPin, ...settings } = db.settings;
    return {
      version: db.version,
      settings,
      employees: db.employees,
      shifts: db.shifts,
      trades: db.trades,
    };
  }

  function commit() {
    db.version += 1;
    saveDb();
    const payload = `data: ${JSON.stringify(publicState())}\n\n`;
    for (const res of sseClients) res.write(payload);
  }

  function isManager(req) {
    const given = String(req.headers['x-manager-pin'] || '');
    const a = crypto.createHash('sha256').update(given).digest();
    const b = crypto.createHash('sha256').update(String(db.settings.managerPin)).digest();
    return crypto.timingSafeEqual(a, b);
  }

  const employee = (id) => db.employees.find((e) => e.id === id);
  const shift = (id) => db.shifts.find((s) => s.id === id);
  const trade = (id) => db.trades.find((t) => t.id === id);
  const openTradeForShift = (shiftId) =>
    db.trades.find((t) => t.shiftId === shiftId && (t.status === 'open' || t.status === 'pending'));

  // First shift of `employeeId` (other than excludeIds) overlapping `candidate`.
  function conflictFor(employeeId, candidate, excludeIds = []) {
    const range = shiftRange(candidate);
    return db.shifts.find(
      (s) =>
        s.employeeId === employeeId &&
        !excludeIds.includes(s.id) &&
        rangesOverlap(shiftRange(s), range)
    );
  }

  function validateShiftFields({ date, start, end }) {
    if (!isValidDate(String(date || ''))) return 'Enter a valid date.';
    if (!TIME_RE.test(String(start || ''))) return 'Enter a valid start time.';
    if (!TIME_RE.test(String(end || ''))) return 'Enter a valid end time.';
    if (start === end) return 'Start and end time can’t be the same.';
    return null;
  }

  // Remove swap offers that reference a shift which no longer belongs to the
  // offering employee (or no longer exists).
  function pruneStaleOffers() {
    for (const t of db.trades) {
      if (t.status !== 'open' && t.status !== 'pending') continue;
      t.offers = t.offers.filter((o) => {
        if (!o.offeredShiftId) return true;
        const s = shift(o.offeredShiftId);
        return s && s.employeeId === o.employeeId;
      });
      if (t.status === 'pending' && !t.offers.some((o) => o.id === t.acceptedOfferId)) {
        t.status = 'open';
        t.acceptedOfferId = null;
      }
    }
  }

  function cancelTradesForShift(shiftId, reason) {
    for (const t of db.trades) {
      if (t.shiftId === shiftId && (t.status === 'open' || t.status === 'pending')) {
        t.status = 'cancelled';
        t.resolvedAt = Date.now();
        t.summary = reason;
      }
    }
  }

  // Re-check that an accepted offer can still be applied. Returns an error
  // message, or null if the trade is good to go.
  function validateApplication(t, offer) {
    const s = shift(t.shiftId);
    if (!s) return 'That shift no longer exists.';
    if (s.employeeId !== t.employeeId) return 'That shift has already changed hands.';
    const taker = employee(offer.employeeId);
    if (!taker) return 'The person who made this offer is no longer on the team.';
    let offeredShift = null;
    if (offer.offeredShiftId) {
      offeredShift = shift(offer.offeredShiftId);
      if (!offeredShift) return 'The shift offered in exchange no longer exists.';
      if (offeredShift.employeeId !== offer.employeeId) return 'The shift offered in exchange has changed hands.';
    }
    const exclude = offeredShift ? [s.id, offeredShift.id] : [s.id];
    const c1 = conflictFor(offer.employeeId, s, exclude);
    if (c1) return `${taker.name} already works ${fmtShift(c1)} — taking this shift would double-book them.`;
    if (offeredShift) {
      const owner = employee(t.employeeId);
      const c2 = conflictFor(t.employeeId, offeredShift, exclude);
      if (c2) return `${owner ? owner.name : 'The owner'} already works ${fmtShift(c2)} — this swap would double-book them.`;
    }
    return null;
  }

  function applyTrade(t, offer) {
    const s = shift(t.shiftId);
    const owner = employee(t.employeeId);
    const taker = employee(offer.employeeId);
    s.employeeId = offer.employeeId;
    let summary;
    if (offer.offeredShiftId) {
      const offeredShift = shift(offer.offeredShiftId);
      offeredShift.employeeId = t.employeeId;
      summary = `${owner.name} and ${taker.name} swapped shifts: ${taker.name} now works ${fmtShift(s)}, ${owner.name} now works ${fmtShift(offeredShift)}.`;
    } else {
      summary = `${taker.name} took over ${owner.name}’s shift ${fmtShift(s)}.`;
    }
    t.status = 'completed';
    t.resolvedAt = Date.now();
    t.summary = summary;
    pruneStaleOffers();
  }

  // ---- HTTP plumbing -------------------------------------------------------

  function sendJson(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
  }

  function fail(res, code, message) {
    sendJson(res, code, { error: message });
  }

  function ok(res, extra = {}) {
    sendJson(res, 200, { ...extra, state: publicState() });
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(new Error('Request too large'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (chunks.length === 0) return resolve({});
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  function serveStatic(req, res, pathname) {
    let file = pathname === '/' ? '/index.html' : pathname;
    const resolved = path.join(PUBLIC_DIR, path.normalize(file));
    if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== path.join(PUBLIC_DIR, 'index.html')) {
      return fail(res, 404, 'Not found');
    }
    fs.readFile(resolved, (err, data) => {
      if (err) return fail(res, 404, 'Not found');
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(resolved)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  }

  function icsEscape(text) {
    return String(text).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\r?\n/g, ' ');
  }

  function serveIcs(res, employeeId) {
    const emp = employeeId ? employee(employeeId) : null;
    if (employeeId && !emp) return fail(res, 404, 'No such employee');
    const shifts = db.shifts.filter((s) => !employeeId || s.employeeId === employeeId);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const name = emp ? `${db.settings.businessName} — ${emp.name}` : db.settings.businessName;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ShiftScheduler//EN',
      'CALSCALE:GREGORIAN',
      `X-WR-CALNAME:${icsEscape(name)}`,
    ];
    for (const s of shifts) {
      const who = employee(s.employeeId);
      const endDate = toMinutes(s.end) <= toMinutes(s.start) ? dateFromDayNumber(dayNumber(s.date) + 1) : s.date;
      const summary = employeeId
        ? `Work ${fmtTime12(s.start)}–${fmtTime12(s.end)}${s.note ? ` · ${s.note}` : ''}`
        : `${who ? who.name : '?'} ${fmtTime12(s.start)}–${fmtTime12(s.end)}${s.note ? ` · ${s.note}` : ''}`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:shift-${s.id}@shift-scheduler`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${s.date.replace(/-/g, '')}T${s.start.replace(':', '')}00`,
        `DTEND:${endDate.replace(/-/g, '')}T${s.end.replace(':', '')}00`,
        `SUMMARY:${icsEscape(summary)}`,
        'END:VEVENT'
      );
    }
    lines.push('END:VCALENDAR');
    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="shifts.ics"',
      'Cache-Control': 'no-cache',
    });
    res.end(lines.join('\r\n') + '\r\n');
  }

  // ---- Routes --------------------------------------------------------------

  async function handleApi(req, res, pathname, url) {
    const parts = pathname.split('/').filter(Boolean); // e.g. ['api','trades',':id','accept']

    if (req.method === 'GET' && pathname === '/api/state') {
      return sendJson(res, 200, { state: publicState() });
    }

    if (req.method === 'GET' && pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`data: ${JSON.stringify(publicState())}\n\n`);
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    if (req.method === 'GET' && pathname === '/api/ics') {
      return serveIcs(res, url.searchParams.get('employeeId') || null);
    }

    const body = await readBody(req);

    if (req.method === 'POST' && pathname === '/api/manager/verify') {
      if (!isManager(req)) return fail(res, 403, 'Wrong PIN');
      return ok(res);
    }

    // ---- Manager-only routes ----
    const managerRoutes =
      pathname.startsWith('/api/employees') ||
      pathname.startsWith('/api/shifts') ||
      pathname === '/api/settings' ||
      /^\/api\/trades\/[^/]+\/(approve|deny)$/.test(pathname);
    if (managerRoutes && !isManager(req)) {
      return fail(res, 403, 'Manager PIN required');
    }

    if (req.method === 'POST' && pathname === '/api/employees') {
      const name = String(body.name || '').trim().slice(0, 60);
      if (!name) return fail(res, 400, 'Enter a name.');
      if (db.employees.length >= MAX_EMPLOYEES) return fail(res, 400, 'Employee limit reached.');
      if (db.employees.some((e) => e.name.toLowerCase() === name.toLowerCase())) {
        return fail(res, 409, `There’s already someone named “${name}”.`);
      }
      const emp = { id: newId(), name, color: COLORS[db.employees.length % COLORS.length] };
      db.employees.push(emp);
      commit();
      return ok(res, { employee: emp });
    }

    if (parts[1] === 'employees' && parts[2] && parts.length === 3) {
      const emp = employee(parts[2]);
      if (!emp) return fail(res, 404, 'No such employee');
      if (req.method === 'PATCH') {
        if (body.name !== undefined) {
          const name = String(body.name).trim().slice(0, 60);
          if (!name) return fail(res, 400, 'Enter a name.');
          if (db.employees.some((e) => e.id !== emp.id && e.name.toLowerCase() === name.toLowerCase())) {
            return fail(res, 409, `There’s already someone named “${name}”.`);
          }
          emp.name = name;
        }
        if (typeof body.color === 'string' && /^#[0-9a-f]{6}$/i.test(body.color)) emp.color = body.color;
        commit();
        return ok(res);
      }
      if (req.method === 'DELETE') {
        db.employees = db.employees.filter((e) => e.id !== emp.id);
        const theirShiftIds = new Set(db.shifts.filter((s) => s.employeeId === emp.id).map((s) => s.id));
        db.shifts = db.shifts.filter((s) => s.employeeId !== emp.id);
        for (const t of db.trades) {
          if ((t.status === 'open' || t.status === 'pending') && (t.employeeId === emp.id || theirShiftIds.has(t.shiftId))) {
            t.status = 'cancelled';
            t.resolvedAt = Date.now();
            t.summary = `Trade cancelled — ${emp.name} was removed from the team.`;
          }
          t.offers = (t.offers || []).filter((o) => o.employeeId !== emp.id);
        }
        pruneStaleOffers();
        commit();
        return ok(res);
      }
    }

    if (req.method === 'POST' && pathname === '/api/shifts') {
      const err = validateShiftFields(body);
      if (err) return fail(res, 400, err);
      const emp = employee(body.employeeId);
      if (!emp) return fail(res, 400, 'Pick an employee.');
      if (db.shifts.length >= MAX_SHIFTS) return fail(res, 400, 'Shift limit reached.');
      const candidate = {
        id: newId(),
        employeeId: emp.id,
        date: body.date,
        start: body.start,
        end: body.end,
        note: String(body.note || '').trim().slice(0, 120),
      };
      const clash = conflictFor(emp.id, candidate);
      if (clash) return fail(res, 409, `${emp.name} already works ${fmtShift(clash)} — that overlaps.`);
      db.shifts.push(candidate);
      commit();
      return ok(res, { shift: candidate });
    }

    if (req.method === 'POST' && pathname === '/api/shifts/copy-week') {
      const from = String(body.fromWeekStart || '');
      if (!isValidDate(from)) return fail(res, 400, 'Invalid week start date.');
      const fromDay = dayNumber(from);
      const weekShifts = db.shifts.filter((s) => {
        const d = dayNumber(s.date);
        return d >= fromDay && d < fromDay + 7;
      });
      let copied = 0;
      let skipped = 0;
      for (const s of weekShifts) {
        const candidate = {
          id: newId(),
          employeeId: s.employeeId,
          date: dateFromDayNumber(dayNumber(s.date) + 7),
          start: s.start,
          end: s.end,
          note: s.note,
        };
        if (conflictFor(s.employeeId, candidate)) {
          skipped += 1;
          continue;
        }
        db.shifts.push(candidate);
        copied += 1;
      }
      if (copied > 0) commit();
      return ok(res, { copied, skipped });
    }

    if (parts[1] === 'shifts' && parts[2] && parts.length === 3) {
      const s = shift(parts[2]);
      if (!s) return fail(res, 404, 'No such shift');
      if (req.method === 'PATCH') {
        const next = {
          ...s,
          date: body.date ?? s.date,
          start: body.start ?? s.start,
          end: body.end ?? s.end,
          employeeId: body.employeeId ?? s.employeeId,
          note: body.note !== undefined ? String(body.note).trim().slice(0, 120) : s.note,
        };
        const err = validateShiftFields(next);
        if (err) return fail(res, 400, err);
        const emp = employee(next.employeeId);
        if (!emp) return fail(res, 400, 'Pick an employee.');
        const clash = conflictFor(next.employeeId, next, [s.id]);
        if (clash) return fail(res, 409, `${emp.name} already works ${fmtShift(clash)} — that overlaps.`);
        if (next.employeeId !== s.employeeId) {
          cancelTradesForShift(s.id, 'Trade cancelled — the shift was reassigned by the manager.');
        }
        Object.assign(s, next);
        pruneStaleOffers();
        commit();
        return ok(res);
      }
      if (req.method === 'DELETE') {
        cancelTradesForShift(s.id, 'Trade cancelled — the shift was deleted.');
        db.shifts = db.shifts.filter((x) => x.id !== s.id);
        pruneStaleOffers();
        commit();
        return ok(res);
      }
    }

    if (req.method === 'PATCH' && pathname === '/api/settings') {
      if (body.businessName !== undefined) {
        const name = String(body.businessName).trim().slice(0, 80);
        if (name) db.settings.businessName = name;
      }
      if (typeof body.requireApproval === 'boolean') db.settings.requireApproval = body.requireApproval;
      if (body.weekStart === 'mon' || body.weekStart === 'sun') db.settings.weekStart = body.weekStart;
      if (body.newPin !== undefined) {
        const pin = String(body.newPin).trim();
        if (pin.length < 4 || pin.length > 32) return fail(res, 400, 'PIN must be 4–32 characters.');
        db.settings.managerPin = pin;
      }
      commit();
      return ok(res);
    }

    // ---- Trades (employee actions, honor-system identity) ----

    if (req.method === 'POST' && pathname === '/api/trades') {
      const s = shift(body.shiftId);
      if (!s) return fail(res, 404, 'No such shift');
      if (s.employeeId !== body.employeeId) return fail(res, 403, 'You can only trade your own shifts.');
      if (openTradeForShift(s.id)) return fail(res, 409, 'That shift is already up for trade.');
      const t = {
        id: newId(),
        shiftId: s.id,
        employeeId: s.employeeId,
        note: String(body.note || '').trim().slice(0, 200),
        status: 'open',
        offers: [],
        acceptedOfferId: null,
        createdAt: Date.now(),
        resolvedAt: null,
        summary: null,
      };
      db.trades.push(t);
      commit();
      return ok(res, { trade: t });
    }

    if (parts[1] === 'trades' && parts[2] && parts[3] && req.method === 'POST') {
      const t = trade(parts[2]);
      if (!t) return fail(res, 404, 'No such trade');
      const action = parts[3];

      if (action === 'offers') {
        if (t.status !== 'open') return fail(res, 409, 'This trade is no longer open.');
        const emp = employee(body.employeeId);
        if (!emp) return fail(res, 400, 'Unknown employee.');
        if (emp.id === t.employeeId) return fail(res, 400, 'You can’t offer on your own trade.');
        let offeredShiftId = null;
        if (body.offeredShiftId) {
          const os = shift(body.offeredShiftId);
          if (!os) return fail(res, 404, 'No such shift to offer.');
          if (os.employeeId !== emp.id) return fail(res, 403, 'You can only offer your own shifts.');
          if (os.id === t.shiftId) return fail(res, 400, 'That’s the same shift.');
          const other = openTradeForShift(os.id);
          if (other) return fail(res, 409, 'That shift is already up for trade — cancel that trade first.');
          offeredShiftId = os.id;
        }
        // One offer per person per trade; a new one replaces the old.
        t.offers = t.offers.filter((o) => o.employeeId !== emp.id);
        const offer = { id: newId(), employeeId: emp.id, offeredShiftId, createdAt: Date.now() };
        t.offers.push(offer);
        commit();
        return ok(res, { offer });
      }

      if (action === 'retract-offer') {
        if (t.status !== 'open') return fail(res, 409, 'This trade is no longer open.');
        t.offers = t.offers.filter((o) => o.employeeId !== body.employeeId);
        commit();
        return ok(res);
      }

      if (action === 'accept') {
        if (t.status !== 'open') return fail(res, 409, 'This trade is no longer open.');
        if (body.employeeId !== t.employeeId) return fail(res, 403, 'Only the shift owner can accept an offer.');
        const offer = t.offers.find((o) => o.id === body.offerId);
        if (!offer) return fail(res, 404, 'That offer is gone.');
        const problem = validateApplication(t, offer);
        if (problem) return fail(res, 409, problem);
        if (db.settings.requireApproval) {
          t.status = 'pending';
          t.acceptedOfferId = offer.id;
          commit();
          return ok(res, { pendingApproval: true });
        }
        applyTrade(t, offer);
        commit();
        return ok(res);
      }

      if (action === 'cancel') {
        if (t.status !== 'open' && t.status !== 'pending') return fail(res, 409, 'This trade is already closed.');
        if (body.employeeId !== t.employeeId && !isManager(req)) {
          return fail(res, 403, 'Only the shift owner or a manager can cancel this trade.');
        }
        t.status = 'cancelled';
        t.resolvedAt = Date.now();
        const owner = employee(t.employeeId);
        const s = shift(t.shiftId);
        t.summary = `${owner ? owner.name : 'Someone'} withdrew the trade for ${s ? fmtShift(s) : 'a shift'}.`;
        commit();
        return ok(res);
      }

      if (action === 'approve') {
        if (t.status !== 'pending') return fail(res, 409, 'This trade isn’t waiting for approval.');
        const offer = t.offers.find((o) => o.id === t.acceptedOfferId);
        if (!offer) return fail(res, 409, 'The accepted offer is gone.');
        const problem = validateApplication(t, offer);
        if (problem) return fail(res, 409, problem);
        applyTrade(t, offer);
        commit();
        return ok(res);
      }

      if (action === 'deny') {
        if (t.status !== 'pending') return fail(res, 409, 'This trade isn’t waiting for approval.');
        t.offers = t.offers.filter((o) => o.id !== t.acceptedOfferId);
        t.acceptedOfferId = null;
        t.status = 'open';
        commit();
        return ok(res);
      }
    }

    return fail(res, 404, 'Not found');
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.startsWith('/api/')) {
      handleApi(req, res, pathname, url).catch((err) => {
        if (!res.headersSent) fail(res, err.message === 'Invalid JSON body' ? 400 : 500, err.message);
      });
      return;
    }
    if (req.method === 'GET') return serveStatic(req, res, pathname);
    fail(res, 405, 'Method not allowed');
  });

  // Keep proxies from closing idle SSE connections.
  const heartbeat = setInterval(() => {
    for (const res of sseClients) res.write(': ping\n\n');
  }, 25000);
  heartbeat.unref();

  return {
    server,
    listen(port = 0) {
      return new Promise((resolve) => {
        server.listen(port, () => resolve(server.address().port));
      });
    },
    close() {
      clearInterval(heartbeat);
      for (const res of sseClients) res.end();
      sseClients.clear();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer()
    .listen(port)
    .then((p) => {
      console.log(`Shift Scheduler running → http://localhost:${p}`);
      console.log('Manager PIN is "1234" until you change it in Manager → Settings (or set MANAGER_PIN).');
    });
}
