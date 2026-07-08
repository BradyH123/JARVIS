'use strict';

/**
 * Background browser — the web, without taking over your screen.
 *
 * JARVIS drives a HIDDEN Electron BrowserWindow (a real Chromium engine that is
 * never shown) through the page's DOM: navigate, read, click, type, submit. It
 * runs entirely off-screen and never touches your real mouse/keyboard, so you
 * can keep working while JARVIS does a task on the web in parallel — the same
 * idea as headless browser automation (Playwright/CDP), but with zero extra
 * dependencies because this app is already Electron.
 *
 * Two layers:
 *   - a thin driver (ensure/goto/readPage/click/type/…) over one hidden window
 *   - run(): a Claude-driven perceive→decide→act loop that completes a goal by
 *     choosing browser tools each turn from the live page's text + element map
 *     (text-grounded, so it's fast and cheap and needs no screenshots).
 *
 * Main-process only (needs Electron BrowserWindow). Defensive: timeouts, caps,
 * and it returns error objects instead of throwing.
 */

const config = require('./config');

let _win = null;

// A realistic desktop-Chrome UA so sites don't serve a blocked/legacy page to
// what would otherwise identify as Electron.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Injected reader: current URL/title, visible text, and a map of interactive
// elements with a stable ref so the model can target them precisely.
const READ_JS = `(function(){
  function L(e){return (e.getAttribute&&(e.getAttribute('aria-label')||e.getAttribute('placeholder')||e.getAttribute('title')||e.getAttribute('name'))||e.innerText||e.value||'').replace(/\\s+/g,' ').trim().slice(0,90);}
  var sel='a,button,input,textarea,select,[role=button],[role=link],[role=tab],[role=checkbox],[onclick]';
  var nodes=Array.prototype.slice.call(document.querySelectorAll(sel));
  var seen={},map=[],idx=0;
  for(var i=0;i<nodes.length&&map.length<160;i++){var e=nodes[i];var r=e.getBoundingClientRect();if(r.width<=0||r.height<=0)continue;var lab=L(e);var href=e.href||'';if(!lab&&!href)continue;var key=e.tagName+'|'+lab+'|'+href;if(seen[key])continue;seen[key]=1;e.setAttribute('data-jarvis-ref',String(idx));map.push({ref:idx,tag:e.tagName.toLowerCase(),type:(e.type||e.getAttribute('role')||''),label:lab,href:String(href).slice(0,160)});idx++;}
  return JSON.stringify({url:location.href,title:document.title,text:(document.body?document.body.innerText:'').replace(/\\n{3,}/g,'\\n\\n').slice(0,12000),interface:map});
})()`;

function getBrowserWindow() {
  // Lazy require so headless test/eval environments (no Electron) can still load
  // the pure exports without pulling in the native module.
  return require('electron').BrowserWindow;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Create (or reuse) the hidden background window. */
async function ensure() {
  if (_win && !_win.isDestroyed()) return _win;
  const BrowserWindow = getBrowserWindow();
  _win = new BrowserWindow({
    show: false, // never displayed — this is the whole point
    width: 1440,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Its own persistent session so logins/cookies survive across tasks,
      // kept separate from anything else.
      partition: 'persist:jarvis-bg',
      backgroundThrottling: false,
    },
  });
  try {
    _win.webContents.setUserAgent(UA);
  } catch (_) {}
  return _win;
}

/** Navigate to a URL and wait for the load to settle (or time out). */
async function goto(url, timeoutMs = 20000) {
  const u = String(url || '').trim();
  if (!u) return { ok: false, error: 'no url' };
  const full = /^https?:\/\//i.test(u) ? u : 'https://' + u.replace(/^\/+/, '');
  const win = await ensure();
  const wc = win.webContents;
  return new Promise((resolve) => {
    let done = false;
    const finish = (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      wc.removeListener('did-finish-load', onOk);
      wc.removeListener('did-fail-load', onFail);
      resolve(res);
    };
    const onOk = () => finish({ ok: true, url: wc.getURL(), title: win.getTitle() });
    // Ignore sub-frame / aborted (-3) failures; only the main-frame hard fail matters.
    const onFail = (_e, code, desc, _u, isMainFrame) => {
      if (isMainFrame && code !== -3) finish({ ok: false, error: `load failed (${code}): ${desc}` });
    };
    const timer = setTimeout(() => finish({ ok: true, url: wc.getURL(), title: win.getTitle(), note: 'load timed out — continuing' }), timeoutMs);
    wc.on('did-finish-load', onOk);
    wc.on('did-fail-load', onFail);
    wc.loadURL(full).catch((e) => finish({ ok: false, error: e.message }));
  });
}

