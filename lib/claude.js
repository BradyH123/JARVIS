'use strict';

/**
 * Thin wrapper around the Anthropic SDK for the three things this app asks of
 * Claude:
 *
 *   1. understandDemonstration() — look at the frames of a recorded action plus
 *      the user's note, and generalize it into a reusable, named skill.
 *   2. chat() — answer the user conversationally, aware of the whole skill
 *      library, and decide whether a stored skill should be run.
 *   3. planExecution() — given a chosen skill and the CURRENT screen, produce a
 *      concrete, step-by-step plan the user must approve before anything runs.
 *
 * Everything returns plain objects. The renderer never talks to Anthropic
 * directly — only the Electron main process does, so the API key stays out of
 * the browser context.
 */

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
const memory = require('./memory');

// Shared self-awareness preamble. Both surfaces (widget + Assistant tab) are the
// SAME assistant with ONE shared memory vault — this is what stops JARVIS from
// treating his other window as a stranger.
const IDENTITY =
  'You are JARVIS, a single AI assistant living on the user\'s computer. You appear in ' +
  'two windows and BOTH are you: the floating widget (the orb) and the Assistant tab in ' +
  'the workspace. They are one assistant sharing one persistent memory (an Obsidian-style ' +
  'vault). A conversation in one window is remembered in the other — never act as if the ' +
  'other surface is someone else. You are deeply integrated into this Mac — effectively ' +
  'part of it. Your capabilities: instantly open apps, websites and searches; take full ' +
  'control of the mouse and keyboard to carry out multi-step tasks while watching the ' +
  'screen; learn skills by demonstration and run saved workflows; edit your OWN source code ' +
  'to improve yourself; and remember people, facts and past conversations in your memory ' +
  'vault between sessions. Speak about yourself in the first person with confidence about ' +
  'what you can do.\n\n' +
  'STYLE: Your replies are read ALOUD, so be brief and conversational. Default to 1–2 short ' +
  'sentences; never exceed 3 unless the user explicitly asks for detail or a list. Lead with ' +
  'the answer, skip preamble and filler, and don\'t restate the question.';

/** Build the memory section for a system prompt (empty string if no vault). */
function memoryBlock() {
  const ctx = memory.contextForPrompt();
  return ctx ? '\n\n--- YOUR MEMORY ---\n' + ctx + '\n--- END MEMORY ---' : '';
}

function getClient() {
  const apiKey = config.getApiKey();
  if (!apiKey) {
    throw new Error('No API key set. Open Settings (⚙) and paste your Anthropic API key.');
  }
  return new Anthropic({ apiKey });
}

/** Convert a "data:image/png;base64,...." URL into an SDK image block. */
function frameToImageBlock(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl || '');
  if (!match) return null;
  return {
    type: 'image',
    source: { type: 'base64', media_type: match[1], data: match[2] },
  };
}

