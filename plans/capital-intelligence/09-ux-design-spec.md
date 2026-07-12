# 09 — UX & Design Specification

Design language: **graph-first · dark-mode-first · dense but organized ·
alive but restrained**. Every screen answers exactly one question (PRD §4).
This doc pins the system so screens are built consistently; per-screen
functional requirements stay in the PRD.

## 1. Design tokens

### 1.1 Color (dark theme is primary; light theme derived, not designed-first)

| Token | Value | Use |
|---|---|---|
| `bg.canvas` | `#0B0E14` | app background, map canvas |
| `bg.surface` | `#12161F` | panels, cards |
| `bg.raised` | `#1A2029` | popovers, detail panel |
| `border.subtle` | `#232B37` | hairlines |
| `text.primary` | `#E6EAF2` | |
| `text.secondary` | `#9AA5B5` | |
| `accent` | `#4C8DFF` | interactive, links, selection |
| `state.stable` | `#2FBF71` | node state green |
| `state.improving` | `#7BD88F` | lighter green + ▲ glyph |
| `state.deteriorating` | `#E5484D` | red + ▼ glyph |
| `state.uncertain` | `#F5A524` | amber + ? glyph |
| `knowledge.clear` | `#2FBF71` | knowledge weather |
| `knowledge.foggy` | `#F5A524` | |
| `knowledge.unknown` | `#8B93A7` (hatched) | unknown ≠ bad — grey, not red |
| `sim` | `#B48CFF` | everything labeled SIMULATION/prediction |

**Non-negotiable:** state is never encoded by color alone — every state
pairs a glyph (▲ ▼ ? ●) and, on nodes, a border style (solid/dashed/hatched),
for accessibility (WCAG AA contrast on all text tokens).

### 1.2 Typography & density

- UI: Inter; data/numerals: IBM Plex Mono (tabular figures for all numbers).
- Type scale: 12/13/14/16/20/28. Default data-row height 32px ("dense"),
  40px "comfortable" toggle in settings.
- Numbers: USD compact (`$1.9B`, `$48.2M`); confidence always as `0.74`
  two-decimals with a 24px inline bar; deltas always signed.

### 1.3 The four object types are visually distinct everywhere

| Kind | Chip | Color |
|---|---|---|
| Fact | `FACT` | neutral grey chip |
| Interpretation | `INTERP` | blue outline chip |
| Prediction/Simulation | `SIM` | purple (`sim`) chip |
| Recommendation | `REC` | accent-filled chip |

Rendered on every insight, feed item, report section, and copilot citation.

## 2. Application chrome

- **Left nav:** 56px icon rail (expands to 220px on hover/pin), the 12 areas
  in PRD order, badge counts on Today/Tasks.
- **Top bar:** global search (`⌘K`), time indicator (demo day chip when in
  demo mode), coverage-note indicator, user menu.
- **Right detail panel:** 400px, slide-over on <1440px, pinned on large
  displays; hosts the node/edge detail everywhere (map, today, clients — one
  component).
- **Explainability drawer:** bottom sheet, opened from any `REC`/`SIM`/
  `INTERP` chip → renders the six-question template + the
  Recommendation → Reasoning → Hypotheses → Evidence → Sources trail as a
  breadcrumb the user can walk. One component, used product-wide.

### 2.1 Keyboard map (Phase 1)

`⌘K` search · `1–9,0,-,=` nav areas · `E` expand node · `P` pin · `H` hide ·
`I` isolate path · `C` compare · `R` launch research · `T` new task ·
`.` open explainability drawer · `⌘⏎` accept copilot draft · `Esc` close
panel/drawer. All map actions also mouse-reachable (right-click menu).

## 3. The Intelligence Map (rendering spec)

- **Renderer:** Sigma.js (WebGL). Layout: precomputed server-side
  (force-directed per cluster, stable seeds so positions don't jump between
  sessions); client does micro-physics only on expand/collapse.
