// coach.js — drives a single-page flow through phases:
//   1. dump      — collect thoughts as floating nodes on the canvas
//   2. pick      — promote one to today's focus (goal)
//   3. expand    — break the goal into themes
//   4. drill     — first action for each theme (tasks)
//   5. execute   — pick a task, do it, confirm done/stuck/skip
//   6. loop      — pick the next, or wrap
//
// Each phase function reads canvas state and returns the next prompt.
// handleAnswer maps the user's response into node additions/updates.
// Designed so each function can later become a Claude API call.

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Late night.';
  if (h < 12) return 'Good morning.';
  if (h < 17) return 'Good afternoon.';
  if (h < 22) return 'Good evening.';
  return 'Late night.';
}

let _id = 0;
function nid() { _id += 1; return `n_${Date.now().toString(36)}_${_id}`; }

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

// --- Phase: brain dump -----------------------------------------------------

function getDumpPrompt(state) {
  const dumps = state.nodes.filter((n) => n.type === 'dump');
  if (dumps.length === 0) {
    return {
      id: nid(),
      text: `${greeting()} I'm here to map out your thinking and help you actually move on it. What's on your mind right now?`,
      hint: 'Anything — a task, a worry, an idea, a half-formed thought. One thing at a time.',
      type: 'open',
      action: 'add-dump',
      phase: 'dump',
    };
  }
  if (dumps.length < 3) {
    return {
      id: nid(),
      text: `Good. What else is on your mind?`,
      hint: 'Keep going. The map gets richer the more I have to work with.',
      type: 'open-or-skip',
      action: 'add-dump',
      phase: 'dump',
      skipLabel: dumps.length >= 1 ? `I'm empty — let's pick one (${dumps.length})` : null,
    };
  }
  // 3+ items: still allow more but actively offer to move on
  return {
    id: nid(),
    text: `Anything else, or shall we pick what to focus on?`,
    hint: `You've got ${dumps.length} things mapped. We can keep going or commit.`,
    type: 'open-or-skip',
    action: 'add-dump',
    phase: 'dump',
    skipLabel: `Pick one — I'm done dumping`,
  };
}

// --- Phase: pick today's focus --------------------------------------------

function getPickPrompt(state) {
  const dumps = state.nodes.filter((n) => n.type === 'dump');
  return {
    id: nid(),
    text: `Look at your map. Which of these matters most to make progress on right now?`,
    hint: 'Pick the one that would feel best to chip away at.',
    type: 'choice-with-other',
    options: dumps.map((d) => ({ value: d.id, label: d.text })),
    otherLabel: 'Something else — let me type it',
    action: 'pick-today',
    phase: 'pick',
  };
}

// --- Phase: expand (themes) -----------------------------------------------

function getExpandPrompt(state) {
  const root = state.nodes.find((n) => n.id === state.rootId);
  const themes = state.nodes.filter((n) => n.type === 'theme' && n.parentId === state.rootId);
  if (themes.length === 0) {
    return {
      id: nid(),
      text: `Let's break this down. What's the first piece of "${root.text}"?`,
      hint: 'A part, an angle, a sub-goal. One short phrase.',
      type: 'open',
      action: 'add-theme',
      parentId: state.rootId,
      referencingNodeId: state.rootId,
      phase: 'expand',
    };
  }
  if (themes.length === 1) {
    return {
      id: nid(),
      text: `Good. What else does this involve?`,
      hint: 'Another piece.',
      type: 'open',
      action: 'add-theme',
      parentId: state.rootId,
      referencingNodeId: state.rootId,
      phase: 'expand',
    };
  }
  if (themes.length === 2) {
    return {
      id: nid(),
      text: `One more — what's the part you keep avoiding?`,
      hint: 'The annoying piece. Name it now and it gets easier.',
      type: 'open-or-skip',
      action: 'add-theme',
      parentId: state.rootId,
      referencingNodeId: state.rootId,
      phase: 'expand',
      skipLabel: `Map feels complete — drill in`,
    };
  }
  // 3+ themes — offer optional more, default to drilling
  return {
    id: nid(),
    text: `Anything else, or shall I dive in?`,
    hint: 'Often the 4th piece is the one you forgot.',
    type: 'open-or-skip',
    action: 'add-theme',
    parentId: state.rootId,
    referencingNodeId: state.rootId,
    phase: 'expand',
    skipLabel: `Dive in`,
  };
}

