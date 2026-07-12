# 04 — Engineering Build Plan (Phase 1)

Milestone-based plan a small team (or a coding agent working sprint-by-sprint)
can execute. Each milestone ends demo-able. Estimated at 2-week sprints for a
2–3 person team; a capable coding agent compresses the calendar, not the
order.

## 0. Operating instructions (for whoever builds)

You are lead product architect, full-stack engineer, AI systems engineer,
data engineer, and UX designer. Build production-quality Phase 1 from
`03-phase-1-prd.md`. Do **not** reduce this to a generic dashboard, news
reader, chatbot, portfolio tracker, or CRM. Do not make silent product
decisions where these documents provide an answer; where a technical detail
is unspecified, choose the simplest robust approach that preserves
extensibility and record it in `BUILD_LOG.md`.

## 1. Repository scaffold (new repo: `capital-intelligence`)

```
capital-intelligence/
├── apps/
│   ├── web/            # Next.js + React + TS; Sigma.js Intelligence Map
│   └── engine/         # Node worker: agents, loops, schedulers
├── packages/
│   ├── shared/         # types, zod schemas (Fact/Interpretation/Prediction/
│   │                   #   Recommendation, Evidence, Hypothesis, …)
│   ├── graph/          # graph service: Neo4j access, schema, invariants,
│   │                   #   versioning, entity resolution, influence calc
│   ├── agents/         # one module per agent: prompt(s) + IO schema + tests
│   ├── adapters/       # PortfolioAdapter, PriceAdapter, NewsAdapter,
│   │                   #   FilingAdapter, EventAdapter + seed implementations
│   └── seed/           # seeded universe + scripted market days (PRD §5)
├── infra/              # docker-compose: neo4j, postgres(+pgvector), app
├── e2e/                # Playwright demo-script tests
└── docs/               # these four planning docs, BUILD_LOG.md, ADRs
```

## 2. Milestones

### M0 — Foundations (Sprint 0)
Monorepo scaffold (pnpm + turborepo), CI (lint, typecheck, unit, e2e-smoke),
docker-compose infra, auth + roles, app shell with the 12-item left nav and
dark theme tokens, `Bus` interface on pg-boss, Anthropic client wrapper with
prompt-version registry and budget guard.
**Done when:** login → empty shell navigable; CI green; `BUILD_LOG.md` started.

### M1 — World model core (Sprints 1–2)
`packages/graph`: node/edge types from architecture §4 with state,
confidence, provenance, time-versioning; entity resolution (alias table +
resolver); influence score job; invariant enforcement (no write without
evidence ref; four-object-type separation). `packages/seed`: full seeded
universe + scripted market days loader. Admin screen v1 (users, adapter
status, audit log).
**Done when:** seed loads idempotently; graph queries answer "who owns
NVIDIA-like holding / what does it depend on / which clients affected" in
one call; every write carries provenance; unit tests on invariants.

### M2 — Intelligence Map (Sprints 3–4)
Sigma.js rendering with clustering + progressive disclosure; view modes
(Firm/Client/Portfolio/Holding/Theme/Risk/Knowledge/Time); all interactions
from PRD §4.1 (pan/zoom/search/expand/pin/hide/isolate/compare/filters/save
view); node visual language (size mappings, state glow); edge inspection;
detail panel with all fields + 9 actions (stub the ones whose targets come in
M3–M5); Trace Impact Path.
**Done when:** PRD §4.1 acceptance met on seeded graph; Playwright covers the
five-click firm→holding→supplier→clients path.

### M3 — The loop, part 1: exposures → research → evidence (Sprints 5–6)
Portfolio Intelligence agent (holdings → exposure edges + rollups); Research
Allocation Engine (scoring: exposure × confidence-gap × change-rate × client
impact × information value; ranked agenda; live research plans); Evidence
Extraction agent over the seeded news/filing stream; Relationship Discovery
(candidate edges, corroboration gate); background loop scheduler; graph
change propagation (state updates fan out, priorities recompute).
**Done when:** "advance day" in demo mode visibly updates node states,
research agenda re-ranks, and every new edge/state change traces to evidence.

### M4 — The loop, part 2: hypotheses → reasoning → attention (Sprints 7–8)
Hypothesis engine (living hypotheses, for/against, confidence history);
Contradiction pass; Reasoning agent (insights with chains, second-order
effects, fact/interpretation separation); Curiosity/blind-spot pass (Unknown
nodes, knowledge weather); **Today screen** fully wired (priorities, graph
changes, research agenda, alerts); **Hypotheses screen**; **News & Evidence
screen**; Tasks v1 with Outcome recording.
**Done when:** Today is generated end-to-end from the graph each simulated
day; six-question explainability template renders on every insight.

### M5 — Clients, scenarios, capital flows (Sprints 9–10)
Client list + full Client Profile (all tabs, client-scoped exposure map, AI
Insights with trails); Scenario engine + Scenario Studio + forward calendar
(Now/Next/Future); Capital Flow agent + Capital Flows screen (evidence-first
language enforced in copy review); Advisor Copilot ("Ask AI About This" +
guided topic drill-down in Research workspace).
**Done when:** meeting-prep-from-profile acceptance passes; 6 scenario
templates run with animated ripple paths; capital flow items all show
both-sides evidence + confidence.

