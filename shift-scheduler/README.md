# 📅 Shift Scheduler

A live-updating employee schedule your whole team opens from **one link in the
group chat**. The boss assigns shifts on a weekly calendar; employees see
exactly when they work and can **trade shifts with each other right in the
app** — cover a shift outright or swap it for one of their own. Every change
appears instantly on everyone's screen, no refresh needed.

Zero dependencies — a single Node.js server, a JSON file for storage, and a
plain HTML/JS frontend. `node server.js` is the whole deployment.

## What everyone can do

**Employees** (no account or password — open the link, tap your name):
- See the week's calendar with everyone's shifts; your own are highlighted
- Filter to "My shifts", flip between weeks
- Put a shift up for trade, offer to **cover** someone's shift, or offer a
  **swap** with one of your own shifts
- Accept offers on your posted shifts — the calendar updates for everyone live
- Subscribe to a personal calendar feed (Google/Apple/Outlook) so shifts show
  up on your phone's calendar automatically

**The manager** (unlocked with a PIN):
- Add/rename/remove employees (each gets a color)
- Add, edit, delete shifts; tap **＋** on any day; **copy a whole week forward**
- Optionally require manager approval before accepted trades take effect
- Rename the business, choose Monday/Sunday week start, change the PIN

**Built-in safety rails:** you can only trade your own shifts, double-booking
is blocked (including overnight shifts crossing midnight), stale offers are
cleaned up automatically, and deleting an employee or shift cancels any trades
that depended on it.

## Run it locally

```bash
cd shift-scheduler
node server.js
# → http://localhost:3000
```

Requires Node 18+. No `npm install`.

First run: open **Manager**, unlock with the default PIN `1234`, add your
team, add shifts, then **change the PIN in Settings**.

## Get your shareable group-chat link

The app needs to run on a small always-on server so the link works for
everyone. Any Node.js host works. Three easy options:

### Railway (~$5/mo, easiest with persistent storage)
1. Push this repo to GitHub (already done if you're reading this there).
2. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo**,
   pick this repo, and set the **root directory** to `shift-scheduler`.
3. Add a **Volume** mounted at `/data` and set the environment variable
   `DATA_DIR=/data` (this keeps your schedule through restarts and deploys).
4. Set `MANAGER_PIN=your-secret-pin`.
5. Railway gives you a public URL — that's the link you post in the group chat.

### Render
Create a **Web Service** from this repo (root directory `shift-scheduler`,
start command `node server.js`). On the free tier the app sleeps when idle and
**the schedule resets on restarts** — fine for trying it out. For real use,
pick a paid instance and attach a **Disk** mounted at `/var/data` with
`DATA_DIR=/var/data`.

### Fly.io / Docker anywhere
A `Dockerfile` is included. On Fly: `fly launch` from the `shift-scheduler`
directory, create a volume, and mount it at `/data`.

## Configuration (environment variables)

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `DATA_DIR` | `./data` | Where `db.json` is stored — point at a persistent disk in production |
| `MANAGER_PIN` | `1234` | Overrides the manager PIN at startup |

## How it stays live

Every browser holds an open [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
connection to `/api/events`. Any change — a new shift, an offer, an accepted
trade — is broadcast to every connected screen immediately. If the connection
drops, the browser reconnects automatically (the green dot in the header shows
connection status).

## A note on trust

This is deliberately lightweight, built for a small team that already trusts
each other: employees pick their name from a list with no password (like a
paper schedule on the wall, anyone could write on it). Only manager actions
are protected by the PIN. If you need real logins, that's the first thing
you'd add.

## Tests

```bash
npm test
```

Covers manager auth, overlap/overnight conflict detection, the full
cover/swap/approval trade flows, employee-deletion cascades, persistence
across restarts, the calendar feed, and the live-update stream.

## API sketch

State: `GET /api/state`, live stream: `GET /api/events` (SSE), calendar feed:
`GET /api/ics?employeeId=…`. Manager routes (require `X-Manager-Pin` header):
CRUD on `/api/employees` and `/api/shifts`, `/api/shifts/copy-week`,
`/api/settings`, trade `approve`/`deny`. Employee routes: `POST /api/trades`
(post a shift), then per-trade `offers`, `retract-offer`, `accept`, `cancel`.
Everything returns the full updated state, and every mutation broadcasts it
over SSE.
