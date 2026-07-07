# JARVIS Quality Blueprint

A deeply-reasoned plan to raise JARVIS from "impressive demo that mostly works"
to "dependable daily driver." Grounded in the actual codebase (`lib/*.js`,
`main.js`, `renderer/`) and in the concrete failures observed while using it
(slow simple tasks, "said done but didn't report back," it closed itself instead
of the tabs, voice that couldn't hear, self-improve 401s).

The organizing thesis: **JARVIS's ceiling is set by three things — how accurately
it perceives, how reliably it grounds actions, and whether it can measure itself.**
Most of the pain we hit maps to exactly those. Fix them systematically and the
rest (speed, cost, trust) follow.

---

## 1. Where quality is actually lost

| Symptom we hit | Root cause | Dimension |
|---|---|---|
| Simple tasks slow | Everything went through the vision loop | Latency / routing |
| "Summarize" said done, no answer | Routed to an action loop with nothing to click | Perception vs action confusion |
| Closed itself, not the tabs | Blind pixel/keyboard actions with no target identity | **Grounding** |
| Voice didn't work | No STT backend; wrong provider | Perception (audio) |
| Self-improve 401 | Sub-process auth wasn't wired | Integration robustness |
| "Never gives a summary" | No structured page read | **Perception (DOM)** |

Notice the pattern: the recurring, *scary* failures (self-shutdown, wrong clicks,
empty answers) are **grounding and perception** failures, not model-intelligence
failures. That's where the highest-leverage work is.

---

## 2. Quality model — the eight dimensions

1. **Perception** — how completely & accurately JARVIS senses state (screen, DOM,
   accessibility tree, audio).
2. **Grounding** — mapping an intent to the *exact right target* (this button, this
   window) rather than approximate pixels.
3. **Reliability** — verification, retries, recovery; does a task actually complete.
4. **Latency** — wall-clock per task; round-trips, screenshots, model size.
5. **Safety** — never doing harm; preview, undo, self-preservation, sandboxing.
6. **Evaluation** — can it *measure* its own success and catch regressions.
7. **Memory** — recall the right thing at the right time; compaction, retrieval.
8. **Self-improvement** — closing the loop: measure → change → verify improvement.

---

## 3. Deep analysis + execution tasks

### 3.1 Perception — read structure, not pixels
**Current:** `webpage.js` extracts browser DOM + interface map (great, just added).
`agent.js` otherwise feeds JPEG screenshots to the model. Native (non-browser)
apps are still pixels-only.

**Gap:** Pixels are lossy and expensive. The model re-reads the same UI every
step, mis-locates small targets, and can't reliably distinguish JARVIS's own
window from the target app — the direct cause of the self-shutdown.

**Tasks**
- **P0 — Accessibility-tree perception** (`lib/axtree.js`, new): on macOS, read the
  focused app's accessibility hierarchy (roles, titles, values, frames) via a
  small Swift/JXA helper (`osascript`/`AXUIElement`). Gives every native control a
  name + coordinate, the same way `webpage.js` does for the browser. This is the
  single highest-leverage change: it fixes grounding, speed, and cost at once.
- **P0 — Unified "world model"** (`lib/perceive.js`, new): one function that returns
  the best available structured view — DOM (browser) → AX tree (native) →
  screenshot+OCR (fallback) — with a normalized `{elements:[{role,label,bounds}]}`
  shape the agent and executor both consume.
- **P1 — Set-of-Mark screenshots:** when a screenshot *is* needed, overlay numbered
  boxes on the detected elements and let the model refer to elements by number.
  Proven to sharply improve click accuracy vs raw pixels.
- **P2 — OCR fallback** for apps with no AX support (canvas apps, remote desktops).

### 3.2 Grounding — act on named targets
**Current:** `executor.js` clicks raw `(x,y)` coordinates the model guessed;
`quickactions.js` targets apps by name via AppleScript (safe). The self-preservation
rule in `agent.js` is a *prompt*, not a *guarantee*.

**Gap:** Coordinate guessing is the least reliable and most dangerous primitive.

**Tasks**
- **P0 — `click_element(label)` / `type_into(label, text)`** actions that resolve a
  target from the world model (3.1) to coordinates deterministically, instead of the
  model emitting pixels. Add to `agent.js` toolset + `executor.js`.
- **P0 — Hard self-preservation:** in `executor.js`, before any `cmd+q`/`cmd+w`/window
  close, check the frontmost app (AX/`System Events`); if it's JARVIS/Electron,
  refuse. Make the guard mechanical, not just a prompt (belt for the suspenders in
  `quickactions.js`).
- **P1 — Focus assertion:** before typing, assert the intended window/app is
  frontmost; re-focus if not. Prevents "typed into the wrong window."

### 3.3 Reliability — verify and recover
**Current:** `agent.js` loops until the model says done; no explicit success check,
no retry policy, unsupported actions degrade to no-ops.

**Gap:** "Said done" ≠ "did it." No post-condition verification, so failures pass
silently (exactly the summarize complaint, generalized).

**Tasks**
- **P0 — Post-condition verification:** each task carries an explicit success check
  (URL changed, element appeared, file exists). After the loop, verify and, if
  unmet, re-plan once. A lightweight "did this achieve the goal?" reflection step.
- **P1 — Bounded retry with reflection:** on a failed step, feed the error + last
  state back with an explicit "what went wrong, try a different approach" (ReAct +
  self-critique), capped at N.
- **P1 — Idempotency + checkpoints** for multi-step workflows so a mid-failure
  doesn't repeat side effects.

### 3.4 Latency — fewer, smaller, cheaper round-trips
**Current:** fast paths for open/close/search (`quickactions.js`), image pruning
(`history.js`), prompt caching in `agent.js`. Routing + chat use the full model.

**Gap:** The router runs the big model on every utterance; the agent screenshots
every step; no model tiering.

**Tasks**
- **P0 — Model tiering:** route/classify with **Haiku** (`getRouterModel`, default
  `claude-haiku-4-5`), reserve Sonnet/Opus for hard reasoning and vision. Routing is
  simple classification — this cuts the most common latency with near-zero quality
  loss.
- **P0 — DOM/AX actions skip screenshots** (follows from 3.1): most steps become
  text round-trips, not image round-trips — the biggest single speedup.
- **P1 — Speculative pre-capture:** capture the next observation while the model is
  still thinking, so act→observe overlaps.
- **P2 — Streaming** partial responses to the widget for perceived latency.

### 3.5 Safety — preview, undo, audit
**Current:** approval gate + STOP (`agent.js`), Full Control default-on, dangerous
shell/self-edit guards (`shell.js`, `selfedit.js`), self-edit auto-revert.

**Gap:** No "here's exactly what I'm about to do" preview for GUI actions; no global
undo; no persistent audit trail the user can review.

**Tasks**
- **P1 — Action preview + dry-run** for destructive/outbound steps: show the
  concrete plan and target before executing (the AX/DOM label makes this legible).
- **P1 — Audit log** (`telemetry.jsonl` already exists) surfaced in the UI: a
  reviewable history of every action taken, with one-click "explain."
- **P2 — Session snapshot/undo** for filesystem-affecting runs (git-style stash of
  touched files, like `selfedit` already does for code).

### 3.6 Evaluation — measure or it isn't real
**Current:** `telemetry.js` records kind/status/duration/steps and summarizes.
That's the seed; there's no *task-success* eval or regression guard.

**Gap:** We can't tell if a change made JARVIS better or worse except anecdotally.
This is the meta-lever: it makes every other improvement measurable and makes
"optimize yourself" trustworthy.

**Tasks**
- **P0 — Golden-task eval harness** (`test/eval/`): a set of scripted tasks with
  programmatic success checks (open X and confirm frontmost; summarize a fixed local
  HTML and check key facts; run a shell command and check output). Runnable headless
  where possible; a scorecard (success %, avg latency, avg steps).
- **P0 — Wire eval into "optimize yourself":** run the eval before and after a
  self-edit; **keep the change only if the scorecard improves and tests pass.** This
  turns self-improvement from "hope" into a measured ratchet.
- **P1 — LLM-judge for open-ended outputs** (summaries): a rubric-scored judge on a
  fixed sample, tracked over time.
- **P1 — Regression CI:** run the deterministic slice of the eval on every PR.

### 3.7 Memory — retrieve the right thing
**Current:** `memory.js` = markdown vault + keyword `search()` + recent-days digest
injected into prompts. Good foundation; retrieval is substring-only.

**Gap:** Keyword search misses paraphrase; the digest is recency-based, not
relevance-based; no compaction, so it grows unboundedly.

**Tasks**
- **P1 — Semantic retrieval:** embed observations/notes (local embeddings or a small
  API) and retrieve by similarity to the current request, not just recency.
- **P1 — Reflection/compaction:** periodically distill raw observations into durable
  "learned procedures" notes (this is what the watch-and-learn data is *for*).
- **P2 — Structured user model:** typed facts (preferences, accounts, common tasks)
  separate from prose, for reliable recall.

### 3.8 Self-improvement — a measured, staged loop
**Current:** on-screen Claude Code / built-in editor; validate (syntax + smoke);
auto-revert on failure; git self-update; telemetry-driven "optimize yourself."

**Gap:** Validation proves "not broken," not "better." No staged rollout, no
before/after proof.

**Tasks**
- **P0 — Gate self-edits on the eval scorecard** (ties to 3.6): change is accepted
  only if eval success ↑ or latency ↓ with no test regressions.
- **P1 — Staged rollout:** land self-edits behind a flag; auto-rollback if live
  telemetry degrades over the next N runs.
- **P2 — Improvement journal:** every self-edit records hypothesis → metric delta,
  so JARVIS learns which kinds of changes actually help.

---

## 4. Sequenced roadmap

**Phase 0 — Foundations of trust (do first)**
1. ✅ Golden-task eval harness + scorecard (`test/eval/`), gating self-improvement.
2. Mechanical self-preservation guard in `executor.js`.
3. ✅ Model tiering: Haiku router (`getRouterModel`).

**Phase 1 — Perception & grounding (the ceiling-raiser)**
4. `lib/perceive.js` world model (DOM → AX tree → screenshot).
5. macOS accessibility-tree reader (`lib/axtree.js`).
6. `click_element(label)` / `type_into(label)` grounded actions.
7. Post-condition verification + one re-plan.

**Phase 2 — Reliability & measured self-improvement**
8. Bounded retry-with-reflection.
9. Gate "optimize yourself" on eval delta; keep-or-revert on the scorecard.
10. Set-of-Mark screenshots for the fallback path.

**Phase 3 — Memory, safety polish, cost**
11. Semantic retrieval + observation compaction.
12. Action preview/dry-run + audit UI.
13. Speculative pre-capture; streaming to the widget.

---

## 5. How we'll know it worked (targets)

- **Task success rate** (from the eval harness): baseline it now; target ≥ 90% on
  the golden set.
- **Median latency** for "open/close/summarize": target < 2s for the fast paths,
  and ≥ 40% fewer screenshots per GUI task after the AX-tree work.
- **Zero self-harm incidents** (never quits/closes itself) — asserted by a
  dedicated eval case.
- **Self-improvement is monotonic**: no merged self-edit that lowers the scorecard.

---

## 6. Principle to hold onto

Every capability we've added is a *reach* extension (it can do more). The next
phase is *reliability* extension (it does what it reaches for, provably). Perceive
structurally, act on named targets, verify the result, and measure every change.
That is the difference between a demo and something you trust with your computer.
