// Mock data for the v0 canvas prototype — Hat Business.
//
// The canvas is nodes + edges. Workflow steps are nodes too, just with
// a different visual style. The active step is the focal point; the
// situation web spreads below it.
//
// Coordinates (x, y) refer to the CENTER of each node, in pixels.
// The canvas is sized to fit the bounds + padding.

export const mockGoal = {
  id: 'g1',
  title: 'Hat Business',
  startedAt: 'May 17',
  lastTouchedRelative: '14h ago',
  stepsDone: 3,
};

// Canvas dimensions (logical) — the canvas scales to viewport width,
// these x values are the "design width." On phone (~360px) we render
// at scale = viewportWidth / DESIGN_W.
export const DESIGN_W = 360;

export const canvasNodes = [
  // ── Workflow river (centered vertical column) ────────────
  {
    id: 'goal',
    kind: 'goal',
    label: 'Hat Business',
    sub: 'Day 4 · 3 done',
    x: 180,
    y: 50,
  },
  { id: 's1', kind: 'step-done', label: 'Pick 3 directions', x: 180, y: 130 },
  { id: 's2', kind: 'step-done', label: 'Situation updated', x: 180, y: 180 },
  { id: 's3', kind: 'step-done', label: 'Caption critique', x: 180, y: 230 },
  {
    id: 's4',
    kind: 'step-active',
    label: 'Sketch 3 bucket hat concepts',
    sub: '~30 min · YOU do this · iPad/paper',
    x: 180,
    y: 330,
  },
  { id: 's5', kind: 'step-upcoming', label: 'Pick the one to make', x: 180, y: 450 },
  { id: 's6', kind: 'step-upcoming', label: 'Sew prototype', x: 180, y: 510 },

  // ── Active-step leverages (close to s4) ──────────────────
  { id: 'drawing', kind: 'skill-strong', label: 'drawing', x: 60, y: 310 },
  { id: 'ipad', kind: 'tool', label: 'iPad + Procreate', x: 60, y: 360 },
  { id: 'timePM', kind: 'time', label: 'time · PM', x: 300, y: 330 },

  // ── Skills / toolkit cluster (top-left of situation zone) ─
  { id: 'sewing', kind: 'skill-strong', label: 'sewing', x: 60, y: 620 },
  { id: 'talking', kind: 'skill-strong', label: 'talking', x: 60, y: 670 },
  { id: 'igcaptions', kind: 'skill-growing', label: 'IG captions', x: 60, y: 720 },
  { id: 'pricing', kind: 'skill-weak', label: 'pricing', x: 60, y: 770 },
  { id: 'photography', kind: 'skill-weak', label: 'photography', x: 60, y: 820 },
  { id: 'sewingMachine', kind: 'tool', label: 'sewing m/c', x: 140, y: 620 },
  { id: 'fabric', kind: 'tool', label: 'fabric stash', x: 140, y: 680 },

  // ── Network cluster (center-right) ───────────────────────
  { id: 'you', kind: 'you', label: 'YOU', x: 180, y: 600 },
  { id: 'jamie', kind: 'person', label: 'Jamie', sub: 'etsy expert', x: 280, y: 590 },
  { id: 'coffee', kind: 'event', label: 'Coffee · Thu 3pm', x: 300, y: 660 },
  { id: 'coworkers', kind: 'person-group', label: 'coworkers', x: 230, y: 700 },
  { id: 'igAudience', kind: 'person-group', label: 'IG · ~400', x: 290, y: 740 },
  { id: 'samK', kind: 'person', label: 'Sam K', sub: 'new follower', x: 310, y: 800 },

  // ── Outputs / world (bottom-center) ──────────────────────
  { id: 'etsy', kind: 'tool', label: 'Etsy', x: 180, y: 870 },
  { id: 'listings', kind: 'thing', label: '3 listings', sub: '8 views · 0 sales', x: 100, y: 920 },
  { id: 'igLaunch', kind: 'event', label: 'IG launch post', sub: '47 likes · 6 follows', x: 250, y: 920 },

  // ── Intel + risk + pending (bottom-right) ────────────────
  { id: 'compShops', kind: 'intel', label: '8 comp shops studied', x: 280, y: 1000 },
  { id: 'audience', kind: 'audience', label: '22-30 arts crowd', sub: 'most promising', x: 130, y: 1000 },
  { id: 'photoRisk', kind: 'risk', label: '⚠ photo quality risk', x: 200, y: 1060 },
  { id: 'lightKit', kind: 'pending', label: 'lighting kit · $48', sub: 'pending', x: 100, y: 1130 },

  // ── Finances (bottom-left) ───────────────────────────────
  { id: 'budget', kind: 'money', label: 'Budget', sub: '$34 / $200 spent', x: 60, y: 1080 },
  { id: 'priceBand', kind: 'intel', label: 'price $45 – $85', x: 60, y: 1160 },
];