/** Run JS in the page and return the parsed value (best-effort). */
async function evaluate(js) {
  const win = await ensure();
  return win.webContents.executeJavaScript(js, true);
}

/** Read the current page: url, title, visible text, element map. */
async function readPage() {
  try {
    const raw = await evaluate(READ_JS);
    const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return { ok: true, ...d };
  } catch (e) {
    return { ok: false, error: e.message, interface: [] };
  }
}

// Build JS that resolves an element by its jarvis ref, a CSS selector, or (last
// resort) the best visible-text match, then performs `verb` on it.
function locatorJs(target, verb) {
  const t = JSON.stringify(String(target == null ? '' : target));
  return `(function(){
    var t=${t};
    var el=null;
    if(/^\\d+$/.test(t)){el=document.querySelector('[data-jarvis-ref="'+t+'"]');}
    if(!el){try{el=document.querySelector(t);}catch(e){}}
    if(!el){
      var q=t.toLowerCase();var best=null,bs=0;
      var ns=document.querySelectorAll('a,button,input,textarea,select,[role=button],[role=link],[role=tab],[onclick]');
      for(var i=0;i<ns.length;i++){var e=ns[i];var r=e.getBoundingClientRect();if(r.width<=0||r.height<=0)continue;var lab=((e.getAttribute('aria-label')||e.placeholder||e.title||e.name||'')+' '+(e.innerText||e.value||'')).toLowerCase().trim();if(!lab)continue;var s=0;if(lab===q)s=100;else if(lab.indexOf(q)>=0)s=60+Math.max(0,20-Math.abs(lab.length-q.length));else if(q.indexOf(lab)>=0&&lab.length>2)s=40;if(s>bs){bs=s;best=e;}}
      if(bs>=40)el=best;
    }
    if(!el)return JSON.stringify({ok:false,error:'no element matched "'+t+'"'});
    el.scrollIntoView({block:'center'});
    ${verb}
    return JSON.stringify({ok:true,label:((el.getAttribute&&el.getAttribute('aria-label'))||el.innerText||el.value||el.name||'').replace(/\\s+/g,' ').trim().slice(0,80)});
  })()`;
}

