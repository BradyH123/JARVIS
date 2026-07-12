# 05 — Knowledge Graph Specification

Detailed data model for the world model. This is the contract for
`packages/graph`; nothing writes to Neo4j except through the graph service,
and the graph service enforces every invariant in §5.

## 1. Common node envelope

Every node, regardless of type, carries:

```ts
interface NodeEnvelope {
  id: string;                 // ULID
  type: NodeType;
  name: string;
  aliases: string[];          // feeds entity resolution
  createdAt: ISO8601;
  updatedAt: ISO8601;
  // State (the "living" part)
  status: 'stable' | 'improving' | 'deteriorating' | 'uncertain';
  confidence: number;         // 0–1: how well WE understand this entity
  understanding: 'observed' | 'described' | 'connected'
               | 'explained' | 'modeled' | 'adaptive';
  influence: number;          // §6 — recomputed, never hand-set
  firmExposureUSD: number;    // §7 rollup — 0 for non-exposure nodes
  affectedClientIds: string[];// §7 rollup
  researchPriority: number;   // set only by Research Allocation Engine
  unknowns: string[];         // open questions about this entity
  // Governance
  provenance: Provenance;     // who created it, from what (§5, I1)
}

interface Provenance {
  actor: 'seed' | 'user:<id>' | 'agent:<name>';
  promptVersion?: string;     // required for agent writes
  inputsHash?: string;        // required for agent writes
  evidenceIds: string[];      // required for agent writes (may be [] for seed/user)
  at: ISO8601;
}
```

`confidenceHistory` and `statusHistory` are not arrays on the node; they are
derived from the versioned change log (§4) so history is never truncated.

## 2. Node types and type-specific properties

| Type | Extra properties | Notes |
|---|---|---|
| `Client` | archetype, netWorthUSD, aumUSD, riskProfile, goals[], lastContactAt, relationshipHealth (0–1) | |
| `Account` | accountType (taxable/IRA/Roth/trust/529), custodianName, clientId | |
| `Holding` | accountId, instrumentId, quantity, costBasisUSD, marketValueUSD, portfolioWeight | Recomputed on price ticks |
| `Instrument` | assetClass (equity/etf/fund/bond/cash), ticker, exchange, expenseRatio?, sectorId, regionId | ETFs/funds get CONTAINS edges to constituents (top-N only) |
| `Company` | ticker?, isPublic, sectorId, hqRegionId, description, employees?, seededFinancials (rev, margin, capex — simulated) | |
| `Person` | role, primaryAffiliationId, personKind (executive/board/policymaker/investor) | |
| `Sector` / `Industry` | gicsCode? | Two levels only in Phase 1 |
| `Theme` | definition, maturity (emerging/established/fading) | First-class concepts, e.g. "AI Adoption" |
| `MacroFactor` | unit, currentValue, trend | e.g. Fed funds rate, 10Y yield, CPI |
| `Commodity` | unit, currentPrice | |
| `GeographicRegion` | isoCode? | |
| `PolicyBody` | jurisdiction, bodyKind (central bank/legislature/regulator) | |
| `Event` | eventKind (earnings/policy/corporate/supply/client-life/market), occursAt, importance (0–1), expectedImpact, actualImpact?, horizon ('now'/'next'/'future') | Future events power the forward calendar |
| `Source` | sourceKind (filing/transcript/press/news/macro-release/internal-note), publisher, url?, documentRef, publishedAt, retrievedAt, qualityTier (1–3) | Raw text lives in the document store, not the graph |
| `Evidence` | sourceId, actor, action, object, quote, extractionConfidence (0–1), asOf | The ONLY bridge between documents and the graph |
| `Hypothesis` | statement, confidence (0–1), assumptions[], analogues[], status (active/strengthening/weakening/archived/refuted), ownerActor | For/against via SUPPORTS/CONTRADICTS edges from Evidence |
| `Scenario` | definition, shocks[] ({target, param, delta}), horizon, runAt?, resultSummary?, label: 'SIMULATION' | Results stored as ImpactPath payloads |
| `ResearchProject` | keyQuestions[], evidenceToGather[], knowledgeGaps[], changeTriggers[] ("what would change our view"), status (open/active/dormant), priorityScore, originalTrigger | Never "closed", only dormant/archived |
| `Insight` | insightKind: 'fact' \| 'interpretation' \| 'prediction' \| 'recommendation', statement, reasoningChain[] (ordered refs to evidence/hypotheses/insights), confidence | I4: kind is immutable after creation |
| `Task` | title, reason ("why now"), priority, dueAt?, state (open/in-progress/done/dismissed), assigneeUserId? | Completing a task creates an Outcome |
| `Report` | reportKind (firm-exposure/client-brief/event-impact), sections[] (refs to saved views/insights/scenarios), generatedAt, pdfRef? | |
| `Outcome` | outcomeKind (task-completed/hypothesis-resolved/prediction-graded), result, gradedConfidenceError? | Feeds Meta agent calibration |
| `Unknown` | question, whyItMatters, valueOfInformation (0–1) | Created by Curiosity agent; resolves into ResearchProject or Evidence |

