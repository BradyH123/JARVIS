// Hat Business — situation only.
//
// The situation is intentionally NOT uniform. Each piece of the situation
// has its own native shape because it's a different kind of thing:
// money is a ledger, a person is a card, a risk is an alarm, a platform
// presence mimics that platform. The visual variety IS the design.

export const situation = {
  goalTitle: 'Hat Business',
  day: 4,

  money: {
    spent: 34,
    pending: 48,
    budget: 200,
    pricePerSale: { low: 45, high: 85 },
    transactions: [
      { when: 'Sat', label: '5yd organic cotton', amount: -25 },
      { when: 'Tue', label: 'Etsy listing fees', amount: -9 },
    ],
    pendingItems: [{ label: 'Lighting kit', amount: -48 }],
  },

  risks: [
    {
      id: 'photo',
      severity: 'high',
      title: 'Photo quality',
      why: 'Comp shops have 3× your view-to-favorite rate.',
      addressedBy: 'Lighting kit · $48',
    },
  ],

  you: {
    skills: [
      { name: 'drawing', strength: 'strong' },
      { name: 'sewing', strength: 'strong' },
      { name: 'talking', strength: 'strong' },
      { name: 'IG captions', strength: 'growing' },
      { name: 'pricing', strength: 'weak' },
      { name: 'photography', strength: 'weak', warn: true },
    ],
    tools: ['iPad + Procreate', 'sewing m/c', 'fabric stash'],
    time: 'PM weekdays · ~8h/week',
  },

  people: [
    {
      id: 'jamie',
      name: 'Jamie',
      initial: 'J',
      role: 'etsy expert',
      importance: 'high',
      tag: 'THU 3PM · Big Sky Cafe',
      note: 'Direct. Knows etsy SEO. Won\'t soft-pedal feedback.',
    },
    {
      id: 'samK',
      name: 'Sam K',
      initial: 'S',
      role: 'new follower',
      importance: 'low',
      note: 'asked thoughtful question on launch post',
    },
    {
      id: 'maple',
      name: '@maple.studio',
      initial: 'M',
      role: 'custom inquiry',
      importance: 'pending',
      tag: 'PENDING reply',
    },
  ],

  platforms: [
    {
      id: 'etsy',
      name: 'Etsy',
      handle: '@yourshop',
      accent: '#e8772e',
      stats: [
        { label: 'listings', value: '3' },
        { label: 'views', value: '8' },
        { label: 'favs', value: '0' },
        { label: 'days live', value: '2' },
      ],
      thumbnails: 3,
    },
    {
      id: 'ig',
      name: 'Instagram',
      handle: '@your_handle',
      accent: 'linear-gradient(135deg, #f9ce34, #ee2a7b, #6228d7)',
      stats: [
        { label: 'followers', value: '412' },
        { label: 'launch ♥', value: '47' },
        { label: 'follows from post', value: '6' },
      ],
      note: 'Audience leaning · 22-30 arts crowd',
    },
  ],

  intel: {
    title: 'comp shop research',
    when: 'Mon-Tue, 8 shops studied',
    bullets: [
      'Price band: $45–$85 for illustrated hats.',
      'Photo quality is the #1 differentiator.',
      '22-30 arts crowd consistently the top buyer.',
      '~30 days from launch to first sale on average.',
    ],
  },

  pending: [
    {
      id: 'lightkit',
      kind: 'purchase',
      title: 'Lighting kit · $48',
      why: 'Addresses photo quality risk. Reversible (returnable).',
      actions: ["I'll order", 'AI orders', 'Skip'],
    },
    {
      id: 'studioTime',
      kind: 'time',
      title: 'Studio block · Sat 10 AM, 3h',
      why: "For prototype iteration based on Jamie's feedback.",
      actions: ['Add to calendar', 'Different time', 'Skip'],
    },
  ],
};
