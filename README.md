# Screen Assistant

An AI desktop assistant that **watches your screen, learns actions by
demonstration, remembers them as named skills, and recalls them
conversationally** — with a human-approval gate before anything runs on your
machine.

The assistant can **actually take control of your mouse and keyboard** and work
autonomously toward a goal, using Claude's computer-use in a perceive → decide →
act loop. Every run starts behind an **approval gate** and can be stopped
instantly. See [`DESIGN.md`](./DESIGN.md) for the full architecture and roadmap.

> ⚠️ **This software controls your real computer.** It can click, type, and open
> things on its own. Start with low-stakes tasks, keep the STOP control in reach
> (**Ctrl/Cmd+Shift+X** works even when the app isn't focused), and don't leave
> it unattended on anything destructive or irreversible.

## The interface: a floating JARVIS widget

The app's primary surface is an **always-on-top, frameless widget** that floats
over your work — an animated arc-reactor core that reflects its state (idle,
listening, working, approval-needed), a voice/text command box, a live activity
feed, and quick counts of your skills and workflows. The full **workspace**
(Teach / Watch / Skills / Workflows / Assistant tabs) is one click away via the
⤢ button, or summon the widget from anywhere with **Ctrl/Cmd+Shift+Space**.

## What works today

- **Teach** a skill by demonstration: hit record, do the thing, stop, name it.
  The app captures frames and asks Claude to generalize them into a reusable
  skill (steps, trigger phrases, app context).
- **Skill library**: browse, expand, and delete everything the assistant learned.
- **Assistant chat**: ask for a skill by name or describe a goal; the assistant
  finds the matching skill and proposes an execution **plan you must approve**.
- **Autonomous execution**: after you approve, the assistant drives the real
  mouse/keyboard to accomplish the goal, screenshotting to verify each step, with
  a live action log and a STOP button. Guarded by a step cap and the kill switch.
- **High-risk approval gate**: before anything destructive/irreversible/outbound
  (delete, send, pay, post, quit-with-unsaved-work) the run **pauses** for an
  explicit Approve/Deny — driven by an `ask_permission` tool the model must call,
  with a heuristic backstop for clearly destructive shortcuts.
- **Voice control** *(concept from realtime voice agents)*: click the mic and
  speak a command; it's transcribed, Claude **routes the intent** (function-call
  style) to a matching skill or a one-off goal, and the gated run carries it out —
  spoken intent → action, no keyboard.
- **Continuous private watching (Phase 2)**: an opt-in, in-memory, local-only
  rolling buffer of recent frames. Nothing is written to disk or sent anywhere
  unless you turn a slice of it into a skill — so you can name something you
  *just* did. Pause any time.
- **Self-improvement**: ask the assistant to change *itself* — "make your orb
  bigger", "add a dark theme", "fix the way you handle X" — and it reads and
  rewrites its own source code to do it. Every self-edit is **snapshotted,
  validated (syntax-checked + the test suite is run), and automatically
  reverted if it fails**, so a bad change can't brick the app. A good change is
  applied on the next reload — say **"reload yourself"** (or click Reload) to
  restart with the new code. See "Self-improvement" below.

## Requirements

- Node.js 18+
- An Anthropic API key: <https://console.anthropic.com/>

## Setup

```bash
npm install
npm start
```

On first launch, click the **⚙ Settings** button and paste your Anthropic API
key — it's stored **encrypted** via your OS keychain (Electron `safeStorage`).
No `.env` file needed. (Developers can still use `.env`; a saved setting always
wins over an env var, which wins over the built-in default.)

Run the tests any time with `npm test` (no key or network needed).

### Building installers

```bash
npm run dist          # current OS
npm run dist:mac      # dmg + zip   (needs macOS)
npm run dist:win      # nsis installer
npm run dist:linux    # AppImage
```

See [`SHIPPING.md`](./SHIPPING.md) for icons, code signing, and the pre-release
manual test.

On first launch you'll need to grant OS permissions:

- **Screen Recording** (perception) — macOS/Windows will prompt.
- **Accessibility / input control** (the "hands") — nut.js needs this to move the
  mouse and type:
  - **macOS:** System Settings → Privacy & Security → **Accessibility** → enable
    the app (and Screen Recording).
  - **Linux:** requires an **X11** session (nut.js does not support Wayland) and
    `libxtst`/`libpng` present.
  - **Windows:** works out of the box.