/** Best-effort extraction of a JSON object from a model text response. */
function extractJson(text) {
  if (!text) return null;
  // Prefer a fenced ```json block, else the first {...} span.
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function textOf(message) {
  return (message.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/**
 * Turn a demonstration into a structured skill.
 * @param {string[]} frames  data-URL screenshots captured during the demo (in order)
 * @param {object}   opts    { name, note }
 */
async function understandDemonstration(frames, opts = {}) {
  const client = getClient();
  const images = (frames || []).map(frameToImageBlock).filter(Boolean).slice(0, 12);

  const instructions =
    'You are the learning core of a screen-watching desktop assistant. The user just ' +
    'performed an action on their computer and captured the frames below (in order). ' +
    'They named it: "' +
    (opts.name || 'untitled action') +
    '". Their note: "' +
    (opts.note || '(none)') +
    '".\n\n' +
    'Study the frames and GENERALIZE the action into a reusable skill — not a pixel-by-pixel ' +
    'replay, but the underlying technique, so it can be re-applied later even if the screen ' +
    'differs slightly.\n\n' +
    'Respond with ONLY a JSON object of this shape:\n' +
    '{\n' +
    '  "description": "one or two sentences: what this accomplishes and how",\n' +
    '  "app_context": "the app or site where this happens, or \\"unknown\\"",\n' +
    '  "steps": ["ordered, human-readable steps of the technique"],\n' +
    '  "trigger_phrases": ["natural ways the user might later ask for this"]\n' +
    '}';

  const content = [{ type: 'text', text: instructions }, ...images];
  if (images.length === 0) {
    content.push({
      type: 'text',
      text: '\n(No frames were captured — infer a reasonable skill from the name and note alone.)',
    });
  }

  const message = await client.messages.create({
    model: config.getModel(),
    max_tokens: 1024,
    messages: [{ role: 'user', content }],
  });

  const parsed = extractJson(textOf(message)) || {};
  return {
    description: parsed.description || opts.note || 'A user-taught action.',
    app_context: parsed.app_context || 'unknown',
    steps: Array.isArray(parsed.steps) ? parsed.steps : [],
    trigger_phrases: Array.isArray(parsed.trigger_phrases) ? parsed.trigger_phrases : [],
  };
}

/**
 * Conversational turn. The assistant knows the whole skill library and may
 * suggest running one.
 * @param {Array}  history        [{ role: 'user'|'assistant', text }]
 * @param {string} skillsContext  output of SkillStore.contextForPrompt()
 */
async function chat(history, skillsContext) {
  const client = getClient();

  const system =
    IDENTITY +
    '\n\nYou are helpful, concise, and safety-conscious: you never claim to have taken an ' +
    'action on the computer — a separate, human-approved execution step does that.\n\n' +
    "Here is the user's current skill library:\n\n" +
    skillsContext +
    '\n\nWhen the user asks for something that matches a skill, say which skill applies ' +
    '(by name) and offer to run it. End such replies with a line of the exact form:\n' +
    'RUN_SKILL: <skill id>\n' +
    'Only include that line when you are proposing to execute a specific stored skill.\n\n' +
    'MEMORY: Use your memory. Call `recall` to look something up before saying you don\'t ' +
    'know. Call `remember` to save durable facts, preferences, or decisions worth keeping ' +
    'for next time (use it whenever the user tells you something about themselves or asks ' +
    'you to remember something).' +
    memoryBlock();

  const tools = [
    {
      name: 'recall',
      description: 'Search your memory vault for past notes/conversations before answering.',
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
    {
      name: 'remember',
      description:
        'Save a durable memory. Use `about_user: true` for a fact/preference about the ' +
        'human (goes to your Profile); otherwise it becomes a titled note in your vault.',
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          about_user: { type: 'boolean' },
        },
        required: ['body'],
      },
    },
  ];

  const messages = (history || []).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.text,
  }));

  // Bounded tool loop so the model can recall/remember, then answer.
  let message;
  for (let hop = 0; hop < 5; hop++) {
    message = await client.messages.create({
      model: config.getModel(),
      max_tokens: 1024,
      system,
      tools,
      messages,
    });
    const toolUses = (message.content || []).filter((b) => b.type === 'tool_use');
    if (message.stop_reason !== 'tool_use' || !toolUses.length) break;

    messages.push({ role: 'assistant', content: message.content });
    const results = [];
    for (const tu of toolUses) {
      let out = 'ok';
      try {
        if (tu.name === 'recall') {
          const hits = memory.search(tu.input.query || '');
          out = hits.length
            ? hits.map((h) => `• ${h.path}: ${h.excerpt}`).join('\n')
            : 'Nothing in memory matched that.';
        } else if (tu.name === 'remember') {
          if (tu.input.about_user) {
            memory.rememberAboutUser(tu.input.body);
            out = 'Saved to your Profile.';
          } else {
            const rel = memory.remember({ title: tu.input.title, body: tu.input.body });
            out = 'Saved memory note: ' + rel;
          }
        }
      } catch (err) {
        out = 'Memory error: ' + err.message;
      }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: [{ type: 'text', text: out }] });
    }
    messages.push({ role: 'user', content: results });
  }

  const reply = textOf(message);
  const runMatch = /RUN_SKILL:\s*([^\s]+)/.exec(reply);
  return {
    reply: reply.replace(/RUN_SKILL:\s*[^\s]+\s*$/, '').trim(),
    proposed_skill_id: runMatch ? runMatch[1] : null,
  };
}

/**
 * Produce a concrete execution plan for a skill against the current screen.
 * This does NOT execute anything — it returns a plan for the user to approve.
 * @param {object} skill        full skill record (with steps)
 * @param {string} screenshot   data-URL of the current screen (optional)
 */
