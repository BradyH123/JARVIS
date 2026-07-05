'use strict';

/**
 * Autonomous execution loop — the "brain" that actually controls the computer.
 *
 * This runs Claude's computer-use tool in a perceive → decide → act cycle:
 *   1. send the goal + current screenshot to Claude
 *   2. Claude replies with tool_use actions (click, type, key, scroll, …)
 *   3. we execute each action on the real machine (lib/executor.js)
 *   4. we send back a fresh screenshot as the tool_result
 *   5. repeat until Claude stops requesting actions, or a guard trips
 *
 * Guards (this drives a real mouse/keyboard, so they matter):
 *   - maxSteps cap
 *   - a shouldAbort() kill switch checked every turn (STOP button / Esc)
 *   - all coordinates are scaled between Claude's downscaled view and real pixels
 *
 * The caller injects `capture()` (Electron screenshot → {dataUrl,width,height})
 * and `execute(action)` (nut.js). This module stays free of Electron/native deps.
 */

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');

// Heuristic backstop: clearly destructive/quit shortcuts force a confirmation
// even if the model forgot to ask. Kept small to avoid nagging.
const RISKY_KEY_COMBOS = ['cmd+q', 'ctrl+q', 'cmd+w', 'ctrl+w', 'cmd+shift+q'];

function looksRisky(action) {
  if (!action) return false;
  if (action.action === 'key') {
    const spec = String(action.text || '').toLowerCase().replace(/\s/g, '');
    return RISKY_KEY_COMBOS.includes(spec);
  }
  return false;
}

// Custom tool the model must call before irreversible/outbound actions.
const PERMISSION_TOOL = {
  name: 'ask_permission',
  description:
    'Ask the human operator to approve a risky action BEFORE performing it. You MUST ' +
    'call this first for anything destructive, irreversible, or outbound: deleting, ' +
    'overwriting, sending a message/email, posting, purchasing/paying, submitting a ' +
    'form with real consequences, or quitting an app with unsaved work. Only proceed ' +
    'with the action if this returns APPROVED.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Plainly, what you are about to do and why.' },
      risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    },
    required: ['summary'],
  },
};

function getClient() {
  const apiKey = config.getApiKey();
  if (!apiKey) throw new Error('No API key set. Open Settings and paste your Anthropic API key.');
  return new Anthropic({ apiKey });
}

function dataUrlToImageBlock(dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl || '');
  if (!m) return null;
  return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
}

/**
 * Run an autonomous session.
 *
 * @param {object}   opts
 * @param {string}   opts.goal        natural-language objective
 * @param {object}   [opts.skill]     optional learned skill for extra context
 * @param {Function} opts.capture     async () => { dataUrl, width, height } (real px)
 * @param {Function} opts.execute     async (action) => { ok, text?, error? }
 * @param {Function} [opts.onEvent]   (evt) => void  progress stream
 * @param {Function} [opts.shouldAbort] () => boolean  kill switch
 * @returns {Promise<{status:string, steps:number, message?:string}>}
 */
