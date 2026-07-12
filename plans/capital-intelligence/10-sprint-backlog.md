# 10 — Sprint Backlog (ticket level)

Milestones M0–M6 from `04-build-plan.md` broken into buildable tickets.
Sizes: S (≤½ day for an agent/engineer-day), M (~1 day), L (2–3 days).
A ticket is done when its acceptance line passes **and** its tests exist.
Order within a milestone is dependency order unless noted.

## M0 — Foundations

| ID | Ticket | Size | Acceptance |
|---|---|---|---|
| M0-1 | Monorepo scaffold (pnpm, turborepo, TS strict, eslint/prettier, vitest) | M | `pnpm build && pnpm test` green on empty packages |
| M0-2 | `infra/docker-compose`: neo4j + postgres(+pgvector) + app targets | M | `docker compose up` → healthchecks pass |
| M0-3 | CI pipeline (lint, typecheck, unit, e2e-smoke, seed:lint stub) | M | PR check matrix green |
| M0-4 | `packages/shared`: zod schemas for envelopes, four insight kinds, Provenance | L | schemas exported, type tests |
| M0-5 | Auth + roles (4 personas), session middleware, authz matrix from 08 §5 | L | Playwright: login per role, forbidden routes 403 |
| M0-6 | App shell: icon-rail nav (12 areas), top bar, ⌘K stub, dark tokens from 09 §1 | M | shell navigable, tokens in a theme file |
| M0-7 | `Bus` interface on pg-boss + traceId plumbing + dead-letter table | M | job round-trip test with traceId propagation |
| M0-8 | Claude wrapper: prompt registry, versioning, budget guard, structured-output helper, response cache (for demo determinism) | L | unit tests incl. budget stop + cache hit |
| M0-9 | `BUILD_LOG.md` + ADR template + banned-phrase lint list | S | lint job fails on a planted phrase |

## M1 — World model core

| ID | Ticket | Size | Acceptance |
|---|---|---|---|
| M1-1 | Graph service skeleton: node/edge CRUD-without-delete, envelope validation (I6) | L | property tests on envelopes |
| M1-2 | Provenance enforcement (I1) + audit log write per mutation | M | `E_NO_PROVENANCE` on missing evidence; audit row present |
| M1-3 | Versioning (I2): validTo closure, AS-OF queries, ChangeLog stream | L | as-of query returns day-old state in test |
| M1-4 | Entity resolver (I3): normalization, alias/ticker match, candidate response | L | "NVDA"/"Nvidia Corp" resolve to one node in test |
| M1-5 | Insight kind rules (I4) + orphan sweep (I5) | M | `E_TYPE_BLUR` test; orphan flagged after TTL |
| M1-6 | Exposure rollup job (graph-spec §7) | L | rollups reconcile to firm AUM ±0.5% on seed |
| M1-7 | Influence score job (personalized PageRank, graph-spec §6) | M | Fed + showpiece nodes rank top-decile on seed |
| M1-8 | Propagation engine (graph-spec §8) + persisted ripples | L | capex fixture reaches copper in ≤4 hops, signals decay |
| M1-9 | Seed loader: universe from `packages/seed` (07 §4) + `seed:lint` gates | L | idempotent load; all §6 quality gates pass |
| M1-10 | Seed authoring: firm/users/16 clients/instruments/positions YAML | L | archetype exposures match 07 §4.3 targets |
| M1-11 | Seed authoring: 4 ecosystems (nodes+edges+evidence refs) | L×2 | node/edge counts in range; every non-obvious edge evidenced |
| M1-12 | Seed authoring: epistemic state (hypotheses, projects, scenarios, calendar, unknowns) + ~300 frozen documents | L×2 | six-question template renders end-to-end for 3 sampled conclusions |
| M1-13 | Canonical queries 1–7 (graph-spec §9) with latency tests | L | each query <150ms p95 on seed |
| M1-14 | Admin v1: users, adapter status, audit log (traceId chain view) | M | audit chain renders for a seeded write |

## M2 — Intelligence Map

| ID | Ticket | Size | Acceptance |
|---|---|---|---|
| M2-1 | `graph.neighborhood` API + server-side clustering + coverageNote | L | ≤400 nodes returned; clustering beyond |
| M2-2 | Server-side stable layout precompute | M | positions stable across reloads |
| M2-3 | `GraphCanvas` on Sigma.js: render, pan/zoom, LOD (09 §3) | L×2 | perf budget CI check passes |
| M2-4 | Node encoding (size switcher, type hue, state border+glyph, client badge) | M | visual regression story |
| M2-5 | Edge encoding + edge click → `EdgeDetailPanel` ("why this exists") | M | evidence list renders from seed |
| M2-6 | Interactions: expand/collapse/pin/hide/isolate/compare + keyboard map | L | Playwright per interaction |
| M2-7 | Filters (type/reltype/confidence/impact/horizon/client/account/freshness) | L | combined filters correct on fixtures |
| M2-8 | View modes: Firm/Client/Portfolio/Holding/Theme/Risk | L | mode switch re-scopes without reload |
| M2-9 | Knowledge view (weather buckets) + Time view (AS-OF scrub) | M | day-3 vs day-7 state visibly differs on seed |
| M2-10 | `NodeDetailPanel` full field set + 9 actions (stubs allowed where target ships M3–M5) | L | all PRD §4.1 panel fields render |
| M2-11 | Trace Impact Path (ripple replay from persisted ripples) | M | day-3 fixture replays; reduced-motion respected |
| M2-12 | Global search (⌘K, alias-aware) + saved views | M | "NVDA" and "Nvidia" hit same node |
| M2-13 | E2E: five-click firm→holding→supplier→clients path | S | scripted in Playwright, green |

