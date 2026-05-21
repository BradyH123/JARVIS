// coach.js
//
// Drives the user with prompts. Each call to getNextPrompt inspects the
// current canvas state and decides what to ask next — what to add, what
// to highlight, what phase we're in. Easy to replace with a Claude call.

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

// --- Prompt-driven coach ---
//
// A prompt has:
//   id, text, hint, type ('open'|'choice'|'confirm'),
//   options? (for choice), referencingNodeId, action, parentId
//
// When the user answers, the App calls handleAnswer(prompt, response, state)
// which returns { addNodes, updateNodeIds, markDoneIds, transientHighlight }.
// Then getNextPrompt(state) returns the next prompt.

function getNextPrompt(state) {
  const { nodes, rootId } = state;
  const root = nodes.find((n) => n.id === rootId);
  const themes = nodes.filter((n) => n.type === 'theme');
  const tasks  = nodes.filter((n) => n.type === 'task');

  // Phase 1 — get up to 4 themes off the root
  if (themes.length < 4) {
    if (themes.length === 0) {
      return {
        id: nid(),
        text: `Looking at "${root.text}" — what's the first big piece this is made of?`,
        hint: 'One short phrase. Don\'t overthink.',
        type: 'open',
        referencingNodeId: root.id,
        action: 'add-theme',
        parentId: root.id,
      };
    }
    if (themes.length === 1) {
      return {
        id: nid(),
        text: `Good. What else does this involve?`,
        hint: 'Another piece. Another angle. Anything that comes to mind.',
        type: 'open',
        referencingNodeId: root.id,
        action: 'add-theme',
        parentId: root.id,
      };
    }
    if (themes.length === 2) {
      return {
        id: nid(),
        text: `One more — what's the part you keep avoiding?`,
        hint: 'The annoying one. The boring one. Name it.',
        type: 'open',
        referencingNodeId: root.id,
        action: 'add-theme',
        parentId: root.id,
      };
    }
    // 3 themes → offer an optional 4th
    return {
      id: nid(),
      text: `Anything else? Tap skip if your map feels complete.`,
      hint: 'Often the 4th piece is the one you forgot.',
      type: 'open-or-skip',
      referencingNodeId: root.id,
      action: 'add-theme',
      parentId: root.id,
    };
  }

  // Phase 2 — drill into each theme by getting one task per theme
  const themeWithoutTask = themes.find(
    (t) => !tasks.some((task) => task.parentId === t.id),
  );
  if (themeWithoutTask) {
    return {
      id: nid(),
      text: `Zoom in here. What's the very first action you'd take on this?`,
      hint: 'A real, physical action. Where would your hands go?',
      type: 'open',
      referencingNodeId: themeWithoutTask.id,
      action: 'add-task',
      parentId: themeWithoutTask.id,
    };
  }

  // Phase 3 — pick which task to do FIRST
  const pendingTasks = tasks.filter((t) => t.status !== 'done');
  if (pendingTasks.length > 0 && !state.flags?.firstTaskPicked) {
    return {
      id: nid(),
      text: `Look at your map. Which one feels most doable right now?`,
      hint: 'No wrong answer. Pick the one you can start in under 2 minutes.',
      type: 'choice',
      options: pendingTasks.map((t) => ({ value: t.id, label: t.text })),
      referencingNodeId: null,
      action: 'pick-first-task',
    };
  }

  // Phase 4 — execute (the picked task)
  const activeTask = nodes.find(
    (n) => n.type === 'task' && n.status === 'active',
  );
  if (activeTask) {
    return {
      id: nid(),
      text: `Ready? Set a timer if it helps. Tap done the moment it's done.`,
      hint: 'You can spend literally 60 seconds. The hard part is starting.',
      type: 'confirm',
      options: [
        { value: 'done', label: '✓ Done' },
        { value: 'stuck', label: '😵 Stuck' },
        { value: 'skip', label: '→ Skip' },
      ],
      referencingNodeId: activeTask.id,
      action: 'execute',
      targetId: activeTask.id,
    };
  }

  // Phase 5 — loop back: any tasks left?
  const moreTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'dismissed');
  if (moreTasks.length > 0) {
    return {
      id: nid(),
      text: `Nice. What's the next one you want to do?`,
      hint: 'Stack the momentum.',
      type: 'choice',
      options: moreTasks.map((t) => ({ value: t.id, label: t.text })),
      referencingNodeId: null,
      action: 'pick-next-task',
    };
  }

  // Phase 6 — all done OR drill deeper
  return {
    id: nid(),
    text: `You worked through your whole map. Want to add more?`,
    hint: 'Or call it a day — that was real progress.',
    type: 'choice',
    options: [
      { value: 'more-themes', label: '+ More pieces' },
      { value: 'wrap', label: '✓ Wrap up' },
    ],
    referencingNodeId: null,
    action: 'wrap-or-continue',
  };
}

// Compute what to do when the user answers `prompt` with `response`.
function handleAnswer(prompt, response, state) {
  const out = { addNodes: [], updateNodes: [], removeHighlights: true };

  switch (prompt.action) {
    case 'add-theme': {
      if (!response || !response.trim()) return out;
      out.addNodes.push({
        type: 'theme',
        text: response.trim(),
        parentId: prompt.parentId,
        status: 'pending',
        bornAt: Date.now(),
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
        bornAt: Date.now(),
      });
      break;
    }
    case 'pick-first-task':
    case 'pick-next-task': {
      // response is the node id
      out.updateNodes.push({ id: response, patch: { status: 'active' } });
      // Demote any previously-active task
      const prevActive = state.nodes.find(
        (n) => n.type === 'task' && n.status === 'active' && n.id !== response,
      );
      if (prevActive) {
        out.updateNodes.push({ id: prevActive.id, patch: { status: 'pending' } });
      }
      out.setFlags = { firstTaskPicked: true };
      break;
    }
    case 'execute': {
      if (response === 'done') {
        out.updateNodes.push({ id: prompt.targetId, patch: { status: 'done' } });
      } else if (response === 'skip') {
        out.updateNodes.push({ id: prompt.targetId, patch: { status: 'dismissed' } });
      } else if (response === 'stuck') {
        // Spawn a smaller sub-task
        out.addNodes.push({
          type: 'task',
          text: 'Smaller version: just look at it for 30 seconds.',
          parentId: prompt.targetId,
          status: 'active',
          bornAt: Date.now(),
        });
        out.updateNodes.push({ id: prompt.targetId, patch: { status: 'pending' } });
      }
      break;
    }
    case 'wrap-or-continue': {
      if (response === 'wrap') out.setFlags = { wrappedUp: true };
      break;
    }
    default:
      break;
  }
  return out;
}

const coach = {
  classify,
  triageDump,
  actionableNextStep,
  greeting,
  getNextPrompt,
  handleAnswer,
  nid,
};

export default coach;
