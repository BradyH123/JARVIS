# 07 — Data Architecture & Seed Dataset Specification

## 1. Ingestion pipeline (every document, no shortcuts)

```
Observe (adapter) → Clean/normalize → Structure (Evidence Extraction agent)
→ Resolve entities (I3) → Create/confirm relationships → Assign confidence
→ Store evidence + source (provenance) → Update graph (versioned)
→ Trigger propagation (§8 of graph spec) → Reasoning/attention updates
```

Stages are bus-connected jobs; any stage can dead-letter to Admin with the
payload preserved. Ingestion is idempotent (document hash = dedupe key).

## 2. Adapter interfaces (`packages/adapters`)

```ts
interface PortfolioAdapter {         // firm/clients/accounts/holdings
  loadFirm(): Promise<FirmSnapshot>;
  onHoldingsChanged(cb): Unsubscribe;
}
interface PriceAdapter {             // instrument prices
  latest(instrumentIds: string[]): Promise<PriceTick[]>;
  onTick(cb): Unsubscribe;
}
interface NewsAdapter {              // articles/press releases
  poll(since: ISO8601): Promise<RawDocument[]>;
}
interface FilingAdapter {            // filings/transcripts/macro releases
  poll(since: ISO8601): Promise<RawDocument[]>;
}
interface EventAdapter {             // known future events (earnings dates,
  upcoming(horizonDays: number): Promise<KnownEvent[]>;   // policy meetings)
}

interface RawDocument {
  externalId: string; kind: SourceKind; publisher: string;
  publishedAt: ISO8601; title: string; body: string;
  qualityTier: 1|2|3; url?: string;
}
```

Phase 1 ships `Seed*` implementations of all five, driven by the scripted
timeline (§5). Real implementations (EDGAR RSS, FRED, market data vendor)
are Phase 2+, feature-flagged, and must not be required by any demo path.

## 3. Demo mode

A `DemoClock` controls simulated time. `POST /demo/advance-day` (Admin-only)
releases the next day's scripted prices, documents, and events into the
normal pipeline — the engine processes them exactly as it would real feeds
(no demo-only code paths past the adapter layer). `demo/reset` reloads the
seed. Deterministic: same day → same documents → (with cached LLM responses)
same graph deltas, which is what e2e asserts against.

## 4. Seed universe

All data is **clearly simulated**: real public company names may be used for
realism (supply-chain relationships reflect public knowledge), but every
price, financial figure, document, and client is fictional. Every seeded
Source carries `publisher: 'SIMULATED — <style>'`.

### 4.1 Firm & users

**Harborview Wealth Partners** (fictional), ~$1.9B AUM.
Users: 1 CIO (Dana), 2 advisors (Marcus, Elena), 1 analyst (Priya),
1 admin (Sam). Passwords seeded for demo; roles per PRD personas.

### 4.2 Clients (16 — archetype-driven)

| # | Client | Archetype | ~AUM | Signature exposures |
|---|---|---|---|---|
| 1 | Whitfield family | Post-exit business owner (sold logistics co.) | $210M | Cash-heavy, munis, concentrated industrials |
| 2 | R. Okafor | Tech VP, concentrated employer stock | $48M | Single-name semi concentration (NVDA), options |
| 3 | Dr. Chen & Dr. Chen | Physician couple, mid-career | $9M | Growth ETFs, 529s, healthcare tilt |
| 4 | M. Delgado | Retired utility executive | $22M | Utilities, dividend equities, bonds |
| 5 | Harper Trust | Multi-gen trust | $85M | Broad ETFs, real estate, munis |
| 6 | J. & P. Novak | Restaurant chain owners | $14M | Consumer discretionary, commercial RE |
| 7 | A. Lindqvist | Retired software founder | $95M | Tech-heavy, VC-adjacent, crypto sliver |
| 8 | K. Barnes | Corporate attorney, partner | $6M | Index-core, ESG tilt |
| 9 | The Motts | Farming family | $18M | Commodities, land, equipment makers |
| 10 | S. Ibarra | Pro athlete (year 6 contract) | $31M | Conservative core + concentrated endorsements cash flow |
| 11 | E. Rousseau | Inherited wealth, philanthropist | $54M | Munis, ESG, foundation account |
| 12 | T. Nakamura | Import/export business owner | $12M | International equities, FX-sensitive |
| 13 | B. & C. Fitzgerald | Dual-income executives, options-rich | $16M | Mega-cap tech, RSU flows |
| 14 | Grupo Vela family office | Small family office | $130M | Energy, LatAm exposure, private credit sliver |
| 15 | L. Adeyemi | Hospital system CFO | $7M | Healthcare, bonds, 457 plan |
| 16 | Pelican Foundation | Nonprofit endowment | $60M | 60/40 core, spending policy constraints |

Each client gets: goals, risk profile, lastContact, relationshipHealth, a
timeline with 3–6 life/financial events (one of which fires during the
scripted days), and 1–4 accounts (taxable/IRA/trust as fits).

