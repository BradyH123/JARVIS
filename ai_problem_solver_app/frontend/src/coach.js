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

// Every "first step" is intentionally physical: it tells you exactly
// where to put your hands. This shatters task paralysis by giving the
// body something to do before the brain catches up.
const MICRO_STEPS_BY_TYPE = {
  learning: [
    'Sit down at a desk and put both hands flat on it',
    'Open the material in front of you',
    'Put your phone face-down or in another room',
    'Pour water into a glass within arm\'s reach',
    'Set a 25-minute timer and tap start',
  ],
  creative: [
    'Open a blank page; put your fingers on the keyboard',
    'Set a 5-minute timer and tap start',
    'Type or sketch the first thing that comes to mind',
    'Do NOT edit — keep your hands moving',
    'When the timer ends, lift your hands and re-read',
  ],
  project: [
    'Open the tool/app and put your hand on the trackpad',
    'Type the goal sentence at the top',
    'Type the 3 first concrete things you need',
    'Click the easiest one',
    'Start it — 60 seconds is enough',
  ],
  physical: [
    'Stand up and put your hand on the doorframe',
    'Put on the right clothes / shoes',
    'Walk to where the task is',
    'Touch the first physical thing involved',
    'Move it / handle it for 60 seconds',
  ],
  decision: [
    'Open notes and put your thumb on the screen',
    'Type the question at the top',
    'Type "Option A:" and one sentence',
    'Type "Option B:" and one sentence',
    'Type any other options that come up',
  ],
  career: [
    'Open the doc and put your hands on the keyboard',
    'Set a 10-minute timer and tap start',
    'Type the worst possible first draft',
    'Do NOT edit yet — keep typing',
    'Save it (cmd/ctrl + S)',
  ],
  planning: [
    'Open the calendar and tap on today',
    'Type the deadline at the top',
    'Brain-dump every piece involved',
    'Circle the 3 most important',
    'Pick which goes first',
  ],
  default: [
    'Place both hands flat on the surface in front of you',
    'Say the goal out loud, once',
    'Pick the smallest possible first action',
    'Do that action — 60 seconds max',
    'Notice you started',
  ],
};

// Detect "task paralysis" wording so the focus view can re-frame the
// first step as a ridiculously-small physical anchor.
const PARALYSIS_SIGNALS = /\b(can'?t start|cannot start|staring at|overwhelm(ed|ing)?|stuck|paraly[sz]ed|frozen|don'?t know where|so much|too much|avoiding|procrastinat)\b/i;

function detectParalysis(text) {
  return PARALYSIS_SIGNALS.test(text || '');
}

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

// --- Time-Blindness audit: per-type "hidden sub-tasks people forget" ---
// Used in the clarify form right after the user picks a timebox.
const HIDDEN_SUBTASKS = {
  learning: [
    'Reviewing what you already know before starting',
    'Taking a real break (not scrolling)',
    'Going back to fix the thing you skipped',
  ],
  creative: [
    'Staring at the wall while ideas land',
    'Throwing out the bad first draft',
    'Naming it / saving it properly',
  ],
  project: [
    'Setting up the tools and environment',
    'Reading the docs you keep avoiding',
    'Cleanup / shutting things down',
  ],
  physical: [
    'Walking to where the task is and back',
    'Finding the thing you need (tape, scissors, etc.)',
    'Putting it all away when done',
  ],
  decision: [
    'Asking one person for input',
    'Sitting with the choice for an hour',
    'Telling someone what you decided',
  ],
  career: [
    'Proofreading slowly',
    'Customizing for the specific company / role',
    'Following up after sending',
  ],
  planning: [
    'Confirming with the other people involved',
    'Building in buffer time',
    'Backup plan if something falls through',
  ],
  default: [
    'Setup time before the task',
    'Interruptions you can\'t fully control',
    'Cleanup / shutdown after',
  ],
};

function timeAudit(classification) {
  return HIDDEN_SUBTASKS[classification.type] || HIDDEN_SUBTASKS.default;
}