/** Click an element (by ref, selector, or visible text). */
async function click(target) {
  try {
    const raw = await evaluate(locatorJs(target, 'el.focus&&el.focus();el.click();'));
    return JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Type text into a field (by ref, selector, or label). Optionally submit. */
async function type(target, text, submit) {
  const val = JSON.stringify(String(text == null ? '' : text));
  const verb =
    `el.focus&&el.focus();` +
    `if('value' in el){el.value=${val};}else{el.textContent=${val};}` +
    `el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));` +
    (submit
      ? `var f=el.form;if(f){if(f.requestSubmit)f.requestSubmit();else f.submit();}else{el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,which:13,bubbles:true}));el.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',keyCode:13,which:13,bubbles:true}));}`
      : '');
  try {
    const raw = await evaluate(locatorJs(target, verb));
    return JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Scroll the page. */
async function scroll(direction) {
  const dy = direction === 'up' ? -700 : 700;
  try {
    await evaluate(`window.scrollBy(0, ${dy}); true`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Grab a screenshot of the hidden page (only when a task truly needs vision). */
async function screenshot() {
  try {
    const win = await ensure();
    const img = await win.webContents.capturePage();
    return { ok: true, dataUrl: img.toDataURL() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Close the background browser and free its resources. */
function close() {
  if (_win && !_win.isDestroyed()) _win.destroy();
  _win = null;
}

function isOpen() {
  return Boolean(_win && !_win.isDestroyed());
}

// ---- The autonomous loop --------------------------------------------------

// Tools the model may call each turn. Kept small and DOM-oriented.
const BROWSER_TOOLS = [
  { name: 'navigate', description: 'Load a URL in the background browser (go directly to known sites — do not web-search for them).', input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'click', description: 'Click an element by its ref number (from the element map), a CSS selector, or its visible text/label.', input_schema: { type: 'object', properties: { target: { type: 'string' } }, required: ['target'] } },
  { name: 'type', description: 'Type text into a field (ref, selector, or label). Set submit=true to press Enter / submit the form after typing (e.g. a search box).', input_schema: { type: 'object', properties: { target: { type: 'string' }, text: { type: 'string' }, submit: { type: 'boolean' } }, required: ['target', 'text'] } },
  { name: 'scroll', description: 'Scroll the page up or down to reveal more content.', input_schema: { type: 'object', properties: { direction: { type: 'string', enum: ['up', 'down'] } }, required: ['direction'] } },
  { name: 'finish', description: 'The goal is complete. Give a short result/answer for the user.', input_schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] } },
];

const SYSTEM =
  'You are JARVIS operating a BACKGROUND web browser on the user\'s behalf — it is ' +
  'invisible and separate from their screen, so work efficiently and never assume the ' +
  'user can see it. Achieve the goal by calling the browser tools. Each turn you are ' +
  'given the current page URL, title, visible text, and a numbered map of clickable/' +
  'typable elements — target elements by their ref number when you can. Go DIRECTLY to ' +
  'known sites via navigate (e.g. "youtube.com", "amazon.com") instead of searching for ' +
  'them. To search within a site, type into its search box with submit=true. Keep going ' +
  'until the goal is genuinely done, then call finish with a brief result. If a page is ' +
  'unexpected, read the element map and adapt. Do not call finish until the task is ' +
  'actually complete.';

/** Format a page state into a compact text block for the model. */
function pageBlock(p) {
  const iface = (p.interface || [])
    .map((e) => `[${e.ref}] ${e.tag}${e.type ? '(' + e.type + ')' : ''} "${e.label}"${e.href ? ' → ' + e.href : ''}`)
    .join('\n')
    .slice(0, 5000);
  return (
    `URL: ${p.url || '(none)'}\nTitle: ${p.title || ''}\n\n` +
    `VISIBLE TEXT:\n${(p.text || '').slice(0, 6000)}\n\n` +
    `ELEMENTS (target by [ref]):\n${iface || '(none found)'}`
  );
}

/**
 * Token-cost control: the model only needs the CURRENT page (and maybe the one
 * before it) to pick its next action, but every old page dump (~10KB) would
 * otherwise ride along in the history on every turn — quadratic cost growth
 * over a long run. Truncate all but the newest `keep` page states down to their
 * one-line action status.
 */
function prunePageStates(messages, keep = 2) {
  const blocks = [];
  for (const m of messages) {
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b.type === 'text' && b.text && b.text.includes('VISIBLE TEXT:')) blocks.push(b);
      if (b.type === 'tool_result' && Array.isArray(b.content)) {
        for (const c of b.content) {
          if (c.type === 'text' && c.text && c.text.includes('VISIBLE TEXT:')) blocks.push(c);
        }
      }
    }
  }
  const cut = Math.max(0, blocks.length - keep);
  for (let i = 0; i < cut; i++) {
    const b = blocks[i];
    // Keep the goal/status/URL lines; drop the bulky page text + element map.
    const at = b.text.indexOf('VISIBLE TEXT:');
    b.text = b.text.slice(0, at).trimEnd() + '\n(older page state pruned to save tokens)';
  }
  return cut;
}

/**
 * Drive the background browser to accomplish a goal.
 * @param {string}   goal
 * @param {object}   [opts]
 * @param {Function} [opts.onEvent]     progress stream (type: thinking|action|done|error)
 * @param {Function} [opts.shouldAbort] () => boolean kill switch
 * @param {number}   [opts.maxSteps]
 * @param {string}   [opts.startUrl]    optional page to open first
 * @returns {Promise<{status:string, message?:string, steps:number}>}
 */
async function run(goal, opts = {}) {
  const onEvent = opts.onEvent || (() => {});
  const shouldAbort = opts.shouldAbort || (() => false);
  const maxSteps = opts.maxSteps || 40;
  const g = String(goal || '').trim();
  if (!g) return { status: 'error', message: 'No goal.', steps: 0 };

  const apiKey = config.getApiKey();
  if (!apiKey) return { status: 'error', message: 'No API key set. Add it in Settings.', steps: 0 };
  // Lazy-require the SDK so the pure helpers load in headless test/eval too.
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const model = config.getModel();

  onEvent({ type: 'action', detail: 'opening a background browser' });
  await ensure();
  if (opts.startUrl) await goto(opts.startUrl);

  let page = await readPage();
  const messages = [
    // Content as blocks (not a string) so old page states can be pruned in place.
    { role: 'user', content: [{ type: 'text', text: `Goal: ${g}\n\nCurrent background browser page:\n${pageBlock(page)}` }] },
  ];

  for (let step = 0; step < maxSteps; step++) {
    if (shouldAbort()) {
      onEvent({ type: 'aborted', step });
      return { status: 'aborted', steps: step };
    }

    let resp;
    try {
      resp = await client.messages.create({
        model,
        max_tokens: 900,
        // Cache the stable system+tools prefix — on every turn after the first,
        // that prefix bills at the (much cheaper) cache-read rate.
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: BROWSER_TOOLS,
        tool_choice: { type: 'any' },
        messages,
      });
    } catch (e) {
      onEvent({ type: 'error', message: e.message });
      return { status: 'error', message: e.message, steps: step };
    }
    messages.push({ role: 'assistant', content: resp.content });

    for (const b of resp.content) {
      if (b.type === 'text' && b.text.trim()) onEvent({ type: 'thinking', text: b.text.trim() });
    }
    const call = resp.content.find((b) => b.type === 'tool_use');
    if (!call) {
      const txt = resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      onEvent({ type: 'done', message: txt });
      return { status: 'done', message: txt, steps: step };
    }

    if (call.name === 'finish') {
      const summary = (call.input && call.input.summary) || 'Done.';
      onEvent({ type: 'done', message: summary });
      return { status: 'done', message: summary, steps: step };
    }

    // Execute the chosen browser action.
    let result = { ok: false, error: 'unknown tool' };
    const inp = call.input || {};
    if (call.name === 'navigate') {
      onEvent({ type: 'action', detail: 'navigate → ' + inp.url });
      result = await goto(inp.url);
    } else if (call.name === 'click') {
      onEvent({ type: 'action', detail: 'click ' + inp.target });
      result = await click(inp.target);
      await delay(500);
    } else if (call.name === 'type') {
      onEvent({ type: 'action', detail: `type "${String(inp.text).slice(0, 40)}"${inp.submit ? ' + submit' : ''}` });
      result = await type(inp.target, inp.text, inp.submit);
      await delay(inp.submit ? 900 : 250);
    } else if (call.name === 'scroll') {
      result = await scroll(inp.direction);
    }

    // Re-read the page and hand the fresh state back as the tool result.
    page = await readPage();
    const status = result.ok ? `OK${result.label ? ' — ' + result.label : ''}${result.note ? ' (' + result.note + ')' : ''}` : `FAILED: ${result.error || 'action failed'}`;
    messages.push({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: call.id, content: [{ type: 'text', text: `${status}\n\nPage now:\n${pageBlock(page)}` }] },
      ],
    });
    // Cost control: only the newest couple of page states stay in the history.
    prunePageStates(messages, 2);
  }

  onEvent({ type: 'max_steps', steps: maxSteps });
  return { status: 'max_steps', message: 'Reached the step limit in the background browser.', steps: maxSteps };
}

module.exports = { ensure, goto, readPage, click, type, scroll, screenshot, close, isOpen, run, locatorJs, pageBlock, prunePageStates };
