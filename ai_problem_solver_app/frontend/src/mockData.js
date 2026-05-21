// Hat Business — goal-centered radial canvas.
//
// THE METAPHOR:
//   Goal sits in the center. Around it: 4 foundational "fronts"
//   (sub-goals). Each front has its own workflow trail of steps
//   (done → ★ active → upcoming) radiating outward from the goal,
//   plus the situation assets that front leverages clustered nearby.
//   Cross-front relationships (e.g. lighting kit addresses photo risk)
//   draw lines across the canvas, showing how the situation actually
//   interlocks.
//
// COORDS:
//   x, y refer to the CENTER of each node, in design-pixel units.
//   Design width = 360 (phone portrait); the canvas scales to viewport.
//
// SECTORS (rough quadrants around the goal at (180, 410)):
//   NE = DESIGN      (you create the product)
//   NW = CUSTOMERS   (who buys + your network)
//   SE = PRESENCE    (where you sell — Etsy + IG)
//   SW = MONEY       (pricing + budget)

export const mockGoal = {
  id: 'g1',
  title: 'Hat Business',
  startedAt: 'May 17',
  lastTouchedRelative: '14h ago',
  frontsInMotion: 4,
};

// ── Money state (always visible — backbone of the service) ──
// Every dollar in this app is tracked. The money strip shows:
//   what's spent · what's committed but not paid · what's left ·
//   what we're earning toward.
export const mockMoney = {
  spent: 34,           // already out the door
  pending: 48,         // committed but awaiting approval (lighting kit)
  budget: 200,         // total budget for this goal
  pricePerSale: { low: 45, high: 85 },
  breakEvenSales: 1,   // approx: 1 sale roughly covers spend-to-date
  goalRevenue: null,   // not set yet — AI will propose
  transactions: [
    { when: 'Sat', label: '5yd organic cotton', amount: -25 },
    { when: 'Tue', label: 'Etsy listing fees', amount: -9 },
  ],
};

export const DESIGN_W = 360;