### 4.3 Instruments & positions

~70 instruments: ~40 single stocks, ~20 ETFs/funds (with top-10 CONTAINS
constituents), ~8 bond/muni proxies, cash. 150–300 positions distributed to
match archetypes; firm-level concentrations engineered so the map is
interesting: **~11% of firm AUM touching AI-infrastructure**, ~9% utilities/
energy, ~8% healthcare, deliberate NVDA overlap across 6 clients.

### 4.4 The four deep ecosystems (world subgraph)

Hand-curated nodes+edges with evidence-backed rationale (public-knowledge
relationships, simulated documents as sources):

1. **AI infrastructure (the showpiece, ~120 nodes):** NVDA, AMD, TSMC, ASML,
   SK-style memory maker, Supermicro-style integrators; hyperscalers (MSFT,
   GOOG, AMZN, META) with capex nodes; power chain — utilities
   (Constellation-style, NextEra-style), transformer makers (Eaton,
   Hubbell-style), grid, copper (commodity + Freeport-style miner), cooling
   (Vertiv-style); data-center REITs (Equinix/DLR-style); themes: AI
   Adoption, Data Center Buildout, Power Scarcity; policy: export controls,
   energy permitting; people: 3 CEOs; macro: rates, electricity prices.
2. **Healthcare (~60 nodes):** insurers, GLP-1-style pharma, device makers,
   hospital systems, FDA policy node, drug-pricing legislation theme.
3. **Energy & grid (~50 nodes):** integrated majors, LNG, renewables,
   pipeline, OPEC-style supply node, electrification theme (bridges to
   ecosystem 1 — the cross-ecosystem edges are the demo's "aha").
4. **Consumer & rates (~50 nodes):** retailers, homebuilders, regional
   banks, CRE, Fed funds macro factor, consumer confidence (bridges to 3).

Plus ~40 connective nodes (sectors, regions, PolicyBodies, common themes).
Target totals: **450–550 world nodes, 2,000–2,800 edges**, every non-obvious
edge carrying ≥1 seeded evidence ref.

### 4.5 Pre-seeded epistemic state

~20 hypotheses (e.g., "Utility capex acceleration precedes AI-infra supplier
outperformance", "Client #2's concentration risk is the firm's largest
single-name exposure"), ~10 open research projects, 6 scenario templates
(rates ±50bps, semi tariffs, AI-demand acceleration, energy shortage,
drug-pricing bill passes, CRE stress), forward calendar (~25 events across
Now/Next/Future), ~30 Unknowns, and enough Evidence/Sources (~300 documents)
that every seeded conclusion passes the six-question template end-to-end.

## 5. The scripted 12 days

Each day ships: price moves (all instruments), 8–15 documents, 0–3 events,
plus **expected outcomes** (used by e2e): which nodes change state, what
enters Today's top-5, which hypotheses move.

| Day | Headline events | Exercises |
|---|---|---|
| 1 | Quiet day; baseline drift | Baseline Today; research agenda from standing priorities |
| 2 | Transformer-maker earnings beat + 8-K; copper +3% | Evidence extraction, hypothesis support, small ripple |
| 3 | **Hyperscaler raises capex guidance 20%** | The showpiece ripple: chips→foundry→power→copper→REITs→clients; M3 fixture |
| 4 | Analyst day: foundry capacity tight; client #13 RSU vest | Relationship corroboration; client timeline event |
| 5 | **Fed holds, hawkish dots** | Macro propagation into ecosystem 4; scenario re-run prompt |
| 6 | Semi export-control rumor (low-quality source) | Source-quality handling: low tier → candidate-only, hedged language |
| 7 | **Foundry supplier earnings miss**; utility rate-case win | Contradiction engine vs. day-3 optimism; hypothesis weakening |
| 8 | Grid-transformer shortage report; drug-pricing bill advances | Cross-ecosystem bridge; healthcare clients affected |
| 9 | **Client #1 closes sale earn-out (liquidity event)**; quiet markets | Client-life-event path: timeline → tasks → brief |
| 10 | Export-control rumor **confirmed** by tier-1 source | Candidate → confirmed edge; confidence jump with audit trail |
| 11 | **Tariff proposal on semi equipment**; copper miner strike | Scenario studio moment; capital-flow reassessment |
| 12 | Mixed earnings; month-end | Meta agent grades day-3/7 predictions; Knowledge Advantage demo; reports |

Authoring process: write day-by-day fixture YAML (`packages/seed/days/`),
generate the ~300 documents once with an LLM against style templates, then
**freeze them in-repo** (no runtime generation; documents are reviewed by a
human before freeze).

## 6. Data quality gates

- Seed loader validates: every edge's endpoints resolve; every evidence ref
  exists; exposure rollups reconcile to firm AUM ±0.5%; no orphan nodes
  (I5) at load time.
- A `seed:lint` CI job runs these plus banned-phrase scan over seeded
  documents' AI-facing summaries.