export const canvasEdges = [
  // ── Workflow river ───────────────────────────────────────
  { from: 'goal', to: 's1', kind: 'flow' },
  { from: 's1', to: 's2', kind: 'flow' },
  { from: 's2', to: 's3', kind: 'flow' },
  { from: 's3', to: 's4', kind: 'flow' },
  { from: 's4', to: 's5', kind: 'flow-future' },
  { from: 's5', to: 's6', kind: 'flow-future' },

  // ── Active step leverages ────────────────────────────────
  { from: 'drawing', to: 's4', kind: 'leverage' },
  { from: 'ipad', to: 's4', kind: 'leverage' },
  { from: 'timePM', to: 's4', kind: 'leverage' },

  // ── Past steps produced things in the world ──────────────
  { from: 's3', to: 'igLaunch', kind: 'produced' },
  { from: 's2', to: 'audience', kind: 'produced' },

  // ── Skills & tools — anchored on YOU ─────────────────────
  { from: 'you', to: 'drawing', kind: 'has' },
  { from: 'you', to: 'sewing', kind: 'has' },
  { from: 'you', to: 'talking', kind: 'has' },
  { from: 'you', to: 'igcaptions', kind: 'has' },
  { from: 'you', to: 'pricing', kind: 'has-weak' },
  { from: 'you', to: 'photography', kind: 'has-weak' },
  { from: 'you', to: 'ipad', kind: 'has' },
  { from: 'you', to: 'sewingMachine', kind: 'has' },
  { from: 'you', to: 'fabric', kind: 'has' },

  // ── Network ──────────────────────────────────────────────
  { from: 'you', to: 'jamie', kind: 'knows' },
  { from: 'jamie', to: 'coffee', kind: 'scheduled' },
  { from: 'you', to: 'coworkers', kind: 'knows' },
  { from: 'you', to: 'igAudience', kind: 'reaches' },
  { from: 'igLaunch', to: 'samK', kind: 'produced' },
  { from: 'igLaunch', to: 'igAudience', kind: 'reaches' },

  // ── Etsy/listings ────────────────────────────────────────
  { from: 'etsy', to: 'listings', kind: 'hosts' },
  { from: 'jamie', to: 'etsy', kind: 'expert-in' },

  // ── Intel & risk ─────────────────────────────────────────
  { from: 'compShops', to: 'photoRisk', kind: 'derives' },
  { from: 'compShops', to: 'priceBand', kind: 'derives' },
  { from: 'compShops', to: 'audience', kind: 'derives' },
  { from: 'listings', to: 'photoRisk', kind: 'related' },
  { from: 'lightKit', to: 'photoRisk', kind: 'addresses' },
  { from: 'lightKit', to: 'budget', kind: 'costs' },
  { from: 'photography', to: 'photoRisk', kind: 'related' },
];

// ── Step detail (opens when active step is tapped) ─────────
export const mockStepDetail = {
  s4: {
    title: 'Sketch 3 bucket hat concepts',
    durationMin: 30,
    agency: 'you',
    tool: 'iPad / paper',
    blurb:
      "I'll critique each when you're done, and we'll pick the one to actually make.",
    whyThis: [
      'You rated illustrated bucket hats as the strongest direction Monday.',
      "Your drawing skill is the highest-leverage asset for this goal.",
      'Three sketches gives us enough range to compare without over-committing.',
    ],
    leverages: ['drawing', 'ipad', 'timePM'],
  },
};