export const canvasNodes = [
  // ── CENTER ───────────────────────────────────────────────
  {
    id: 'goal',
    kind: 'goal',
    label: 'HAT BUSINESS',
    sub: 'Day 4 · 4 fronts in motion',
    x: 180,
    y: 410,
  },

  // ── SUB-GOAL HUBS (foundational steps around the goal) ───
  { id: 'sg-design', kind: 'subgoal', label: 'DESIGN', x: 250, y: 320 },
  { id: 'sg-customers', kind: 'subgoal', label: 'CUSTOMERS', x: 110, y: 320 },
  { id: 'sg-presence', kind: 'subgoal', label: 'PRESENCE', x: 250, y: 500 },
  { id: 'sg-money', kind: 'subgoal', label: 'MONEY', x: 110, y: 500 },

  // ────────────────────────────────────────────────────────
  // DESIGN front (NE) — the product itself
  // ────────────────────────────────────────────────────────
  // Workflow trail (oldest closer to hub, active and future further out)
  { id: 'd1', kind: 'step-done', label: 'Pick 3 directions', x: 285, y: 270 },
  { id: 'd2', kind: 'step-done', label: 'Caption critique', x: 320, y: 220 },
  {
    id: 'd3',
    kind: 'step-active',
    label: 'Sketch 3 bucket hats',
    sub: '~30 min · YOU',
    x: 280,
    y: 140,
    cost: 0,
  },
  { id: 'd4', kind: 'step-upcoming', label: 'Pick the one', x: 320, y: 65, cost: 0 },
  { id: 'd5', kind: 'step-upcoming', label: 'Sew prototype', x: 230, y: 35, cost: 8 },
  // Supporting assets
  { id: 'drawing', kind: 'skill-strong', label: 'drawing', x: 200, y: 200 },
  { id: 'ipad', kind: 'tool', label: 'iPad+Procreate', x: 200, y: 245 },
  { id: 'sewing', kind: 'skill-strong', label: 'sewing', x: 165, y: 80 },
  { id: 'fabric', kind: 'tool', label: 'fabric stash', x: 165, y: 35 },

  // ────────────────────────────────────────────────────────
  // CUSTOMERS front (NW) — audience + network
  // ────────────────────────────────────────────────────────
  { id: 'c1', kind: 'step-done', label: '8 comp shops', x: 80, y: 270, cost: 0 },
  { id: 'c2', kind: 'step-done', label: 'Initial audience', x: 45, y: 220, cost: 0 },
  {
    id: 'c3',
    kind: 'step-active',
    label: 'Coffee w/ Jamie · Thu 3p',
    sub: 'YOU · Big Sky Cafe',
    x: 80,
    y: 140,
    cost: 12,
  },
  { id: 'c4', kind: 'step-upcoming', label: 'Reply to Sam K', x: 45, y: 65, cost: 0 },
  // Supporting assets
  { id: 'jamie', kind: 'person', label: 'Jamie', sub: 'etsy expert', x: 155, y: 145 },
  { id: 'samK', kind: 'person', label: 'Sam K', sub: 'new follower', x: 130, y: 75 },
  { id: 'audience', kind: 'audience', label: '22-30 arts crowd', x: 165, y: 215 },
  { id: 'compShops', kind: 'intel', label: 'comp shops intel', x: 28, y: 290 },

  // ────────────────────────────────────────────────────────
  // PRESENCE front (SE) — where you sell
  // ────────────────────────────────────────────────────────
  { id: 'p1', kind: 'step-done', label: 'Setup Etsy', x: 285, y: 555, cost: 0 },
  { id: 'p2', kind: 'step-done', label: 'Post 3 listings', x: 320, y: 610, cost: 9 },
  { id: 'p3', kind: 'step-done', label: 'IG launch · 47 likes', x: 325, y: 685, cost: 0 },
  {
    id: 'p4',
    kind: 'step-active',
    label: 'DM-back to @maple.studio',
    sub: 'AI drafted · approve to send',
    x: 285,
    y: 770,
    cost: 0,
    revenue: { low: 60, high: 120, label: 'custom order' },
  },
  { id: 'p5', kind: 'step-upcoming', label: 'Reshoot listings', x: 220, y: 845, cost: 0 },
  // Supporting assets
  { id: 'etsy', kind: 'tool', label: 'Etsy', x: 215, y: 575 },
  { id: 'listings', kind: 'thing', label: '3 listings · 8 views', x: 215, y: 645 },
  { id: 'iglaunch', kind: 'event', label: 'IG launch post', x: 235, y: 720 },
  { id: 'mapleStudio', kind: 'person', label: '@maple.studio', sub: 'custom inquiry', x: 225, y: 780 },
  { id: 'photoRisk', kind: 'risk', label: '⚠ photo quality risk', x: 195, y: 830 },

  // ────────────────────────────────────────────────────────
  // MONEY front (SW) — pricing + budget
  // ────────────────────────────────────────────────────────
  { id: 'm1', kind: 'step-done', label: '$200 budget set', x: 80, y: 555, cost: 0 },
  {
    id: 'm2',
    kind: 'step-active',
    label: 'Approve lighting kit · $48',
    sub: 'YOU decide · reversible',
    x: 60,
    y: 660,
    cost: 48,
  },
  {
    id: 'm3',
    kind: 'step-upcoming',
    label: 'Set price band $45-85',
    x: 90,
    y: 745,
    cost: 0,
    revenue: { low: 45, high: 85, label: 'per hat' },
  },
  {
    id: 'm4',
    kind: 'step-upcoming',
    label: 'Track 1st sale margin',
    x: 135,
    y: 820,
    cost: 0,
    revenue: { tbd: true, label: 'unlocks first revenue' },
  },
  // Supporting assets
  { id: 'budget', kind: 'money', label: 'Budget $34/$200', x: 155, y: 580 },
  { id: 'lightKit', kind: 'pending', label: 'lighting kit $48', sub: 'pending', x: 25, y: 705 },
  { id: 'priceBand', kind: 'intel', label: '$45-$85 band', x: 160, y: 720 },
];