If the top bar shows `⚠ no OS control`, the native input module didn't load —
re-run `npm install` and check the permissions above.

### Voice control (OpenAI Whisper)

**Talking to JARVIS works** with real click-to-talk speech-to-text via **OpenAI
Whisper**. Click the mic to arm listening; each turn records from your mic,
auto-stops after a short pause, is transcribed by Whisper, and runs as a command
— then he listens again. He won't record while he's speaking (no feedback loop),
and the STOP control always applies.

This needs a **speech-to-text key** (separate from your Anthropic key, because the
Anthropic API has no STT). Pick a provider in **⚙ Settings → Voice provider** and
paste the matching key:

- **Groq** *(default, recommended)* — runs Whisper with a real **free tier**;
  sign up at console.groq.com and paste the key. Fast and free.
- **OpenAI** — Whisper (`whisper-1`); needs OpenAI credits.
- **Deepgram** — Nova; needs a Deepgram key.

The key is stored encrypted via the OS keychain. Without one, the mic is disabled
and you type commands instead — routing is identical.

Pipeline: `renderer/widget.js` records with `getUserMedia`/`MediaRecorder` +
silence detection → `lib/transcribe.js` (main process) POSTs to Whisper →
transcript is fed into the same command router. **Speaking back** uses the
browser SpeechSynthesis API.

Global shortcuts (work from anywhere):

- **Ctrl/Cmd + Shift + R** — toggle the demonstration recorder.
- **Ctrl/Cmd + Shift + X** — **emergency STOP** the autonomous run.

## Configuration

`.env` keys:

| Key | Purpose | Default |
|-----|---------|---------|
| `ANTHROPIC_API_KEY` | your Claude API key | — (required) |
| `ANTHROPIC_MODEL` | model for vision + reasoning | `claude-sonnet-5` |
| `SA_COMPUTER_USE_MODEL` | model for the autonomous loop (needs computer-use support) | falls back to `ANTHROPIC_MODEL` |
| `SA_COMPUTER_TOOL_TYPE` | computer tool version | `computer_20251124` |
| `SA_COMPUTER_BETA` | computer-use beta flag | `computer-use-2025-11-24` |
| `SA_MAX_STEPS` | hard cap on autonomous steps per run | `40` |
| `SA_ACTION_DELAY_MS` | settle delay after each action | `350` |
| `SA_TARGET_WIDTH` | width Claude "sees"; coords scaled to real px | `1280` |
| `SA_CONFIRM_EVERY` | require confirmation before *every* action (paranoid) | off |
| `SA_FULL_CONTROL` | act without per-action approval (STOP still works) | **on** |
| `SA_WATCH_INTERVAL_MS` | Phase 2 capture sampling period | `3000` |
| `SA_WATCH_MAX_FRAMES` | Phase 2 rolling buffer size | `40` |

> **Computer-use requires a model that supports it.** Point
> `SA_COMPUTER_USE_MODEL`/`SA_COMPUTER_TOOL_TYPE`/`SA_COMPUTER_BETA` at a
> supported model + tool version for your account if the defaults aren't enabled.

## Project layout

```
jarvis/  (repo root)
├── main.js            Electron main (capture, IPC, shortcut)
├── preload.js         safe bridge to the UI
├── lib/
│   ├── skills.js      skill memory store (skills.json)
│   ├── claude.js      Anthropic calls: learn / chat / plan / route-command
│   ├── executor.js    OS input layer (nut.js) — the "hands"
│   ├── quickactions.js instant fast-path: open app / site / search (no screenshots)
│   ├── webpage.js     reads the live browser DOM (page text + interface map)
│   ├── crawler.js     deep site crawler (follows links, robots-aware, page-capped)
│   ├── sweep.js       filesystem index (find/open files & apps instantly)
│   ├── content.js     search INSIDE files (Spotlight) + read/summarize a doc
│   ├── shell.js       terminal capability: run real shell commands (guarded)
│   ├── agent.js       computer-use agentic loop + approval gate — the "brain"
│   ├── selfedit.js    sandboxed self-editing engine (read/write/validate/revert)
│   ├── improver.js    built-in self-improvement loop (fallback editor)
│   ├── claudecode.js  self-improvement via the Claude Code CLI on its own repo
│   ├── memory.js      Obsidian-style long-term memory vault
│   ├── telemetry.js   records his own run metrics; feeds data-driven self-optimization
│   ├── transcribe.js  OpenAI Whisper speech-to-text (voice)
│   └── monitor.js     Phase 2 in-memory watch buffer — continuous perception
└── renderer/          Teach / Watch / Skills / Assistant tabs + run overlay + voice
```

