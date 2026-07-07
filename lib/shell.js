'use strict';

/**
 * Terminal capability — lets JARVIS run real shell commands on the host, so he
 * can do anything you could do in Terminal (install tools, run scripts, manage
 * files, use git, drive other CLIs) and stream the output back.
 *
 * Commands run through a LOGIN shell so the user's PATH/profile is in scope —
 * that's how tools like `brew`, `git`, `node`, and `claude` resolve the same way
 * they do in a normal terminal (GUI apps otherwise get a bare PATH).
 *
 * Safety: `looksDangerous()` flags clearly destructive/outbound commands so the
 * caller can force an approval prompt even in Full Control mode; every run is
 * killable (STOP) and time-bounded.
 */

const { spawn } = require('child_process');

// Clearly destructive or high-blast-radius patterns. Not exhaustive — a backstop
// so the obvious foot-guns always ask first, even when Full Control is on.
const DANGEROUS = [
  /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i, // rm -rf / -fr
  /\bsudo\b/i,
  /\bmkfs\b|\bdiskutil\s+(erase|reformat|partition)|\bdd\s+if=/i,
  /\bshutdown\b|\breboot\b|\bhalt\b/i,
  /:\(\)\s*\{.*\}\s*;/, // fork bomb
  /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh)\b/i, // curl … | sh
  /\bchmod\s+-[a-z]*R[a-z]*\s+777\b/i,
  />\s*\/dev\/(sd|disk|rdisk|null\/)/i,
  /\bkillall\b|\bpkill\s+-9\b/i,
  /\bgit\s+push\b.*--force|\bgit\s+reset\s+--hard\b/i,
  /\b(nvram|csrutil|spctl)\b/i,
];

function looksDangerous(command) {
  const c = String(command || '');
  return DANGEROUS.some((re) => re.test(c));
}

function loginShell() {
  if (process.platform === 'win32') return { cmd: process.env.COMSPEC || 'cmd.exe', flag: '/c' };
  const sh = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  return { cmd: sh, flag: '-lc' };
}

/**
 * Run a shell command, streaming output.
 *
 * @param {string}   command
 * @param {object}   [opts]
 * @param {string}   [opts.cwd]          working directory (default: home)
 * @param {number}   [opts.timeoutMs]    hard timeout (default 120000)
 * @param {Function} [opts.onData]       (chunk:string) => void  streamed output
 * @param {Function} [opts.shouldAbort]  () => boolean kill switch
 * @returns {Promise<{ok:boolean, code:number|null, output:string, aborted?:boolean, timedOut?:boolean}>}
 */
function run(command, opts = {}) {
  const cmd = String(command || '').trim();
  const onData = opts.onData || (() => {});
  const shouldAbort = opts.shouldAbort || (() => false);
  const timeoutMs = opts.timeoutMs || 120000;

  return new Promise((resolve) => {
    if (!cmd) return resolve({ ok: false, code: null, output: 'No command given.' });
    const { cmd: shellCmd, flag } = loginShell();

    let child;
    try {
      child = spawn(shellCmd, [flag, cmd], {
        cwd: opts.cwd || process.env.HOME || process.cwd(),
        env: process.env,
      });
    } catch (err) {
      return resolve({ ok: false, code: null, output: err.message });
    }

    let output = '';
    let killed = false;
    let timedOut = false;
    const cap = 200000; // keep at most ~200KB so a chatty command can't blow up memory
    const append = (s) => {
      output += s;
      if (output.length > cap) output = output.slice(-cap);
      onData(s);
    };

    const poll = setInterval(() => {
      if (!killed && shouldAbort()) {
        killed = true;
        try {
          child.kill('SIGTERM');
        } catch {
          /* gone */
        }
      }
    }, 300);

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* gone */
      }
    }, timeoutMs);

    child.stdout.on('data', (d) => append(d.toString()));
    child.stderr.on('data', (d) => append(d.toString()));
    child.on('error', (err) => {
      clearInterval(poll);
      clearTimeout(timer);
      resolve({ ok: false, code: null, output: (output + '\n' + err.message).trim() });
    });
    child.on('close', (code) => {
      clearInterval(poll);
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut && !killed,
        code,
        output: output.trim(),
        aborted: killed || undefined,
        timedOut: timedOut || undefined,
      });
    });
  });
}

module.exports = { run, looksDangerous, loginShell };
