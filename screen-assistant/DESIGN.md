# Screen Assistant — Architecture & Roadmap

An AI desktop assistant that **watches the screen, learns actions by demonstration,
remembers them as named skills, and recalls/executes them conversationally** —
always behind a human-approval gate.

This document is the map from the current MVP to the full vision. It is honest
about what is buildable today versus what is a research frontier.

---

## 1. The four pillars

| # | Pillar | What it means | Status in this repo |
|---|--------|---------------|---------------------|
| 1 | **Perception** | Capture what's on screen (and optionally input events) | ✅ MVP: on-demand frame capture during a recording window |
| 2 | **Demonstration learning** | User performs an action, names it; the AI generalizes it into a reusable *skill* | ✅ MVP: frames + note → Claude → structured skill |
| 3 | **Memory** | A growing library of named skills the user can browse and recall | ✅ MVP: JSON store + library UI |
| 4 | **Autonomous execution + planning** | Recall a skill conversationally; the AI plans and carries it out | 🟡 MVP: plan generation + **human approval**; execution is *simulated* |

The hard, unsolved part is Pillar 4's *reliable* execution. The MVP deliberately
stops at "propose a plan the human approves," because driving a real machine
autonomously is where correctness and safety risk concentrate.

---

## 2. Current architecture (MVP)

Electron desktop app — a browser tab cannot see or control the OS, so this must
be a native/desktop shell.

```
┌──────────────────────────────────────────────────────────┐
│ Electron MAIN process (Node)                              │
│                                                            │
│  main.js        window, IPC, global shortcut               │
│  desktopCapturer ── captureFrame() → PNG data URL          │
│  lib/skills.js   SkillStore  → skills.json (userData dir)  │
│  lib/claude.js   Anthropic SDK  (key stays here only)      │
│      • understandDemonstration(frames, note)               │
│      • chat(history, skillLibraryContext)                  │
│      • planExecution(skill, currentScreenshot)             │
└───────────────▲───────────────────────┬───────────────────┘
                │ contextBridge (preload) │ whitelisted IPC only
┌───────────────┴───────────────────────▼───────────────────┐
│ Electron RENDERER (sandboxed web UI, no Node)             │
│  Teach tab     record → frames strip → name → save         │
│  Skills tab    library, expand, run, delete                │
│  Assistant tab chat → proposes skill → plan-approval modal │
└────────────────────────────────────────────────────────────┘
```

Security posture of the MVP:
- `contextIsolation: true`, `nodeIntegration: false` — the web layer never
  touches Node, the filesystem, or the API key.
- The renderer can only call the explicit methods in `preload.js`.
- The Anthropic key lives in `.env`, read by the main process, never shipped to
  the renderer.
- **No execution** happens without an explicit user click on an approval modal,
  and even then the MVP only simulates it.

---

## 3. Data model

A **skill** (see `lib/skills.js`):

```jsonc
{
  "id": "uuid",
  "name": "File my weekly status report",   // what the user called it
  "description": "…",                        // Claude's generalization
  "steps": ["…"],                            // inferred technique, not pixels
  "trigger_phrases": ["file my report", …],  // NL ways to invoke it
  "app_context": "Gmail",                    // where it happens
  "frames": ["data:image/png;base64,…"],     // demo thumbnails (MVP: inline)
  "note": "always CC my manager",            // user's free-text hint
  "created_at": "ISO-8601"
}
```

The key design choice: a skill stores a **generalized technique**, not a literal
recording. That's what lets it be re-applied when the screen differs.

---

## 4. Roadmap — MVP → autonomy

### Phase 0 — MVP (this repo)
- On-demand frame capture, teach-by-demonstration, skill library, conversational
  recall, plan generation, approval modal (execution simulated).

### Phase 1 — Real, gated execution
- Add an execution backend (`nut.js` / `robotjs`, or Claude **computer-use** with
  the [computer-use tool](https://docs.anthropic.com/en/docs/build-with-claude/computer-use)).
- Execute the approved plan **one step at a time**, re-screenshotting between
  steps so the model verifies it's on track (perceive → act → verify loop).
- Hard stops: pause before any step flagged `risk_level: high`.

### Phase 2 — Continuous, private perception
- Move from "record window" to always-on capture with an on-device ring buffer.
- **Privacy first:** local-only by default, per-app allow/deny lists, a global
  pause, automatic redaction of password fields, and clear recording indicators.
- Only send frames to the model on explicit user action, or with opt-in.

### Phase 3 — Skills that compose into plans
- Let the assistant chain skills for "large-scale plans/strategies": a planner
  decomposes a goal into a DAG of known skills + gaps, and asks to learn the gaps.
- Add a workflow/plan store on top of the skill store.

### Phase 4 — Robustness & memory
- Element-level grounding (accessibility tree, not just pixels) for reliability.
- Success/failure feedback loop so skills improve with use.
- Versioned skills; export/import; optional encrypted cloud sync.

---

## 5. Honest risks & open questions

- **Reliability:** pixel-only grounding is brittle. Phase 4's accessibility-tree
  grounding matters for anything you'd trust unattended.
- **Safety:** autonomous control of a real machine can send messages, spend money,
  or delete data. The approval gate is not optional; automate removing it only
  with per-skill, user-set trust levels.
- **Privacy:** "watches your screen at all times" is a serious data-handling
  commitment. Default to local-only; make every byte leaving the device a
  deliberate, visible choice.
- **Cost/latency:** vision calls per step add up. Cache, downscale frames, and
  prefer accessibility data where possible.

---

## 6. Where to look in the code

| File | Role |
|------|------|
| `main.js` | Electron main: capture, IPC, shortcut, wiring |
| `preload.js` | Safe bridge exposed to the UI |
| `lib/skills.js` | Skill persistence + prompt context |
| `lib/claude.js` | All Anthropic calls (learn / chat / plan) |
| `renderer/` | The three-tab UI |