export const canvasEdges = [
  // ── Goal → sub-goals (foundational radiating arms) ───────
  { from: 'goal', to: 'sg-design', kind: 'arm' },
  { from: 'goal', to: 'sg-customers', kind: 'arm' },
  { from: 'goal', to: 'sg-presence', kind: 'arm' },
  { from: 'goal', to: 'sg-money', kind: 'arm' },

  // ── DESIGN trail ─────────────────────────────────────────
  { from: 'sg-design', to: 'd1', kind: 'flow' },
  { from: 'd1', to: 'd2', kind: 'flow' },
  { from: 'd2', to: 'd3', kind: 'flow' },
  { from: 'd3', to: 'd4', kind: 'flow-future' },
  { from: 'd4', to: 'd5', kind: 'flow-future' },
  { from: 'drawing', to: 'd3', kind: 'leverage' },
  { from: 'ipad', to: 'd3', kind: 'leverage' },
  { from: 'sewing', to: 'd5', kind: 'leverage-future' },
  { from: 'fabric', to: 'd5', kind: 'leverage-future' },

  // ── CUSTOMERS trail ──────────────────────────────────────
  { from: 'sg-customers', to: 'c1', kind: 'flow' },
  { from: 'c1', to: 'c2', kind: 'flow' },
  { from: 'c2', to: 'c3', kind: 'flow' },
  { from: 'c3', to: 'c4', kind: 'flow-future' },
  { from: 'jamie', to: 'c3', kind: 'leverage' },
  { from: 'samK', to: 'c4', kind: 'leverage-future' },
  { from: 'audience', to: 'c2', kind: 'produced' },
  { from: 'compShops', to: 'c1', kind: 'produced' },

  // ── PRESENCE trail ───────────────────────────────────────
  { from: 'sg-presence', to: 'p1', kind: 'flow' },
  { from: 'p1', to: 'p2', kind: 'flow' },
  { from: 'p2', to: 'p3', kind: 'flow' },
  { from: 'p3', to: 'p4', kind: 'flow' },
  { from: 'p4', to: 'p5', kind: 'flow-future' },
  { from: 'etsy', to: 'p1', kind: 'used' },
  { from: 'etsy', to: 'listings', kind: 'hosts' },
  { from: 'listings', to: 'p2', kind: 'produced' },
  { from: 'iglaunch', to: 'p3', kind: 'produced' },
  { from: 'mapleStudio', to: 'p4', kind: 'leverage' },

  // ── MONEY trail ──────────────────────────────────────────
  { from: 'sg-money', to: 'm1', kind: 'flow' },
  { from: 'm1', to: 'm2', kind: 'flow' },
  { from: 'm2', to: 'm3', kind: 'flow-future' },
  { from: 'm3', to: 'm4', kind: 'flow-future' },
  { from: 'budget', to: 'm1', kind: 'produced' },
  { from: 'lightKit', to: 'm2', kind: 'leverage' },
  { from: 'priceBand', to: 'm3', kind: 'leverage-future' },

  // ── Cross-front (the situation map weaves it all together) ─
  { from: 'lightKit', to: 'photoRisk', kind: 'addresses' },
  { from: 'compShops', to: 'photoRisk', kind: 'derives' },
  { from: 'compShops', to: 'priceBand', kind: 'derives' },
  { from: 'compShops', to: 'audience', kind: 'derives' },
  { from: 'iglaunch', to: 'samK', kind: 'produced' },
  { from: 'iglaunch', to: 'audience', kind: 'reached' },
  { from: 'jamie', to: 'p5', kind: 'will-advise' },
  { from: 'budget', to: 'lightKit', kind: 'gates' },
];

// ── Step detail sheets (one per active step) ───────────────
export const mockStepDetail = {
  d3: {
    title: 'Sketch 3 bucket hat concepts',
    front: 'DESIGN',
    durationMin: 30,
    agency: 'you',
    tool: 'iPad / paper',
    blurb:
      "I'll critique each when you're done, and we'll pick the one to actually make.",
    whyThis: [
      'Direction #2 (illustrated bucket hats) is the strongest pick from Monday.',
      'Drawing is your highest-leverage asset for this goal.',
      'Three sketches gives us enough range to compare without over-committing.',
    ],
    leverages: ['drawing', 'ipad'],
  },
  c3: {
    title: 'Coffee with Jamie · Thursday 3 PM',
    front: 'CUSTOMERS',
    durationMin: 45,
    agency: 'you',
    tool: 'Big Sky Cafe',
    blurb:
      "Bring your phone — Jamie's most useful feedback will be photo critique on the live listings.",
    whyThis: [
      "Jamie's an etsy expert and she's direct (good for photo feedback).",
      'The photo quality risk is your #1 blocker on PRESENCE — Jamie can confirm or rule it out fast.',
      'In-person talking is one of your strong suits.',
    ],
    leverages: ['jamie'],
  },
  p4: {
    title: 'DM-back to @maple.studio',
    front: 'PRESENCE',
    durationMin: 2,
    agency: 'you-approve',
    tool: 'Instagram',
    blurb:
      "They asked about a custom order. AI drafted a reply — approve, edit, or skip.",
    whyThis: [
      'First custom inquiry — high signal that the product resonates.',
      "Quick warm reply keeps them engaged without over-committing.",
      'Custom orders may be a more viable path than retail listings while photos are weak.',
    ],
    leverages: ['mapleStudio'],
  },
  m2: {
    title: 'Approve lighting kit · $48',
    front: 'MONEY',
    durationMin: 1,
    agency: 'you',
    tool: 'AI orders if approved',
    blurb:
      "Addresses the photography risk flag. Reversible (returnable). $48 of your $200 budget.",
    whyThis: [
      'Comp shops with similar photo quality have 3× your view-to-favorite rate.',
      'Listings are live but underperforming — 8 views, 0 favorites in 2 days.',
      'Returnable, so the downside is bounded.',
    ],
    leverages: ['lightKit', 'budget'],
  },
};