async function planExecution(skill, screenshot) {
  const client = getClient();
  const image = frameToImageBlock(screenshot);

  const instructions =
    'You are the planning core of a desktop assistant. Produce a concrete, ordered plan ' +
    'to perform the following learned skill on the user\'s computer RIGHT NOW. A human will ' +
    'review this plan before anything runs, so be explicit and flag anything risky ' +
    '(sending messages, deleting, spending money, irreversible changes).\n\n' +
    'Skill: ' + skill.name + '\n' +
    'Description: ' + (skill.description || '') + '\n' +
    'Known steps:\n' + (skill.steps || []).map((s, i) => `  ${i + 1}. ${s}`).join('\n') +
    '\n\nRespond with ONLY JSON:\n' +
    '{\n' +
    '  "plan": ["concrete actions to take now, in order"],\n' +
    '  "risk_level": "low" | "medium" | "high",\n' +
    '  "risks": ["anything the user should know before approving"],\n' +
    '  "needs_clarification": ["questions if the current screen is not where this can start"]\n' +
    '}';

  const content = [{ type: 'text', text: instructions }];
  if (image) {
    content.push({ type: 'text', text: '\nThe current screen:' });
    content.push(image);
  }

  const message = await client.messages.create({
    model: config.getModel(),
    max_tokens: 1024,
    messages: [{ role: 'user', content }],
  });

  const parsed = extractJson(textOf(message)) || {};
  return {
    plan: Array.isArray(parsed.plan) ? parsed.plan : [],
    risk_level: parsed.risk_level || 'medium',
    risks: Array.isArray(parsed.risks) ? parsed.risks : [],
    needs_clarification: Array.isArray(parsed.needs_clarification) ? parsed.needs_clarification : [],
  };
}

/**
 * Route a spoken/typed command to an action using tool-calling — the same
 * "voice → intent → function call → execute" pattern behind realtime voice
 * agents, but grounded in the user's own learned skills and running on Claude.
 *
 * @param {string} transcript     what the user said/typed
 * @param {string} skillsContext  output of SkillStore.contextForPrompt()
 * @returns {Promise<{action:'skill'|'goal'|'reply', skill_id?, goal?, message?}>}
 */
