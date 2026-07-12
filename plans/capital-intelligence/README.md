# Capital Intelligence Platform — Build Planning Package

This folder is the distilled, buildable plan for the product designed in the
ChatGPT conversation of 2026-07-11/12 (transcript: "ChatGPT Conversation
Transcript", screen-recording OCR). It converts a long free-form brainstorm
into a decision-complete document set that a coding agent or engineering team
can execute **without guessing on anything the conversation already decided**.

## What we are building (one paragraph)

An **AI-native capital intelligence platform for wealth managers**. It does not
start from news; it starts from **what the firm and its clients own**. Every
holding is decomposed into its underlying exposures and drivers; a living
knowledge graph connects those exposures to companies, people, supply chains,
policies, themes, and macro forces; an AI "brain" of specialized agents decides
where research attention is most valuable, gathers evidence, maintains living
hypotheses with confidence scores, runs scenarios, and turns all of it into
prioritized, fully explainable advisor actions. The signature interface is the
**Intelligence Map** — a living exposure/influence graph that is the home
screen, with every other screen a view into the same underlying model.

**North star sentence** (locked in the conversation):

> Build the world's first Financial Cognition Engine — an AI-native
> intelligence platform that continuously constructs, challenges, and refines a
> causal model of the financial world, maps every client portfolio into that
> model, continuously allocates research toward the highest-value unanswered
> questions, and transforms that evolving understanding into transparent,
> explainable intelligence for wealth managers.

## Document map

**Layer 1 — direction (what and why):**

| Doc | Purpose | Read when |
|---|---|---|
| [`01-vision-and-principles.md`](./01-vision-and-principles.md) | Mission, the 8 locked principles, positioning, users, moat, language guardrails | First; it rarely changes |
| [`02-system-architecture.md`](./02-system-architecture.md) | The two loops, the 10-step Capital Intelligence Loop, agent roster, knowledge-graph schema overview, evidence/explainability model, tech stack decisions | Before writing any code |
| [`03-phase-1-prd.md`](./03-phase-1-prd.md) | Phase 1 scope, screen-by-screen product spec, node visual language, acceptance criteria | While building each screen |
| [`04-build-plan.md`](./04-build-plan.md) | Repo layout, milestone plan (M0–M6), engineering rules, demo script, testing strategy, risks | To run the build |

**Layer 2 — detailed specification (exactly how; added so nothing gets
decided implicitly mid-build):**

| Doc | Purpose | Governs |
|---|---|---|
| [`05-knowledge-graph-spec.md`](./05-knowledge-graph-spec.md) | Full data model: node/edge envelopes and registries, versioning, the 6 invariants with error codes, influence/rollup/propagation algorithms, canonical queries | `packages/graph` |
| [`06-agent-specs.md`](./06-agent-specs.md) | Per-agent contracts: triggers, IO schemas, prompt skeletons, guardrails, golden-set evals; debate pipeline; budget/model-tier rules | `packages/agents` |
| [`07-data-and-seed-spec.md`](./07-data-and-seed-spec.md) | Ingestion pipeline, adapter interfaces, demo mode, and the concrete seed universe: firm, 16 clients, 4 ecosystems, 12 scripted days with expected outcomes | `packages/adapters`, `packages/seed` |
| [`08-api-and-events-spec.md`](./08-api-and-events-spec.md) | tRPC routers/procedures, bus topics, SSE messages, authz matrix | server + `apps/web` boundary |
| [`09-ux-design-spec.md`](./09-ux-design-spec.md) | Design tokens, chrome, keyboard map, map rendering/perf budgets, per-screen layout, states & motion rules, component inventory | `apps/web` |
| [`10-sprint-backlog.md`](./10-sprint-backlog.md) | M0–M6 broken into ~75 tickets with sizes, acceptance lines, and cut lines | execution |
| [`11-decision-register.md`](./11-decision-register.md) | Every decision: LOCKED / DEFAULTED / OPEN, with override deadlines and change control | governance; the build-start gate |

**Layer 3 — execution readiness (running the build and the business):**

| Doc | Purpose | Used by |
|---|---|---|
| [`12-prompt-pack.md`](./12-prompt-pack.md) | Full v0.1 system prompts for all 13 agents + debate stages, shared preamble/rules, versioning policy | `packages/agents/prompts` seed |
| [`13-phase2-data-integrations.md`](./13-phase2-data-integrations.md) | Real-data waves W1–W6, vendor shortlists, cost envelope, and the Phase-1 seams to build now | Phase 2 planning; adapter design |
| [`14-validation-and-gtm.md`](./14-validation-and-gtm.md) | Target segment, positioning, design-partner program, the three validation gates (G1–G3), metrics | Founder, in parallel with M2–M6 |
| [`15-compliance-and-risk.md`](./15-compliance-and-risk.md) | Decision-support posture, regulatory touchpoints, AI risk register, security baseline, pre-pilot actions | Compliance story; pilot gate |

**Build-start gate:** the build begins when the founder has skimmed
`11-decision-register.md` §C and either answered or accepted the defaults.
Nothing in §C hard-blocks M0.

## Decisions already locked (do not re-litigate)

These were explicitly settled during the conversation:

1. **Own interface, not a bolt-on.** We build our own dashboard/product, not
   just an AI layer on top of an existing CRM — but we do not rebuild
   custodial/CRM plumbing in Phase 1.
2. **Exposure-first, never news-first.** The intelligence loop starts from
   portfolios and assets, then decides where to research. News is mapped onto
   exposures, not the other way around.
3. **The living exposure/influence graph is the home page** and the signature
   feature. Reports, tasks, and feeds are *views of the graph*.
4. **Two loops:** an always-on background world-intelligence loop, and a
   portfolio-driven advisor loop. The 10-step Capital Intelligence Loop is
   locked (see architecture doc §2).
5. **Graph database from day one**, modular agent architecture, event bus —
   so Phase 2 doesn't require a rewrite.
6. **Explainability is non-negotiable.** Every conclusion is traceable:
   Recommendation → Reasoning → Hypotheses → Evidence → Sources → Original
   documents. Facts, interpretations, predictions, and recommendations are
   four distinct object types.
7. **Language guardrail:** we do not claim to "predict where money will go."
   We surface where capital pressures and opportunities may be forming, with
   probabilities, supporting *and* contradicting evidence, and confidence
   levels. Internally the engine optimizes for **reducing uncertainty**.
8. **Visual over textual.** Meaningful figures, states, and graph structure —
   not walls of cards and prose. Dark-mode-first, dense-but-organized,
   Bloomberg in spirit, not in style.
9. **Phase 1 runs on seeded/simulated data** behind adapter interfaces that
   are cleanly swappable for licensed real-data feeds later.
10. **MVP mentality rejected for the core:** Phase 1 is a polished, functional
    demonstration of the complete core loop (all 15 Phase-1 capabilities in
    the PRD), not a throwaway prototype.

## Where the code will live

This planning package lives in the JARVIS repo for convenience, but the
platform is a separate product. **Recommendation:** implement in a dedicated
repository (working name `capital-intelligence` / engine codename **Financial
Cognition Engine**), scaffolded per `04-build-plan.md` §1. Nothing in this
plan depends on the JARVIS codebase.

## Glossary

- **Exposure** — a decomposed driver of a holding (sector, factor, geography,
  supplier dependency, theme, macro sensitivity, single-name concentration).
- **Evidence** — a structured, provenance-carrying extraction from a source
  document (filing, transcript, release, article), never raw text pasted into
  the graph.
- **Hypothesis** — a living, confidence-scored claim with supporting and
  contradicting evidence, assumptions, unknowns, and historical analogues.
- **Research plan / investigation** — an open-ended, evolving unit of research
  attention created by the Research Allocation Engine or an advisor.
- **World model / digital twin** — the knowledge graph plus entity states:
  the AI's continuously updated model of the financial world relevant to the
  firm.
- **Intelligence Map** — the home-screen living graph UI.
- **Knowledge Advantage** — the platform's defining metric: how much better is
  the firm's understanding today than yesterday (coverage, confidence
  calibration, uncertainty reduced by research).
