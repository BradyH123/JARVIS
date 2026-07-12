# 13 — Phase 2 Data & Integrations Plan

Phase 1 runs entirely on seeded adapters. This doc plans the path to real
data so Phase 1's interfaces are built with the true targets in view. Nothing
here is Phase 1 work; the deliverable is *sequencing, vendor shortlists, and
interface implications*.

## 1. Integration order (locked rationale: cheapest trust-builders first)

| Wave | What | Why this order |
|---|---|---|
| W1 | Public documents & macro: SEC EDGAR (filings, free), FRED/BLS/Treasury (macro, free), company press releases (RSS) | Free, legal clarity, exercises the exact ingestion pipeline the seed used; makes News & Evidence real without licensing |
| W2 | Market data: prices/fundamentals via a mid-tier vendor | Turns exposure rollups and drift live; modest cost |
| W3 | Portfolio holdings: CSV/spreadsheet import first, then custodian/aggregator feeds | CSV import unlocks real pilots immediately (design partners export from any custodian); feeds come after a partner commits |
| W4 | Earnings transcripts & curated news | Upgrades evidence quality; moderately priced |
| W5 | CRM sync (notes, meetings, tasks out) | Only after advisors trust the intelligence; write-back needs care |
| W6 | Alt-data (patents, permits, shipping, satellite) | Explicitly later; each source must pass the earned-admission rule |

## 2. Vendor shortlists (evaluate, don't pre-commit)

- **Prices/fundamentals (W2):** Polygon.io, Tiingo, Financial Modeling Prep,
  Intrinio. Criteria: WebSocket + EOD, fundamentals coverage, redistribution
  terms for displaying data to advisory clients, cost at ~500 instruments.
  Budget target ≤ $500/mo at pilot scale.
- **Transcripts/news (W4):** FMP or API Ninjas transcripts to start; news via
  Benzinga/Marketaux tier before any Dow Jones/Refinitiv conversation.
  Criterion that dominates: licensed QUOTING rights, because Evidence stores
  verbatim quotes.
- **Holdings (W3):** ByAllAccounts/Yodlee-class aggregation, Plaid Investments
  for held-away, direct custodian feeds (Schwab Advisor Services, Fidelity
  Wealthscape) once a partner firm sponsors the relationship. Addepar/Orion/
  Black Diamond APIs if the partner already uses one — often the fastest path.
- **CRM (W5):** Redtail, Wealthbox, Salesforce FSC — pick whichever the first
  design partner uses; build against an internal `CrmAdapter` interface.
- **Identifiers:** OpenFIGI (free) + SEC CIK mapping for entity resolution
  upgrades — instrument aliases become FIGI/CIK-anchored in W1–W2.

## 3. Interface implications for Phase 1 (build these seams now)

1. Adapters already isolate sources — keep **quote-rights metadata** on
   `Source` (`quotable: boolean`) so UI can degrade to paraphrase+link when a
   future vendor forbids verbatim display.
2. Entity resolver must accept **external id maps** (ticker→FIGI→CIK) even
   though Phase 1 only uses names/tickers.
3. `PortfolioAdapter` gets a `importCsv(file)` implementation in W3 —
   design the holdings schema in Phase 1 so a Schwab/Orion export maps onto
   it without migration (fields already in doc 05 §2 cover it).
4. Rate-limit/backoff and per-source ingestion budgets live in the pipeline,
   not the adapter, so W1 sources drop in without new plumbing.
5. Every real source enters through the same earned-admission gate (I5) —
   integration success is measured by *evidence density on exposure-bearing
   nodes*, not document volume.

## 4. Cost envelope (pilot scale, ~3 firms, ~500 instruments)

W1: $0 · W2: $100–500/mo · W3: CSV $0, aggregator $500–1,500/mo when needed ·
W4: $100–400/mo · LLM: governed by the existing budget guard (register C6).
Total pilot data budget target: **≤ $2,500/mo**, revisited per wave.

## 5. Gates

Each wave starts only when: (a) the previous wave's sources pass a two-week
quality soak (extraction precision spot-checks, entity-resolution error rate
< 2%), and (b) a named user need pulls it (a design partner request or a
demo gap), matching the earned-admission principle at the roadmap level.
