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
  'other surface is someone else. You can watch the screen, act on the computer, edit your ' +
  'own code, and remember things between sessions via your memory vault.';

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
      name: 'run_goal',
      description:
        'Autonomously carry out a one-off goal on the computer when no stored skill fits but the ' +
        'intent is a concrete task to perform.',
      input_schema: {
        type: 'object',
        properties: { goal: { type: 'string' } },
        required: ['goal'],
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
    'YOURSELF (your own code/behaviour/looks), run_workflow if it matches a saved workflow, ' +
    'run_skill if it matches a taught skill, run_goal for a concrete one-off computer task, or ' +
    'reply otherwise (use reply for questions, chit-chat, or anything about your memory/past ' +
    'conversations — answer from YOUR MEMORY below). Prefer taught knowledge (workflow > ' +
    'skill) over run_goal.\n\n' +
    'Skill library:\n' +
    skillsContext +
    '\n\nWorkflows:\n' +
    (workflowsContext || 'No workflows defined yet.') +
    memoryBlock();

  const message = await client.messages.create({
    model: config.getModel(),
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
  if (call.name === 'run_goal') return { action: 'goal', goal: call.input.goal };
  if (call.name === 'self_improve') return { action: 'self_improve', request: call.input.request };
  if (call.name === 'set_autonomy') return { action: 'set_autonomy', enabled: Boolean(call.input.enabled) };
  return { action: 'reply', message: call.input.message || '' };
}

module.exports = { understandDemonstration, chat, planExecution, routeCommand };
