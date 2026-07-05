'use strict';

/**
 * Dependency-free smoke tests for the pure modules (no Electron, no network).
 * Run with: npm test
 *
 * These guard the logic that packaging and refactors most easily break:
 * persistence, config resolution, workflow step resolution, and the watch
 * buffer's bounds. The model calls and OS input are integration-tested by
 * launching the real app (see SHIPPING.md).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sa-test-'));
let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log('  ✓ ' + name);
}

async function main() {

// --- SkillStore ---
const { SkillStore } = require('../lib/skills');
await test('SkillStore add/list/get/remove persists', () => {
  const file = path.join(tmp, 'skills.json');
  const s = new SkillStore(file);
  const added = s.add({ id: 'a1', name: 'Test skill', steps: ['x'], frames: ['f'], created_at: 'now' });
  assert.strictEqual(added.name, 'Test skill');
  assert.strictEqual(added.frame_count, 1, 'summary should not leak frame data but count it');
  const reloaded = new SkillStore(file); // survives restart
  assert.strictEqual(reloaded.list().length, 1);
  assert.ok(reloaded.get('a1'));
  assert.strictEqual(reloaded.remove('a1'), true);
  assert.strictEqual(new SkillStore(file).list().length, 0);
});

// --- WorkflowStore ---
const { WorkflowStore } = require('../lib/workflows');
await test('WorkflowStore resolveSteps flags missing skills, keeps goals', () => {
  const skills = new SkillStore(path.join(tmp, 'skills2.json'));
  skills.add({ id: 's1', name: 'Open mail', steps: [], frames: [], created_at: 'now' });
  const wfs = new WorkflowStore(path.join(tmp, 'wf.json'));
  wfs.add({
    id: 'w1',
    name: 'Routine',
    steps: [
      { type: 'skill', skill_id: 's1' },
      { type: 'skill', skill_id: 'missing' },
      { type: 'goal', goal: 'take a screenshot' },
    ],
    created_at: 'now',
  });
  const { runnable, missing } = wfs.resolveSteps('w1', skills);
  assert.strictEqual(runnable.length, 2, 'valid skill + goal are runnable');
  assert.deepStrictEqual(missing, ['missing']);
  assert.strictEqual(runnable[0].goal, 'Open mail');
  assert.strictEqual(runnable[1].skill, null);
});

// --- config resolution order ---
const config = require('../lib/config');
await test('config resolves saved > env > default', () => {
  config.init(tmp);
  assert.strictEqual(config.getModel(), 'claude-sonnet-5', 'default when nothing set');
  process.env.ANTHROPIC_MODEL = 'env-model';
  assert.strictEqual(config.getModel(), 'env-model', 'env beats default');
  config.update({ model: 'saved-model' });
  assert.strictEqual(config.getModel(), 'saved-model', 'saved beats env');
  assert.strictEqual(config.getComputerUseModel(), 'saved-model', 'CU model falls back to model');
  delete process.env.ANTHROPIC_MODEL;
});

await test('config stores API key and reports a storage mode', () => {
  config.init(fs.mkdtempSync(path.join(os.tmpdir(), 'sa-key-')));
  assert.strictEqual(config.snapshot().hasKey, false);
  config.update({ apiKey: 'sk-ant-test' });
  assert.strictEqual(config.getApiKey(), 'sk-ant-test');
  assert.ok(['encrypted', 'plaintext'].includes(config.snapshot().keyStorageMode));
});

// --- WatchBuffer bounds ---
const { WatchBuffer } = require('../lib/monitor');
await test('WatchBuffer respects maxFrames and recent()', async () => {
  let n = 0;
  const wb = new WatchBuffer({
    capture: async () => ({ dataUrl: 'data:image/png;base64,' + n++, width: 100, height: 100 }),
    maxFrames: 3,
  });
  wb.active = true; // simulate a running buffer without spinning up timers
  for (let i = 0; i < 5; i++) await wb._tick();
  assert.strictEqual(wb.status().count, 3, 'buffer capped at maxFrames');
  assert.strictEqual(wb.recent(2).length, 2);
  wb.stop();
  assert.strictEqual(wb.status().count, 0, 'buffer dropped on stop (privacy)');
});

  console.log(`\n${passed} test(s) passed.`);
}

main().catch((err) => {
  console.error('\n✗ ' + (err && err.message ? err.message : err));
  process.exit(1);
});