async function routeCommand(transcript, skillsContext, workflowsContext) {
  const client = getClient();

  const tools = [
    {
      name: 'run_skill',
      description: 'Run a specific skill the user has already taught. Use when the command clearly matches one.',
      input_schema: {
        type: 'object',
        properties: { skill_id: { type: 'string' }, why: { type: 'string' } },
        required: ['skill_id'],
      },
    },
    {
      name: 'run_workflow',
      description:
        'Run a saved multi-step workflow (a named composition of skills/goals). Use when the ' +
        'command matches a workflow name or trigger phrase.',
      input_schema: {
        type: 'object',
        properties: { workflow_id: { type: 'string' } },
        required: ['workflow_id'],
      },
    },
    {
      name: 'quick_action',
      description:
        'INSTANT shortcut for the most common tasks — ALWAYS prefer this over run_goal when it ' +
        'fits, because it runs immediately with no screenshots. Kinds:\n' +
        '- open_app (target=app name, e.g. "Safari") — "open/launch X"\n' +
        '- open_url (target=URL/domain, e.g. "google.com") — "open/go to <site>"\n' +
        '- web_search (target=query) — ONLY a pure information lookup where the user just wants ' +
        'search results shown ("search the web for pizza recipes"). NOT for tasks that need ' +
        'going INTO a site and doing something — those are run_goal.\n' +
        '- quit_app (target=app name, e.g. "Google Chrome") — "close/quit my browser", "quit X"\n' +
        '- close_tabs (target=browser name or empty for the frontmost browser) — "close all my tabs"\n' +
        'e.g. "close my browser" → quit_app Google Chrome; "close all my tabs" → close_tabs (empty).',
      input_schema: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['open_app', 'open_url', 'web_search', 'quit_app', 'close_tabs'],
          },
          target: { type: 'string', description: 'Empty string is allowed for close_tabs.' },
        },
        required: ['kind'],
      },
    },
    {
      name: 'run_goal',
      description:
        'Autonomously carry out a task by navigating and acting — looking at the screen and ' +
        'clicking/typing across steps. Use this (NOT web_search/open_url) whenever the user ' +
        'wants to DO something on a website or app: "go to amazon and add X to my cart", ' +
        '"on YouTube play Y", "log into Z", "fill out this form", "find X on <site> and click ' +
        'it". Opening a page is not enough — this drives the site to actually complete the task.',
      input_schema: {
        type: 'object',
        properties: { goal: { type: 'string' } },
        required: ['goal'],
      },
    },
    {
      name: 'look_at_screen',
      description:
        "Read what the user is looking at and ANSWER or summarize it — replies with text " +
        '(does not click/type). For a browser tab it pulls the actual page code + interface ' +
        'map; otherwise it reads the screen. Use for: "summarize this tab/page/website/' +
        'article", "what does this say", "read this", "pull the code of this page", "map this ' +
        'interface", "what am I looking at". Prefer this over run_goal whenever the user wants ' +
        'information ABOUT the screen/page rather than an action.',
      input_schema: {
        type: 'object',
        properties: { question: { type: 'string', description: "The user's question or 'summarize this'." } },
        required: ['question'],
      },
    },
    {
      name: 'complex_task',
      description:
        'A MULTI-STEP request that needs planning and several actions in sequence — e.g. ' +
        '"research X and save it to a doc", "find my resume, open it, and draft a cover ' +
        'letter", "download the data from this site and put it in a spreadsheet". Use whenever ' +
        'the request is more than one simple action.',
      input_schema: {
        type: 'object',
        properties: { goal: { type: 'string' } },
        required: ['goal'],
      },
    },
    {
      name: 'run_command',
      description:
        'Run a real shell/terminal command on the computer and return its output. Use for ' +
        'anything the user would do in Terminal: installing software (brew/npm/pip), running ' +
        'scripts, git operations, file management (ls/mv/cp/mkdir), reading files, launching ' +
        'CLIs. Prefer this when the task is naturally a command line action. Provide the exact ' +
        'command. Destructive commands will ask the user for confirmation first.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The exact shell command to run.' },
          why: { type: 'string', description: 'Brief reason, shown to the user.' },
        },
        required: ['command'],
      },
    },
    {
      name: 'self_improve',
      description:
        "Modify the assistant's OWN source code — to add a feature, fix a bug, or change " +
        'its behaviour or appearance. Use ONLY when the user asks the assistant to improve, ' +
        'edit, upgrade, or change ITSELF (e.g. "make your orb bigger", "add a dark theme to ' +
        'yourself", "fix the way you handle X"). Not for tasks on other apps.',
      input_schema: {
        type: 'object',
        properties: { request: { type: 'string', description: 'The self-change to make, in full.' } },
        required: ['request'],
      },
    },
    {
      name: 'schedule_task',
      description:
        'Schedule a command to run LATER or on a REPEATING schedule — "in 30 minutes, check ' +
        'my email", "at 9pm open YouTube", "every day at 9am open my calendar", "every Monday ' +
        'at 8:00 research tech news", "every 15 minutes check X". The command is what JARVIS ' +
        'should do when it fires (phrased as a normal command). Times are the user\'s local ' +
        'time in 24h HH:MM. weekday: 0=Sunday…6=Saturday.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'What to do when the schedule fires, as a plain command.' },
          when_kind: { type: 'string', enum: ['once_in', 'once_at', 'every', 'daily', 'weekly'] },
          minutes: { type: 'number', description: 'For once_in / every: the number of minutes.' },
          time: { type: 'string', description: 'For once_at / daily / weekly: local time as HH:MM (24h).' },
          weekday: { type: 'number', description: 'For weekly: 0=Sunday … 6=Saturday.' },
        },
        required: ['command', 'when_kind'],
      },
    },
    {
      name: 'ongoing_task',
      description:
        'Start OPEN-ENDED continuous work that has NO finite ending — e.g. "do research on ' +
        'cats", "keep researching X", "keep an eye on Y", "keep improving Z". It runs cycle ' +
        'after cycle in a hidden background browser, saves findings to memory, shows as an ' +
        'ONGOING task, and NEVER stops until the user says stop. If the user gave an explicit ' +
        'duration ("for 10 minutes"), pass minutes. IMPORTANT: if the request is clearly ' +
        'time-boxed/finite but the durations are NOT specified (e.g. "research X for a bit ' +
        'then write me a report"), do NOT start it — use reply to ask a clarifying question ' +
        '(how long to research, how long on the write-up) first.',
      input_schema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'The open-ended goal to keep working on.' },
          minutes: { type: 'number', description: 'Optional time budget in minutes, ONLY if the user explicitly gave one.' },
        },
        required: ['goal'],
      },
    },
    {
      name: 'background_task',
      description:
        'Do a task on the WEB in a hidden, off-screen browser so the user can keep working ' +
        'at the same time — JARVIS never touches their real mouse/screen. Use whenever the ' +
        'user says to do something "in the background", "quietly", "without taking over my ' +
        'screen", "while I keep working/using my computer", "behind the scenes", or otherwise ' +
        'wants a web task done WITHOUT interrupting them. The task must be doable in a browser ' +
        '(navigate, search, read, fill forms, click) — not native macOS apps.',
      input_schema: {
        type: 'object',
        properties: { goal: { type: 'string', description: 'The full web task to carry out in the background.' } },
        required: ['goal'],
      },
    },
    {
      name: 'organize_windows',
      description:
        'Tidy the screen: tile every open window into a non-overlapping grid so all ' +
        'windows and tabs are fully visible at once (and JARVIS can see them). Use for ' +
        '"organize/arrange/tile my windows", "line up my windows", "clean up my screen", ' +
        '"fix my window layout", "I can\'t see all my tabs".',
      input_schema: { type: 'object', properties: {} },
    },
    {
      name: 'set_autonomy',
      description:
        'Turn the assistant\'s autonomous "Full Control" mode ON or OFF. In Full Control it ' +
        'carries out tasks without pausing for per-action approval (the STOP kill switch still ' +
        'works). Use when the user says things like "act autonomously", "you have full control", ' +
        '"stop asking me for permission" (enabled=true) or "ask before acting", "require ' +
        'approval", "be careful" (enabled=false).',
      input_schema: {
        type: 'object',
        properties: { enabled: { type: 'boolean' } },
        required: ['enabled'],
      },
    },
    {
      name: 'reply',
      description: 'Just answer or ask a clarifying question — no computer action.',
      input_schema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
    },
  ];

  const system =
    IDENTITY +
    '\n\nYou are also the intent router for your own voice/text commands. Given the user ' +
    'command, your skill library, and your workflows, call exactly ONE tool: set_autonomy if ' +
    'they ask to change how much you ask permission, self_improve if they ask you to change ' +
    'YOURSELF (your own code/behaviour/looks), look_at_screen if they want you to read/' +
    'summarize/answer about what is ON their screen, quick_action for the common instant tasks ' +
    '(open an app, open a website, web search, quit/close an app or browser, close browser ' +
    'tabs), run_command for anything that is naturally a ' +
    'terminal command (install software, run a script, git, file operations), run_workflow if ' +
    'it matches a saved workflow. IMPORTANT: if the user wants to DO something ON a website ' +
    '(navigate into it, search it, click, buy, log in, play, fill a form) use run_goal — NOT ' +
    'web_search or open_url, which only open a page and stop. If the user wants a WEB task ' +
    'done "in the background"/"quietly"/"while I keep working"/"without taking over my ' +
    'screen", use background_task (a hidden off-screen browser) instead of run_goal. If the ' +
    'work is OPEN-ENDED with no natural finish ("do research on cats", "keep researching/' +
    'watching/improving X"), use ongoing_task — it keeps working until the user says stop. ' +
    'If a request is time-boxed but the durations are unspecified, reply with a short ' +
    'clarifying question instead of guessing. ' +
    'Continue: run_workflow if ' +
    'it matches a saved workflow, run_skill if it matches a taught skill, run_goal for a ' +
    'concrete single GUI task, complex_task if it needs SEVERAL steps in sequence, or reply ' +
    'otherwise (use reply for questions, chit-chat, or ' +
    'anything about your memory/past ' +
    'conversations — answer from YOUR MEMORY below). ALWAYS prefer quick_action over run_goal ' +
    'for opening apps/sites and searches — it is far faster. Prefer taught knowledge ' +
    '(workflow > skill) over run_goal.\n\n' +
    'Skill library:\n' +
    skillsContext +
    '\n\nWorkflows:\n' +
    (workflowsContext || 'No workflows defined yet.') +
    memoryBlock();

  const message = await client.messages.create({
    // Fast tier for intent routing (Quality Blueprint §3.4 — model tiering).
    model: config.getRouterModel(),
    max_tokens: 512,
    system,
    tools,
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: transcript }],
  });

  const call = (message.content || []).find((b) => b.type === 'tool_use');
  if (!call) return { action: 'reply', message: textOf(message) || "Sorry, I didn't catch that." };

  if (call.name === 'run_skill') return { action: 'skill', skill_id: call.input.skill_id };
  if (call.name === 'run_workflow') return { action: 'workflow', workflow_id: call.input.workflow_id };
  if (call.name === 'quick_action')
    return { action: 'quick_action', kind: call.input.kind, target: call.input.target };
  if (call.name === 'run_goal') return { action: 'goal', goal: call.input.goal };
  if (call.name === 'run_command')
    return { action: 'run_command', command: call.input.command, why: call.input.why || '' };
  if (call.name === 'complex_task') return { action: 'complex_task', goal: call.input.goal };
  if (call.name === 'look_at_screen') return { action: 'look_at_screen', question: call.input.question };
  if (call.name === 'self_improve') return { action: 'self_improve', request: call.input.request };
  if (call.name === 'schedule_task')
    return {
      action: 'schedule_task',
      command: call.input.command,
      when: { kind: call.input.when_kind, minutes: call.input.minutes, time: call.input.time, weekday: call.input.weekday },
    };
  if (call.name === 'ongoing_task')
    return { action: 'ongoing_task', goal: call.input.goal, minutes: call.input.minutes };
  if (call.name === 'background_task') return { action: 'background_task', goal: call.input.goal };
  if (call.name === 'organize_windows') return { action: 'organize_windows' };
  if (call.name === 'set_autonomy') return { action: 'set_autonomy', enabled: Boolean(call.input.enabled) };
  return { action: 'reply', message: call.input.message || '' };
}

