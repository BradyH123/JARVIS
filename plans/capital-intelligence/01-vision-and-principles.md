# 01 — Vision & Principles

## 1. Mission

Build an AI-native **capital intelligence platform** for wealth managers whose
core is a **Financial Cognition Engine**: a continuously learning system that
maintains a living causal model of the financial world, maps every client
portfolio into that model, detects meaningful change, explains why it matters,
and organizes advisor attention where it creates the most value.

The product is sold as **better thinking**, not charts. Advisors get one
question answered every day, with evidence: *"Given everything we own, what
matters most right now — and what should we do about it?"*

## 2. The problem (from the market research portion of the conversation)

Wealth managers spend most of their time on relationship and process work, not
stock picking: ~20–30% client meetings/reviews, 10–20% meeting prep, 15–25%
paperwork/compliance, 10–15% portfolio monitoring, 15–25% prospecting, plus
email and research. Their biggest pains: finding new clients, meeting prep,
compliance documentation, information overload in market research, portfolio
monitoring, CRM drudgery, and proactive client communication.

This platform attacks the **intelligence** cluster of those pains: market
research overload, portfolio monitoring, meeting-ready client insight, and
"who should I call today and why." (Lead generation and CRM automation are
adjacent opportunities, deliberately **out of scope** for Phase 1 — see PRD
§ Non-goals.)

## 3. The core inversion

Every competing tool is news-first: ingest the firehose, then ask who's
affected. We invert it:

```
Portfolio → Exposure → Research Priority → Evidence → Hypothesis
        → Scenario → Client Impact → Advisor Action → Outcome → Learning
```

The system looks at what the firm actually owns, asks *"what forces could move
this?"*, builds targeted research plans for those drivers, and only then goes
to the world for evidence. Research is proactive ("because something might
happen"), not reactive ("because something happened"). We are playing chess:
three time horizons — **Now / Next / Future** — always grounded in current
exposure but looking several moves ahead.

## 4. The eight north-star principles (locked)

1. **Portfolio first.** Research follows exposures, never headlines.
2. **Build a world model, not a news feed.** Everything is an entity with
   state, connected by intelligent, time-aware relationships.
3. **Reason before recommending.** Observation → evidence → hypothesis →
   confidence → advice. Never jump straight to conclusions.
4. **Continuous learning.** The graph evolves; hypotheses get archived;
   outcomes recalibrate confidence. Knowledge compounds, it is never thrown
   away.
5. **Expose the unknowns.** Track what we don't know that might matter; the
   research frontier is a first-class product surface ("our confidence here is
   low — more evidence could move the needle").
6. **Explainability everywhere.** Evidence trails, not black boxes. Every
   conclusion answers: what happened, why we think so, what supports it, what
   contradicts it, what assumptions we're making, what would change our mind.
7. **Think in systems, not securities.** Model forces, ecosystems, actors, and
   second-order effects — not tickers in isolation.
8. **Organize attention.** Attention is the scarcest resource. The system's
   purpose is to allocate advisor and AI attention where it creates the most
   value.

## 5. What it is / what it is not

**It is:**
- an intelligence platform and financial knowledge graph
- a research allocation system (the moat)
- an institutional memory system
- a client-impact analysis platform
- an explainable scenario and hypothesis workspace
- a visual interface for exploring the forces around what a firm owns

**It is not:**
- a chatbot (a copilot chat exists but is secondary to graph, research,
  evidence, and actions)
- a news reader or generic dashboard
- a CRM, portfolio accounting system, or trading platform
- a price-prediction black box — it supports investment judgment, it does not
  replace it

## 6. Positioning and tone

"Bloomberg for client intelligence" is the spirit: depth, density,
interconnection, keyboard efficiency, serious utility — **without** copying
Bloomberg's visual style or complexity. The product should feel like a modern
financial command center that is *alive*: node states, ripples, confidence
weather — not walls of text.

**Language guardrails (compliance-aware, locked):**
- Never "the AI predicts where money will go."
- Always "the system surfaces where capital pressures and opportunities may be
  forming, based on evidence, with confidence levels."
- The engine's internal objective is **uncertainty reduction**, not
  clairvoyance. Every forward-looking statement carries probability,
  supporting evidence, contradicting evidence, and confidence.
- Facts, interpretations, predictions (simulations), and recommendations are
  four distinct, visibly labeled object types everywhere in the product.

## 7. Users (Phase 1 personas)

1. **Wealth Manager / Advisor** — firm-wide and per-client exposures, meeting
   prep, risks/opportunities, explain events to clients, generate reports and
   tasks, know what deserves attention now vs. later.
2. **Investment Analyst** — investigate holdings and themes, inspect evidence,
   develop and challenge hypotheses, model scenarios, record conclusions into
   firm knowledge.
3. **Chief Investment Officer** — aggregate exposure and concentrations,
   research priorities, major theses, confidence/uncertainty posture, upcoming
   events, institutional knowledge gaps.
4. **Firm Administrator** — users, clients/accounts, data sources,
   permissions, audit history, AI settings, system health.

## 8. The moat

1. **The Research Allocation Engine** — a named engine, not a side feature.
   Every day it answers: *"Where does one more hour of human or AI research
   create the most decision value for this book of business?"* Inputs:
   exposure size, current confidence, rate of change, potential client impact,
   information value. Output: a ranked research agenda with live research
   plans.
2. **Compounding institutional memory** — nothing is forgotten; every
   hypothesis, outcome, meeting insight, and research project permanently
   improves the world model. Ten advisors' discoveries propagate to the whole
   firm.
3. **The knowledge graph itself** — time-aware, confidence-scored,
   provenance-complete. Data curation and retrieval over a strong foundation
   model; we do not train a base model.
4. **Trust through explainability** — professionals will adopt a system that
   shows its work with provenance over a smarter-sounding black box.

## 9. The defining metric: Knowledge Advantage

Not portfolio return. Not alpha. Every day the system measures: How much more
does the firm understand today vs. yesterday? Which areas became clearer or
murkier? Which research eliminated the most uncertainty? Is our confidence
calibrated (when we said 80%, were we right ~80% of the time)? These metrics
are product surfaces (CIO view) *and* internal engine objectives.

## 10. Long-term arc (context, not commitments)

Phase 1 builds the graph + core loop + signature UI on seeded data. The arc
beyond: real data integrations → deeper reasoning and simulations → learning
from outcomes → autonomous research → institutional intelligence →
self-improving cognition. The same engine can later serve hedge funds, family
offices, PE/VC, corporate strategy — wealth management is the first
application. The architecture must not preclude this; Phase 1 must not
attempt it.