### M6 — Memory, reports, polish, hardening (Sprints 11–12)
Institutional Memory screen + calibration record + Knowledge Advantage
metrics; Reports (3 templates, PDF export, disclaimer footer); Meta agent v1
(grade seeded-history hypotheses, adjust calibration); performance pass
(graph fps, query budgets); security/audit pass; full e2e demo-script suite;
seed-data richness pass; docs.
**Done when:** PRD §6 definition of done is met in a single continuous run.

## 3. Cross-cutting engineering rules

1. **Agents are pure modules:** prompt + zod IO schema + graph-service calls
   only; every agent has golden-set tests (fixed inputs → asserted structured
   outputs, judged for schema + key facts, not exact wording).
2. **Prompt versioning:** prompts live in-repo, versioned; every AI graph
   write logs agent + prompt version + input hash (audit requirement).
3. **Budgets:** per-loop token/cost budget enforced in the Claude wrapper;
   demo mode must run a full simulated day under a fixed budget.
4. **No silent truncation:** if an agent skips items (rate limits, budget),
   it must emit a visible "coverage" note on the affected screen.
5. **Determinism where possible:** seeded runs use temperature ≤0.3 and
   cached responses for e2e stability; the demo replay must be reproducible.
6. **ADRs:** any deviation from `02-system-architecture.md` §6 needs a short
   ADR in `docs/`.

## 4. Team / agent allocation (if parallelizing)

Workstream A: graph + engine (M1, M3, M4 backend). Workstream B: web UI (M2,
M4–M6 screens). Workstream C: agents + prompts + evals (M3–M6). Seed data is
a shared early deliverable (blocking M1 exit).

## 5. Dependencies & prerequisites

- Anthropic API key (paid tier; budget est. modest — seeded corpus is small).
- Docker locally; no other external services required for Phase 1.
- Optional (feature-flagged): SEC EDGAR RSS, FRED API keys for real-feed
  spike in M3+ — never on the demo path.

## 6. Testing strategy

- **Unit:** graph invariants (provenance, versioning, entity resolution,
  four-type separation), scoring functions, adapters.
- **Agent evals:** golden sets per agent; regression-run in CI on prompt
  changes.
- **E2E (Playwright):** the demo script below, plus the five-click map path,
  Today generation after "advance day", scenario run, report export.
- **Performance:** scripted fps/interaction budget check on the seeded map.

## 7. The 15-minute demo script (doubles as the e2e spine)

1. Log in as advisor → land on Intelligence Map (firm view, living graph).
2. Zoom into the AI-infrastructure cluster → click the NVIDIA-like holding →
   detail panel: exposure, affected clients, hypotheses, confidence.
3. Trace Impact Path from a supplier node → see which clients are touched.
4. "Advance day" (scripted capex-announcement event) → watch states change,
   ripple animate; Today re-ranks.
5. Open Today → top priority explains itself (six-question template) →
   jump to the exact graph region behind it.
6. Launch Research from the affected theme node → pre-drafted plan → follow
   one AI-guided drill-down step → promote a finding to a hypothesis.
7. Open the client profile of the most-affected client → AI Insights with
   evidence trails → create a task + add brief section to a report.
8. Scenario Studio: run "rates +50bps" → animated impact path → attach to
   the report → export PDF.
9. Hypotheses screen: show a confidence sparkline moving after today's
   evidence; show a contradiction challenge.
10. Institutional Memory: calibration record + Knowledge Advantage delta for
    the day. End.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Graph UI becomes chaotic/slow (most-likely product killer) | M2 is dedicated to it; clustering + progressive disclosure from day one; fps budget in CI; Sigma.js WebGL |
| Agents produce plausible-but-unsupported claims | Provenance invariant blocks evidence-free writes; contradiction pass; golden-set evals; visible confidence |
| Scope creep toward the 10-year vision (transcript is expansive) | Only PRD §1's 15 capabilities are in scope; everything else needs an ADR + explicit de-scope trade |
| Seeded data feels fake/thin | Dedicated seed workstream; 3–4 deeply-built ecosystems instead of shallow breadth; scripted days rehearsed against demo |
| LLM cost/latency in the background loop | Budget guard, small seeded corpus, batch windows, cached deterministic demo replay |
| Compliance-sounding output ("will happen") | Copy review gate in M5; language guardrails encoded in prompts + lint list of banned phrasings |

## 9. Open questions for the founder (non-blocking; defaults chosen)

1. **Product name.** Docs use "Capital Intelligence Platform"; engine
   codename "Financial Cognition Engine". Branding TBD.
2. **The 10-year one-sentence answer** the conversation asked for ("what do
   people say it does better than anyone else?") — a draft exists in
   `01-vision-and-principles.md` §1; confirm or rewrite it.
3. Real-data spike (EDGAR/FRED) inside Phase 1: nice-to-have flag, default
   **off**. Say the word to prioritize it.
4. Hosting target after local Docker (default: single cloud VM for demos).
5. Design partner: is there a friendly advisor/firm to demo to at M4 and M6?
   The demo script is built to run live for them.
