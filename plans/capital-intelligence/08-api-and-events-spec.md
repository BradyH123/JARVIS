# 08 — API & Event Contracts

## 1. Shape

- **tRPC** between `apps/web` and the server (end-to-end types from
  `packages/shared`); REST only where tRPC is awkward (PDF download, demo
  webhook). All procedures require a session; role guards per router.
- **Live updates:** SSE channel `/live` pushing typed messages (§4). The web
  app subscribes once and fans out to screens; no per-screen polling.
- **Pagination:** cursor-based everywhere a list can exceed 100 items.
- **Errors:** typed error codes from graph invariants (`E_NO_PROVENANCE`,
  `E_DUPLICATE_ENTITY`, …) surface to Admin; user screens get friendly
  variants.

## 2. Routers and key procedures

| Router | Procedures (input → output, abridged) |
|---|---|
| `auth` | login, logout, me |
| `graph` | `neighborhood({nodeId, depth≤2, filters, viewMode}) → Subgraph` (server-clustered ≤400 nodes) · `node({id}) → NodeDetail` (envelope + type props + rollups + top relationships + recent evidence + hypotheses + unknowns + calendar + audit tail) · `edge({id}) → EdgeDetail` (why it exists: envelope + evidence list + history) · `search({q, types?}) → Hit[]` (alias-aware) · `impactPath({rippleId}) → Ripple` · `asOf({nodeId, t}) → Subgraph` · `savedViews.list/create/delete` · `compare({a,b}) → ComparePayload` |
| `today` | `get({date?}) → {priorities[], graphChanges[], researchAgenda[], firedAlerts[]}` — each priority: `{score, exposureUSD, clientIds, confidence, urgency, horizon, reason, nextStep, anchorNodeId, insightId}` |
| `clients` | list · `profile({id})` → header + tabs payloads · `timeline({id})` · `insights({id})` (each with `insightId` for the trail) · `exposureMap({id})` (client-scoped neighborhood) |
| `research` | `projects.list({status})` · `project({id})` · `launch({nodeId}) → projectId` (pre-drafted plan) · `drilldown({projectId, topicNodeId}) → {subtopics[], questions[], citations[]}` (guided exploration) · `promote({projectId, findingId, to: 'hypothesis'|'task'|'reportSection'|'watchlist'})` |
| `hypotheses` | list({status, sort}) · `get({id})` → statement, confidence + history (from ChangeLog), evidence for/against, assumptions, unknowns, analogues, challenges |
| `scenarios` | templates.list · `run({templateId | custom}) → scenarioId` (job; progress via SSE) · `get({id})` → ripple + narrative + assumptions (labeled SIMULATION) · attachToReport |
| `capitalFlows` | `byTheme() → [{themeId, direction, strength, confidence, supporting[], contradicting[], exposedClientIds}]` · `timeline({themeId})` |
| `evidence` | `feed({filters}) → mapped items` (what happened / who's affected / suggested action) · `item({id})` → evidence + source + quote + links · `raw({sourceId})` (one level down) |
| `tasks` | list/create/update/complete (`complete` records an Outcome) |
| `reports` | templates.list · `generate({kind, sectionRefs[]}) → reportId` · `get({id})` · `GET /reports/:id.pdf` (REST) |
| `memory` | `search({q}) → cited passages` · `calibration() → record` · `knowledgeAdvantage({range}) → metrics` |
| `copilot` | `ask({anchorNodeId?, clientId?, message}) → {answer, citations[]}` (citations = node/evidence ids, all clickable; refusal shape when out-of-corpus) |
| `alerts` | create({nodeId, condition}) · list · delete |
| `admin` | users CRUD · adapters.status/toggle · aiSettings.get/set (model tiers, budgets, weights) · auditLog({filters}) · health · `demo.advanceDay` / `demo.reset` |

`Subgraph` = `{nodes: NodeSummary[], edges: EdgeSummary[], clusters: ClusterHint[], coverageNote?}` —
`coverageNote` is the no-silent-truncation rule made visible.

## 3. Bus topics (pg-boss job names)

```
ingest.document.received      → evidence extraction
evidence.created              → relationship discovery, hypothesis agent
graph.node.stateChanged       → propagation
graph.edge.upserted           → propagation, exposure rollup
graph.ripple.completed        → reasoning agent, research allocation rescore
research.plan.updated         → today recompute
hypothesis.updated            → contradiction check (thresholded), today
scenario.run.requested/.completed
attention.reranked            → today payload rebuild
outcome.recorded              → meta agent
loop.day.start / loop.day.end → orchestrator cadence
demo.dayAdvanced              → seed adapters release next day
```

Every job payload carries `traceId` (one per originating document/change) so
Admin can show the full causal chain of any pipeline run.

## 4. SSE message types (client-facing)

`graph.delta {nodeIds, edgeIds, rippleId?}` · `today.updated` ·
`scenario.progress {scenarioId, stage}` · `job.coverage {screen, note}` ·
`alert.fired {alertId, nodeId}` · `demo.day {n}`.

UI rule: deltas animate only what changed (restrained); a full refetch never
interrupts user interaction with the map.

## 5. AuthZ matrix (Phase 1)

| Capability | Advisor | Analyst | CIO | Admin |
|---|---|---|---|---|
| View all clients | own book | ✓ | ✓ | ✓ |
| Map/Research/Hypotheses/Scenarios | ✓ | ✓ | ✓ | ✓ |
| Generate reports | ✓ | ✓ | ✓ | — |
| Admin screens, demo controls | — | — | read-only health | ✓ |
| AI settings / weights | — | — | propose | ✓ |

("own book" = clients where user is the assigned advisor; CIO sees firm-wide.)
