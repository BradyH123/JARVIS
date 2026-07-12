# 02 — System Architecture

> The interface is a window. The product is the intelligence system behind it.

## 1. Layer diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│ INTERFACE LAYER (web app)                                              │
│  Intelligence Map · Today · Clients · Research · Capital Flows ·       │
│  Future & Scenarios · News & Evidence · Hypotheses · Tasks · Reports · │
│  Institutional Memory · Administration        (all views of the graph) │
├────────────────────────────────────────────────────────────────────────┤
│ EXPLAINABILITY LAYER                                                   │
│  Every insight answers: what changed · why it matters · who's affected │
│  · how sure we are.  Trace: Recommendation → Reasoning → Hypotheses →  │
│  Evidence → Sources → Original documents                               │
├────────────────────────────────────────────────────────────────────────┤
│ AI BRAIN (modular agents on an event bus)                              │
│  Portfolio Intelligence · Research Allocation · Evidence Extraction ·  │
│  Relationship Discovery · Hypothesis · Reasoning · Scenario ·          │
│  Capital Flow · Curiosity/Blind-Spots · Contradiction · Memory ·       │
│  Advisor Copilot · Meta (self-calibration)                             │
├────────────────────────────────────────────────────────────────────────┤
│ WORLD MODEL (knowledge graph + entity state)                           │
│  Time-aware, confidence-scored, provenance-complete graph of clients,  │
│  holdings, companies, people, themes, macro factors, events, evidence, │
│  hypotheses, research projects, tasks, outcomes                        │
├────────────────────────────────────────────────────────────────────────┤
│ DATA LAYER (adapters)                                                  │
│  Phase 1: seed/simulation adapters (firm, clients, holdings, prices,   │
│  news, filings, events) · Later: real feeds behind the same interfaces │
└────────────────────────────────────────────────────────────────────────┘
```

## 2. The two loops

### 2.1 Background world-intelligence loop (always on)
Watches sources, parses documents into structured evidence, resolves
entities, creates/updates relationships, updates entity states and
confidence, and triggers reasoning when things change. It runs on a schedule
plus event triggers, independent of any user being logged in.

### 2.2 Advisor (portfolio-driven) intelligence loop — the spine
The locked 10-step **Capital Intelligence Loop**:

1. **Map holdings** — every client, every account, every position.
2. **Decompose** each position into underlying drivers: sectors, factors,
   geographies, dependencies (suppliers/customers/power/logistics), themes,
   macro sensitivities, key people, single-name concentrations.
3. **Prioritize research** — score by exposure size, confidence of current
   understanding, rate of change, potential client impact, information value.
   Decide where attention goes today.
4. **Gather evidence deliberately** — targeted collection against open
   research plans, not random ingestion.
5. **Evaluate evidence** — does it strengthen or weaken a view? How strong is
   the source? Structured extraction with provenance.
6. **Update the graph** — entities, relationships, states, confidence;
   never overwrite history (versioned facts).
7. **Reason across the graph** — second-order effects, client impacts,
   broken assumptions; separate facts / interpretations / predictions /
   recommendations.
8. **Simulate scenarios** — "what if rates +50bps / tariffs hit semis / AI
   demand doubles"; show projected impact paths with confidence.
9. **Prioritize human attention** — rank what deserves advisor eyes now.
10. **Deliver intelligence and learn** — explainable outputs (Today feed,
    tasks, reports); outcomes feed back to recalibrate confidence.

Change propagation is the graph's "nervous system": one update (e.g.,
"Microsoft raises capex") automatically fans out questions across connected
nodes (NVIDIA? TSMC? power? transformers? copper? which clients?) and updates
research priorities, hypotheses, scenarios, and tasks.

## 3. Agent roster

Agents are independent modules that consume and publish events on a shared
bus. Each has one job, its own prompt(s), and writes only through the graph
service (never raw DB access). Advisors only ever talk to the Copilot; the
rest work under the hood, orchestrated by a thin **Chief Intelligence
Orchestrator** that assigns work and enforces budgets.

| Agent | Job | Consumes | Produces |
|---|---|---|---|
| Portfolio Intelligence | Reverse-engineer every holding into an exposure map | holdings, instrument reference data | EXPOSED_TO / DEPENDS_ON edges, exposure rollups |
| Research Allocation (the heart) | Rank where the next hour of research creates most value; draft live research plans (key questions, evidence to gather, gaps, what would change our view) | exposures, confidence map, change events | ResearchProject nodes, ranked agenda |
| Evidence Extraction | Turn documents into structured Evidence (actor, action, object, time, confidence, quote, source) | raw documents from adapters | Evidence nodes + SUPPORTS/CONTRADICTS edges |
| Relationship Discovery | "What new connections might exist?" — propose edges with confidence | new evidence, entity states | candidate relationships (flagged until corroborated) |
| Hypothesis | Maintain living hypotheses: for/against evidence, confidence, assumptions, unknowns, analogues | evidence updates | Hypothesis nodes, confidence updates |
| Reasoning | Build explanations; second-order/system effects; keep facts vs. interpretations distinct | graph deltas | Insight objects with reasoning chains |
| Contradiction | Attack every conclusion: opposing evidence, alternative explanations, hidden assumptions | hypotheses, insights | challenges, downgraded confidence, flagged bias |
| Curiosity / Blind-Spots | Ask questions, not answers: missing links, low-confidence zones, surprises, intelligence debt | confidence map | research questions, unknown objects |
| Scenario | Run "what if" simulations over the graph; ripple paths per portfolio | hypotheses, exposures | Scenario nodes with impact paths |
| Capital Flow | Estimate directional capital pressures by theme with evidence for/against and confidence | market data, positioning signals | capital-flow assessments per theme/node |
| Memory | Compress, link, and version knowledge; institutional memory; nothing forgotten | everything | summaries, analogues, retrieval indexes |
| Advisor Copilot | Translate engine output into client-specific actions, briefs, drafts; answer free-form questions grounded in the graph | insights, client context | tasks, report sections, chat answers with citations |
| Meta | Grade past hypotheses/predictions; calibrate confidence; measure Knowledge Advantage | outcomes | calibration adjustments, KPI metrics |

**Debate pattern (used for high-stakes conclusions):** one agent argues for,
one against, one hunts missing information, one estimates uncertainty, one
finds historical analogues, one asks "what would make this completely
wrong?" — then a synthesizer writes the committee's conclusion. Phase 1
implements this as a single orchestrated multi-prompt pipeline (not six
always-on services).

## 4. Knowledge graph schema

### 4.1 Node types (Phase 1 set)

`Client, Account, Holding, Instrument (stock/ETF/fund/bond), Company, Person,
Sector, Industry, Theme, MacroFactor, GeographicRegion, Commodity,
PolicyBody (Fed/Congress/regulator), Event, Evidence, Source, Hypothesis,
Scenario, ResearchProject, Insight, Task, Report, Outcome, Unknown`

Abstract **concepts are first-class nodes** (e.g., "AI Adoption",
"Electrification", "Semiconductor Bottlenecks") — they bridge thousands of
concrete entities.

Every node carries **state**, not just fields:
- `status`: stable / improving / deteriorating / uncertain
- `confidence` (0–1) in our understanding of it, with history
- `influence` score (PageRank-style: if this changes, how much of the graph
  moves?)
- `firmExposure` (rolled-up AUM at stake) and `affectedClients`
- `researchPriority`, `unknowns[]`, `lastUpdated`
- optional capital metrics: attraction / momentum / stability (modeling
  language, not literal physics)

### 4.2 Relationship types (Phase 1 set)

```
OWNS, HOLDS, MANAGES, LEADS,
SUPPLIES, PURCHASES_FROM, COMPETES_WITH, DEPENDS_ON,
REGULATES, FUNDS, EXPOSED_TO, BENEFITS_FROM, HURT_BY,
CORRELATED_WITH, INFLUENCES, EXPECTED_TO_AFFECT,
HISTORICALLY_PRECEDES, PART_OF_THEME,
SUPPORTS, CONTRADICTS, SUBJECT_OF_RESEARCH
```

Relationships are first-class and intelligent. Every edge carries:
`strength, confidence, evidenceRefs[], firstObserved, lastConfirmed,
validFrom/validTo (time-aware), expectedDirection, estimatedImpact, notes`.
Clicking an edge in the UI must answer *why this relationship exists*.

### 4.3 Non-negotiable invariants

1. **Provenance:** nothing enters the graph without evidence — source,
   timestamp, confidence, original document ref, extracted quote.
2. **Time:** knowledge is versioned, never overwritten. The graph can answer
   "how did this relationship change, when, and why?"
3. **Entity resolution:** "NVIDIA" = "NVDA" = "Nvidia Corporation" — one
   entity, everywhere (alias table + resolver pass on ingestion).
4. **Earned admission:** data enters the graph only if it improves
   understanding of the financial world relevant to the firm — no hoarding.
5. **Four object types never blur:** Fact ≠ Interpretation ≠ Prediction ≠
   Recommendation. Distinct schemas, distinct UI labels.

### 4.4 Understanding stages (progress measure per entity)

Observed → Described → Connected → Explained → Modeled → Adaptive. Stored per
node; powers the Knowledge/confidence map ("knowledge weather": clear / foggy
/ unknown) and the CIO's coverage metrics.

## 5. Evidence & explainability model

```
Source (document, feed item)
  └─ Evidence (structured extraction: actor, action, object, time, quote,
     sourceQuality, confidence)
       ├─ SUPPORTS / CONTRADICTS → Hypothesis (living: confidence, assumptions,
       │                            unknowns, analogues, version history)
       │      └─ feeds → Insight (reasoning chain, second-order effects)
       │             └─ feeds → Recommendation / Task / Report / Scenario
       └─ updates → entity state & relationships
