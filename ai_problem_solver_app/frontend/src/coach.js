// coach.js
//
// Rule-based stand-in for the AI coach. Each exported function corresponds
// to one prompt you would later send to Claude:
//
//   classify(problem)             -> "Classify this problem"
//   clarifyingQuestions(...)      -> "What should we ask the user next?"
//   decompose(...)                -> "Break this into milestones + first micro-steps"
//   expandMilestone(...)          -> "Break this milestone into 60-second actions"
//   encouragement() / nudge()     -> "Reply to the user with a refocus / cheer"
//
// To swap in real Claude calls: replace the body of each function with an
// Anthropic SDK call and keep the return shape identical.

const PROBLEM_TYPES = {
  learning: {
    keywords: ['learn', 'understand', 'study', 'practice', 'memorize', 'class', 'homework', 'essay', 'paper', 'math', 'science', 'read', 'book', 'exam', 'test'],
    label: 'Learning / Study',
    icon: '📚',
    milestoneTemplate: [
      'Set up your space and gather the materials',
      'Skim everything to get the big picture',
      'Identify the 3 hardest concepts',
      'Practice each concept with active recall',
      'Test yourself and patch the gaps',
    ],
  },
  creative: {
    keywords: ['write', 'create', 'design', 'compose', 'art', 'story', 'paint', 'draw', 'video', 'music', 'song', 'poem', 'novel'],
    label: 'Creative work',
    icon: '🎨',
    milestoneTemplate: [
      'Brain-dump every idea (no judging)',
      'Pick the ONE direction that excites you most',
      'Make a rough draft / sketch — bad on purpose',
      'Refine the parts that feel alive',
      'Share it with one person',
    ],
  },
  project: {
    keywords: ['build', 'make', 'develop', 'code', 'app', 'website', 'launch', 'project', 'product', 'feature'],
    label: 'Project / Build',
    icon: '🛠️',
    milestoneTemplate: [
      'Write the one-sentence outcome',
      'List the tools / materials you need',
      'Build the smallest possible version',
      'Use it once and note what feels broken',
      'Fix the one thing that bothered you most',
    ],
  },
  physical: {
    keywords: ['clean', 'tidy', 'cook', 'exercise', 'workout', 'work out', 'fix', 'repair', 'install', 'move', 'laundry', 'dishes', 'declutter', 'room', 'gym'],
    label: 'Physical / Real-world task',
    icon: '💪',
    milestoneTemplate: [
      'Put on the clothes / shoes you need',
      'Set a 10-minute timer — you can stop after',
      'Touch the first physical thing',
      'Work the timer; notice the momentum',
      'Decide: stop or keep going',
    ],
  },
  decision: {
    keywords: ['should i', 'decide', 'choose', 'pick', 'whether', 'between', 'option'],
    label: 'Decision',
    icon: '🤔',
    milestoneTemplate: [
      'Write down the real options (be specific)',
      'For each: 1 best case + 1 worst case',
      'Mark which option future-you would thank you for',
      'Name what you are afraid of, in one line',
      'Pick — give yourself permission to be wrong',
    ],
  },
  career: {
    keywords: ['job', 'interview', 'resume', 'career', 'apply', 'application', 'cover letter', 'linkedin'],
    label: 'Career',
    icon: '💼',
    milestoneTemplate: [
      'Open the doc / app you need',
      'Write the WORST possible first draft',
      'Improve only the first paragraph',
      'Submit it (it does not need to be perfect)',
      'Note one thing to improve next time',
    ],
  },
  planning: {
    keywords: ['plan', 'organize', 'schedule', 'trip', 'event', 'party', 'wedding', 'meeting', 'calendar'],
    label: 'Planning / Organizing',
    icon: '🗓️',
    milestoneTemplate: [
      'Write the goal and the deadline',
      'List the major pieces involved',
      'Order them by what must come first',
      'Block time on a calendar for the first piece',
      'Do the first piece',
    ],
  },
  default: {
    keywords: [],
    label: 'General task',
    icon: '🎯',
    milestoneTemplate: [
      'Pick the smallest possible first action',
      'Do that action for 2 minutes',
      'Decide if you want to continue',
      'Take one more small action',
      'Note your progress, no matter how small',
    ],
  },
};

