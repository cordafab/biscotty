import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservations } from '../../../src/backend/firefox/observations.js';

test('CSI-A07/A08 startup clears legacy observations and never reads or writes them', async () => {
  let listener, cleared = 0;
  const adapter = {
    onSiteActivity(fn) { listener = fn; },
    async clearSiteObservation() { cleared++; },
    async readSiteObservations() { throw new Error('must not read'); },
    async writeSiteObservations() { throw new Error('must not write'); }
  };
  const tracker = createObservations({ adapter });
  await tracker.ready;
  const before = await tracker.get({ id: 1 });
  listener({ kind: 'request', tabId: 1, frameId: 0, host: 'private.example' });
  assert.deepEqual(await tracker.get({ id: 1 }), before);
  assert.equal(cleared, 1);
});
test('CSI-A06 top-level navigation and bounded eviction invalidate generations', async () => {
  let listener;
  const tracker = createObservations({ adapter: { onSiteActivity(fn) { listener = fn; }, async clearSiteObservation() {} }, limits: { tabs: 1 } });
  await tracker.ready;
  const tab = { id: 1 };
  const original = await tracker.get(tab);
  listener({ kind: 'committed', tabId: 1, frameId: 1 });
  assert.deepEqual(await tracker.get(tab), original);
  listener({ kind: 'beforeNavigate', tabId: 1, frameId: 0 });
  const navigated = await tracker.get(tab);
  assert.notEqual(navigated.generation, original.generation);
  await tracker.get({ id: 2 });
  assert.notEqual((await tracker.get(tab)).generation, navigated.generation);
});
test('CSI-A08 failed legacy cleanup cannot restore or rewrite observations', async () => {
  let writes = 0, failed = true;
  const tracker = createObservations({ adapter: { onSiteActivity() {}, async clearSiteObservation() { if (failed) throw new Error('failure'); }, async writeSiteObservations() { writes++; } } });
  await tracker.ready;
  await assert.rejects(tracker.get({ id: 1 }));
  failed = false;
  assert.equal(typeof (await tracker.get({ id: 1 })).generation, 'string');
  assert.equal(writes, 0);
});
