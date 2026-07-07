'use strict';

/**
 * Visual preview generator. Renders the REAL renderer/index.html in headless
 * Chromium with a mocked `window.assistant` backend so every screen fills with
 * realistic data, then screenshots each view into scripts/preview-shots/.
 *
 * This is a dev/documentation tool, not part of the shipped app.
 * Run: node scripts/preview.js
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = path.join(__dirname, 'preview-shots');
const RENDERER = 'file://' + path.join(__dirname, '..', 'renderer', 'index.html');

// A tiny 1x1-ish gradient JPEG data URL used as a fake screen frame.
const FAKE_FRAME =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="150">
       <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
         <stop offset="0" stop-color="#2a3350"/><stop offset="1" stop-color="#141826"/>
       </linearGradient></defs>
       <rect width="240" height="150" fill="url(#g)"/>
       <rect x="16" y="16" width="208" height="24" rx="5" fill="#3a4568" opacity="0.5"/>
       <rect x="16" y="52" width="150" height="12" rx="3" fill="#5b8cff" opacity="0.7"/>
       <rect x="16" y="72" width="120" height="12" rx="3" fill="#8b93a3" opacity="0.5"/>
     </svg>`
  ).toString('base64');

const SKILLS = [
  {
    id: 's1',
    name: 'File my weekly status report',
    description: "Duplicates the report template, fills in this week's numbers, and emails it to the team.",
    steps: ['Open Google Drive and duplicate the “Weekly Report” template', 'Fill in metrics from the dashboard', 'Compose an email to the team and attach it', 'Send'],
    trigger_phrases: ['file my report', 'weekly status'],
    app_context: 'Google Drive + Gmail',
    note: 'Always CC my manager.',
    created_at: '2026-07-06',
    frame_count: 8,
  },
  {
    id: 's2',
    name: 'Triage my inbox',
    description: 'Labels newsletters, archives receipts, and flags anything that needs a reply.',
    steps: ['Open Gmail', 'Apply “Newsletter” label to bulk senders', 'Archive receipts', 'Star messages that mention me directly'],
    trigger_phrases: ['triage inbox', 'clean up email'],
    app_context: 'Gmail',
    note: '',
    created_at: '2026-07-06',
    frame_count: 6,
  },
  {
    id: 's3',
    name: 'Start my focus session',
    description: 'Closes distracting apps, opens the task board, and starts a timer.',
    steps: ['Quit Slack and Messages', 'Open the task board', 'Start a 50-minute timer'],
    trigger_phrases: ['focus mode', 'start focus'],
    app_context: 'Desktop',
    note: '',
    created_at: '2026-07-06',
    frame_count: 5,
  },
];

const WORKFLOWS = [
  {
    id: 'w1',
    name: 'Monday morning startup',
    description: 'Everything I do to start the week.',
    steps: [
      { type: 'skill', skill_id: 's2' },
      { type: 'goal', goal: 'Open the team dashboard and take a screenshot' },
      { type: 'skill', skill_id: 's1' },
    ],
    created_at: '2026-07-06',
  },
];

/** The mock injected as window.assistant before the renderer's app.js runs. */
function mockScript(hasKey) {
  return `
    window.__hasKey = ${hasKey};
    const noop = () => {};
    const frame = ${JSON.stringify(FAKE_FRAME)};
    window.assistant = {
      captureFrame: async () => frame,
      skills: {
        list: async () => ${JSON.stringify(SKILLS)},
        get: async (id) => (${JSON.stringify(SKILLS)}).find(s => s.id === id) || null,
        save: async () => ({}),
        remove: async () => true,
      },
      workflows: {
        list: async () => ${JSON.stringify(WORKFLOWS)},
        get: async (id) => (${JSON.stringify(WORKFLOWS)}).find(w => w.id === id) || null,
        save: async () => ({}), remove: async () => true, run: async () => ({ status: 'done' }),
      },
      chat: async () => ({ reply: 'That matches your “File my weekly report” skill. Want me to run it?', proposed_skill_id: 's1' }),
      command: async () => ({ action: 'reply', message: 'ok' }),
      plan: async () => ({ skill: { id: 's1', name: 'File my weekly report' }, plan: ['Open Drive', 'Duplicate template', 'Fill metrics', 'Send email'], risk_level: 'medium', risks: ['Sends an email to the team'], needs_clarification: [] }),
      execute: async () => ({ status: 'done' }),
      stop: async () => ({ stopped: true }),
      confirm: async () => ({ ok: true }),
      onAgentEvent: noop,
      plan: async () => ({ skill: { id: 's1', name: 'File my weekly report' }, plan: ['Open Drive', 'Duplicate the template', 'Fill in this week’s metrics', 'Compose and send the email'], risk_level: 'medium', risks: ['This sends an email to your team'], needs_clarification: [] }),
      configInfo: async () => ({ hasKey: ${hasKey}, model: 'claude-sonnet-5', canControl: true, keyStorageMode: 'encrypted', maxSteps: 40, confirmEvery: false, platform: 'darwin', isWayland: false }),
      settings: {
        get: async () => ({ hasKey: ${hasKey}, keyStorageMode: 'encrypted', model: 'claude-sonnet-5', computerUseModel: 'claude-sonnet-5', maxSteps: 40, confirmEvery: false }),
        update: async () => ({}), testKey: async () => ({ ok: true }),
      },
      watch: {
        start: async () => ({ active: true, paused: false, count: 3, maxFrames: 40, latest: frame }),
        stop: async () => ({ active: false, paused: false, count: 0, maxFrames: 40, latest: null }),
        pause: async () => ({}), resume: async () => ({}),
        status: async () => ({ active: false, paused: false, count: 0, maxFrames: 40, latest: null }),
        recent: async () => [frame, frame, frame],
      },
      onWatchEvent: noop,
      onToggleRecord: noop,
    };
  `;
}