// ── Node detail (drill-down) ───────────────────────────────
export const mockNodeDetail = {
  jamie: {
    title: 'Jamie',
    subtitle: 'etsy expert · met through coworker Lia',
    sections: [
      {
        heading: 'Thread',
        items: [
          {
            when: 'Sat 4 PM',
            actor: 'you',
            draftedByAi: true,
            body:
              "hey jamie — lia mentioned you've been running an etsy shop for a while. i'm setting one up for hand-drawn hats and could really use 20 min of your eyes on it. happy to buy coffee thurs or fri.",
          },
          {
            when: 'Sat 6 PM',
            actor: 'them',
            body:
              "haha yes happy to. send me the listings when you have them up and let's grab coffee thurs.",
          },
          {
            when: 'Wed 11 AM',
            actor: 'you',
            draftedByAi: true,
            body:
              "listings are live: [link to 3 etsy listings]\nphotos are rough — that's actually what i wanted your take on first. see you thurs.",
          },
        ],
      },
      {
        heading: 'Upcoming',
        items: [{ kind: 'note', text: 'Coffee · Thursday 3 PM · Big Sky Cafe' }],
      },
      {
        heading: 'AI notes about Jamie',
        items: [
          { kind: 'bullet', text: 'Responsive (~2h reply time)' },
          {
            kind: 'bullet',
            text:
              "Direct, doesn't soft-pedal feedback (good for the photography critique you need).",
          },
          { kind: 'bullet', text: 'Knows etsy SEO well — ask about tags.' },
        ],
      },
    ],
  },
  photoRisk: {
    title: 'Photo quality risk',
    subtitle: 'derived from comp shops studied',
    sections: [
      {
        heading: 'Why this matters',
        items: [
          {
            kind: 'bullet',
            text:
              'Comp shops with similar photo quality have 3x your view-to-favorite rate.',
          },
          {
            kind: 'bullet',
            text:
              "Listings are live but underperforming — 8 views, 0 favorites in 2 days.",
          },
        ],
      },
      {
        heading: 'What addresses this',
        items: [
          { kind: 'note', text: 'Lighting kit · $48 · pending your approval' },
          { kind: 'note', text: 'Jamie\'s feedback Thursday (she\'s direct)' },
        ],
      },
    ],
  },
  lightKit: {
    title: 'Lighting kit · $48 · pending',
    subtitle: 'AI wants to order this',
    sections: [
      {
        heading: 'Why',
        items: [
          {
            kind: 'bullet',
            text:
              'Addresses the photography risk flag — comp shops with similar photo quality have 3x your view-to-favorite rate.',
          },
          { kind: 'bullet', text: 'Reversible (returnable).' },
        ],
      },
      {
        heading: 'Decide',
        items: [
          { kind: 'action', label: "I'll order" },
          { kind: 'action', label: 'AI orders' },
          { kind: 'action', label: 'Skip' },
        ],
      },
    ],
  },
};

// ── Chat messages (for the drawer) ─────────────────────────
export const mockMessages = [
  {
    id: 'm1',
    day: 'Mon, May 18',
    time: '2:14 PM',
    sender: 'ai',
    body:
      'Pulled 8 product directions that overlap with your sewing + drawing combo. Skim and tell me which 3 feel most like you.',
  },
  {
    id: 'm2',
    day: 'Mon, May 18',
    time: '2:31 PM',
    sender: 'you',
    body:
      'Locked: #2 (illustrated bucket hats), #4 (embroidered caps), #7 (custom drawn beanies). Note on #2: "love this most."',
  },
  {
    id: 'm3',
    day: 'Mon, May 18',
    time: '2:32 PM',
    sender: 'ai',
    body:
      'All three reward drawing. Updated your Situation: "drawing time per piece" → high.',
  },
  {
    id: 'm4',
    day: 'Today',
    time: '9:02 AM',
    sender: 'ai',
    body:
      "Next move: sketch 3 bucket hat concepts. Tap the active step on the canvas — I'll show you why this and what it touches.",
  },
];

export const mockPending = [
  {
    id: 'p1',
    section: 'NETWORK',
    title: 'DM-back to @maple.studio',
    blurb: 'They asked about a custom order.',
    draft:
      'yes! i do custom — happy to send sketches first. what kind of hat were you imagining?',
    actions: ['Approve & send', 'Edit', 'Skip'],
  },
  {
    id: 'p2',
    section: 'TIME & ENERGY',
    title: 'Studio block — Sat 10 AM, 3h',
    blurb: "For prototype iteration based on Jamie's feedback.",
    actions: ['Add to calendar', 'Different time', 'Skip'],
  },
  {
    id: 'p3',
    section: 'FINANCES',
    title: 'Purchase: Lighting kit, $48',
    blurb:
      'Addresses the photography risk flag. Reversible (returnable).',
    actions: ["I'll order", 'AI orders', 'Skip'],
  },
];
