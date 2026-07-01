# Screen Assistant

An AI desktop assistant that **watches your screen, learns actions by
demonstration, remembers them as named skills, and recalls them
conversationally** — with a human-approval gate before anything runs on your
machine.

This is an MVP scaffold. It is real and runnable, but execution is *simulated*
(the assistant proposes a plan you approve; it does not yet drive your mouse).
See [`DESIGN.md`](./DESIGN.md) for the full architecture and the phased roadmap
to real, gated autonomy.

## What works today

- **Teach** a skill by demonstration: hit record, do the thing, stop, name it.
  The app captures frames and asks Claude to generalize them into a reusable
  skill (steps, trigger phrases, app context).
- **Skill library**: browse, expand, and delete everything the assistant learned.
- **Assistant chat**: ask for a skill by name or describe a goal; the assistant
  finds the matching skill and proposes an execution **plan you must approve**.

## Requirements

- Node.js 18+
- An Anthropic API key: <https://console.anthropic.com/>

## Setup

```bash
cd screen-assistant
npm install
cp .env.example .env      # then paste your ANTHROPIC_API_KEY into .env
npm start
```

On first launch macOS/Windows will ask for **Screen Recording** permission —
that's the app's perception pillar; grant it so capture works.

Global shortcut: **Ctrl/Cmd + Shift + R** toggles the demonstration recorder
from anywhere.

## Configuration

`.env` keys:

| Key | Purpose | Default |
|-----|---------|---------|
| `ANTHROPIC_API_KEY` | your Claude API key | — (required) |
| `ANTHROPIC_MODEL` | model for vision + reasoning | `claude-sonnet-5` |

## Project layout

```
screen-assistant/
├── main.js            Electron main (capture, IPC, shortcut)
├── preload.js         safe bridge to the UI
├── lib/
│   ├── skills.js      skill memory store (skills.json)
│   └── claude.js      Anthropic calls: learn / chat / plan
└── renderer/          three-tab UI (Teach / Skills / Assistant)
```

## Safety

- The web UI is sandboxed (`contextIsolation`, no `nodeIntegration`); it cannot
  reach Node, the filesystem, or your API key.
- Nothing executes without an explicit approval click — and in this MVP even an
  approved plan is only simulated.
- Screen data stays local; frames go to Anthropic only when you record a demo or
  ask for a plan.

## Status

MVP / Phase 0. Real gated execution is Phase 1 — see [`DESIGN.md`](./DESIGN.md).