async function shoot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name + '.png') });
  console.log('  ✓ ' + name + '.png');
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1120, height: 820 }, deviceScaleFactor: 2 });

  // --- Main app (key present) ---
  const page = await context.newPage();
  await page.addInitScript(mockScript(true));
  await page.goto(RENDERER);
  await page.waitForTimeout(400);

  await shoot(page, '1-teach');

  await page.click('.tab[data-tab="watch"]');
  await page.waitForTimeout(200);
  await shoot(page, '2-watch');

  await page.click('.tab[data-tab="skills"]');
  await page.waitForTimeout(300);
  // open the first skill card
  await page.click('#skills-list .skill-head');
  await page.waitForTimeout(150);
  await shoot(page, '3-skills');

  await page.click('.tab[data-tab="workflows"]');
  await page.waitForTimeout(300);
  await shoot(page, '4-workflows');

  await page.click('.tab[data-tab="assistant"]');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    document.getElementById('chat-log').innerHTML =
      '<div class="msg user">File my weekly report</div>' +
      '<div class="msg assistant">That matches your “File my weekly status report” skill. Want me to run it?<br><button class="primary run-btn">Review plan</button></div>' +
      '<div class="msg user">🎙 start my monday routine</div>' +
      '<div class="msg assistant">Running workflow: Monday morning startup</div>';
  });
  await shoot(page, '5-assistant');

  // Settings modal
  await page.click('#btn-settings');
  await page.waitForTimeout(200);
  await shoot(page, '6-settings');
  await page.click('#set-cancel');

  // Live run overlay + approval gate
  await page.evaluate(() => {
    document.getElementById('run-overlay').classList.remove('hidden');
    document.getElementById('run-status').textContent = '● running';
    document.getElementById('run-status').className = 'run-status running';
    document.getElementById('run-goal').textContent = 'File my weekly status report';
    const log = document.getElementById('run-log');
    log.innerHTML =
      '<div class="run-line info">Starting — the assistant now controls your mouse &amp; keyboard.</div>' +
      '<div class="run-line think">🧠 I can see Google Drive. Opening the report template.</div>' +
      '<div class="run-line action">➤ left_click @ (512, 210)</div>' +
      '<div class="run-line action">➤ type "Weekly status — July"</div>' +
      '<div class="run-line perm">⏸ needs approval (high): About to send an email to the team</div>';
    const box = document.getElementById('confirm-box');
    box.classList.remove('hidden');
    document.getElementById('confirm-msg').innerHTML =
      '<strong class="risk-high">Approval needed (high risk)</strong><br>Send the weekly report email to team@company.com';
  });
  await page.waitForTimeout(150);
  await shoot(page, '7-run-and-approval');

  // --- Onboarding (fresh install, no key) ---
  const page2 = await context.newPage();
  await page2.addInitScript(mockScript(false));
  await page2.goto(RENDERER);
  await page2.waitForTimeout(400);
  await shoot(page2, '8-onboarding');

  await browser.close();
  console.log('\nWrote screenshots to ' + OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
