# 03 — Phase 1 PRD

Phase 1 delivers a **polished, functional demonstration of the complete core
loop** on seeded data. Not a hollow prototype, not the ten-year platform.

## 1. Phase 1 capabilities (the locked 15)

A user must be able to:

1. Log into the application (role-based: Advisor / Analyst / CIO / Admin).
2. View a wealth management firm with multiple sample clients.
3. View accounts and holdings at both firm and client level.
4. Explore a living exposure and influence graph (Intelligence Map).
5. Click any holding, company, theme, person, event, or macro factor.
6. See how that node connects to the rest of the financial system.
7. View supporting evidence and related news for any node.
8. Inspect current hypotheses and forward-looking assessments.
9. Identify which clients may be affected by any node/event.
10. Create or launch a targeted research investigation.
11. Use AI to explore a topic and follow connected subtopics (guided
    drill-down).
12. View future events and scenarios related to the firm's holdings.
13. Generate advisor tasks and reports from graph intelligence.
14. Inspect the reasoning and evidence behind every insight.
15. See how confidence changes over time.

## 2. Non-goals (Phase 1)

- No real brokerage/custodian/CRM connections (seed adapters only).
- No trade execution, rebalancing, or performance accounting.
- No lead-generation/prospecting module (separate future product surface).
- No compliance-document generation.
- No mobile apps; desktop-first, usable on tablet, simplified on small
  screens.
- Chat is present but secondary — never the primary interface.

## 3. Global structure

Left navigation, in order (default landing = Intelligence Map):

1. **Intelligence Map** 2. **Today** 3. **Clients** 4. **Research**
5. **Capital Flows** 6. **Future & Scenarios** 7. **News & Evidence**
8. **Hypotheses** 9. **Tasks** 10. **Reports** 11. **Institutional Memory**
12. **Administration**

Design language: graph-first · dark-mode-first · dense but organized ·
professional · fast · explainable · zoomable firm→client→holding · optimized
for large desktops. Avoid: card walls, prose walls, decorative charts,
consumer-fintech gradients, AI sparkle, hidden reasoning, chat-first UX.
Every screen answers **one question** (noted per screen below).

---

## 4. Screen specs

### 4.1 Intelligence Map — "What do we own and what forces surround it?"

The signature feature and home screen: the firm's financial world as a living
network **starting from what the firm and its clients own**.

**Graph content:** firm → clients → accounts → holdings → instruments →
companies → sectors/industries → themes → commodities → countries → macro
factors → policies/regulators → executives → suppliers → risks → research
priorities.

**View modes (switcher):** Firm · Client · Portfolio · Holding · Theme ·
Capital Flow · Risk · Knowledge (confidence weather) · Time (scrub history).

**Interactions (all required):** pan, zoom, search, expand node, collapse
branch, pin, hide, isolate a relationship path, compare two nodes, filter by
node type / relationship type / confidence / impact / time horizon / client /
account / source freshness, save a view, add a view to a report, launch
research from any node, create an alert from any node, open the detail panel
without leaving the graph.

**Node visual language:**
- Size — configurable: AUM exposure · influence · possible impact · research
  priority · confidence · capital momentum · # affected clients.
- State (border/glow) — stable / improving / deteriorating / uncertain,
  rendered as the green/yellow/red + grey language throughout the product.
- When evidence changes a node's state, animate the change subtly and show
  the impact path on demand ("Trace Impact Path"). No chaos: intelligent
  clustering + progressive disclosure; restrained animation.

**Edge inspection:** clicking an edge shows why the relationship exists —
type, strength, confidence, evidence for/against, history.

**Detail panel (right side, on node click):** name, type, current status,
summary metrics, firm exposure, affected clients, direct relationships,
strongest upstream influences, strongest downstream impacts, recent evidence,
current hypotheses (with for/against), confidence + trend, unknowns, future
events, scenario sensitivity, research priority, suggested advisor actions,
audit trail. **Actions:** Open Full Profile · Launch Research · Ask AI About
This · Add to Watchlist · Create Task · Create Scenario · Add to Report ·
Compare · Trace Impact Path.

**Acceptance:** 60fps-feel pan/zoom on the seeded graph (~1–2k visible nodes
clustered); every Phase-1 capability 4–9 reachable from this screen; a new
user can go firm → NVIDIA-style holding → supplier → affected clients in
under five clicks.

### 4.2 Today — "What changed and what deserves attention today?"

Translates the graph into a prioritized daily work plan. Not a news feed.

Sections:
- **Top Priorities** — ranked items with priority score, exposure amount,
  affected clients, confidence, urgency, time horizon, concise reason,
  recommended next step. Each links into the exact part of the graph that
  explains it.
- **Significant Graph Changes** — new/strengthened/weakened relationships,
  state changes, confidence moves since yesterday.
- **Research Agenda** — today's ranked research opportunities from the
  Research Allocation Engine, each with its live plan.
- **Watchlist & Alerts** — user-created node alerts that fired.

**Acceptance:** every item traceable (evidence trail ≤2 clicks); zero generic
headlines without a mapped exposure.

### 4.3 Clients — "What matters to this client?"

Client list → **Client Profile**, a briefing book, "Bloomberg page for a
person": header (net worth, AUM, goals, risk profile, last contact,
relationship health) + tabs: **Portfolio** (holdings w/ AI comments,
drift/concentration flags) · **Exposure Map** (client-scoped graph) ·
**Timeline** (life + financial events) · **News** (client-relevant only) ·
**Documents** (seeded; instant Q&A later) · **Meetings** · **AI Insights**
(talking points, tax ideas, relationship nudges, risks — each with evidence
trail) · **Tasks**.