const MICRO_STEPS_BY_TYPE = {
  learning: [
    'Pick a quiet spot and sit down',
    'Open the material in front of you',
    'Put your phone face-down or in another room',
    'Get water and a snack within reach',
    'Set a 25-minute timer',
  ],
  creative: [
    'Open a blank page',
    'Set a 5-minute timer',
    'Write or sketch everything that comes to mind',
    'Do not edit — just dump',
    'When the timer ends, stop and re-read',
  ],
  project: [
    'Open the tools / app you will use',
    'Write the goal sentence at the top',
    'List the 3 first concrete things you need',
    'Pick the easiest one',
    'Start it',
  ],
  physical: [
    'Stand up',
    'Put on the right clothes / shoes',
    'Walk to where the task is',
    'Touch the first thing involved',
    'Move it / handle it for 60 seconds',
  ],
  decision: [
    'Open a notes app or paper',
    'Write the question at the top',
    'List option A',
    'List option B',
    'List any other options',
  ],
  career: [
    'Open the application / document',
    'Set a 10-minute timer',
    'Write the worst draft you can',
    'Do not edit yet',
    'Save it',
  ],
  planning: [
    'Open a calendar or notes app',
    'Write the deadline at the top',
    'Brain-dump every piece involved',
    'Circle the 3 most important',
    'Pick which goes first',
  ],
  default: [
    'Pause for 30 seconds',
    'Say the goal out loud',
    'Pick the smallest first action',
    'Do that action',
    'Notice you started',
  ],
};

function classify(problem) {
  const text = (problem || '').toLowerCase();
  let bestType = 'default';
  let bestScore = 0;
  for (const [type, data] of Object.entries(PROBLEM_TYPES)) {
    const score = data.keywords.reduce(
      (sum, kw) => sum + (text.includes(kw) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }
  const data = PROBLEM_TYPES[bestType];
  return {
    type: bestType,
    label: data.label,
    icon: data.icon,
    confidence: bestScore > 0 ? 'high' : 'guess',
  };
}

function clarifyingQuestions(_problem, _classification) {
  return [
    {
      id: 'outcome',
      prompt: 'What does "done" look like? One sentence is enough.',
      hint: 'Try: "I have ___ on my desk" or "I can explain ___ to someone".',
      type: 'text',
    },
    {
      id: 'timebox',
      prompt: 'How much time do you want to give this right now?',
      hint: 'Pick whatever feels doable. You can stop early.',
      type: 'choice',
      options: ['5 min', '15 min', '25 min', '1 hour', 'as long as it takes'],
    },
    {
      id: 'unknown',
      prompt: 'What is the biggest unknown — what do you NOT know yet?',
      hint: 'It is OK to say "everything".',
      type: 'text',
    },
  ];
}

function decompose(problem, classification, answers) {
  const template = PROBLEM_TYPES[classification.type].milestoneTemplate;
  const milestones = template.map((label, i) => ({
    id: `m${i}`,
    label,
    status: 'pending',
    steps: i === 0 ? expandMilestone(classification, 0) : [],
  }));
  return {
    outcome: (answers && answers.outcome) || problem,
    timebox: (answers && answers.timebox) || '25 min',
    unknown: (answers && answers.unknown) || '',
    milestones,
  };
}

function expandMilestone(classification, milestoneIndex) {
  // For v1 we only have a curated set of micro-steps per problem type,
  // for the very first milestone. Later milestones get a generic but
  // useful expansion based on their label.
  if (milestoneIndex === 0) {
    const steps =
      MICRO_STEPS_BY_TYPE[classification.type] || MICRO_STEPS_BY_TYPE.default;
    return steps.map((label, i) => ({ id: `s${i}`, label, status: 'pending' }));
  }
  // Generic micro-expansion for later milestones.
  return [
    { id: 's0', label: 'Re-read this milestone out loud', status: 'pending' },
    { id: 's1', label: 'Set a 10-minute timer', status: 'pending' },
    { id: 's2', label: 'Do the smallest version of this for 2 minutes', status: 'pending' },
    { id: 's3', label: 'Notice what you got done', status: 'pending' },
    { id: 's4', label: 'Decide: stop, continue, or refine', status: 'pending' },
  ];
}

const ENCOURAGEMENTS = [
  'You started. That is the hardest part.',
  'One more small action — you have momentum.',
  'Pause, breathe, then the next tiny step.',
  'You do not have to do it perfectly. You have to do it.',
  'Future-you will thank present-you for this.',
  'Five more minutes. You can stop after.',
  'Notice what you have already done.',
  'The next step is small on purpose.',
  'Done is better than perfect. Keep going.',
];

const NUDGES = [
  'Still with me? What is the very next action?',
  'If you are stuck, name what is in the way out loud.',
  'Try this: do the next step for 60 seconds only.',
  'It is OK to do a worse version. Just start.',
  'Tap "Done" the moment you do it — even if it felt tiny.',
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const coach = {
  classify,
  clarifyingQuestions,
  decompose,
  expandMilestone,
  encouragement: () => pickRandom(ENCOURAGEMENTS),
  nudge: () => pickRandom(NUDGES),
};

export default coach;
