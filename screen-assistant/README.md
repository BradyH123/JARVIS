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
cd screen-assistant
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

For **voice control**, the app uses the browser SpeechRecognition API. If your
Electron build lacks a speech backend the mic is disabled and you can type
commands instead — the intent routing is identical. To wire a dedicated
speech-to-text provider, replace the capture in `renderer/app.js` (voice section)
with your STT of choice and call `assistant.command(transcript)`.

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
| `SA_FULL_CONTROL` | act without per-action approval (STOP still works) | off |
| `SA_WATCH_INTERVAL_MS` | Phase 2 capture sampling period | `3000` |
| `SA_WATCH_MAX_FRAMES` | Phase 2 rolling buffer size | `40` |

> **Computer-use requires a model that supports it.** Point
> `SA_COMPUTER_USE_MODEL`/`SA_COMPUTER_TOOL_TYPE`/`SA_COMPUTER_BETA` at a
> supported model + tool version for your account if the defaults aren't enabled.

## Project layout

```
screen-assistant/
├── main.js            Electron main (capture, IPC, shortcut)
├── preload.js         safe bridge to the UI
├── lib/
│   ├── skills.js      skill memory store (skills.json)
│   ├── claude.js      Anthropic calls: learn / chat / plan / route-command
│   ├── executor.js    OS input layer (nut.js) — the "hands"
│   ├── agent.js       computer-use agentic loop + approval gate — the "brain"
│   ├── selfedit.js    sandboxed self-editing engine (read/write/validate/revert)
│   ├── improver.js    self-improvement loop — the assistant rewrites its own code
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

> ⚠️ Self-editing is powerful. The guardrails (sandboxed paths, validation,
> auto-revert, backups) make it *safe to try*, but review changes you don't
> understand before committing them, and keep STOP in reach.

The engine (`lib/improver.js`) uses your normal `ANTHROPIC_MODEL` and the same
API key — it talks to the Anthropic API directly, so it needs **API credits**
(separate from any Claude subscription). It does **not** require the Claude
desktop app.

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
