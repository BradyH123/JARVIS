# 11 — Decision Register

Single source of truth for what's decided, by whom, and what still needs the
founder before build start. Statuses: **LOCKED** (from the design
conversation — do not re-litigate) · **DEFAULTED** (chosen in these docs by
the "simplest robust" rule — overridable before its milestone starts) ·
**OPEN** (needs founder input; default applies if unanswered).

## A. Locked in the design conversation

| # | Decision | Where |
|---|---|---|
| A1 | Own full interface; not a bolt-on layer; don't rebuild custodial/CRM plumbing | 01 §5 |
| A2 | Exposure-first loop; research follows portfolios, never headlines | 01 §3 |
| A3 | Living exposure/influence graph is the home screen and signature feature | 03 §4.1 |
| A4 | Two loops; the 10-step Capital Intelligence Loop is the spine | 02 §2 |
| A5 | Graph database + modular agents + event bus from day one | 02 §6 |
| A6 | Full explainability chain; four object types never blur | 02 §5, 05 I4 |
| A7 | No "predict money" claims; evidence + confidence framing; uncertainty-reduction objective | 01 §6 |
| A8 | Visual-first, dark-first, dense; Bloomberg spirit not style; chat secondary | 09 |
| A9 | Phase 1 on seeded data behind swappable adapters | 07 |
| A10 | Phase 1 = polished complete core loop (15 capabilities), not a throwaway MVP | 03 §1 |
| A11 | Retrieval + strong foundation model; no base-model training | 01 §8 |
| A12 | The 8 north-star principles | 01 §4 |

## B. Defaulted in this planning package

| # | Decision | Default | Override deadline |
|---|---|---|---|
| B1 | Stack: TS monorepo, Next.js, Node engine | as specified in 02 §6 | before M0 |
| B2 | Graph store: Neo4j Community (Docker); Postgres for app data | 02 §6 | before M1 |
| B3 | Bus: pg-boss behind `Bus` interface | 02 §6 | before M0 |
| B4 | Map renderer: Sigma.js WebGL | 09 §3 | before M2 |
| B5 | LLM: Claude API, three model tiers per agent class | 06 §0 | before M3 |
| B6 | Research priority weights `0.3/0.25/0.2/0.15/0.1` (admin-tunable) | 06 §3 | anytime (config) |
| B7 | Confidence clamp ±0.15 per evidence; corroboration gate at 0.5 | 06 §§5–6 | before M3 |
| B8 | Propagation decay: strength×confidence, floor 0.05, depth 4 | 05 §8 | before M1 |
| B9 | Seed universe: Harborview, 16 clients, 4 ecosystems, 12 scripted days | 07 §§4–5 | before M1 seed authoring |
| B10 | Real company names with clearly simulated data in seed | 07 §4 | before M1 seed authoring |
| B11 | Debate pipeline triggers: >5% AUM, 0.85 confidence, report generation | 06 §14 | before M4 |
| B12 | AuthZ matrix (advisor = own book) | 08 §5 | before M0-5 |
| B13 | Implementation in a fresh `capital-intelligence` repo | README | before M0 |

## C. Open — founder input wanted (build can start on defaults)

| # | Question | Default if unanswered | Blocks |
|---|---|---|---|
| C1 | Product name / brand | "Capital Intelligence Platform"; engine "Financial Cognition Engine" | nothing (rename later) |
| C2 | The 10-year one-sentence answer ("what do people say it does better than anyone else?") | draft in 01 §1 stands | nothing |
| C3 | Include the flagged real-data spike (EDGAR/FRED) inside Phase 1? | No | M3+ scope |
| C4 | Hosting after local Docker | single cloud VM for demos | M6 |
| C5 | Design partner firm for M4/M6 demos? | demo runs internal | demo scheduling |
| C6 | Budget ceiling for LLM spend in dev/demo | $500/mo cap in the budget guard | M3 |
| C7 | Is client #10 (pro athlete) / any archetype off-brand for your target firms? | keep as specified | M1 seed authoring |
| C8 | Target segment: independent RIAs $500M–$5B AUM (14 §1) — right first market? | yes | design-partner recruiting |
| C9 | Pricing hypothesis to test privately: $750/advisor/mo, $2k firm min (14 §2) | test as stated | G2+ conversations only |
| C10 | Design-partner offer terms: roadmap input + 50% year-one pilot pricing (14 §3) | as stated | partner recruiting |

## C-bis. Hard gates (not questions — checklists that must be signed off here)

| Gate | What | When |
|---|---|---|
| G-DATA | No real client PII enters the system until the W3 security checklist (15 §4) is signed off in this register | before Phase 2 W3 |
| G-LEGAL | Securities-attorney review of the decision-support posture + ToS (15 §6) | before G3 pricing conversations |

## D. Change control

- Overriding a **DEFAULTED** item: edit this file + short ADR in the build
  repo; if past its deadline, note the migration cost in the ADR.
- Touching a **LOCKED** item requires the founder explicitly reopening it in
  writing; record the reopening here.
- Every ADR links back to its register row.