// --- Quest framing: reframe a micro-step as a small game with a reward ---
const QUEST_THEMES = [
  { match: /\b(sit|stand|walk|put on|open|set up|gather)\b/i, title: 'Suit Up',           reward: '60 seconds of your favorite song' },
  { match: /\b(timer|set a|minute|pomodoro)\b/i,              title: 'Set the Trap',      reward: 'a deep breath' },
  { match: /\b(write|sketch|draft|dump|brain[- ]?dump)\b/i,   title: 'Brain Dump Quest',  reward: 'a long stretch' },
  { match: /\b(decide|pick|choose|circle|mark)\b/i,           title: 'The Choice',        reward: 'tell someone what you picked' },
  { match: /\b(read|skim|review|re-?read)\b/i,                title: 'Recon Mission',     reward: 'a sip of water' },
  { match: /\b(practice|recall|test yourself|quiz)\b/i,       title: 'Boss Fight',        reward: 'one small celebration' },
  { match: /\b(refine|improve|edit|polish|fix)\b/i,           title: 'Sharpen the Blade', reward: 'a 60-second pause' },
  { match: /\b(share|send|submit|post|tell)\b/i,              title: 'Final Move',        reward: 'the relief of being done' },
  { match: /\b(start|begin|move|touch|do)\b/i,                title: 'First Move',        reward: 'the satisfaction of starting' },
];

function questFor(stepLabel) {
  for (const q of QUEST_THEMES) {
    if (q.match.test(stepLabel)) {
      return { title: q.title, reward: q.reward };
    }
  }
  return { title: 'Side Quest', reward: 'a small win' };
}

// --- Brain dump triage: dump everything, get Now / Later / Trash buckets ---
//
// Heuristic categorization based on keywords. A real Claude call would do
// this far better; this is just enough to make the UX feel intelligent.
const NOW_SIGNALS = /\b(today|now|asap|urgent|due|deadline|tonight|this morning|this afternoon|tomorrow|this week|need to|have to|must)\b/i;
const TRASH_SIGNALS = /\b(maybe|someday|might|could|wish|wonder|consider|eventually|if i|one day)\b/i;

function triageDump(text) {
  const lines = (text || '')
    .split(/[\n•]+/)
    .map((s) => s.replace(/^[-*•\d.\s]+/, '').trim())
    .filter((s) => s.length > 0);

  const now = [];
  const later = [];
  const trash = [];

  for (const line of lines) {
    if (NOW_SIGNALS.test(line)) {
      now.push(line);
      continue;
    }
    if (TRASH_SIGNALS.test(line)) {
      trash.push(line);
      continue;
    }
    later.push(line);
  }

  return {
    now: now.slice(0, 6),
    later: later.slice(0, 10),
    trash: trash.slice(0, 10),
  };
}

// One-sentence "actionable next step" for a Now item (very simple version).
function actionableNextStep(item) {
  const lc = item.toLowerCase();
  if (/email|message|text|reply|respond/.test(lc)) return 'Open the inbox and read the message once.';
  if (/call|phone|ring/.test(lc)) return 'Pick up your phone and dial. You can hang up.';
  if (/clean|tidy|dishes|laundry/.test(lc)) return 'Walk to the spot and touch one thing.';
  if (/write|draft|essay/.test(lc)) return 'Open a blank doc and type the title.';
  if (/study|read|learn/.test(lc)) return 'Open the material and read one paragraph.';
  if (/buy|order|shop/.test(lc)) return 'Open the site and add one thing to the cart.';
  return 'Spend 2 minutes on this. You can stop after.';
}

// --- Body Double mode: short check-in prompts every 10 minutes ---
const BODY_DOUBLE_PROMPTS = [
  'Hey — quick check-in. What are you working on right now?',
  'Still here. Are you on the step we picked, or did you drift?',
  'Eyes up. What did you get done in the last 10 minutes?',
  'Tiny status update: one word is fine.',
  'Checking in. Still moving?',
];

function bodyDoublePrompt() {
  return pickRandom(BODY_DOUBLE_PROMPTS);
}

const BODY_DOUBLE_REPLIES = {
  good: [
    'Love that. Keep the momentum — next step is queued up.',
    'You\'re cooking. Hit one more.',
    'Nice. Future-you is thanking present-you.',
  ],
  stuck: [
    'OK — try the next step for 60 seconds only. Stop after if you want.',
    'Name the block out loud. Then do the next tiny thing.',
    'Add an even smaller step before the suggested one.',
  ],
  distracted: [
    'Happens. Phone face-down for 2 minutes. Then one step.',
    'Refocus: re-read your goal at the top. Pick the next step.',
    'No guilt. Just one tiny action to get the engine back.',
  ],
};

function bodyDoubleReply(status) {
  const arr = BODY_DOUBLE_REPLIES[status] || BODY_DOUBLE_REPLIES.good;
  return pickRandom(arr);
}

const coach = {
  classify,
  clarifyingQuestions,
  decompose,
  expandMilestone,
  encouragement: () => pickRandom(ENCOURAGEMENTS),
  nudge: () => pickRandom(NUDGES),
  timeAudit,
  questFor,
  triageDump,
  actionableNextStep,
  bodyDoublePrompt,
  bodyDoubleReply,
  detectParalysis,
};

export default coach;
