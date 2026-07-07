'use strict';

/* Renders the JARVIS widget over a faux desktop and screenshots a few states. */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, 'preview-shots');
const WIDGET = 'file://' + path.join(__dirname, '..', 'renderer', 'widget.html');

function mock() {
  return `
    const noop = () => {};
    window.__agentCbs = [];
    window.assistant = {
      openDashboard: noop, hideWidget: noop, quitApp: noop,
      summaryCounts: async () => ({ skills: 3, workflows: 1, running: false, watching: false }),
      onWidgetSummon: noop, onFocusTab: noop, onToggleRecord: noop,
      collapseWidget: noop, onWidgetCollapsed: noop,
      onWatchEvent: (cb) => { window.__watchCb = cb; },
      command: async () => ({ action: 'reply', message: 'ok' }),
      execute: async () => ({ status: 'done' }),
      workflows: { run: async () => ({ status: 'done' }) },
      stop: async () => ({}), confirm: async () => ({}),
      onAgentEvent: (cb) => window.__agentCbs.push(cb),
    };
    window.__emit = (e) => window.__agentCbs.forEach((cb) => cb(e));
  `;
}

// A faux desktop so the transparent widget is shown in context.
const DESKTOP = `data:text/html,${encodeURIComponent(`
<html><body style="margin:0;height:100vh;background:
  radial-gradient(1200px 800px at 20% 10%, #23304d, #0c1018 60%);
  font-family:-apple-system,sans-serif;color:#7f8ba3;overflow:hidden">
  <div style="position:absolute;top:40px;left:60px;width:520px;height:340px;
    background:#151b28;border:1px solid #263043;border-radius:12px;padding:18px">
    <div style="height:12px;width:140px;background:#2b3purple;border-radius:4px"></div>
    <div style="margin-top:14px;height:10px;width:70%;background:#222c3d;border-radius:3px"></div>
    <div style="margin-top:8px;height:10px;width:55%;background:#222c3d;border-radius:3px"></div>
    <div style="margin-top:8px;height:10px;width:62%;background:#222c3d;border-radius:3px"></div>
  </div>
  <div style="position:absolute;bottom:24px;left:60px;font-size:13px;opacity:.5">Your work — the assistant floats on top</div>
</body></html>`)}`;

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 380, height: 540 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(mock());
  await page.goto(WIDGET);
  await page.waitForTimeout(600); // let the orb animate a few frames

  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'w1-idle.png'), omitBackground: true });
  console.log('  ✓ w1-idle.png');

  // running state with a live feed
  await page.evaluate(() => {
    window.__emit({ type: 'started', goal: 'File my weekly status report' });
    window.__emit({ type: 'thinking', text: 'I can see Google Drive. Opening the template.' });
    window.__emit({ type: 'action', detail: 'left_click @ (512, 210)' });
    window.__emit({ type: 'action', detail: 'type "Weekly status — July"' });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'w2-running.png'), omitBackground: true });
  console.log('  ✓ w2-running.png');

  // approval state
  await page.evaluate(() => {
    window.__emit({ type: 'permission', summary: 'About to send an email to the team', risk: 'high' });
    window.__emit({ type: 'confirm-request', id: 'x1', summary: 'Send the weekly report email to team@company.com', risk: 'high' });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'w3-approval.png'), omitBackground: true });
  console.log('  ✓ w3-approval.png');

  // collapsed floating-orb mini-mode (with REC indicator active)
  const mini = await ctx.newPage();
  await mini.setViewportSize({ width: 140, height: 140 });
  await mini.addInitScript(mock());
  await mini.goto(WIDGET);
  await mini.waitForTimeout(300);
  await mini.evaluate(() => document.body.classList.add('collapsed'));
  await mini.waitForTimeout(500);
  await mini.screenshot({ path: path.join(OUT, 'w4-mini.png'), omitBackground: true });
  console.log('  ✓ w4-mini.png');

  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