## Voice control — the concept, and its lineage

The voice layer emulates the pattern popularized by realtime voice agents
(spoken command → low-latency intent recognition → **function/tool call** →
execute, reading app state along the way). Here that pattern runs on Claude:
your words are routed by a tool-calling step (`run_skill` / `run_goal` / `reply`)
into the same approval-gated execution engine. Background reading:
[OpenAI gpt-realtime](https://openai.com/index/introducing-gpt-realtime/),
[OpenAI Realtime API guide](https://developers.openai.com/api/docs/guides/realtime),
[AssemblyAI: how voice agents work](https://www.assemblyai.com/blog/ai-voice-agents).

## Do almost anything — the orchestrator

For requests that need **several steps**, JARVIS plans and executes them in
sequence across all its capabilities. Say *"do this: research the top 3 standing
desks, save the findings to a note, and open it"* — or just phrase a multi-step
goal — and it:

1. **Plans** the request into concrete steps (`claude.planTasks`), each mapped to
   one capability: open/search, shell command, find a file, search file contents,
   read the screen/page, crawl a site, harvest a page, or drive the GUI.
2. **Executes** each step in order (`assistant:do`), streaming a live plan +
   per-step progress, routing destructive commands through the approval gate, and
   halting instantly on STOP.

The intent router picks this automatically for multi-step requests; you can also
force it with *"do this: …"* / *"handle this for me: …"*.

## Memory — an Obsidian-style vault

JARVIS keeps a **persistent memory** as a folder of markdown files you can open
directly in [Obsidian](https://obsidian.md). It lives at
`~/Documents/JARVIS Vault/` and is created on first launch:

- `Identity.md` — who he is (his self-awareness anchor: the widget and the
  Assistant tab are **the same assistant**, sharing this one memory).
- `Profile.md` — durable facts he learns about you.
- `Conversations/YYYY-MM-DD.md` — every exchange, from **both** surfaces, so a
  chat in the widget is remembered in the Assistant tab and vice-versa.
- `Memories/<note>.md` — durable notes he chooses to keep, with `[[wikilinks]]`.

He reads a digest of this into every reply, and can actively `recall` (search)
and `remember` (save) via tools — tell him *"remember that I prefer dark mode"*
and it lands in `Profile.md`. Click the **🧠 memory** chip on the widget to open
the vault in your file manager (then "Open folder as vault" in Obsidian).

## Self-measurement & learning

JARVIS gathers data on his own work and on how you use your computer, and turns
both into improvement:

- **Self-telemetry** (`lib/telemetry.js`): every run — a task, quick action,
  screen read, shell command — records its kind, outcome, duration, and steps to
  `telemetry.jsonl`. Ask *"how are you doing"* / *"show your stats"* for a digest
  (success rate, slowest kinds, common errors).
- **Data-driven self-optimization**: say *"optimize yourself"* and he feeds that
  real performance summary into the self-improvement flow, targeting the slowest
  and least-reliable code — then you `upload yourself` and `reload yourself`.
- **Watch-and-learn**: say *"watch me work"* / *"learn how I work"* and he turns
  on the local capture buffer and, every couple of minutes, summarizes what app
  and interface you're using and how — saved to `Observations/` in the vault, so
  he builds up knowledge of human UIs to reuse later. *"Stop watching"* ends it.
  (Frames stay local; only short text summaries are kept.)

## Self-improvement

The assistant can edit its **own source code**. Say something like *"add a
setting to slow down your typing"* or *"make the widget remember its size"* and
it will:

1. **Read** its own files (an agentic loop with `list_files` / `read_file` /
   `write_file` tools, all confined to the app's own directory by
   `lib/selfedit.js` — no path traversal, source extensions only).
2. **Rewrite** the relevant files to make the change.
3. **Validate** the result: every touched `.js` is `node --check`ed and the smoke
   suite (`npm test`) is run.
4. **Keep or revert**: if validation fails (or you STOP it), the entire change
   set is rolled back to the exact original bytes — so a bad self-edit can never
   leave the app broken. Originals of a *successful* change are also stashed
   under `.selfedit-backups/<timestamp>/` for manual rollback.

A validated change is on disk but not yet running — **reload to apply**: say
*"reload yourself"*, or click **Reload** in the prompt that appears. Turn on
**Full Control** (Settings) if you want it to act on the self-edit without the
per-step approval prompts (STOP still works).

### Default: drive your OPEN Claude Code session

When you ask JARVIS to *"improve yourself: …"*, he uses **computer-use to type the
request into the Claude Code session you already have open** — the same real,
authenticated window you'd use by hand. He brings it to the front, types the task
into its input, and presses Enter, then stops and lets that session do the work.

This is the preferred model because it uses your **already-logged-in** Claude Code
(no separate auth, no hidden process). The flow is:

1. *"improve yourself: add a dark theme"* → JARVIS types it into your Claude Code.
2. Claude Code makes the changes in this repo and commits (as instructed).
3. *"upload yourself"* → JARVIS runs `git add -A && git commit && git push`.
4. *"reload yourself"* → JARVIS relaunches into the new version.

### Alternative: internal Claude Code / built-in editor

There's also an internal path (`lib/claudecode.js`) that shells out to a headless
`claude -p` in the repo, and a pure-API fallback editor (`lib/improver.js`) that
reads/writes/validates files directly. These are used by the `improve.run`
channel; the on-screen approach above avoids their authentication pitfalls by
reusing your live session. All modes only work from a git checkout (`npm start`),
not a packaged build, and STOP kills any run.

### Self-update

Say *"update yourself"* and JARVIS runs `git pull --ff-only` on his own repo to
fetch the latest code, then you *"reload yourself"* to run it. So he can both
**improve** himself (write new code) and **update** himself (pull existing code).

> ⚠️ Self-editing is powerful. The guardrails (sandboxed paths, validation,
> auto-revert, backups) make it *safe to try*, but review changes you don't
> understand before committing them, and keep STOP in reach.

The engine (`lib/improver.js`) uses your normal `ANTHROPIC_MODEL` and the same
API key — it talks to the Anthropic API directly, so it needs **API credits**
(separate from any Claude subscription). It does **not** require the Claude
desktop app.

## Terminal — do anything you could do in a shell

JARVIS can run **real shell commands** on the host (`lib/shell.js`), so he can do
anything you'd do in Terminal: install tools (`brew`/`npm`/`pip`), run scripts,
use `git`, manage files, drive other CLIs. Ask naturally — *"install jq"*,
*"what's my git status"*, *"make a folder called notes on my Desktop"* — and the
intent router sends it down the `run_command` path, runs it through your **login
shell** (so your PATH and tools resolve as normal), and streams the output into
the widget.

Guardrails:

- Commands that look **destructive or outbound** (`rm -rf`, `sudo`, `curl … | sh`,
  `git reset --hard`, disk operations, …) **always ask for approval first**, even
  in Full Control mode.
- Everything is **killable** with STOP and **time-bounded**, and each command is
  noted in the memory vault.

Combined with the computer-use loop (mouse/keyboard) and the instant open/search
fast path, this is what lets JARVIS do essentially anything you can do on the
machine — by GUI *or* command line.

## Safety

- The web UI is sandboxed (`contextIsolation`, no `nodeIntegration`); it cannot
  reach Node, the filesystem, or your API key.
- **Self-edits are sandboxed to the app's own directory, validated before they
  count, and auto-reverted on any failure** (see Self-improvement).
- **No autonomous run starts without an explicit approval click.**
- Once running, you can stop instantly: the **STOP** button or the global
  **Ctrl/Cmd+Shift+X** kill switch, checked before every step.
- A **step cap** (`SA_MAX_STEPS`) bounds any single run.
- Screen data stays local; frames go to Anthropic only when you record a demo,
  ask for a plan, or during an approved run.
- The model is instructed to avoid destructive/irreversible/outbound actions
  unless the goal clearly requires them — but **this is guidance, not a
  guarantee**. Supervise real runs.

## Status

Phase 1 — real, gated autonomous execution. Continuous private perception and
skill-chaining are Phases 2–3 — see [`DESIGN.md`](./DESIGN.md).
