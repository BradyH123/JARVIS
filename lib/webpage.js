'use strict';

/**
 * Read the ACTUAL page — not a screenshot.
 *
 * When the user asks JARVIS to summarize a website, this pulls the live DOM from
 * the active browser tab via AppleScript JavaScript injection: the URL, title,
 * the full visible text, and a MAP of every interactive element (links, buttons,
 * inputs) with its label and on-screen coordinates. That gives a far richer,
 * more accurate basis for a summary than a screenshot, and the interface map can
 * ground precise clicks.
 *
 * Requires the browser to allow JavaScript from Apple Events (a one-time setting):
 *   - Chrome/Arc/Brave/Edge: View → Developer → "Allow JavaScript from Apple Events"
 *   - Safari: Develop → "Allow JavaScript from Apple Events"
 * If it's off we detect the error and tell the user how to enable it.
 */

const { execFile } = require('child_process');

const isMac = process.platform === 'darwin';

// Chromium browsers share one AppleScript form; Safari uses another.
const BROWSERS = [
  { app: 'Google Chrome', kind: 'chromium' },
  { app: 'Arc', kind: 'chromium' },
  { app: 'Brave Browser', kind: 'chromium' },
  { app: 'Microsoft Edge', kind: 'chromium' },
  { app: 'Safari', kind: 'safari' },
];

// Injected page reader. Returns a JSON string (so AppleScript hands back text).
const EXTRACT_JS = `(function(){
  function L(e){return (e.getAttribute('aria-label')||e.innerText||e.value||e.getAttribute('placeholder')||e.getAttribute('title')||e.getAttribute('name')||'').replace(/\\s+/g,' ').trim().slice(0,90);}
  var sel='a,button,input,textarea,select,[role=button],[role=link],[role=tab],[onclick]';
  var nodes=Array.prototype.slice.call(document.querySelectorAll(sel));
  var seen={},map=[];
  for(var i=0;i<nodes.length&&map.length<250;i++){var e=nodes[i];var r=e.getBoundingClientRect();if(r.width<=0||r.height<=0)continue;var lab=L(e);var href=e.href||'';if(!lab&&!href)continue;var key=e.tagName+'|'+lab+'|'+href;if(seen[key])continue;seen[key]=1;map.push({tag:e.tagName.toLowerCase(),type:e.type||e.getAttribute('role')||'',label:lab,href:String(href).slice(0,200),x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});}
  return JSON.stringify({url:location.href,title:document.title,text:(document.body?document.body.innerText:'').replace(/\\n{3,}/g,'\\n\\n').slice(0,24000),interface:map});
})()`;

/** Escape a JS payload for embedding in an AppleScript double-quoted string. */
function osaEscape(s) {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function osa(script) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 15000, maxBuffer: 12 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, output: String(stdout || '').trim(), error: err ? String(stderr || '') || err.message : '' });
    });
  });
}

async function isRunning(app) {
  const r = await osa(`application "${app}" is running`);
  return /true/i.test(r.output);
}

function permissionHint(app, kind) {
  const where = kind === 'safari' ? 'Safari → Develop menu' : `${app} → View → Developer`;
  return `${app}: turn on "Allow JavaScript from Apple Events" (${where}), then try again.`;
}

/**
 * Read the active tab of the frontmost running browser.
 * @returns {Promise<{ok, browser?, url?, title?, text?, interface?, error?, needsPermission?}>}
 */
async function readActiveTab() {
  if (!isMac) return { ok: false, error: 'Reading the live page is macOS-only.' };
  const js = osaEscape(EXTRACT_JS);

  for (const b of BROWSERS) {
    if (!(await isRunning(b.app))) continue;
    const script =
      b.kind === 'safari'
        ? `tell application "Safari" to do JavaScript "${js}" in front document`
        : `tell application "${b.app}" to execute front window's active tab javascript "${js}"`;
    const r = await osa(script);
    if (r.ok && r.output) {
      try {
        return { ok: true, browser: b.app, ...JSON.parse(r.output) };
      } catch {
        /* non-JSON — fall through to permission check */
      }
    }
    // Running but couldn't inject → almost always the Apple-Events JS setting.
    if (/Apple ?Events|not allowed|Allow JavaScript|-1743|execute|do JavaScript|1728/i.test(r.error || '')) {
      return { ok: false, browser: b.app, needsPermission: true, error: permissionHint(b.app, b.kind) };
    }
  }
  return { ok: false, error: 'No open browser tab found to read.' };
}

module.exports = { readActiveTab, isSupported: () => isMac };