async function runSession(opts) {
  const { goal, skill, capture, execute } = opts;
  const onEvent = opts.onEvent || (() => {});
  const shouldAbort = opts.shouldAbort || (() => false);
  // Human confirmation gate. Defaults to DENY when no handler is wired, so a
  // misconfiguration fails safe rather than auto-approving risky actions.
  const confirm = opts.confirm || (async () => false);
  const client = getClient();

  // Read settings fresh at run start so Settings changes apply without restart.
  const MODEL = config.getComputerUseModel();
  const TOOL_TYPE = config.getComputerToolType();
  const BETA_FLAG = config.getComputerBeta();
  const MAX_STEPS = config.getMaxSteps();
  const TARGET_WIDTH = config.getTargetWidth();
  const CONFIRM_EVERY = config.getConfirmEvery();

  // First screenshot establishes the coordinate scale.
  const first = await capture();
  const realW = first.width;
  const realH = first.height;
  const scale = Math.min(1, TARGET_WIDTH / realW);
  const dispW = Math.round(realW * scale);
  const dispH = Math.round(realH * scale);
  const toReal = (x, y) => [x / scale, y / scale];

  const tools = [
    {
      type: TOOL_TYPE,
      name: 'computer',
      display_width_px: dispW,
      display_height_px: dispH,
      display_number: 1,
    },
    PERMISSION_TOOL,
  ];

  const system =
    'You are an autonomous desktop operator. You control the real computer via the ' +
    'computer tool (mouse, keyboard). Work step by step toward the goal, taking a ' +
    'screenshot to verify the result after meaningful actions. Be careful and precise. ' +
    'Before ANY destructive, irreversible, or outbound action (delete, overwrite, send, ' +
    'post, pay, submit-with-consequences, quit-with-unsaved-work), you MUST call the ' +
    'ask_permission tool first and only continue if it returns APPROVED. When the ' +
    'goal is complete, STOP and briefly state that it is done — do not keep acting.' +
    (skill
      ? '\n\nThe user previously taught this technique; follow it:\n' +
        `Skill: ${skill.name}\n${skill.description || ''}\n` +
        (skill.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n')
      : '');

  const firstImg = dataUrlToImageBlock(first.dataUrl);
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: `Goal: ${goal}\n\nHere is the current screen. Begin.` },
        ...(firstImg ? [firstImg] : []),
      ],
    },
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    if (shouldAbort()) {
      onEvent({ type: 'aborted', step });
      return { status: 'aborted', steps: step };
    }

    let response;
    try {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 1400,
        system,
        tools,
        betas: [BETA_FLAG],
        messages,
      });
    } catch (err) {
      let message = err.message || String(err);
      // Turn an opaque tool/model rejection into an actionable hint.
      if (/tool|beta|model|not.*support|400|invalid/i.test(message)) {
        message +=
          `  (Computer-use may not be enabled for model "${MODEL}" with tool ` +
          `"${TOOL_TYPE}" / beta "${BETA_FLAG}". Set a supported model in Settings.)`;
      }
      onEvent({ type: 'error', message });
      return { status: 'error', steps: step, message };
    }

    messages.push({ role: 'assistant', content: response.content });

    // Surface any narration.
    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        onEvent({ type: 'thinking', text: block.text.trim() });
      }
    }

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
      const finalText = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      onEvent({ type: 'done', message: finalText });
      return { status: 'done', steps: step, message: finalText };
    }

    const toolResults = [];
    for (const tu of toolUses) {
      if (shouldAbort()) {
        onEvent({ type: 'aborted', step });
        return { status: 'aborted', steps: step };
      }

      // The model explicitly asking to proceed with a risky action.
      if (tu.name === 'ask_permission') {
        const inp = tu.input || {};
        onEvent({ type: 'permission', summary: inp.summary || '', risk: inp.risk || 'medium' });
        const approved = await confirm({ summary: inp.summary || '', risk: inp.risk || 'medium' });
        onEvent({ type: 'permission-result', approved });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: [
            {
              type: 'text',
              text: approved
                ? 'APPROVED — the operator approved this action. Proceed.'
                : 'DENIED — the operator declined. Do not perform it; find a safe alternative or stop.',
            },
          ],
        });
        continue;
      }

      const action = tu.input || {};
      // Scale coordinates from Claude's view into real pixels.
      const real = { ...action };
      if (Array.isArray(action.coordinate)) real.coordinate = toReal(action.coordinate[0], action.coordinate[1]);
      if (Array.isArray(action.start_coordinate))
        real.start_coordinate = toReal(action.start_coordinate[0], action.start_coordinate[1]);

      onEvent({ type: 'action', action: action.action, detail: describe(action) });

      // Heuristic/paranoid backstop: confirm before executing if the action is
      // clearly destructive or if paranoid mode is on.
      if (action.action !== 'screenshot' && (CONFIRM_EVERY || looksRisky(action))) {
        const summary = `About to ${describe(action)}`;
        onEvent({ type: 'permission', summary, risk: looksRisky(action) ? 'high' : 'medium' });
        const approved = await confirm({ summary, risk: looksRisky(action) ? 'high' : 'medium' });
        onEvent({ type: 'permission-result', approved });
        if (!approved) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tu.id,
            content: [{ type: 'text', text: 'DENIED by operator — action not performed. Choose a safe alternative or stop.' }],
          });
          continue;
        }
      }

      let result = { ok: true };
      if (action.action !== 'screenshot') {
        result = await execute(real);
      }

      // Always return a fresh screenshot (except pure text results).
      const content = [];
      if (result.text) {
        content.push({ type: 'text', text: result.text });
      } else {
        const shot = await capture();
        const img = dataUrlToImageBlock(shot.dataUrl);
        if (img) content.push(img);
      }
      if (result.error) {
        content.push({ type: 'text', text: 'Action error: ' + result.error });
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content,
        is_error: Boolean(result.error),
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  onEvent({ type: 'max_steps', steps: MAX_STEPS });
  return { status: 'max_steps', steps: MAX_STEPS };
}

function describe(action) {
  const c = Array.isArray(action.coordinate) ? ` @ (${action.coordinate.join(', ')})` : '';
  if (action.action === 'type') return `type "${(action.text || '').slice(0, 60)}"`;
  if (action.action === 'key') return `key ${action.text || ''}`;
  if (action.action === 'scroll') return `scroll ${action.scroll_direction || ''}${c}`;
  return `${action.action}${c}`;
}

module.exports = { runSession };
