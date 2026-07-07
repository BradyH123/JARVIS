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

// Full data harvest: pull EVERYTHING the page exposes — complete text, HTML,
// every link/image/table/form, meta tags, and JSON-LD structured data. Capped so
// one giant page can't blow up memory, but far more than the summary reader.
const HARVEST_JS = `(function(){
  function T(e){return (e&&e.innerText||'').replace(/\\s+/g,' ').trim();}
  var links=[],imgs=[],tables=[],heads=[],jsonld=[],forms=[],meta={};
  var la=document.querySelectorAll('a[href]');for(var i=0;i<la.length&&links.length<3000;i++){links.push({text:T(la[i]).slice(0,140),href:la[i].href});}
  var ia=document.querySelectorAll('img[src]');for(var j=0;j<ia.length&&imgs.length<1500;j++){imgs.push({src:ia[j].src,alt:(ia[j].alt||'').slice(0,160)});}
  var ta=document.querySelectorAll('table');for(var k=0;k<ta.length&&tables.length<200;k++){var rows=[];var trs=ta[k].querySelectorAll('tr');for(var r=0;r<trs.length;r++){var cells=[];var cs=trs[r].querySelectorAll('th,td');for(var c=0;c<cs.length;c++){cells.push(T(cs[c]).slice(0,240));}if(cells.length)rows.push(cells);}if(rows.length)tables.push(rows);}
  var ha=document.querySelectorAll('h1,h2,h3');for(var h=0;h<ha.length&&heads.length<500;h++){heads.push({level:ha[h].tagName.toLowerCase(),text:T(ha[h]).slice(0,200)});}
  var sa=document.querySelectorAll('script[type=\\"application/ld+json\\"]');for(var s=0;s<sa.length&&jsonld.length<50;s++){try{jsonld.push(JSON.parse(sa[s].textContent));}catch(e){}}
  var fa=document.querySelectorAll('form');for(var f=0;f<fa.length&&forms.length<100;f++){var fields=[];var xs=fa[f].querySelectorAll('input,select,textarea');for(var x=0;x<xs.length;x++){fields.push({type:xs[x].type||xs[x].tagName.toLowerCase(),name:xs[x].name||'',label:(xs[x].getAttribute('aria-label')||xs[x].placeholder||'').slice(0,80)});}forms.push({action:fa[f].action||'',method:fa[f].method||'',fields:fields});}
  var ma=document.querySelectorAll('meta[name],meta[property]');for(var m=0;m<ma.length;m++){var kk=ma[m].getAttribute('name')||ma[m].getAttribute('property');if(kk&&!meta[kk])meta[kk]=(ma[m].getAttribute('content')||'').slice(0,300);}
  return JSON.stringify({url:location.href,title:document.title,meta:meta,text:(document.body?document.body.innerText:'').slice(0,300000),html:document.documentElement.outerHTML.slice(0,900000),links:links,images:imgs,tables:tables,headings:heads,jsonld:jsonld,forms:forms,counts:{links:links.length,images:imgs.length,tables:tables.length,headings:heads.length,forms:forms.length}});
})()`;

/** Harvest all data from the active tab of the frontmost browser. */
async function harvestActiveTab() {
  if (!isMac) return { ok: false, error: 'Harvesting is macOS-only.' };
  const js = osaEscape(HARVEST_JS);
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
        /* fall through */
      }
    }
    if (/Apple ?Events|not allowed|Allow JavaScript|-1743|execute|do JavaScript|1728/i.test(r.error || '')) {
      return { ok: false, browser: b.app, needsPermission: true, error: permissionHint(b.app, b.kind) };
    }
  }
  return { ok: false, error: 'No open browser tab found to harvest.' };
}

/** Harvest every open tab across all windows of the frontmost Chromium browser. */
async function harvestAllTabs() {
  if (!isMac) return { ok: false, error: 'Harvesting is macOS-only.' };
  const js = osaEscape(HARVEST_JS);
  let target = null;
  for (const b of BROWSERS) {
    if (b.kind === 'chromium' && (await isRunning(b.app))) {
      target = b;
      break;
    }
  }
  if (!target) {
    // Safari or none: fall back to just the active tab.
    const one = await harvestActiveTab();
    return one.ok ? { ok: true, browser: one.browser, pages: [one] } : one;
  }

  const nWin = parseInt((await osa(`tell application "${target.app}" to count windows`)).output, 10) || 0;
  const pages = [];
  for (let w = 1; w <= nWin; w++) {
    const nTab = parseInt((await osa(`tell application "${target.app}" to count tabs of window ${w}`)).output, 10) || 0;
    for (let t = 1; t <= nTab; t++) {
      const r = await osa(`tell application "${target.app}" to execute tab ${t} of window ${w} javascript "${js}"`);
      if (r.ok && r.output) {
        try {
          pages.push({ ok: true, browser: target.app, ...JSON.parse(r.output) });
        } catch {
          /* skip unreadable tab */
        }
      }
    }
  }
  return {
    ok: pages.length > 0,
    browser: target.app,
    pages,
    error: pages.length ? undefined : 'No tabs could be read (enable "Allow JavaScript from Apple Events").',
  };
}

module.exports = { readActiveTab, harvestActiveTab, harvestAllTabs, isSupported: () => isMac };