// ── Node detail sheets ─────────────────────────────────────
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
              'Comp shops with similar photo quality have 3× your view-to-favorite rate.',
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
          { kind: 'note', text: "Jamie's feedback Thursday (she's direct)" },
        ],
      },
    ],
  },
  lightKit: {
    title: 'Lighting kit · $48',
    subtitle: 'pending your decision',
    sections: [
      {
        heading: 'Why',
        items: [
          {
            kind: 'bullet',
            text:
              'Addresses the photography risk — comp shops with similar photo quality have 3× your view-to-favorite rate.',
          },
          { kind: 'bullet', text: 'Reversible (returnable).' },
          { kind: 'bullet', text: 'Within budget ($34 spent of $200).' },
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
  mapleStudio: {
    title: '@maple.studio',
    subtitle: 'custom order inquiry · IG',
    sections: [
      {
        heading: 'Their message',
        items: [
          {
            when: 'Today 8 AM',
            actor: 'them',
            body:
              "love your work!! do you do custom orders? i'd want something illustrated, kinda art-nouveau vibe — is that in your wheelhouse?",
          },
        ],
      },
      {
        heading: 'AI-drafted reply',
        items: [
          {
            when: 'pending',
            actor: 'you',
            draftedByAi: true,
            body:
              "yes! i do custom — happy to send sketches first. what kind of hat were you imagining? art-nouveau is very much in my wheelhouse.",
          },
        ],
      },
      {
        heading: 'Decide',
        items: [
          { kind: 'action', label: 'Approve & send' },
          { kind: 'action', label: 'Edit' },
          { kind: 'action', label: 'Skip' },
        ],
      },
    ],
  },
  audience: {
    title: '22-30 arts crowd',
    subtitle: 'most promising audience · from comp shop research',
    sections: [
      {
        heading: 'What we know',
        items: [
          { kind: 'bullet', text: 'Comp shops in this niche have 2-4× engagement.' },
          { kind: 'bullet', text: "IG launch's strongest signal came from this group." },
          { kind: 'bullet', text: 'Higher tolerance for $45-85 price band.' },
        ],
      },
    ],
  },
  compShops: {
    title: 'Comp shops intel',
    subtitle: '8 shops studied · Mon-Tue research block',
    sections: [
      {
        heading: 'Key findings',
        items: [
          { kind: 'bullet', text: 'Price band: $45-$85 (drawn/illustrated hats).' },
          { kind: 'bullet', text: 'Photo quality is the #1 differentiator.' },
          { kind: 'bullet', text: '22-30 arts crowd consistently the top buyer.' },
          { kind: 'bullet', text: 'Average 30-day time to first sale.' },
        ],
      },
    ],
  },
  budget: {
    title: 'Budget',
    subtitle: '$34 / $200 spent',
    sections: [
      {
        heading: 'Spent so far',
        items: [
          { kind: 'bullet', text: '$25 · 5 yards of organic cotton (Sat)' },
          { kind: 'bullet', text: '$9 · etsy listing fees (Tue)' },
        ],
      },
      {
        heading: 'Pending',
        items: [{ kind: 'note', text: 'Lighting kit · $48 · awaiting approval' }],
      },
    ],
  },
};

// ── Chat messages ──────────────────────────────────────────
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
      'All three reward drawing. Splitting the goal into 4 fronts so we can move on all of them in parallel: DESIGN, CUSTOMERS, PRESENCE, MONEY.',
  },
  {
    id: 'm4',
    day: 'Today',
    time: '9:02 AM',
    sender: 'ai',
    body:
      "You have 4 active fronts. Tap any one of the ★ steps on the canvas — I'll show you why this and what it touches.",
  },
];

export const mockPending = [
  {
    id: 'p1',
    section: 'PRESENCE',
    title: 'DM-back to @maple.studio',
    blurb: 'They asked about a custom order.',
    draft:
      'yes! i do custom — happy to send sketches first. what kind of hat were you imagining?',
    actions: ['Approve & send', 'Edit', 'Skip'],
  },
  {
    id: 'p2',
    section: 'DESIGN',
    title: 'Studio block — Sat 10 AM, 3h',
    blurb: "For prototype iteration based on Jamie's feedback.",
    actions: ['Add to calendar', 'Different time', 'Skip'],
  },
  {
    id: 'p3',
    section: 'MONEY',
    title: 'Purchase: Lighting kit, $48',
    blurb:
      'Addresses the photography risk flag. Reversible (returnable).',
    actions: ["I'll order", 'AI orders', 'Skip'],
  },
];