// --- Phase: drill (first task per theme) ----------------------------------

function getDrillPrompt(state) {
  const themes = state.nodes.filter((n) => n.type === 'theme' && n.parentId === state.rootId);
  const tasks = state.nodes.filter((n) => n.type === 'task');
  const next = themes.find((t) => !tasks.some((task) => task.parentId === t.id));
  if (!next) return null;
  return {
    id: nid(),
    text: `Zoom in here. What's the very first action you'd take on this?`,
    hint: 'A real, physical action. Where do your hands go? Under 2 minutes.',
    type: 'open',
    action: 'add-task',
    parentId: next.id,
    referencingNodeId: next.id,
    phase: 'drill',
  };
}

// --- Phase: pick first task to execute ------------------------------------

function getPickTaskPrompt(state) {
  const tasks = state.nodes
    .filter((n) => n.type === 'task' && n.status !== 'done' && n.status !== 'dismissed' && n.status !== 'active');
  if (tasks.length === 0) return null;
  return {
    id: nid(),
    text: `Look at your map. Which one feels most doable RIGHT NOW?`,
    hint: 'The one you can start in under 60 seconds.',
    type: 'choice',
    options: tasks.map((t) => ({ value: t.id, label: t.text })),
    action: 'pick-task',
    phase: 'execute',
  };
}

// --- Phase: execute a task ------------------------------------------------

function getExecutePrompt(state) {
  const active = state.nodes.find((n) => n.type === 'task' && n.status === 'active');
  if (!active) return null;
  return {
    id: nid(),
    text: `Ready? Do it. Tap done the second it's done.`,
    hint: 'You can spend literally 60 seconds. The hard part is starting.',
    type: 'confirm',
    options: [
      { value: 'done',  label: '✓ Done' },
      { value: 'stuck', label: '😵 Stuck' },
      { value: 'skip',  label: '→ Skip' },
    ],
    referencingNodeId: active.id,
    action: 'execute',
    targetId: active.id,
    phase: 'execute',
  };
}

// --- Phase: loop (next task or wrap) --------------------------------------

function getLoopPrompt(state) {
  const remaining = state.nodes.filter(
    (n) => n.type === 'task' && n.status !== 'done' && n.status !== 'dismissed' && n.status !== 'active',
  );
  if (remaining.length > 0) {
    return {
      id: nid(),
      text: `Nice. What's the next one?`,
      hint: 'Stack the momentum.',
      type: 'choice',
      options: remaining.map((t) => ({ value: t.id, label: t.text })),
      action: 'pick-task',
      phase: 'execute',
    };
  }
  // Dumps still hanging around?
  const remainingDumps = state.nodes.filter(
    (n) => n.type === 'dump' && n.status !== 'dismissed',
  );
  if (remainingDumps.length > 0) {
    return {
      id: nid(),
      text: `Today's focus is mapped out. Want to pull another thing off your dump pile?`,
      hint: 'Or wrap up — you did real work.',
      type: 'choice-with-other',
      options: remainingDumps.map((d) => ({ value: d.id, label: d.text })),
      otherLabel: '✓ Wrap up for now',
      otherValue: '__wrap',
      action: 'pick-new-focus',
      phase: 'loop',
    };
  }
  return {
    id: nid(),
    text: `You worked through it. That's it. Take a breath.`,
    hint: 'Tap anything to keep going, or close the app — both are wins.',
    type: 'choice',
    options: [
      { value: 'more', label: 'Add more to the map' },
      { value: 'wrap', label: '✓ Done for now' },
    ],
    action: 'wrap',
    phase: 'wrap',
  };
}

