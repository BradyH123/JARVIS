# Screen Assistant — Complete Blueprint

**One sentence:** a desktop AI assistant with full (but gated) control of the
computer, operated conversationally by voice or text, whose defining ability is
**learning by demonstration** — the user performs a task, names it, and the
assistant can then do it itself, alone or composed into larger workflows.

This document is the master blueprint: every subsystem, its data, its contracts,
and how they fit. The matching skeleton lives in this folder — every module
named here exists in code.

---

## 1. Product definition

### 1.1 What it is
A personal computer operator. It has three jobs:

1. **Productivity assistant** — conversational help that can *act*: open, find,
   organize, fill, file, summarize; not just answer.
2. **Task mimic** — watch the user do something once, learn the *technique*
   (not the pixels), and repeat it on demand, adapted to the current screen.
3. **Workload organizer** — compose learned tasks into named workflows and run
   multi-step plans autonomously.

### 1.2 What it is not
- Not a browser extension or web app — it must own the screen and the input
  devices, so it is a **desktop app (Electron)**.
- Not a macro recorder — replaying exact clicks breaks the moment a window
  moves. Skills store *generalized steps* that a vision model re-grounds on the
  live screen every time.
- Not unsupervised by default — full power is *available*, but destructive and
  outbound actions pause for human approval until the user opts otherwise.

### 1.3 The core loop (all features reduce to this)

```
        TEACH                        RECALL                       ACT
 ┌──────────────────┐      ┌──────────────────────┐     ┌──────────────────────┐
 │ user does a task │      │ user says/types what │     │ perceive → decide →  │
 │ frames captured  │ ───▶ │ they want; intent    │ ──▶ │ act → verify loop    │
 │ user names it    │      │ router picks a skill,│     │ drives real mouse +  │
 │ Claude general-  │      │ workflow, or ad-hoc  │     │ keyboard; risky steps│
 │ izes → SKILL     │      │ goal                 │     │ pause for approval   │
 └──────────────────┘      └──────────────────────┘     └──────────────────────┘
          ▲                                                       │
          └────────────── memory grows with every teach ◀────────┘
```

---

## 2. System architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ ELECTRON MAIN PROCESS (Node — privileged)                               │
│                                                                          │
│   main.js — composition root: window, IPC registry, global shortcuts,   │
│             kill switch, watch-buffer lifecycle                          │
│                                                                          │
│   PERCEPTION                    COGNITION (lib/claude.js)                │
│   ├─ captureSized()             ├─ understandDemonstration()  teach      │
│   │   desktopCapturer → PNG     ├─ chat()                     converse   │
│   └─ lib/monitor.js             ├─ routeCommand()             intent     │
│       WatchBuffer: opt-in,      └─ planExecution()            preview    │
│       in-memory ring buffer                                              │
│                                 EXECUTION                                 │
│   MEMORY                        ├─ lib/agent.js  computer-use loop:      │
│   ├─ lib/skills.js              │   perceive→decide→act→verify,          │
│   │   SkillStore (skills.json)  │   ask_permission gate, step cap,       │
│   └─ lib/workflows.js           │   abort checks, coord scaling          │
│       WorkflowStore             └─ lib/executor.js  nut.js: real mouse   │
│       (workflows.json)              & keyboard events                    │
│                                                                          │
└────────────▲─────────────────────────────────────┬─────────────────────┘
             │  contextBridge (preload.js)          │  whitelisted IPC only