## M3 — Loop part 1 (exposures → research → evidence)

| ID | Ticket | Size | Acceptance |
|---|---|---|---|
| M3-1 | Seed adapters (all 5) + DemoClock + advance-day/reset endpoints | L | day releases flow through normal pipeline |
| M3-2 | Ingestion pipeline stages as bus jobs (07 §1), idempotent, dead-letters | L | duplicate document is a no-op |
| M3-3 | Portfolio Intelligence agent + goldens | L | 06 §2 eval passes |
| M3-4 | Research Allocation scoring (deterministic) + weights in Admin | M | 06 §3 ranking eval passes |
| M3-5 | Research plan drafting (LLM) + `ResearchProject` writes | M | plans reference real exposure mechanisms |
| M3-6 | Evidence Extraction agent + goldens (15 fixtures) | L | precision target met; quotes verbatim |
| M3-7 | Relationship Discovery + corroboration gate | M | 06 §5 eval: candidate stays ≤0.5 until 2nd source |
| M3-8 | Orchestrator: background loop cadence + budgets + telemetry | L | full simulated day runs under budget |
| M3-9 | Wire propagation → rescore → `attention.reranked` | M | day-3 advance visibly re-ranks agenda |
| M3-10 | SSE `/live` channel + `graph.delta` animation hookup | M | state change animates without refetch |

## M4 — Loop part 2 (hypotheses → reasoning → attention)

| ID | Ticket | Size | Acceptance |
|---|---|---|---|
| M4-1 | Hypothesis agent + clamped log-odds updater | L | 06 §6 eval passes |
| M4-2 | Contradiction agent + thresholds + inline challenges | M | finds planted counter-evidence; never raises confidence |
| M4-3 | Reasoning agent (six-question template, four kinds) | L | day-3 fixture yields 4 chained distinct objects |
| M4-4 | Curiosity agent + Unknowns + knowledge weather feed | M | stale high-exposure sector surfaces top |
| M4-5 | Today screen (priorities, graph changes, agenda, alerts) | L | every row's trail ≤2 clicks; zero unmapped headlines |
| M4-6 | `ExplainabilityDrawer` (product-wide component) | M | walks REC→…→source on seed |
| M4-7 | Hypotheses screen (table, sparklines from ChangeLog, challenges) | M | day-7 weakening visible |
| M4-8 | News & Evidence screen (mapped rows; raw feed one level down) | M | filters persist; kind chips correct |
| M4-9 | Tasks + Outcome recording | M | completing task creates Outcome node |
| M4-10 | Alerts (create from node, fire on state change) | S | alert fires on day fixture |
| M4-11 | E2E: advance-day → Today regenerates with expected day-3 outcomes | M | matches seed expected-outcomes file |

## M5 — Clients, scenarios, capital flows, copilot

| ID | Ticket | Size | Acceptance |
|---|---|---|---|
| M5-1 | Client list + profile header + Portfolio/Timeline/News/Documents/Meetings tabs | L | meeting-prep acceptance (PRD §4.3) |
| M5-2 | Client Exposure Map tab (scoped `GraphCanvas`) | M | identical interactions, client scope |
| M5-3 | AI Insights tab (trails on every insight) | M | drawer opens from each insight |
| M5-4 | Scenario engine (shock → propagation reuse → LLM narrative) | L | 06 §10 eval passes |
| M5-5 | Scenario Studio UI + 6 templates + report attach | L | SIMULATION banner everywhere; bands not points |
| M5-6 | Forward calendar (Now/Next/Future) + pre-attached research plans | M | 25 seeded events grouped correctly |
| M5-7 | Capital Flow agent + Capital Flows screen + timeline scrub | L | both-sides evidence on every assessment |
| M5-8 | Advisor Copilot: Ask-AI-About-This + citations + refusal shape | L | 06 §13 eval: 0 fabricated citations |
| M5-9 | Research workspace: 3-pane canvas + guided drill-down + promote | L×2 | launch-from-node lands with pre-drafted plan; promote paths work |
| M5-10 | Client life-event path (day-9 fixture): timeline → task → brief | M | end-to-end on seed |
| M5-11 | Copy review gate: banned-phrase lint across UI + agent outputs | S | CI fails on violation |

## M6 — Memory, reports, meta, hardening

| ID | Ticket | Size | Acceptance |
|---|---|---|---|
| M6-1 | Memory agent (compression, analogues, retrieval index) | L | 06 §12 eval (day-3 belief recall) |
| M6-2 | Institutional Memory screen + calibration record | M | day-12 grading visible |
| M6-3 | Meta agent (prediction grading, multipliers, Knowledge Advantage) | L | 06 §15 eval passes |
| M6-4 | Reports: 3 templates, composer, PDF export, disclaimer footer | L | PDF renders saved view + scenario |
| M6-5 | Performance pass (map fps, query p95s, SSE under load) | M | budgets in CI all green |
| M6-6 | Security/audit pass (authz matrix tests, secrets, PII scan of prompts) | M | checklist in BUILD_LOG signed off |
| M6-7 | Full 15-minute demo-script e2e (build-plan §7, steps 1–10) | L | single continuous Playwright run green |
| M6-8 | Seed richness pass (rehearse demo, fix thin spots) | M | demo dry-run recorded |
| M6-9 | Docs: README, runbook, ADR sweep | S | new-machine setup <30min following README |

## Cut lines (if schedule pressure hits, in order)

1. Time view scrub (M2-9 second half) → ship AS-OF API only.
2. Capital-flow timeline scrub (M5-7 partial) → static assessment list.
3. Compare tray (M2-6 partial).
4. Alerts (M4-10) → watchlist only.
Never cut: invariants, explainability drawer, demo-script e2e, banned-phrase
gate — these are the product's identity.