## 3. Edge types

Common edge envelope:

```ts
interface EdgeEnvelope {
  id: string;
  type: EdgeType;
  from: string; to: string;
  strength: number;        // 0–1 how much `to` is affected by/tied to `from`
  confidence: number;      // 0–1 how sure we are the edge is real/correctly weighted
  evidenceIds: string[];   // I1: required except for structural seed edges
  firstObserved: ISO8601;
  lastConfirmed: ISO8601;
  validFrom: ISO8601;      // I2: time-aware
  validTo: ISO8601 | null; // null = current
  expectedDirection?: 'positive' | 'negative' | 'mixed' | 'unknown';
  estimatedImpact?: string;   // human-readable, e.g. "~18% of COGS"
  notes?: string;
  provenance: Provenance;
}
```

Edge registry (Phase 1 — closed set; adding a type requires an ADR):

| Category | Types | Typical from → to |
|---|---|---|
| Structural | `OWNS`, `HOLDS`, `CONTAINS`, `MANAGES`, `LEADS`, `PART_OF` | Client→Account, Account→Holding, Holding→Instrument, ETF→Company, Person→Company |
| Economic | `SUPPLIES`, `PURCHASES_FROM`, `COMPETES_WITH`, `DEPENDS_ON`, `FUNDS` | Company↔Company |
| Exposure | `EXPOSED_TO`, `BENEFITS_FROM`, `HURT_BY`, `CORRELATED_WITH` | Holding/Company → Theme/MacroFactor/Commodity/Region |
| Influence | `INFLUENCES`, `REGULATES`, `EXPECTED_TO_AFFECT`, `HISTORICALLY_PRECEDES` | PolicyBody/MacroFactor/Event → anything |
| Thematic | `PART_OF_THEME` | Company/Instrument/Event → Theme |
| Epistemic | `SUPPORTS`, `CONTRADICTS`, `ABOUT`, `SUBJECT_OF_RESEARCH`, `DERIVED_FROM` | Evidence→Hypothesis, Evidence→Entity (ABOUT), ResearchProject→Entity, Insight→Evidence/Hypothesis |

Direction convention: influence flows `from → to` ("from affects to").
`CORRELATED_WITH` is the only undirected type (stored one way, queried both).

## 4. Versioning (I2 — never overwrite)

- **Facts and edges:** updates close the current record (`validTo = now`) and
  insert a successor. Queries default to `validTo IS NULL` (current world);
  Time view queries `AS OF t`.
- **Scalar state changes** (status, confidence, influence, priority) append
  to a `ChangeLog` stream (Postgres table, not Neo4j): `{nodeId, field, old,
  new, at, provenance}`. Sparklines and "confidence over time" render from
  this stream.