// --- Master dispatcher ----------------------------------------------------

function getNextPrompt(state) {
  // Phase 1 — collecting dump (until user moves on or hits 3+)
  if (!state.rootId && !state.flags?.dumpDone) {
    return getDumpPrompt(state);
  }
  // Phase 2 — pick today's focus from dump
  if (!state.rootId) {
    return getPickPrompt(state);
  }
  // Phase 3 — expand into themes
  const themes = state.nodes.filter((n) => n.type === 'theme' && n.parentId === state.rootId);
  if (themes.length < 3 && !state.flags?.expandDone) {
    return getExpandPrompt(state);
  }
  // Phase 4 — drill each theme for a first task
  const drill = getDrillPrompt(state);
  if (drill) return drill;
  // Phase 5 — pick which task first
  if (!state.flags?.firstTaskPicked) {
    const pick = getPickTaskPrompt(state);
    if (pick) return pick;
  }
  // Phase 6 — execute active task
  const exec = getExecutePrompt(state);
  if (exec) return exec;
  // Phase 7 — loop
  return getLoopPrompt(state);
}

// --- Handle the user's response ------------------------------------------

function handleAnswer(prompt, response, state) {
  const out = { addNodes: [], updateNodes: [], setFlags: null, setRootId: null };

  switch (prompt.action) {
    case 'add-dump': {
      if (!response || !response.trim()) return out;
      out.addNodes.push({
        type: 'dump',
        text: response.trim(),
        parentId: null,
        status: 'pending',
      });
      break;
    }
    case 'pick-today': {
      // Promote a dump node to goal — OR if user typed a new one, make a new goal
      if (response.startsWith('__other:')) {
        const text = response.slice('__other:'.length);
        // Create a new goal node directly (no parent)
        const newId = '__new_goal__'; // placeholder; Workspace will assign real id
        out.addNodes.push({
          type: 'goal',
          text,
          parentId: null,
          status: 'pending',
          _setAsRoot: true,
        });
      } else {
        // Promote the existing dump
        out.updateNodes.push({
          id: response,
          patch: { type: 'goal', status: 'pending' },
        });
        out.setRootId = response;
      }
      break;
    }
    case 'add-theme': {
      if (!response || !response.trim()) return out;
      out.addNodes.push({
        type: 'theme',
        text: response.trim(),
        parentId: prompt.parentId,
        status: 'pending',
      });
      break;
    }
    case 'add-task': {
      if (!response || !response.trim()) return out;
      out.addNodes.push({
        type: 'task',
        text: response.trim(),
        parentId: prompt.parentId,
        status: 'pending',
      });
      break;
    }
    case 'pick-task': {
      out.updateNodes.push({ id: response, patch: { status: 'active' } });
      const prev = state.nodes.find(
        (n) => n.type === 'task' && n.status === 'active' && n.id !== response,
      );
      if (prev) out.updateNodes.push({ id: prev.id, patch: { status: 'pending' } });
      out.setFlags = { firstTaskPicked: true };
      break;
    }
    case 'execute': {
      if (response === 'done') {
        out.updateNodes.push({ id: prompt.targetId, patch: { status: 'done' } });
      } else if (response === 'skip') {
        out.updateNodes.push({ id: prompt.targetId, patch: { status: 'dismissed' } });
      } else if (response === 'stuck') {
        out.addNodes.push({
          type: 'task',
          text: 'Smaller version: just look at it for 30 seconds.',
          parentId: prompt.targetId,
          status: 'active',
        });
        out.updateNodes.push({ id: prompt.targetId, patch: { status: 'pending' } });
      }
      break;
    }
    case 'pick-new-focus': {
      if (response === '__wrap') {
        out.setFlags = { wrapped: true };
      } else {
        // Promote this dump to be the new goal
        out.updateNodes.push({
          id: response,
          patch: { type: 'goal', status: 'pending' },
        });
        out.setRootId = response;
        out.setFlags = { expandDone: false, firstTaskPicked: false };
      }
      break;
    }
    case 'wrap': {
      if (response === 'more') {
        out.setFlags = { expandDone: false };
      } else {
        out.setFlags = { wrapped: true };
      }
      break;
    }
    default: break;
  }
  return out;
}

