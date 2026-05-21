// Mock data for the v0 prototype — Hat Business example.
// Everything is hardcoded; no backend. Lets us see and feel the design.

export const mockGoal = {
  id: 'g1',
  title: 'Hat Business',
  startedAt: 'May 17',
  lastTouchedRelative: '14h ago',
  stepsDone: 3,
};

export const mockMessages = [
  {
    id: 'm1',
    day: 'Mon, May 18',
    time: '2:14 PM',
    sender: 'ai',
    body: 'Pulled together 8 product directions I think overlap with your sewing + drawing combo. Skim them and tell me which 3 feel most like you.',
    actions: [{ label: 'View 8 directions' }],
  },
  {
    id: 'm2',
    day: 'Mon, May 18',
    time: '2:31 PM',
    sender: 'you',
    body: 'Locked: #2 (illustrated bucket hats), #4 (embroidered caps), #7 (custom drawn beanies). Rated each 4-5 stars. Note on #2: "love this most."',
  },
  {
    id: 'm3',
    day: 'Mon, May 18',
    time: '2:32 PM',
    sender: 'ai',
    body: "Good signal. All three reward your drawing skill, which is rarer than sewing. I updated your Situation: \"drawing time per piece\" → high.",
    actions: [{ label: 'View update' }],
  },
  {
    id: 'm4',
    day: 'Wed, May 20',
    time: '11:14 AM',
    sender: 'ai',
    body: 'Two caption options for your launch post:',
    critique: {
      options: [
        {
          id: 'A',
          label: 'Option A',
          body: "hats for people who don't usually wear hats.\nhand-drawn, hand-sewn, one of one.\nstarting at $58 — link in bio.",
        },
        {
          id: 'B',
          label: 'Option B',
          body: "if you've ever stared at a plain hat thinking \"this could be art\": that's the brief.\neach one drawn by hand. each one only made once.\n$58 to start. link below.",
        },
      ],
      defaultRatings: { A: 3, B: 5 },
      defaultNote: 'B is more me. A feels generic. cut "this could be art" though — too try-hard.',
    },
  },
  {
    id: 'm5',
    day: 'Today',
    time: '9:02 AM',
    sender: 'ai',
    body: null,
    step: {
      title: 'Sketch 3 bucket hat concepts',
      durationMin: 30,
      agency: 'you',
      tool: 'iPad / paper',
      blurb: "I'll critique each when you're done, and we'll pick the one to actually make.",
      whyThis: [
        'You rated illustrated bucket hats as the strongest direction Monday.',
        "Your drawing skill is the highest-leverage asset for this goal — we need to use it before we sew.",
        'Three sketches gives us enough range to compare without making you over-commit.',
      ],
      leverages: ['Skill: drawing', 'Tool: iPad+Procreate', 'Time block: weekday PM'],
    },
  },
];

export const mockSituation = {
  timeEnergy: {
    summary: '~10h / week available',
    rows: [
      ['Best window', 'weekday afternoons'],
      ['This week', '6h logged (under)'],
    ],
    calendar: [
      { day: 'Thu', time: '3:00 PM', what: 'Coffee with Jamie', byAi: true, approved: true },
      { day: 'Sat', time: '10:00 AM', what: 'Studio block — sewing prototype', byAi: false, approved: true },
      { day: 'Sun', time: '—', what: 'No commitments', byAi: false, approved: true, soft: true },
    ],
    pendingCount: 1,
  },
  skillsToolkit: {
    strong: ['sewing', 'drawing', 'in-person talking'],
    growing: ['instagram captions', 'etsy listings'],
    weak: ['pricing', 'product photography'],
    toolkit: ['sewing machine', 'iPad + Procreate', 'Instagram (~400)', 'fabric stash'],
    activity: [
      { date: 'Mon', what: '3 bucket hat sketches saved', tool: 'Procreate' },
      { date: 'Tue', what: 'Prototype 1 built', tool: 'Sewing m/c' },
      { date: 'Wed', what: 'Launch post live', tool: 'Instagram' },
      { date: 'Wed', what: '3 listings live', tool: 'Etsy' },
    ],
    pendingCount: 1,
  },
  finances: {
    rows: [
      ['Budget', '<$200 / month'],
      ['Spent', '$34'],
      ['Goal', 'Break even by month 3'],
    ],
    moneyOut: [
      { date: 'Sat', what: 'Fabric (canvas + lining)', amount: '$22.40', actor: 'you' },
      { date: 'Mon', what: 'Etsy listing fees (3)', amount: '$0.60', actor: 'ai' },
      { date: 'Mon', what: 'Domain: bradymakes.co', amount: '$11.00', actor: 'you' },
    ],
    moneyIn: [],
    pendingPurchase: {
      name: 'Lighting kit for product photos',
      amount: '$48',
      reason: 'Addresses the photography risk flag.',
    },
  },
  network: {
    people: [
      {
        id: 'jamie',
        name: 'Jamie',
        tag: 'etsy expert',
        status: 'Warm thread open',
        lastTouched: '2d ago',
        preview: '"happy to look at your listings when ready"',
      },
      {
        id: 'coworkers',
        name: 'Coworkers',
        tag: '4 people',
        status: 'No open threads',
        lastTouched: '6d ago',
      },
      {
        id: 'instagram',
        name: 'Instagram audience',
        tag: '~400 followers',
        status: '2 unread DMs',
        lastTouched: 'just now',
      },
    ],
    pendingOutreach: 1,
  },
  goalIntel: {
    audienceCandidates: [
      { label: '22-30 urban arts crowd', tag: 'most promising' },
      { label: 'festival circuit', tag: 'seasonal' },
      { label: 'outdoor / regen ag', tag: 'your interest' },
    ],
    priceBand: '$45 – $85',
    compShopsStudied: 8,
    riskFlag:
      'Product photography is the most common reason comp shops underperform.',
    outbound: [
      {
        date: 'Wed 9 AM',
        what: 'IG launch post',
        stats: '47 likes · 3 comments · 6 follows',
        signal: 'bucket hat #2 got most comments',
      },
      {
        date: 'Wed 11 AM',
        what: 'Etsy listings (3)',
        stats: '8 views · 0 favorites · 0 sales',
        signal: 'low view-to-favorite suggests photos',
      },
      {
        date: 'Tue 4 PM',
        what: 'DM-back to follower asking about custom',
        stats: 'reply: "yes please, just emailed you"',
        signal: 'created new Network entry: Sam K',
      },
    ],
    pendingPosts: 2,
  },
};

export const mockJamie = {
  name: 'Jamie',
  tag: 'etsy expert, met through coworker Lia',
  bestContact: 'text',
  relationship: 'Warm',
  owes: 'Owes you nothing',
  thread: [
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
  upcoming: { what: 'Coffee', when: 'Thursday 3 PM', where: 'Big Sky Cafe' },
  notes: [
    'Responsive (~2h reply time)',
    "Direct, doesn't soft-pedal feedback (good for the photography critique you need).",
    'Knows etsy SEO well — ask about tags.',
  ],
};

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
      'Addresses the photography risk flag — comp shops with similar photo quality have 3x your view-to-favorite rate. Reversible (returnable).',
    actions: ["I'll order", 'AI orders', 'Skip'],
  },
];
