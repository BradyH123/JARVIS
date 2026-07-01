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

const MODEL = process.env.SA_COMPUTER_USE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const TOOL_TYPE = process.env.SA_COMPUTER_TOOL_TYPE || 'computer_20250124';
const BETA_FLAG = process.env.SA_COMPUTER_BETA || 'computer-use-2025-01-24';
const MAX_STEPS = Number(process.env.SA_MAX_STEPS || 40);
// Claude grounds best on a ~XGA-sized view; we downscale the screenshot to this
// width and scale coordinates back up to real pixels when executing.
const TARGET_WIDTH = Number(process.env.SA_TARGET_WIDTH || 1280);

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set.');
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
  const client = getClient();

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
  ];

  const system =
    'You are an autonomous desktop operator. You control the real computer via the ' +
    'computer tool (mouse, keyboard). Work step by step toward the goal, taking a ' +
    'screenshot to verify the result after meaningful actions. Be careful and precise. ' +
    'If an action is destructive, irreversible, or sends something to other people ' +
    '(delete, send, pay, post), do it only if the goal clearly requires it. When the ' +
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
      onEvent({ type: 'error', message: err.message });
      return { status: 'error', steps: step, message: err.message };
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

      const action = tu.input || {};
      // Scale coordinates from Claude's view into real pixels.
      const real = { ...action };
      if (Array.isArray(action.coordinate)) real.coordinate = toReal(action.coordinate[0], action.coordinate[1]);
      if (Array.isArray(action.start_coordinate))
        real.start_coordinate = toReal(action.start_coordinate[0], action.start_coordinate[1]);

      onEvent({ type: 'action', action: action.action, detail: describe(action) });

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

module.exports = { runSession, MODEL, MAX_STEPS };