/**
 * Look at a screenshot of the user's screen and answer a question about it —
 * "summarize this tab", "what does this say", "what am I looking at". This is a
 * one-shot vision READ (it returns text), distinct from the computer-use loop
 * which takes ACTIONS. That's why summaries never appeared before: the action
 * loop had nothing to click and just stopped without answering.
 *
 * @param {string} question         the user's question about the screen
 * @param {string} screenshotDataUrl data-URL of the current screen
 */
async function describeScreen(question, screenshotDataUrl) {
  const client = getClient();
  const image = frameToImageBlock(screenshotDataUrl);

  const system =
    IDENTITY +
    "\n\nYou are looking at a screenshot of the user's screen right now. Answer their " +
    'question about what is visible. If they ask you to summarize a page, article, tab, or ' +
    'document, read the visible text and give a clear, useful summary of the key points. Be ' +
    'specific and concise. If the relevant content is cut off or not visible, say what you ' +
    'can see and note that you may need them to scroll or focus the right window.';

  const content = [{ type: 'text', text: question || 'What is on my screen right now?' }];
  if (image) content.push(image);
  else content.push({ type: 'text', text: '(No screenshot was available.)' });

  const message = await client.messages.create({
    model: config.getModel(),
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content }],
  });
  return textOf(message);
}

