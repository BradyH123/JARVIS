'use strict';

/**
 * Accessibility-tree reader (macOS) — Quality Blueprint §3.1/§3.2.
 *
 * Reads the frontmost app's actionable UI elements (buttons, fields, menus,
 * links…) with their labels and SCREEN coordinates, via a JXA script over the
 * Accessibility API (System Events). Screen coordinates are directly clickable —
 * unlike a browser DOM's viewport coordinates — so this is the reliable way to
 * "click the Send button" on native apps instead of guessing pixels.
 *
 * Best-effort and defensive: a hard timeout (JXA AX traversal can be slow),
 * small caps, and it returns an error object rather than throwing/hanging. Needs
 * Accessibility permission (which JARVIS already requires for mouse/keyboard
 * control). Requires on-device validation.
 */

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const isMac = process.platform === 'darwin';

// JXA: walk the frontmost process's windows and collect actionable elements.
const JXA = `function run() {
  var se = Application('System Events');
  var proc;
  try { proc = se.applicationProcesses.whose({ frontmost: true })[0]; } catch (e) { return '{}'; }
  var WANT = {AXButton:1,AXTextField:1,AXTextArea:1,AXCheckBox:1,AXRadioButton:1,AXPopUpButton:1,AXMenuButton:1,AXLink:1,AXComboBox:1,AXTabButton:1,AXSearchField:1,AXToggle:1};
  var out = [];
  function label(el){
    var s='';
    try{ s = el.title(); }catch(e){}
    if(!s){ try{ s = el.description(); }catch(e){} }
    if(!s){ try{ var v = el.value(); if(typeof v==='string') s=v; }catch(e){} }
    if(!s){ try{ s = el.name(); }catch(e){} }
    return (s||'').toString().slice(0,80);
  }
  function walk(el, depth){
    if(out.length>=200 || depth>10) return;
    var kids=[];
    try{ kids = el.uiElements(); }catch(e){ return; }
    for(var i=0;i<kids.length && out.length<200;i++){
      var k=kids[i], role='';
      try{ role = k.role(); }catch(e){}
      if(WANT[role]){
        var pos,size;
        try{ pos=k.position(); size=k.size(); }catch(e){}
        if(pos&&size&&size[0]>0&&size[1]>0){
          out.push({role:role.replace('AX','').toLowerCase(), label:label(k), x:Math.round(pos[0]+size[0]/2), y:Math.round(pos[1]+size[1]/2)});
        }
      }
      walk(k, depth+1);
    }
  }
  var wins=[];
  try{ wins = proc.windows(); }catch(e){}
  for(var w=0; w<wins.length && w<3; w++){ walk(wins[w], 0); }
  var appName=''; try{ appName = proc.name(); }catch(e){}
  return JSON.stringify({ app: appName, elements: out });
}`;

let scriptPath = null;
function ensureScript() {
  if (scriptPath && fs.existsSync(scriptPath)) return scriptPath;
  scriptPath = path.join(os.tmpdir(), 'jarvis-axtree.js');
  fs.writeFileSync(scriptPath, JXA, 'utf8');
  return scriptPath;
}

/** Read the frontmost app's actionable elements. */
function elements() {
  return new Promise((resolve) => {
    if (!isMac) return resolve({ ok: false, error: 'Accessibility tree is macOS-only.' });
    let file;
    try {
      file = ensureScript();
    } catch (e) {
      return resolve({ ok: false, error: e.message });
    }
    execFile('osascript', ['-l', 'JavaScript', file], { timeout: 8000, maxBuffer: 4 * 1024 * 1024 }, (err, out, errOut) => {
      if (err) return resolve({ ok: false, error: String(errOut || err.message).slice(0, 200) });
      try {
        const d = JSON.parse(String(out || '{}'));
        resolve({ ok: true, app: d.app || '', elements: Array.isArray(d.elements) ? d.elements : [] });
      } catch {
        resolve({ ok: false, error: 'Could not read the accessibility tree.' });
      }
    });
  });
}

/** Fuzzy-find the best actionable element matching `label`. */
function match(elements, label) {
  const q = String(label || '').toLowerCase().trim();
  if (!q || !Array.isArray(elements)) return null;
  let best = null;
  let bestScore = 0;
  for (const el of elements) {
    const l = String(el.label || '').toLowerCase();
    if (!l) continue;
    let score = 0;
    if (l === q) score = 100;
    else if (l.includes(q)) score = 60 + Math.max(0, 20 - Math.abs(l.length - q.length));
    else if (q.includes(l) && l.length > 2) score = 40;
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return bestScore >= 40 ? best : null;
}

module.exports = { elements, match };
