'use strict';

/**
 * Self-improvement loop — the assistant edits its OWN code to fulfil a request.
 *
 * This is a small agentic loop, analogous to lib/agent.js but for source code
 * instead of the mouse/keyboard. Claude is given tools to list, read, and
 * overwrite files in the app's own tree (all guarded by lib/selfedit.js), then
 * signals `finish`. We snapshot everything it touches up front, validate the
 * result (syntax + smoke tests), and — critically — REVERT the whole change set
 * if validation fails or the run is aborted, so a bad self-edit can never brick
 * the app. A good change is backed up and left on disk for the next launch.
 *
 * Safety properties:
 *   - edits are confined to the app root, source extensions only (selfedit)
 *   - nothing is kept unless it passes `node --check` + the smoke suite
 *   - any non-success outcome restores the original files
 */

const Anthropic = require('@anthropic-ai/sdk');
const config = require('./config');
const selfedit = require('./selfedit');

function getClient() {
  const apiKey = config.getApiKey();
  if (!apiKey) throw new Error('No API key set. Open Settings and paste your Anthropic API key.');
  return new Anthropic({ apiKey });
}

const TOOLS = [
  {
    name: 'list_files',
    description: "List every source file in the assistant's own codebase.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_file',
    description: 'Read the full contents of one source file (repo-relative path).',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description:
      'Overwrite one source file with new contents. You MUST provide the ENTIRE new ' +
      'file, not a diff or a fragment. Keep the code valid and in the existing style.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  {
    name: 'finish',
    description:
      'Call when the change is complete. The edits will be syntax-checked and the ' +
      'test suite run; if anything fails you will get the errors and must fix them.',
    input_schema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    },
  },
];

const SYSTEM =
  'You are the self-improvement engine of a desktop assistant called JARVIS — an ' +
  'Electron app (main process in main.js, sandboxed renderer in renderer/, logic in ' +
  'lib/). You can read and rewrite your OWN source code to fulfil the user request.\n\n' +
  'Rules:\n' +
  '- Read the relevant files before editing so you understand the current code.\n' +
  '- Make the smallest change that satisfies the request; match the surrounding style.\n' +
  '- When you write a file you must output the COMPLETE new file contents.\n' +
  '- Never break existing behaviour and keep every file syntactically valid.\n' +
  '- Do not add heavy new dependencies or touch node_modules / build output.\n' +
  '- Do not weaken the safety model (approval gates, STOP kill switch, path guards).\n' +
  '- When finished, call the finish tool with a one-line summary of what changed.';

function toolResult(tu, text, isError) {
  return {
    type: 'tool_result',
    tool_use_id: tu.id,
    content: [{ type: 'text', text: String(text).slice(0, 120000) }],
    is_error: Boolean(isError),
  };
}

/**
 * Run one self-improvement session.
 *
 * @param {object}   opts
 * @param {string}   opts.goal          natural-language improvement request
 * @param {Function} [opts.onEvent]     progress stream (evt) => void
 * @param {Function} [opts.shouldAbort] () => boolean kill switch
 * @returns {Promise<{status, changed:string[], summary?, errors?, reverted?}>}
 */
async function improve(opts) {
  const goal = String(opts.goal || '').trim();
  const onEvent = opts.onEvent || (() => {});
  const shouldAbort = opts.shouldAbort || (() => false);
  if (!goal) return { status: 'error', message: 'No improvement described.', changed: [] };

  const client = getClient();
  const model = config.getModel();

  // Originals of everything we touch, captured lazily on first write so we can
  // revert the entire change set if the outcome isn't a clean success.
  const originals = {};
  const changed = new Set();
  const captureOriginal = (rel) => {
    if (rel in originals) return;
    Object.assign(originals, selfedit.snapshot([rel]));
  };

  const finish = (result) => {
    const touched = Object.keys(originals);
    if (result.status === 'done') {
      // Keep the change; stash the originals so the user can roll back by hand.
      if (touched.length) {
        try {
          selfedit.backup(originals, new Date().toISOString());
        } catch {
          /* backup is best-effort */
        }
      }
      return { ...result, changed: [...changed] };
    }
    // Any non-success outcome: put the code back exactly as it was.
    let reverted = false;
    if (touched.length) {
      try {
        selfedit.restore(originals);
        reverted = true;
      } catch {
        /* leave as-is; surfaced via reverted:false */
      }
    }
    return { ...result, changed: [...changed], reverted };
  };

  const manifest = selfedit.listSource();
  const messages = [
    {
      role: 'user',
      content:
        `Improvement request: ${goal}\n\n` +
        `Your source files:\n${manifest.join('\n')}\n\n` +
        'Read what you need, make the change, then call finish.',
    },
  ];

  const MAX_TURNS = 40;
  let validationsLeft = 3;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (shouldAbort()) return finish({ status: 'aborted' });

    let resp;
    try {
      resp = await client.messages.create({
        model,
        max_tokens: 8000,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
      });
    } catch (err) {
      return finish({ status: 'error', message: err.message });
    }

    messages.push({ role: 'assistant', content: resp.content });
    for (const b of resp.content) {
      if (b.type === 'text' && b.text.trim()) onEvent({ type: 'thinking', text: b.text.trim() });
    }

    const toolUses = resp.content.filter((b) => b.type === 'tool_use');
    if (!toolUses.length) {
      // Model stopped talking without finishing — nothing validated, so revert.
      return finish({ status: 'incomplete' });
    }

    const results = [];
    let finishReq = null;
    for (const tu of toolUses) {
      try {
        if (tu.name === 'list_files') {
          results.push(toolResult(tu, selfedit.listSource().join('\n')));
        } else if (tu.name === 'read_file') {
          onEvent({ type: 'read', path: tu.input.path });
          results.push(toolResult(tu, selfedit.readFile(tu.input.path)));
        } else if (tu.name === 'write_file') {
          captureOriginal(tu.input.path);
          selfedit.writeFile(tu.input.path, tu.input.content);
          changed.add(tu.input.path);
          onEvent({ type: 'write', path: tu.input.path });
          results.push(toolResult(tu, 'Saved.'));
        } else if (tu.name === 'finish') {
          finishReq = tu.input.summary || '';
          results.push(toolResult(tu, 'Validating your changes…'));
        } else {
          results.push(toolResult(tu, 'Unknown tool.', true));
        }
      } catch (err) {
        results.push(toolResult(tu, 'ERROR: ' + err.message, true));
      }
    }
    messages.push({ role: 'user', content: results });

    if (finishReq !== null) {
      if (!changed.size) {
        return finish({ status: 'done', summary: finishReq || 'No changes were necessary.' });
      }
      onEvent({ type: 'validating' });
      const v = selfedit.validate([...changed]);
      if (v.ok) {
        onEvent({ type: 'validated' });
        return finish({ status: 'done', summary: finishReq });
      }
      validationsLeft -= 1;
      onEvent({ type: 'validation-failed', errors: v.errors });
      if (validationsLeft <= 0) {
        return finish({ status: 'validation-failed', errors: v.errors, summary: finishReq });
      }
      messages.push({
        role: 'user',
        content:
          'Validation FAILED — the change was NOT accepted. Fix these problems and call ' +
          'finish again:\n\n' +
          v.errors.join('\n\n'),
      });
    }
  }

  return finish({ status: 'incomplete' });
}

module.exports = { improve };