**Acceptance:** an advisor can prep a client meeting from this screen alone;
every insight shows its why.

### 4.4 Research — "What should we investigate, and what have we learned?"

The research workspace. Left: ranked open **Research Projects** (from the
engine or created by users; every project has key questions, evidence to
gather, knowledge gaps, what-would-change-our-view; plans stay open and
evolve). Center: the active investigation — an interactive canvas mixing
graph excerpts, evidence cards, hypothesis panels, and AI-guided drill-down
(capability 11: pick a topic → the AI proposes connected subtopics and
questions → user follows a path, everything cited). Right: contribution
panel — promote findings into hypotheses, tasks, report sections, or
watchlist entries.

**Acceptance:** launch-research-from-node lands here with a pre-drafted plan;
completing an investigation visibly updates graph confidence.

### 4.5 Capital Flows — "Where may capital be reorganizing?"

Theme-level view of estimated capital pressures: direction, strength,
supporting signals, **contradicting signals**, confidence. A capital-flow
timeline that can be scrubbed. Strictly evidence-first language (no
"prediction" framing). Each theme links to exposed clients/holdings.

**Acceptance:** every flow assessment shows both sides of the evidence and a
confidence level; nothing renders without provenance.

### 4.6 Future & Scenarios — "What's coming, and what if?"

- **Forward calendar** auto-built from exposures: earnings, policy deadlines,
  known events tied to holdings — each with a pre-attached research plan
  (watch items, thresholds, possible actions) across **Now / Next / Future**
  horizons.
- **Scenario Studio**: pick or define a scenario ("rates +50bps", "tariffs on
  semis"), run it, see the ripple path animate across the graph with per-node
  and per-client impact, assumptions, and confidence. Scenarios are saved,
  comparable, and attachable to reports.

**Acceptance:** at least 6 seeded scenario templates; each scenario output is
labeled Prediction/Simulation, never fact.

### 4.7 News & Evidence — "What happened, and does it matter to us?"

The evidence center. Incoming items are shown **already mapped**: what
happened · who among our clients/holdings is affected · what we suggest doing
about it. Filter by node, client, source quality, confidence. Every item is a
structured Evidence object with its source and quote — the raw feed exists
but is one level down, not the default.

### 4.8 Hypotheses — "What do we currently believe, and how strongly?"

Registry of living hypotheses: statement, confidence (with sparkline
history), evidence for / against (counts + drill-in), assumptions, unknowns,
historical analogues, status (active/archived/refuted), owner (agent or
human). Contradiction-engine challenges appear inline.

### 4.9 Tasks — "What should humans do?"

Advisor task queue generated from graph intelligence + user-created tasks.
Each task: reason ("why now"), linked nodes/clients, priority, due date,
state. Tasks are views of the graph — completing one records an Outcome node.

### 4.10 Reports — "What do we send to clients/committees?"

Composable reports from saved graph views, insights, scenarios, and client
briefs. Phase 1: firm exposure report, client briefing, event impact report.
Export to PDF. Advice-disclaimer footer per architecture §7.

### 4.11 Institutional Memory — "What have we learned, ever?"

Searchable history: past hypotheses and their outcomes, past research
projects, decisions, meeting notes (seeded), confidence-calibration record
("when we said 80%…"). The Knowledge Advantage metrics live here and on the
CIO dashboard slice of Today.

### 4.12 Administration — "Is the system healthy and governed?"

Users/roles, clients/accounts management, data-source adapter status and
toggles, AI settings (model, budgets, prompt versions), audit log of every
AI write (agent, prompt version, inputs hash, evidence refs), system health
(job queues, ingestion lag).

---

## 5. Seeded data spec (Phase 1)

Deterministic, replayable, and rich enough that the demo feels alive:

- 1 firm, 4 advisors (one per persona), **12–20 clients** with realistic
  profiles (business owner, retired executive, physician, tech employee with
  concentrated stock, etc.), 1–4 accounts each, **150–300 total positions**
  across ~60–80 instruments (stocks, ETFs, funds, bonds, cash).
- A hand-curated **world subgraph** around those instruments: ~300–600
  companies/people/themes/macro nodes and ~1,500–3,000 edges, centered on 3–4
  deeply-built ecosystems (e.g., AI infrastructure: chips → foundries →
  equipment → power → transformers → copper → utilities → REITs; plus
  healthcare, energy, consumer).
- A **simulated market-day stream**: 10–15 scripted "days" of price moves,
  news items, filings, and events that exercise the whole loop (a capex
  announcement that ripples; a rate decision; an earnings miss; a supplier
  disruption; a client life event). Replayable via a demo control ("advance
  day") for live demos.
- Pre-seeded: ~20 hypotheses, ~10 research projects, ~6 scenarios, forward
  calendar entries, and enough evidence objects that every seeded conclusion
  is fully traceable end-to-end.

## 6. Definition of done for Phase 1

All 15 capabilities demonstrable in one continuous 15-minute demo (script in
`04-build-plan.md` §7) by a first-time user; every AI conclusion on screen
passes the six-question explainability template; the four object types are
visually distinct everywhere; graph performance targets met; e2e suite green.
