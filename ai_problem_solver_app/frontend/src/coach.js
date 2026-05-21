// coach.js
//
// Rule-based stand-in for the AI brain. It returns NODES that get added
// to the canvas — questions, tasks, ideas, branches. Each function here
// maps to one prompt that will later be sent to Claude.

const TYPES = {
  learning: { label: 'Learning', icon: '📚' },
  creative: { label: 'Creative', icon: '🎨' },
  project:  { label: 'Project',  icon: '🛠️' },
  physical: { label: 'Physical', icon: '💪' },
  decision: { label: 'Decision', icon: '🤔' },
  career:   { label: 'Career',   icon: '💼' },
  planning: { label: 'Planning', icon: '🗓️' },
  default:  { label: 'Goal',     icon: '🎯' },
};

const KEYWORDS = {
  learning: ['learn','understand','study','memorize','class','homework','essay','math','science','read','exam','test','practice'],
  creative: ['write','create','design','compose','art','story','paint','draw','video','music','song','poem','novel'],
  project:  ['build','make','develop','code','app','website','launch','project','product','feature','startup'],
  physical: ['clean','tidy','cook','exercise','workout','fix','repair','install','move','laundry','dishes','declutter','room','gym'],
  decision: ['should i','decide','choose','pick','whether','between','option'],
  career:   ['job','interview','resume','career','apply','application','cover letter','linkedin'],
  planning: ['plan','organize','schedule','trip','event','party','wedding','meeting','calendar'],
};

function classify(text) {
  const t = (text || '').toLowerCase();
  let best = 'default', score = 0;
  for (const [k, kws] of Object.entries(KEYWORDS)) {
    const s = kws.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
    if (s > score) { score = s; best = k; }
  }
  return { type: best, ...TYPES[best] };
}

// First physical move per type — "where to put your hands"
const FIRST_TOUCH = {
  learning: 'Sit down. Put both hands flat on the desk.',
  creative: 'Open a blank page. Fingers on the keyboard.',
  project:  'Open the tool. Hand on the trackpad.',
  physical: 'Stand up. Walk to where the task is.',
  decision: 'Open notes. Thumb on the screen.',
  career:   'Open the doc. Hands on the keyboard.',
  planning: 'Open the calendar. Tap on today.',
  default:  'Both hands flat on the surface in front of you.',
};

const FIVE_MIN_KICK = {
  learning: 'Set a 5-min timer. Just skim the first page.',
  creative: 'Set a 5-min timer. Type whatever lands — bad on purpose.',
  project:  'Set a 5-min timer. Open the tool and type the goal at the top.',
  physical: 'Set a 5-min timer. Move ONE physical thing.',
  decision: 'Set a 5-min timer. List the options, even bad ones.',
  career:   'Set a 5-min timer. Write the worst possible first sentence.',
  planning: 'Set a 5-min timer. Brain-dump every piece involved.',
  default:  'Set a 5-min timer. You can stop after.',
};

const ANGLES = {
  learning: ['What\'s the ONE concept you keep avoiding?', 'What does the teacher actually grade?'],
  creative: ['Whose work would you love this to feel like?', 'What part scares you most? Start there.'],
  project:  ['What\'s the smallest version that would still be useful?', 'What part are you avoiding because it\'s boring?'],
  physical: ['What\'s the one thing in the way?', 'What\'s the messiest spot? Start there.'],
  decision: ['What\'s the worst case of option A?', 'Future-you 6 months out — what would they choose?'],
  career:   ['Who could read this in 60 seconds and tell you the truth?', 'What\'s the ONE line that has to land?'],
  planning: ['Who else needs to know?', 'What falls apart if one piece is late?'],
  default:  ['What would make this easier?', 'What\'s the one thing you keep avoiding?'],
};

const NUDGES = [
  'Still with me? Tap the glowing one.',
  'Don\'t think — just pick the next move.',
  'One tiny action. Go.',
  'Your map is waiting. Tap something.',
];
const CHEERS = [
  'You did it. Momentum.',
  'Stack another one.',
  'Future-you is grateful.',
  'That\'s real progress.',
  'Keep the streak.',
];

function pickRandom(a) { return a[Math.floor(Math.random() * a.length)]; }

let _idCounter = 0;
function nid() { _idCounter += 1; return `n_${Date.now().toString(36)}_${_idCounter}`; }

// All node-generation functions return PARTIAL nodes (no id/x/y/parentId);
// the canvas fills those in.
function partial(type, text, opts = {}) {
  return { type, text, ...opts };
}

// When the user first submits, spawn the initial tree.
function generateInitial(rootText, c) {
  return [
    partial('question', 'In one sentence: what does "done" actually look like?', {
      status: 'active',
    }),
    partial('task', FIRST_TOUCH[c.type], { status: 'pending' }),
    partial('task', FIVE_MIN_KICK[c.type], { status: 'pending' }),
    partial('idea', pickRandom(ANGLES[c.type] || ANGLES.default), { status: 'pending' }),
    partial('question', 'How much time do you want to spend right now?', {
      status: 'pending',
      options: ['5 min', '15 min', '25 min', '1 hour', 'until done'],
    }),
  ];
}