/**
 * Watch-and-learn: given a few recent frames of the user working, summarize what
 * they're doing and HOW they use the interface (app, task, key steps, shortcuts).
 * These summaries accumulate as observations so JARVIS learns human UIs over time.
 *
 * @param {string[]} frames  recent screen frames (data URLs), in order
 */
async function observeActivity(frames) {
  const client = getClient();
  const images = (frames || []).map(frameToImageBlock).filter(Boolean).slice(0, 5);
  if (!images.length) return '';

  const instructions =
    'These are recent frames of the user working on their computer (in order). In ONE or TWO ' +
    'sentences, note what app/interface they are using and HOW they are using it — the task, ' +
    'the key UI elements they interact with, and any shortcuts or patterns worth remembering ' +
    'so you could do it yourself later. If nothing meaningful is happening, reply exactly ' +
    '"(idle)".';

  const message = await client.messages.create({
    model: config.getModel(),
    max_tokens: 300,
    messages: [{ role: 'user', content: [{ type: 'text', text: instructions }, ...images] }],
  });
  const text = textOf(message).trim();
  return /^\(idle\)$/i.test(text) ? '' : text;
}

/**
 * Answer a question / summarize using the ACTUAL page content and interface map
 * extracted from the live DOM (lib/webpage.js) — richer and more accurate than a
 * screenshot. `page` = { url, title, text, interface: [{tag,type,label,href,x,y}] }.
 */