// Acknowledge skip on open-or-skip prompts.
function handleSkip(prompt, _state) {
  const out = { setFlags: null };
  if (prompt.action === 'add-dump') out.setFlags = { dumpDone: true };
  if (prompt.action === 'add-theme') out.setFlags = { expandDone: true };
  return out;
}

// --- Proactive AI canvas edits -------------------------------------------
//
// After certain user actions, the AI proactively adds *suggestion* nodes
// to the canvas. These render with a dotted border and lower opacity;
// tapping one promotes it to a real node. This is the stand-in for a real
// Claude tool-use loop (add_node, connect_nodes, etc.).

const THEME_HINTS = {
  learning: ['Set up your study space', 'Identify what you don\'t know yet', 'Schedule the actual study time'],
  creative: ['Find your reference / inspiration', 'Make the first ugly draft', 'Share it with one person'],
  project:  ['Define what "done" looks like', 'List the tools you need', 'Ship the smallest version'],
  physical: ['Set up the space', 'Do the boring prep', 'Clean up afterward'],
  decision: ['List the real options', 'Talk to one person you trust', 'Set a deadline to decide'],
  career:   ['Tailor it to the role', 'Get a second pair of eyes', 'Hit send before you over-edit'],
  planning: ['Confirm with the people involved', 'Block calendar time', 'Identify what could go wrong'],
  default:  ['Break it into smaller pieces', 'Identify what\'s blocking you', 'Pick a stopping point'],
};

const TASK_HINTS = [
  'Set a 5-minute timer',
  'Open the tool and stare at it',
  'Write the worst possible version',
  'Tell someone you\'re doing it (accountability)',
  'Move one physical object related to this',
];

function inferThemesForGoal(goalText, classification) {
  const type = (classification && classification.type) || 'default';
  const pool = THEME_HINTS[type] || THEME_HINTS.default;
  // Pick 2 suggestions
  return pool.slice(0, 2).map((text) => ({
    type: 'theme',
    text,
    status: 'pending',
    _suggested: true,
  }));
}

function inferTaskForTheme(themeText) {
  // Very simple — pick a task hint and return one suggestion
  const text = TASK_HINTS[Math.floor(Math.random() * TASK_HINTS.length)];
  return [{
    type: 'task',
    text,
    status: 'pending',
    _suggested: true,
  }];
}

// Called after handleAnswer applied its base result; returns extra nodes
// the AI wants to add to the canvas proactively.
function getProactiveAdditions(prompt, _response, classification) {
  if (prompt.action === 'pick-today') {
    // After user picks today's focus → suggest two probable themes
    return inferThemesForGoal('', classification).map((p) => ({
      ...p,
      _attachToRoot: true, // workspace will fill parentId once root is set
    }));
  }
  if (prompt.action === 'add-theme' && prompt.parentId) {
    return inferTaskForTheme('').map((p) => ({
      ...p,
      parentId: prompt.parentId,
    }));
  }
  return [];
}

// When user claims a suggestion: just flip its _suggested off.
function claimSuggestion() {
  return { patch: { _suggested: false } };
}

const coach = {
  classify,
  greeting,
  getNextPrompt,
  handleAnswer,
  handleSkip,
  getProactiveAdditions,
  claimSuggestion,
  nid,
};

export default coach;
