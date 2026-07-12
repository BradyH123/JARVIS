# 06 — Agent Specifications

Contract for `packages/agents`. Every agent is a pure module:
`(typed input) → LLM call(s) with versioned prompt → (zod-validated output) →
graph-service writes`. No agent touches Neo4j/Postgres directly. All writes
carry provenance (agent name, prompt version, inputs hash, evidence ids).

## 0. Shared machinery

- **Prompt registry:** `packages/agents/prompts/<agent>/<version>.md`,
  referenced by semver; CI runs golden-set evals when a prompt changes.
- **Output discipline:** every agent returns JSON matching its zod schema via
  tool-use (structured output). On validation failure: one retry with the
  error appended, then dead-letter to Admin with the raw output.
- **Budget guard:** orchestrator assigns each run a token budget; the Claude
  wrapper hard-stops and emits a `coverage` note when exceeded (visible in
  UI per build-plan rule 4).
- **Language guardrails:** a shared post-processor rejects banned phrasings
  ("will happen", "predicts that money", "guaranteed") in any user-facing
  string; agents must express futures as simulations with confidence.
- **Model tiers:** default = mid-tier model; Reasoning/Contradiction/Scenario
  synthesis may use the top tier; extraction at scale may use the small tier.
  Configurable in Admin.

## 1. Chief Intelligence Orchestrator (not an LLM agent)

Deterministic code. Subscribes to bus topics, maintains the daily cadence
(background loop schedule, "advance day" in demo mode), fans work out to
agents with budgets, enforces run ordering per loop step, records loop
telemetry. Owns the **debate pipeline** (§14).

## 2. Portfolio Intelligence Agent

- **Trigger:** holdings changed, price tick batch, nightly; per-instrument.
- **Reads:** holding + instrument + company profile, existing exposure edges.
- **Writes:** `EXPOSED_TO / DEPENDS_ON / BENEFITS_FROM / HURT_BY /
  PART_OF_THEME` edges from companies/instruments to themes, macro factors,
  commodities, regions, suppliers; exposure notes.
- **Output schema:** `{instrumentId, exposures: [{targetName, targetType,
  edgeType, strength, direction, rationale, evidenceRefs[]}]}`.
- **Prompt skeleton:** "You are a portfolio decomposition analyst. Given this
  instrument/company and these reference documents, enumerate the economic
  drivers that materially move it. For each: driver, mechanism, strength
  (0–1), direction. Cite evidence for every driver. Do not invent drivers
  without support; mark uncertain ones with low strength and add an unknown."
- **Guardrails:** may only propose edges whose target resolves to an existing
  node or a well-formed new concept node (goes through I3/I5).
- **Eval:** golden set of 10 instruments; asserts required drivers present
  (e.g., GPU maker → foundry dependency, AI theme, power/energy sensitivity),
  no hallucinated suppliers, all edges evidenced.

## 3. Research Allocation Engine (the heart)