┌────────────┴─────────────────────────────────────▼─────────────────────┐
│ RENDERER (sandboxed UI — no Node, no key, no filesystem)                │
│   Teach │ Watch │ Skills │ Assistant tabs                                │
│   plan-approval modal · live run overlay (log + STOP + Approve/Deny)     │
│   🎙 voice capture → assistant.command()                                 │
└──────────────────────────────────────────────────────────────────────────┘
```

**Trust boundary:** the renderer can only call the explicit `preload.js` API.
The Anthropic key, filesystem, and input devices live exclusively in the main
process. Anything the UI wants done, it must ask for over a named IPC channel.

### 2.1 Module contracts

| Module | Owns | Public surface |
|---|---|---|
| `lib/skills.js` | skill persistence | `list/get/add/remove/contextForPrompt` |
| `lib/workflows.js` | workflow persistence + step resolution | `list/get/add/remove/resolveSteps/contextForPrompt` |
| `lib/monitor.js` | rolling frame buffer | `start/stop/pause/resume/recent/status` |
| `lib/claude.js` | all one-shot model calls | `understandDemonstration/chat/routeCommand/planExecution` |
| `lib/agent.js` | the autonomous session | `runSession({goal, skill, capture, execute, confirm, shouldAbort, onEvent})` |
| `lib/executor.js` | OS input | `perform(action)`, `isAvailable()` |

`agent.js` deliberately has **no Electron or native imports** — capture and
execution are injected. That makes the brain testable headlessly and lets the
hands be swapped (nut.js today; an accessibility-tree driver in Phase 4).

---

## 3. Data model (all local JSON in Electron `userData`)

### 3.1 Skill — a taught, generalized technique
```jsonc
{
  "id": "uuid",
  "name": "File my weekly status report",
  "description": "Opens the template, fills this week's numbers, emails it.",
  "steps": ["Open Drive and duplicate the report template", "…"],
  "trigger_phrases": ["file my report", "weekly status"],
  "app_context": "Google Drive + Gmail",
  "frames": ["data:image/png;base64,…"],      // the demonstration evidence
  "note": "always CC my manager",              // user hint the AI can't see
  "created_at": "ISO-8601"
}
```

### 3.2 Workflow — an ordered composition of skills and ad-hoc goals
```jsonc
{
  "id": "uuid",
  "name": "Monday morning startup",
  "description": "Everything I do to start the week.",
  "trigger_phrases": ["start my monday", "monday routine"],
  "steps": [
    { "type": "skill", "skill_id": "uuid-of-check-email-skill" },
    { "type": "goal",  "goal": "Open the team dashboard and screenshot it" },
    { "type": "skill", "skill_id": "uuid-of-file-report-skill" }
  ],
  "created_at": "ISO-8601"
}
```

### 3.3 Runtime events (main → renderer stream, `agent:event`)
`started · thinking · action · permission · confirm-request ·
permission-result · step-started · step-finished · done · aborted ·
max_steps · error · finished`

---

## 4. The conversational command layer

Everything is invocable by talking. One router, four verdicts:

```
 "file my report and then start my monday routine"
        │  (voice → SpeechRecognition → transcript, or typed)
        ▼
 routeCommand(transcript, skills+workflows context)   — Claude tool-calling
        ├─ run_skill    {skill_id}      → gated autonomous run of that skill
        ├─ run_workflow {workflow_id}   → gated sequential run of its steps
        ├─ run_goal     {goal}          → gated ad-hoc autonomous run
        └─ reply        {message}       → conversation only, no action