// When the user answers a question.
function generateAfterAnswer(node, answer, c) {
  const a = (answer || '').trim();
  const short = a.length > 60 ? a.slice(0, 57) + '…' : a;

  // If it was the timebox question, surface hidden sub-tasks
  if (node.options && node.options.some((o) => /min|hour|done/.test(o))) {
    return [
      partial('idea', `Heads up: ${c.label.toLowerCase()} tasks usually run 50% longer than you think. Build in a buffer.`, {
        status: 'pending',
      }),
      partial('task', `Set a timer for ${a} and tap start.`, { status: 'active' }),
    ];
  }

  // Outcome-style answer → translate into a concrete task
  return [
    partial('task', `Spend 2 minutes moving toward: "${short}"`, {
      status: 'active',
    }),
    partial('question', 'What\'s the first concrete thing you need to make this happen?', {
      status: 'pending',
    }),
  ];
}

// When the user completes a task.
function generateAfterTaskDone(_node, c) {
  return [
    partial('celebration', pickRandom(CHEERS), { status: 'pending' }),
    partial('task', `Stack another tiny move: ${nextMicroFor(c)}`, { status: 'active' }),
  ];
}

// When the user skips a task — give them an even smaller version.
function generateAfterTaskSkipped(node, _c) {
  return [
    partial('task', `Smaller version: just look at it for 30 seconds.`, {
      status: 'active',
    }),
    partial('idea', `Name what\'s in the way out loud, then come back.`, { status: 'pending' }),
  ];
}

// When the user accepts an idea — promote it into a task.
function generateAfterIdeaAccepted(node, _c) {
  return [
    partial('task', `Try it: ${node.text}`, { status: 'active' }),
  ];
}

// Periodic nudge if the user goes idle.
function generateNudge() {
  return partial('question', pickRandom(NUDGES), { status: 'active' });
}

const NEXT_POOL = {
  learning: ['Re-read what you just did.', 'Test yourself on one fact.', 'Find the next concept.'],
  creative: ['Add one more sentence.', 'Re-read and circle one good line.', 'Take a 60-second pause.'],
  project:  ['Use what you just built once.', 'Note one thing to fix.', 'Commit / save your work.'],
  physical: ['Put away ONE item.', 'Move to the next spot.', 'Take a 30-second water break.'],
  decision: ['Add one more pro or con.', 'Ask one person for input.', 'Sit with it for 60 seconds.'],
  career:   ['Read what you wrote out loud.', 'Cut the worst sentence.', 'Save it.'],
  planning: ['Block the time on a calendar.', 'Text one person about it.', 'Set a reminder.'],
  default:  ['Do it again, smaller.', 'Take one breath.', 'Note what you learned.'],
};
function nextMicroFor(c) {
  const pool = NEXT_POOL[c.type] || NEXT_POOL.default;
  return pickRandom(pool);
}

// --- Brain dump triage ---
const NOW_RX = /\b(today|now|asap|urgent|due|deadline|tonight|this morning|this afternoon|tomorrow|need to|have to|must|owe)\b/i;
const TRASH_RX = /\b(maybe|someday|might|could|wish|wonder|consider|eventually|if i|one day)\b/i;

function triageDump(text) {
  const items = (text || '')
    .split(/[\n•]+/)
    .map((s) => s.replace(/^[-*•\d.\s]+/, '').trim())
    .filter((s) => s.length > 0);
  const now = [], later = [], trash = [];
  for (const it of items) {
    if (NOW_RX.test(it)) now.push(it);
    else if (TRASH_RX.test(it)) trash.push(it);
    else later.push(it);
  }
  return { now, later, trash };
}

function actionableNextStep(item) {
  const lc = (item || '').toLowerCase();
  if (/email|message|text|reply|respond/.test(lc)) return 'Open the inbox and read the message once.';
  if (/call|phone|ring/.test(lc)) return 'Pick up your phone. You can hang up.';
  if (/clean|tidy|dishes|laundry/.test(lc)) return 'Walk over and touch one thing.';
  if (/write|draft|essay/.test(lc)) return 'Open a blank doc. Type the title.';
  if (/study|read|learn/.test(lc)) return 'Open the material. Read one paragraph.';
  if (/buy|order|shop/.test(lc)) return 'Open the site. Add one thing to the cart.';
  if (/exercise|gym|workout|run/.test(lc)) return 'Put on the shoes. Stand up.';
  return 'Spend 2 minutes on it. You can stop after.';
}

// --- Daily check-in prompts ---
function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Late night.';
  if (h < 12) return 'Good morning.';
  if (h < 17) return 'Good afternoon.';
  if (h < 22) return 'Good evening.';
  return 'Late night.';
}

const coach = {
  classify,
  generateInitial,
  generateAfterAnswer,
  generateAfterTaskDone,
  generateAfterTaskSkipped,
  generateAfterIdeaAccepted,
  generateNudge,
  triageDump,
  actionableNextStep,
  greeting,
  nid,
};

export default coach;