- **Trigger:** daily; after any propagation batch; on demand ("Launch
  Research").
- **Scoring (deterministic code, not LLM):**
  `priority = w1·exposureUSD_n + w2·(1−confidence) + w3·changeRate_n +
  w4·clientImpact_n + w5·informationValue_n` — weights configurable in
  Admin, defaults `0.3/0.25/0.2/0.15/0.1`, all inputs normalized 0–1.
- **LLM part:** drafts/refreshes the **live research plan** for the top-K
  items: key questions, best evidence to gather, knowledge gaps, "what would
  change our view" triggers.
- **Writes:** `ResearchProject` nodes + `SUBJECT_OF_RESEARCH` edges + ranked
  agenda (Today screen payload).
- **Output schema:** `{targetNodeId, keyQuestions[≤5], evidenceToGather[≤5],
  knowledgeGaps[], changeTriggers[], suggestedSources[]}`.
- **Eval:** given a seeded state with a known concentration + a fresh shock,
  the shocked high-exposure/low-confidence node must rank top-3; plans must
  reference the actual exposure mechanism.

## 4. Evidence Extraction Agent

- **Trigger:** every document from adapters (news, filing, transcript,
  macro release, internal note).
- **Writes:** `Source` + `Evidence` nodes + `ABOUT` edges to resolved
  entities; proposes `SUPPORTS/CONTRADICTS` links to open hypotheses.
- **Output schema:** `{source: {...}, evidence: [{actor, action, object,
  asOf, quote, entities: [{name, type}], extractionConfidence,
  hypothesisLinks: [{hypothesisId, relation, rationale}]}]}`.
- **Prompt skeleton:** "Extract discrete, checkable statements. Quote
  verbatim. Never merge speculation with fact — speculation becomes a
  statement about what its author claims. One evidence object per claim."
- **Guardrails:** entities pass the resolver; unresolvable entities become
  `observed`-stage stubs only if I5-connectable, else dropped with a log.
- **Eval:** 15 fixture documents with hand-labeled expected extractions;
  precision over recall (a missed claim is better than an invented one).

## 5. Relationship Discovery Agent

- **Trigger:** new evidence batches; weekly sweep per ecosystem.
- **Writes:** *candidate* economic/influence edges with `confidence ≤ 0.5`
  and `notes: 'candidate'`; corroboration gate: a second independent evidence
  source (different `Source.publisher`) is required before confidence may
  exceed 0.5.
- **Output schema:** `{candidates: [{from, to, edgeType, strength,
  confidence, mechanism, evidenceRefs[]}]}`.
- **Eval:** seeded fixture where two documents imply a supplier link →
  exactly one candidate edge, correct direction, gated confidence.

## 6. Hypothesis Agent

- **Trigger:** evidence linked to a hypothesis; new ImpactEvents; research
  project findings.
- **Writes:** Hypothesis nodes (create/update confidence/status via §4
  versioning); links evidence for/against.
- **Confidence update rule:** deterministic — log-odds update weighted by
  `extractionConfidence × sourceQualityTier`, clamped ±0.15 per single piece
  of evidence (no one document swings a thesis).
- **LLM part:** (re)states hypotheses crisply, lists assumptions, unknowns,
  analogues; proposes when a hypothesis should split or archive.
- **Eval:** feeding 3 supporting + 1 strong contradicting fixture must move
  confidence up-then-down within clamps and update status to 'weakening'.

## 7. Reasoning Agent

- **Trigger:** ImpactEvent batches (post-propagation), research completions.
- **Writes:** `Insight` nodes with `insightKind` strictly one of
  fact/interpretation/prediction/recommendation, plus reasoningChain refs;
  second-order effect edges (`EXPECTED_TO_AFFECT`, candidate-gated).
- **Prompt skeleton:** the six-question template (what happened / why we
  think so / supports / contradicts / assumptions / what would change our
  mind) + "walk the chain: reality → evidence → beliefs → decisions →
  flows. Never emit a recommendation not grounded in a hypothesis."
- **Eval:** the M3 capex fixture must produce: fact (capex raised),
  interpretation (demand expectation), prediction w/ confidence (elevated
  supplier demand), recommendation (research transformer/power exposure) —
  four distinct objects, chained.

## 8. Contradiction Agent

- **Trigger:** any hypothesis crossing confidence 0.7; any recommendation;
  weekly sweep of top-10 hypotheses.
- **Writes:** challenge notes attached to hypotheses/insights; may downgrade
  confidence (same clamped rule); flags `assumption` objects.
- **Prompt skeleton:** "Attack this conclusion. What evidence disproves it?
  What would a smart skeptic say? Hidden assumptions? What are we
  overweighting? Produce the strongest opposing case, then rate how much it
  should reduce confidence."
- **Eval:** must find the planted counter-evidence in fixtures; must never
  *raise* confidence.

## 9. Curiosity / Blind-Spots Agent

- **Trigger:** nightly.
- **Writes:** `Unknown` nodes (question, why it matters, value of
  information); updates knowledge-weather buckets; proposes research
  questions to the Allocation Engine.
- **Looks for:** high-exposure/low-confidence zones, stale regions (no
  evidence in N days = intelligence debt), missing links (two correlated
  nodes with no explaining path), surprises (outcomes that contradicted us).
- **Eval:** seeded stale high-exposure sector must surface as top unknown.

## 10. Scenario Agent

- **Trigger:** user runs a scenario; weekly refresh of saved scenarios.
- **Mechanics:** deterministic first pass — apply shock to target node(s),
  reuse §8 propagation with shock-specific decay; LLM second pass — narrate
  per-path mechanisms, estimate per-client impact bands, list assumptions.
- **Writes:** Scenario node + persisted ripple + narrative; everything
  labeled `SIMULATION`.
- **Eval:** "rates +50bps" template touches rate-sensitive fixtures (banks,
  REITs, long-duration growth) with sensible signs; narrative includes
  assumptions and confidence.

## 11. Capital Flow Agent

- **Trigger:** weekly; after major macro events.
- **Writes:** per-theme capital-flow assessments: direction, strength,
  supporting signals, contradicting signals, confidence + capital metrics on
  nodes (attraction/momentum/stability).
- **Guardrails:** hardest language constraints; output must always contain
  ≥1 contradicting signal or explicitly state "no contradicting signal
  found, which itself lowers confidence in our search".
- **Eval:** fixture with mixed signals must produce a hedged, both-sided
  assessment; banned-phrase scan passes.

## 12. Memory Agent

- **Trigger:** nightly compression pass; on Outcome creation.
- **Writes:** compressed summaries per ecosystem/theme (stored as documents,
  embedded for retrieval); analogue links (`HISTORICALLY_PRECEDES`); keeps
  the retrieval index fresh. Nothing is deleted, only layered.
- **Eval:** after 12 seeded days, "what did we believe about X on day 3 and
  what changed?" answerable via retrieval with correct citations.

## 13. Advisor Copilot

- **Trigger:** user chat ("Ask AI About This"), guided drill-down in
  Research, task/brief/report drafting.
- **Reads:** graph neighborhood of the anchor node + retrieval over
  memory/evidence; client context when scoped to a client.
- **Writes:** only drafts (tasks, report sections, briefs) that the user
  accepts; chat answers must cite nodes/evidence (clickable).
- **Guardrails:** refuses to answer beyond the graph+corpus ("I don't have
  evidence on that — want me to open a research project?"); never gives
  personalized investment advice framing; suitability language enforced.
- **Eval:** answers to 10 canned questions must cite ≥1 correct evidence id
  and 0 fabricated ids (checked mechanically).

## 14. Debate pipeline (for high-stakes conclusions)

Orchestrated multi-prompt sequence, not standing agents: Advocate → Skeptic
(Contradiction prompt) → Gap-hunter (what's missing) → Uncertainty estimator
→ Analogue-finder → "What would make this completely wrong?" → Synthesizer.
Invoked when: a recommendation touches >X% of firm AUM (default 5%), a
hypothesis would cross 0.85 confidence, or a report is generated. Synthesis
becomes the Insight; all stages stored in the reasoning chain.

## 15. Meta Agent

- **Trigger:** weekly; on prediction-horizon expiry.
- **Does:** grades expired predictions against seeded outcomes (Brier-style
  calibration error), adjusts per-agent confidence multipliers within ±20%,
  computes Knowledge Advantage metrics (coverage, density, calibration,
  uncertainty reduced by research), writes the CIO metrics payload.
- **Eval:** synthetic over/under-confident histories produce correcting
  multipliers in the right direction.