```

Design rules:
- **Prefer taught knowledge**: a matching skill/workflow beats an ad-hoc goal.
- **The router never executes** — it only names the intent. Execution always
  goes through the same gated `runSession` path regardless of entry point
  (mic, chat box, Skills tab, Workflows card). One safety choke point.
- Ambiguity → `reply` with a clarifying question, never a guess-and-run.

---

## 5. Execution engine (full computer power, one gate)

`agent.js` runs Claude **computer-use** as the operator:

1. Screenshot (downscaled to `SA_TARGET_WIDTH`, coords rescaled to real pixels).
2. Model returns tool actions — `left_click`, `type`, `key`, `scroll`,
   `left_click_drag`, `double_click`, `wait`, ….
3. `executor.js` performs them with nut.js on the real devices.
4. Fresh screenshot goes back as the tool result → the model **verifies its own
   work** before the next action.
5. Loop ends when the model stops requesting actions, hits `SA_MAX_STEPS`,
   errors, or is aborted.

**Safety model — layered, all mandatory:**

| Layer | Mechanism |
|---|---|
| Entry gate | no run starts without an explicit user approval click |
| Risk gate | `ask_permission` tool: the model must request approval before destructive / irreversible / outbound actions; run pauses for Approve/Deny |
| Heuristic backstop | clearly destructive shortcuts (⌘Q/⌘W…) force a prompt even if the model forgets |
| Paranoid mode | `SA_CONFIRM_EVERY=1` → every single action confirms |
| Kill switch | STOP button + global **Ctrl/Cmd+Shift+X**, checked before every step; releases pending prompts as *denied* |
| Bounds | `SA_MAX_STEPS` per run; workflows additionally bound per step |
| Fail-safe default | an unwired confirm handler **denies** |

Workflows inherit all of this per step, plus: a step that ends `aborted` or
`error` halts the whole workflow (no blind continuation).

---

## 6. Perception & privacy

Two capture modes, one principle — **frames leave the machine only on an
explicit user action** (teaching a skill, planning, or an approved run):

- **Record window** (Teach tab / Ctrl+Cmd+Shift+R): sampled frames while the
  user demonstrates; ends at Stop.
- **Continuous watch** (Watch tab, `lib/monitor.js`): opt-in rolling buffer,
  **in-memory only**, bounded (`SA_WATCH_MAX_FRAMES`), pausable, dropped on
  stop. Enables "turn what I *just* did into a skill" without pre-planning.

Hardening backlog (Phase 4): per-app allow/deny lists, password-field
redaction, on-screen recording indicator required by some OSes.

---

## 7. Productivity surface (what the user actually feels)

| Need | How the blueprint serves it |
|---|---|
| "Do this thing I always do" | teach once → say its name forever |
| "I forgot to record it" | Watch buffer → name what you just did |
| "Do these five things every morning" | compose skills into a **workflow**, one spoken phrase runs it |
| "Just handle this one-off" | ad-hoc goal → autonomous run |
| "What can you do?" | Skills/Workflows library is the assistant's living manual, browsable and speakable |
| "Don't touch anything dangerous" | approval gates + paranoid mode + kill switch |

---

## 8. Configuration

| Key | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | model access | required |
| `ANTHROPIC_MODEL` | teach/chat/plan/router model | `claude-sonnet-5` |
| `SA_COMPUTER_USE_MODEL` | operator model (computer-use capable) | falls back to `ANTHROPIC_MODEL` |
| `SA_COMPUTER_TOOL_TYPE` / `SA_COMPUTER_BETA` | tool version / beta flag | `computer_20250124` / `computer-use-2025-01-24` |
| `SA_MAX_STEPS` | per-run action cap | 40 |
| `SA_ACTION_DELAY_MS` | settle delay between actions | 350 |
| `SA_TARGET_WIDTH` | model's view width (px) | 1280 |
| `SA_CONFIRM_EVERY` | confirm every action | off |
| `SA_WATCH_INTERVAL_MS` / `SA_WATCH_MAX_FRAMES` | watch buffer tuning | 3000 / 40 |

OS permissions: Screen Recording + Accessibility (macOS) · X11 (Linux; nut.js
has no Wayland) · none extra (Windows).

---

## 9. Roadmap & maturity

| Phase | Scope | Status |
|---|---|---|
| 0 | Teach, library, chat, plan preview | ✅ |
| 1 | Real gated execution (computer-use + nut.js), kill switch, risk gate | ✅ |
| 2 | Continuous private watch buffer | ✅ |
| 2.5 | Voice command layer (intent router) | ✅ |
| 3 | **Workflows** — compose skills/goals into named plans | ✅ skeleton (this repo) |
| 4 | Robustness: accessibility-tree grounding, success/failure feedback into skills, per-app privacy lists, redaction, skill versioning/export | ◻ next |
| 5 | Packaging (electron-builder installers, auto-update, keychain-stored key), telemetry opt-in, multi-display support | ◻ |

**Honest frontier:** pixel-grounded autonomy is genuinely capable but not yet
trustworthy *unattended*. The blueprint's answer is Phase 4 grounding + the
permanent layered gates — power first, trust earned per skill.

---

## 10. Testing strategy

- `node --check` on every module (no build step to hide behind).
- `agent.js` is dependency-injected → unit-testable with fake capture/execute.
- Stores are plain JSON classes → testable without Electron.
- End-to-end: launch on a desktop OS, teach a trivial skill (open an app),
  run it, verify the gate triggers on a destructive decoy task.
```