```

Every user-facing conclusion must render the six-question template:
what happened · why we think so · supporting evidence · contradicting
evidence · assumptions · what would change our mind. Confidence is always
visible. Unknowns are shown, not hidden.

## 6. Technology stack (Phase 1 decisions)

Chosen per the locked rule: *simplest robust approach that preserves future
extensibility.* Deviations require a written note in the build log.

| Concern | Decision | Rationale |
|---|---|---|
| App shape | Web app: **TypeScript monorepo** — `apps/web` (Next.js + React), `apps/engine` (Node worker), `packages/graph`, `packages/agents`, `packages/adapters`, `packages/shared` | One language end-to-end; agents and UI share types |
| Graph store | **Neo4j** (Community, via Docker) as the system of record for the world model | Locked decision: real graph DB from day one; Cypher fits influence/propagation queries |
| Relational store | **PostgreSQL** for auth, users, app state, job bookkeeping | Boring and right |
| Event bus / jobs | **pg-boss** on Postgres (Phase 1) behind a thin `Bus` interface | No extra infra; swap for Redis/NATS later without touching agents |
| AI | **Anthropic Claude API** (`@anthropic-ai/sdk`); each agent = versioned prompt + JSON-schema tool output; retrieval over the graph + document store (no model training) | Locked: strong model + curation/retrieval, not base-model training |
| Embeddings/search | pgvector on Postgres for document/evidence retrieval | Same DB, good enough for Phase 1 |
| Graph rendering | **Sigma.js (WebGL)** for the Intelligence Map (thousands of nodes, smooth pan/zoom); Cytoscape.js acceptable fallback for small subgraphs | The signature screen must stay fluid; restrained animation |
| Charts | Lightweight (e.g., Recharts/visx) for the few non-graph visuals (heat map, confidence trends, timeline) | Decisions attached to every chart, no decoration |
| Auth | Email+password with sessions (NextAuth or Lucia), role-based: Advisor / Analyst / CIO / Admin | Phase 1 is single-firm, multi-user |
| Deployment | Docker Compose (web + engine + neo4j + postgres); cloud later | Demo-able anywhere |
| Testing | Vitest unit; Playwright e2e on the demo script; golden-set evals for agent prompts | See build plan §6 |

### 6.1 Data adapters (Phase 1)

All ingestion goes through `packages/adapters` interfaces:
`PortfolioAdapter, PriceAdapter, NewsAdapter, FilingAdapter, EventAdapter`.
Phase 1 ships **seed/simulation implementations** (deterministic, replayable
"market days" so the graph visibly lives during demos). Optional cheap real
feeds (SEC EDGAR RSS, FRED) may be added behind the same interfaces if time
allows — they must be feature-flagged and never block the seeded demo.

## 7. Security, privacy, compliance posture (Phase 1)

- Client PII stays in our stores; prompts to the model send the minimum
  necessary context (no SSNs/account numbers in Phase 1 seed data at all).
- Full audit trail: every AI write to the graph records agent, prompt
  version, inputs hash, and evidence refs.
- Role-based access; Admin screen exposes audit history and AI settings.
- All forward-looking outputs carry the language guardrails from
  `01-vision-and-principles.md` §6. This is decision support, not investment
  advice; put that in the footer of every report.

## 8. What Phase 1 explicitly defers

Real custodian/CRM/market-data integrations; autonomous overnight research
fleets; multi-firm tenancy; the internal "attention economy" and department
reputation systems; satellite/alt-data; compliance document generation;
mobile apps (the web UI must merely be usable on tablet). The architecture
above leaves clean seams for each.