async function answerFromPage(question, page) {
  const client = getClient();
  const iface = (page.interface || [])
    .map((e) => `- ${e.tag}${e.type ? '[' + e.type + ']' : ''} "${e.label}"${e.href ? ' → ' + e.href : ''} @(${e.x},${e.y})`)
    .join('\n')
    .slice(0, 6000);

  const pageBlock =
    `URL: ${page.url || ''}\nTitle: ${page.title || ''}\n\n` +
    `PAGE TEXT (from the live DOM):\n${(page.text || '').slice(0, 18000)}\n\n` +
    `INTERFACE MAP (clickable elements, with screen coordinates):\n${iface || '(none found)'}`;

  const system =
    IDENTITY +
    "\n\nYou were handed the REAL content and interface map of the web page the user is on — " +
    'extracted from the live DOM, not a screenshot. Answer their question or summarize the ' +
    'page accurately and concisely from this data. If they ask about the interface or how to ' +
    'do something on the page, use the interface map (element labels + coordinates).';

  const message = await client.messages.create({
    model: config.getModel(),
    max_tokens: 1200,
    system,
    messages: [{ role: 'user', content: `${question}\n\n---\n${pageBlock}` }],
  });
  return textOf(message);
}

/**
 * Plan a complex, multi-step request into an ordered list of steps, each mapped
 * to ONE of JARVIS's capabilities. Powers "do almost anything" — the executor
 * (main.js) runs the steps in order through the existing gated handlers.
 */
async function planTasks(goal) {
  const client = getClient();
  const system =
    IDENTITY +
    '\n\nBreak the user request into the MINIMAL ordered list of concrete steps, each using ' +
    'exactly ONE capability below. Only include steps that are actually needed; end with a ' +
    'reply step that reports the result.\n\n' +
    'Capabilities:\n' +
    '- quick_action { kind: open_app|open_url|web_search|quit_app|close_tabs, target }\n' +
    '- run_command { command }  — a shell/terminal command\n' +
    '- find_file { query }  — locate a file on the computer (filename index)\n' +
    '- search_content { query }  — find files whose CONTENTS mention something\n' +
    '- read_screen { question }  — read/summarize the current screen or web page\n' +
    '- crawl { url, depth }  — deep-crawl a website (url optional = current tab)\n' +
    '- harvest { }  — pull all data from the current page\n' +
    '- click_element { label }  — click a named on-screen button/field/menu\n' +
    '- organize_windows { }  — tile all open windows into a grid so everything is visible\n' +
    '- computer { goal }  — drive mouse/keyboard for any GUI task the above can\'t do\n' +
    '- reply { message }  — say something to the user\n\n' +
    'Respond with ONLY JSON: {"steps":[{"capability":"...","args":{...},"why":"short reason"}]}';
  const message = await client.messages.create({
    model: config.getModel(),
    max_tokens: 1400,
    system,
    messages: [{ role: 'user', content: String(goal || '') }],
  });
  const parsed = extractJson(textOf(message)) || {};
  return Array.isArray(parsed.steps) ? parsed.steps.slice(0, 12) : [];
}

/** Summarize / answer about a file's extracted text content. */
async function answerFromText(question, title, text) {
  const client = getClient();
  const system =
    IDENTITY +
    "\n\nYou were given the text content of one of the user's files. Answer their question or " +
    'summarize it accurately and concisely from this text.';
  const message = await client.messages.create({
    model: config.getModel(),
    max_tokens: 1200,
    system,
    messages: [{ role: 'user', content: `${question}\n\n--- FILE: ${title} ---\n${(text || '').slice(0, 60000)}` }],
  });
  return textOf(message);
}

module.exports = {
  understandDemonstration,
  chat,
  planExecution,
  routeCommand,
  describeScreen,
  observeActivity,
  answerFromPage,
  answerFromText,
  planTasks,
};
