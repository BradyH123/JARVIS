'use strict';

/**
 * Claude Code self-improvement engine.
 *
 * This is JARVIS's most powerful way to work on himself: instead of the
 * hand-rolled API loop in lib/improver.js, he shells out to the **Claude Code
 * CLI** (`claude`) pointed at his OWN repository. Claude Code is a full agentic
 * coding tool — it reads the codebase, makes multi-file edits, runs the tests,
 * and can commit — so it handles real self-modification far better than a single
 * edit loop.
 *
 * It runs headless and streaming:
 *   claude -p "<task>" --output-format stream-json --verbose \
 *          --dangerously-skip-permissions --model <model> --max-turns N
 *
 * We parse the stream-json events into progress the widget can show, and the
 * child process is killed if the user hits STOP. This only makes sense when
 * JARVIS runs from a git checkout (npm start) — the repo root is where `claude`
 * works; a packaged/asar build can't edit its own source.
 *
 * Requires the `claude` CLI to be installed and authenticated on the host
 * (the user already has it — it's how JARVIS was built). Falls back to the
 * API-based improver when unavailable.
 */

const { spawn, execFileSync } = require('child_process');

/** Is the Claude Code CLI installed and runnable on this machine? */
function isAvailable() {
  try {
    execFileSync('claude', ['--version'], { stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function describeTool(block) {
  const name = block.name || 'tool';
  const inp = block.input || {};
  if (name === 'Edit' || name === 'Write' || name === 'Read' || name === 'NotebookEdit')
    return `${name} ${String(inp.file_path || '').split('/').pop()}`;
  if (name === 'Bash') return `run: ${String(inp.command || '').slice(0, 80)}`;
  if (name === 'Grep' || name === 'Glob') return `${name} ${inp.pattern || inp.query || ''}`;
  if (name === 'TodoWrite') return 'planning…';
  return name;
}

/**
 * Run a self-improvement task through Claude Code.
 *
 * @param {object}   opts
 * @param {string}   opts.task         natural-language instruction
 * @param {string}   opts.cwd          the JARVIS repo root (where claude runs)
 * @param {string}   [opts.model]      model override
 * @param {number}   [opts.maxTurns]   safety cap on agent turns
 * @param {Function} [opts.onEvent]    progress stream
 * @param {Function} [opts.shouldAbort] () => boolean kill switch
 * @returns {Promise<{status, summary?, message?}>}
 */
function improve(opts) {
  const onEvent = opts.onEvent || (() => {});
  const shouldAbort = opts.shouldAbort || (() => false);

  return new Promise((resolve) => {
    const args = [
      '--print',
      opts.task,
      '--output-format',
      'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      '--max-turns',
      String(opts.maxTurns || 60),
    ];
    if (opts.model) args.push('--model', opts.model);

    // Hand Claude Code a known-good key so it authenticates the same way JARVIS
    // does, instead of falling back to a missing/stale credential (which 401s).
    const env = { ...process.env };
    if (opts.apiKey) env.ANTHROPIC_API_KEY = opts.apiKey;

    let child;
    try {
      child = spawn('claude', args, { cwd: opts.cwd, env });
    } catch (err) {
      return resolve({ status: 'error', message: err.message });
    }
    // We pass the task as an argument, so there's no stdin to send — close it so
    // Claude Code doesn't stall waiting ("no stdin data received in 3s").
    try {
      child.stdin.end();
    } catch {
      /* ignore */
    }

    let buf = '';
    let summary = '';
    let killed = false;
    let authFailed = false; // saw a 401/credentials error in the output

    const abortTimer = setInterval(() => {
      if (!killed && shouldAbort()) {
        killed = true;
        try {
          child.kill('SIGTERM');
        } catch {
          /* already gone */
        }
      }
    }, 400);

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let evt;
        try {
          evt = JSON.parse(line);
        } catch {
          continue;
        }
        if (evt.type === 'assistant' && evt.message && Array.isArray(evt.message.content)) {
          for (const b of evt.message.content) {
            if (b.type === 'text' && b.text.trim()) onEvent({ type: 'thinking', text: b.text.trim() });
            else if (b.type === 'tool_use') onEvent({ type: 'action', text: describeTool(b) });
          }
        } else if (evt.type === 'result') {
          summary = evt.result || summary;
          if (/401|authenticat|invalid.*credential/i.test(JSON.stringify(evt))) authFailed = true;
        }
      }
    });

    child.stderr.on('data', (d) => {
      const t = d.toString().trim();
      if (!t) return;
      if (/401|authenticat|invalid.*credential/i.test(t)) authFailed = true;
      onEvent({ type: 'log', text: t.slice(0, 200) });
    });

    child.on('error', (err) => {
      clearInterval(abortTimer);
      resolve({ status: 'error', message: err.message });
    });

    child.on('close', (code) => {
      clearInterval(abortTimer);
      if (killed) return resolve({ status: 'aborted', summary });
      if (code === 0) return resolve({ status: 'done', summary });
      if (authFailed) {
        return resolve({
          status: 'error',
          message:
            "Claude Code couldn't authenticate (401). Set a valid Anthropic API key in " +
            'JARVIS Settings, or run `claude` in a terminal to log in.',
          summary,
        });
      }
      resolve({ status: 'error', message: `Claude Code exited with code ${code}.`, summary });
    });
  });
}

module.exports = { isAvailable, improve, describeTool };
