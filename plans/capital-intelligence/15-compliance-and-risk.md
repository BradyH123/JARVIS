# 15 — Compliance, Security & Risk Plan

We sell software to regulated firms; we are not (and must not drift into
being) an investment adviser ourselves. This doc sets the guardrails that
keep the product sellable to compliance officers — often the real gatekeeper
in an RIA sale. Not legal advice; a securities attorney reviews this posture
before the first paid pilot (action item, §6).

## 1. Product posture (locked)

1. **Decision support, not advice.** The platform analyzes, explains, and
   organizes attention. It never tells an advisor or client to buy/sell/hold
   a security. Copilot guardrails (doc 12 §12) and the banned-phrase gate
   enforce this in output; ToS and on-screen disclaimers enforce it in
   framing. Recommendation objects recommend *attention and research
   actions*, not transactions.
2. **The advisor is the fiduciary.** Every workflow ends at a human
   decision. No auto-executed client communications, no auto-trading, ever
   in this product line.
3. **Explainability is our compliance story.** The evidence trail
   (Recommendation → … → Source) is exactly what a compliance officer wants
   to see when an examiner asks "why did the advisor say this?" — we sell
   the audit trail as a feature.

## 2. Regulatory touchpoints (what the buyer's compliance team will ask)

| Area | Our answer |
|---|---|
| SEC Marketing Rule (advisers' use of our output in client comms) | Reports/briefs carry source citations and a "prepared with" disclosure block the firm can adapt; nothing we generate makes performance promises; simulation outputs are labeled and banded |
| Books & records (17a-4 / Rule 204-2 expectations) | Export: any report, brief, Today snapshot, and its full evidence trail exportable to immutable PDF/JSON for the firm's archiving system; retention is the firm's system-of-record job, we make export trivial (Phase 2 W5 adds direct archive-connector) |
| Reg S-P / privacy | Client PII minimized in prompts (already in 02 §7); encryption in transit and at rest; per-firm data isolation from day one of multi-tenancy; DPA template ready before first pilot with real data |
| Suitability/Reg BI adjacency | We never generate client-directed recommendations; advisor-facing drafts carry suitability caveats (doc 12 §12) |
| AI governance questionnaires (increasingly standard) | Model inventory (which models, versions, for what), prompt versioning, human-in-the-loop map, calibration monitoring (Meta agent), incident process — all already designed; package as a one-page "AI governance summary" sales asset |

## 3. AI-specific risk register

| Risk | Control |
|---|---|
| Hallucinated facts entering the graph | Provenance invariant I1 (no write without evidence), extraction precision-over-recall rule, corroboration gate for discovered relationships |
| Prompt injection via ingested documents | Shared preamble rule 4 (documents are data, not instructions) + anomaly flagging + source quality tiers; injection fixtures in the golden sets (planted "ignore your rules" document must be flagged, M3 eval) |
| Data poisoning via low-quality sources | Quality tiers gate confidence ceilings (day-6 seed fixture exercises this); earned-admission keeps junk out |
| Overconfident output | Clamped confidence updates, Contradiction agent, Meta calibration multipliers, visible confidence everywhere |
| Forbidden framing reaching users | Banned-phrase lint in CI + runtime post-processor on all user-visible strings |
| LLM outage/latency | Background loop degrades gracefully (stale-but-labeled data, coverage notes); UI never hard-depends on a live LLM call except Copilot, which fails with an honest error |
| Cost blowout | Budget guard hard-stops with visible coverage notes; per-firm budgets at multi-tenancy |

## 4. Security baseline (Phase 1 → pilot)

Phase 1 (demo): secrets in env/keychain never in repo; role-based authz
matrix tested in CI; audit log on every AI write; dependency scanning in CI.
Before any real client data (Phase 2 W3): SSO/MFA, per-firm tenancy
isolation review, encrypted backups, pen-test pass, incident-response
runbook, SOC 2 Type I program started (buyers will ask; Type II follows).
**Rule: no real client PII touches the system until the W3 checklist is
signed off in the decision register.**

## 5. Liability & commercial protections

ToS: decision-support disclaimer, no-advice clause, accuracy
non-warranty with evidence-trail transparency, cap on liability; E&O/tech
liability insurance before first paid pilot; mutual NDA + DPA templates for
design partners. Simulation/prediction outputs contractually defined as
illustrative analytics.

## 6. Pre-pilot action items (owner: founder)

1. Securities attorney review of §1–2 posture and ToS draft (before G3
   pricing conversations, see doc 14).
2. E&O/tech insurance quotes.
3. AI governance one-pager drafted from §2 (sales asset).
4. W3 security checklist formalized into the decision register as a gate.