- **Level-of-detail:** zoomed out → cluster bubbles with counts + aggregate
  state; mid → nodes, no labels except pinned/hovered; close → labels +
  state glyphs. Hard cap 400 rendered nodes (server clusters beyond that;
  `coverageNote` when clustering hides matches).
- **Node encoding:** size = selected metric (default `firmExposureUSD`,
  switcher per PRD); fill = type hue (muted); border = state color+style;
  small badge = affected-client count when >0.
- **Edge encoding:** width = strength, opacity = confidence, color = neutral
  except during ripple replay; arrowheads only at close zoom.
- **Ripple animation:** on `graph.delta` with `rippleId`, pulse travels the
  stored path, 250ms/hop, max 8 concurrent pulses; a "ripples" toggle can
  mute all motion. Nothing else on the canvas animates continuously.
- **Selection model:** click = select + detail panel; double-click = expand;
  drag-select = compare tray (max 2); breadcrumb of drill path top-left
  ("Firm → AI Infrastructure → NVDA → TSMC").
- **Performance budget (CI-checked):** first map paint <2s on seed data;
  pan/zoom ≥50fps on a 2019-class laptop; expand ≤300ms server round-trip.

## 4. Screen layout notes (delta on top of PRD §4)

- **Today:** single centered column (max 960px) of priority rows — rank,
  reason (one sentence), exposure, client avatars, confidence bar, horizon
  chip, one primary action. Right rail: graph-changes mini-list + research
  agenda. No cards-in-cards; a row expands inline to show its evidence trail.
- **Client profile:** header band (name, archetype, AUM, risk, relationship
  health dial, last contact) + tab strip; the Exposure Map tab embeds the
  same map component scoped to the client (all interactions identical).
- **Research workspace:** 3 panes — projects list (280px) / canvas / promote
  rail (320px). Canvas blocks: question, evidence card, hypothesis panel,
  subgraph snippet; blocks are draggable, snap to a vertical flow, and every
  block shows its citations. Guided drill-down renders as suggested next
  blocks ("3 subtopics, 2 open questions"), never as a chat transcript.
- **Scenario studio:** left = template/param form (shock target, magnitude,
  horizon); center = map in ripple-replay mode; right = per-client impact
  table (bands, not point estimates) + assumptions list. Everything under a
  persistent `SIMULATION` banner (purple).
- **Hypotheses:** table view (statement, confidence sparkline, Δ7d,
  evidence ±counts, status, owner) with expandable rows; challenges from the
  Contradiction agent render inline in red-outlined blocks.
- **News & Evidence:** mapped-item rows (what happened → who's affected →
  suggested action, with chips); "view raw feed" is a deliberate extra
  click. Filters persist per user.
- **Admin:** plain tables + status tiles; the audit log is searchable by
  `traceId` and renders the pipeline chain for any write.

## 5. States & motion rules

- Every screen defines loading (skeleton, not spinner), empty ("no research
  projects yet — launch one from any node on the map"), error, and
  **coverage** ("analysis limited: budget cap — 3 of 41 documents deferred")
  states. Coverage notes are amber, dismissible, logged.
- Motion: 150–300ms ease-out only; no looping/idle animation anywhere except
  the ripple replay; `prefers-reduced-motion` kills all canvas animation.
- Copy tone: analyst-grade, hedged futures ("may", "estimated", confidence
  shown), no exclamation marks, no AI-persona voice. Banned-phrase lint list
  applies to UI copy too.

## 6. Component inventory (build once, reuse)

`GraphCanvas` · `NodeDetailPanel` · `EdgeDetailPanel` · `ExplainabilityDrawer`
· `ConfidenceBar` · `KindChip` · `StateGlyph` · `PriorityRow` · `EvidenceCard`
· `HypothesisPanel` · `ImpactTable` · `ClientHeader` · `CoverageNote` ·
`CommandPalette` · `SavedViewMenu`. Storybook stories + visual regression
screenshots for each are part of M2/M4 definitions of done.