- **Hypotheses** additionally keep `statementVersion` — editing the statement
  archives the old hypothesis and links `DERIVED_FROM`.

## 5. Invariants (enforced in the graph service; each has an error code)

| # | Invariant | Enforcement |
|---|---|---|
| I1 | No agent write without provenance incl. ≥1 evidenceId (seed/user writes exempt but logged) | reject `E_NO_PROVENANCE` |
| I2 | No destructive update; versioning per §4 | service has no delete/overwrite API |
| I3 | Entity resolution before insert: resolver checks name+aliases (normalized, ticker-aware) and blocks near-duplicates | reject `E_DUPLICATE_ENTITY` with match candidates |
| I4 | `Insight.insightKind` immutable; a recommendation must trace to ≥1 hypothesis; a prediction must carry confidence | reject `E_TYPE_BLUR` |
| I5 | Earned admission: any new non-epistemic node must connect to an exposure-bearing node within 3 hops within 24h, else flagged `orphan` and surfaced in Admin | nightly sweep |
| I6 | Confidence/strength ∈ [0,1]; status ∈ enum; closed edge-type set | schema validation |

## 6. Influence score

Personalized PageRank over current (validTo=null) influence-bearing edges
(`INFLUENCES, REGULATES, DEPENDS_ON, SUPPLIES, EXPOSED_TO, EXPECTED_TO_AFFECT`),
edge weight = `strength × confidence`, personalization vector = normalized
`firmExposureUSD` (so influence is *influence on what we own*, not global
fame). Recomputed nightly and after any propagation batch touching >N=25
nodes. Stored on the node; history in ChangeLog.

## 7. Exposure rollups

`firmExposureUSD(node)` = sum over all paths
`Holding → Instrument → (CONTAINS)? → Company → (exposure edges ≤2 hops) → node`,
each path contributing `marketValue × Π(strength × confidence)`, capped per
path at the source market value; `affectedClientIds` = clients owning any
contributing holding. Materialized after price ticks and graph writes
(incremental where possible; full rebuild is acceptable at seed scale).

## 8. Propagation (the nervous system)

On a state-changing write (node status/confidence delta ≥ 0.1, new/removed
edge, Event ingested):

1. BFS outward along current influence-bearing edges, direction-aware.
2. Signal decays multiplicatively: `signal *= strength × confidence`;
   stop at `signal < 0.05` or depth 4.
3. Each reached node gets an `ImpactEvent {sourceChange, path[], signal}` on
   the bus — **propagation never directly mutates reached nodes**; the
   Reasoning/Hypothesis agents decide what an impact means.
4. The full set of ImpactEvents from one change = the "ripple", persisted so
   the UI can replay/animate it (Trace Impact Path).
5. Research priorities recompute for all reached nodes (cheap scoring pass).

## 9. Canonical queries (must be fast; e2e-tested)

1. Neighborhood for the map: `nodeId, depth≤2, filters` → subgraph with
   cluster hints (≤ 400 nodes returned; server-side clustering beyond that).
2. "Who is affected?": node → contributing holdings → clients, with USD.
3. Evidence trail: recommendation → insights → hypotheses → evidence →
   sources (single path query, powers the explainability drawer).
4. "Why is this yellow?": node → most recent status ChangeLog entries →
   their provenance evidence, ranked by signal.
5. Forward calendar: Events with `occursAt > now` linked within 2 hops of
   exposure-bearing nodes, grouped by horizon.
6. Knowledge weather: nodes with `firmExposureUSD > 0` bucketed by
   confidence (clear / foggy / unknown).
7. As-of subgraph at time t (Time view).

## 10. Storage split

- **Neo4j:** nodes, edges (both versioned per §4).
- **Postgres:** users/auth, ChangeLog, job state (pg-boss), report PDFs
  metadata, saved views, document store index.
- **Document store:** raw source documents (filesystem/S3-compatible),
  referenced by `Source.documentRef`; pgvector embeddings for retrieval.
