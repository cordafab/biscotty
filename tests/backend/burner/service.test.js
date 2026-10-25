import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../../../src/backend/gateway/application.js';
import { createTestAdapter, cookie } from '../../harness/adapter.js';
import { envelope, sender, rule } from '../../harness/fixtures.js';
async function setup(options) {
  const adapter = createTestAdapter(options);
  const app = createApplication(adapter, { extensionId: sender.id, baseURL: 'moz-extension://test/' });
  await app.ready();
  const request = async (action, payload = {}, revision = app.configuration.view().revision) => app.dispatch(envelope(action, payload, revision), sender);
  const state = () => request('getState');
  return { adapter, app, request, state };
}
const removes = adapter => adapter.calls.filter(call => call.type === 'remove');
for (const boundary of ['result', 'marker']) test(`BURN-A18 cancellation during terminal ${boundary} persistence preserves a dismissible result`, async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie()] } });
  let release, enter;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { enter = resolve; });
  const method = boundary === 'result' ? 'writeCurrentOperation' : 'clearMarker';
  const original = s.adapter[method];
  s.adapter[method] = async value => {
    if (boundary === 'marker' || value.state === 'completed') { enter(); await gate; }
    return original(value);
  };
  const preview = await s.request('previewBurn');
  const started = await s.request('startBurn', { previewToken: preview.data.previewToken });
  await entered;
  const pendingCancellation = s.request('cancelBurn', { operationId: started.data.operationId });
  await new Promise(resolve => setImmediate(resolve));
  release();
  const cancellation = await pendingCancellation;
  await s.app.burner.waitForIdle();
  assert.equal(cancellation.ok, false);
  assert.equal(cancellation.error.code, 'INVALID_REQUEST');
  assert.equal(s.app.burner.view().state, 'completed');
  assert.equal(s.adapter.operation.state, 'completed');
  assert.equal(s.adapter.marker, null);
  assert.equal((await s.request('dismissOperation', { operationId: started.data.operationId })).ok, true);
  assert.equal((await s.state()).data.operation, null);
});
test('BURN-A01/A02/A03 all supported stores and partitions; protected containers skipped', async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie(), cookie({ name: 'p', partitionKey: { topLevelSite: 'https://first.test', hasCrossSiteAncestor: true }, firstPartyDomain: 'first.test', session: false })], 'firefox-container-4': [cookie()], 'firefox-container-9': [cookie()] } });
  const { record, catalogGeneration } = s.app.configuration.readConfiguration();
  record.protectedContainerRefs = [record.containerBindings[0].ref];
  await s.app.configuration.commitConfiguration({ expectedRevision: 0, expectedCatalogGeneration: catalogGeneration, candidate: record });
  const p = await s.request('previewBurn'); assert.equal(p.ok, true); assert.equal(p.data.eligibleAttempts, 3); assert.equal(p.data.skippedStores.length, 1);
  assert.equal(s.adapter.calls.some(call => call.type === 'list' && call.storeId === 'firefox-container-4'), false);
  assert.equal((await s.request('startBurn', { previewToken: p.data.previewToken })).ok, true);
  await s.app.burner.waitForIdle();
  assert.equal(removes(s.adapter).length, 3);
  assert.deepEqual(removes(s.adapter)[1].partitionKey, { topLevelSite: 'https://first.test', hasCrossSiteAncestor: true });
  assert.equal(s.adapter.marker, null);
});
test('BURN-A04/A05 future protected parent/path identities prevent selector calls', async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie({ domain: 'shop.example.com', path: '/account/data' }), cookie({ name: 'safe' })] } });
  const { record, catalogGeneration } = s.app.configuration.readConfiguration();
  record.rules = [rule({ name: 'session', path: '/account', includeSubdomains: false })];
  await s.app.configuration.commitConfiguration({ expectedRevision: 0, expectedCatalogGeneration: catalogGeneration, candidate: record });
  const p = await s.request('previewBurn'); assert.equal(p.data.eligibleAttempts, 1); assert.equal(p.data.ambiguous, 1);
  await s.request('startBurn', { previewToken: p.data.previewToken }); await s.app.burner.waitForIdle();
  assert.equal(removes(s.adapter)[0].name, 'safe');
});
test('BURN-A06 catalog, permission and settings changes invalidate preview', async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie()] } });
  let p = await s.request('previewBurn');
  await s.state(); // An unchanged state refresh must preserve the confirmation.
  assert.equal((await s.request('startBurn', { previewToken: p.data.previewToken })).ok, true); await s.app.burner.waitForIdle();
  p = await s.request('previewBurn'); s.adapter.setAccess({ granted: false });
  assert.equal((await s.request('startBurn', { previewToken: p.data.previewToken })).ok, false);
});
test('BURN-A07/A08/A15/ARCH-A07 popup independence, cancellation and concurrent starts', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const s = await setup({ cookies: { 'firefox-default': [cookie(), cookie({ name: 'second' })] }, remove: async () => { await pending; return { removed: true }; } });
  const p = await s.request('previewBurn');
  const results = await Promise.all([s.request('startBurn', { previewToken: p.data.previewToken }), s.request('startBurn', { previewToken: p.data.previewToken })]);
  assert.equal(results.filter(result => result.ok).length, 1);
  while (!removes(s.adapter).length) await new Promise(resolve => setTimeout(resolve, 1));
  const current = (await s.state()).data.operation;
  assert.equal(current.state, 'running');
  await s.request('cancelBurn', { operationId: current.id }); release(); await s.app.burner.waitForIdle();
  assert.equal(removes(s.adapter).length, 1); assert.equal(s.app.burner.view().state, 'canceled'); assert.equal(s.app.burner.view().unattemptedCalls, 1);
});
test('BURN-A09/A12/A13/A17 bounded repeated selectors and accurate results', async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie(), cookie({ hostOnly: false }), cookie({ name: 'third' }), cookie({ path: '/a%2Fb' })] }, remove: (_, n) => { if (n === 1) throw new Error('synthetic'); return n === 2 ? null : { removed: true }; } });
  const p = await s.request('previewBurn'); assert.equal(p.data.eligibleAttempts, 3); assert.equal(p.data.ambiguous, 1);
  await s.request('startBurn', { previewToken: p.data.previewToken }); s.adapter.cookies['firefox-default'].push(cookie({ name: 'new' })); await s.app.burner.waitForIdle();
  const operation = s.app.burner.view(); assert.equal(operation.state, 'partial'); assert.equal(operation.attemptedCalls, 3); assert.equal(operation.removedCalls, 1); assert.equal(operation.notFoundCalls, 1); assert.equal(operation.errors, 1); assert.equal(removes(s.adapter).length, 3);
});
test('BURN-A10/A11 interruption, marker failures, cleanup failure prevent new execution', async () => {
  const interrupted = await setup({ marker: 'old-operation' }); assert.equal(interrupted.app.burner.view().state, 'interrupted'); assert.equal(interrupted.app.burner.view().removedCalls, null);
  assert.equal((await interrupted.request('previewBurn')).error.code, 'OPERATION_ACTIVE');
  await interrupted.request('dismissOperation', { operationId: 'old-operation' }); assert.equal(interrupted.adapter.marker, null);
  const s = await setup({ cookies: { 'firefox-default': [cookie()] } });
  const p = await s.request('previewBurn'); s.adapter.faults.marker = true;
  assert.equal((await s.request('startBurn', { previewToken: p.data.previewToken })).error.code, 'STORAGE_FAILED'); assert.equal(removes(s.adapter).length, 0); assert.equal(s.app.burner.isLocked(), true);
  const t = await setup({ cookies: { 'firefox-default': [cookie()] } }); const q = await t.request('previewBurn'); t.adapter.faults.cleanup = true;
  await t.request('startBurn', { previewToken: q.data.previewToken }); await t.app.burner.waitForIdle(); assert.equal(t.app.burner.isLocked(), true); assert.equal(t.app.burner.view().reason, 'CLEANUP_FAILED');
});
for (const startupMethod of ['readMarker', 'readCurrentOperation', 'writeCurrentOperation']) {
  test(`BURN-A10/A11 startup ${startupMethod} failure permits dismissal only after confirmed cleanup`, async () => {
    const adapter = createTestAdapter({ marker: 'old-operation', cookies: { 'firefox-default': [cookie()] } });
    const failStorage = async () => { throw new Error('synthetic storage failure'); };
    const original = adapter[startupMethod];
    adapter[startupMethod] = failStorage;
    const app = createApplication(adapter, { extensionId: sender.id, baseURL: 'moz-extension://test/' });
    await app.ready();
    adapter[startupMethod] = original;
    const request = (action, payload = {}) => app.dispatch(envelope(action, payload, app.configuration.view().revision), sender);
    const initial = (await request('getState')).data;
    assert.equal(initial.operation.state, 'interrupted');
    assert.equal(initial.operation.reason, 'STORAGE_FAILED');
    assert.equal(initial.capabilities.canBurn, false);
    assert.equal(initial.capabilities.canChangeProtection, false);
    for (const cleanupMethod of ['clearMarker', 'clearCurrentOperation']) {
      const cleanup = adapter[cleanupMethod];
      adapter[cleanupMethod] = failStorage;
      const failed = await request('dismissOperation', { operationId: initial.operation.id });
      assert.equal(failed.error.code, 'INTERNAL_FAILURE');
      assert.equal(app.burner.isLocked(), true);
      assert.equal((await request('getState')).data.operation.id, initial.operation.id);
      assert.equal((await request('previewBurn')).error.code, 'OPERATION_ACTIVE');
      adapter[cleanupMethod] = cleanup;
    }
    assert.equal((await request('dismissOperation', { operationId: initial.operation.id })).ok, true);
    const recovered = (await request('getState')).data;
    assert.equal(recovered.operation, null);
    assert.equal(recovered.capabilities.canBurn, true);
    assert.equal(recovered.capabilities.canChangeProtection, true);
    assert.equal(adapter.marker, null);
    assert.equal(adapter.operation, null);
    assert.equal((await request('previewBurn')).ok, true);
    assert.equal(removes(adapter).length, 0);
  });
}
test('BURN-A14 dismiss removes the single current result; no local history', async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie()] } }); const p = await s.request('previewBurn');
  await s.request('startBurn', { previewToken: p.data.previewToken }); await s.app.burner.waitForIdle();
  await s.request('dismissOperation', { operationId: s.app.burner.view().id }); assert.equal(s.adapter.operation, null); assert.equal(s.adapter.marker, null); assert.equal(s.app.burner.view(), null);
});
test('BURN-A16 lost host access after first call stops further native calls', async () => {
  let adapter;
  const s = await setup({ cookies: { 'firefox-default': [cookie(), cookie({ name: 'second' })] }, remove: () => { adapter.setAccess({ granted: false }); return { removed: true }; } }); adapter = s.adapter;
  const p = await s.request('previewBurn'); await s.request('startBurn', { previewToken: p.data.previewToken }); await s.app.burner.waitForIdle();
  assert.equal(removes(adapter).length, 1); assert.equal(s.app.burner.view().state, 'partial'); assert.equal(s.app.burner.view().unattemptedCalls, 1);
});
test('BURN-A11 dismissal cannot clear a marker while start is being accepted', async () => {
  let releaseView, releaseRemove;
  const viewGate = new Promise(resolve => { releaseView = resolve; });
  const removeGate = new Promise(resolve => { releaseRemove = resolve; });
  const s = await setup({ cookies: { 'firefox-default': [cookie()] }, remove: async () => { await removeGate; return { removed: true }; } });
  const original = s.adapter.writeCurrentOperation;
  s.adapter.writeCurrentOperation = async value => { if (value.state === 'running') await viewGate; return original(value); };
  const p = await s.request('previewBurn');
  const start = s.request('startBurn', { previewToken: p.data.previewToken });
  while (!s.app.burner.view()) await new Promise(resolve => setTimeout(resolve, 1));
  const dismiss = s.request('dismissOperation', { operationId: s.app.burner.view().id });
  releaseView(); assert.equal((await start).ok, true); assert.equal((await dismiss).error.code, 'OPERATION_ACTIVE');
  assert.ok(s.adapter.marker); releaseRemove(); await s.app.burner.waitForIdle();
});
test('BURN-A08/A24 session writes preserve cancellation then terminal ordering', async () => {
  let releaseRemove, releaseCancel;
  const removeGate = new Promise(resolve => { releaseRemove = resolve; });
  const cancelGate = new Promise(resolve => { releaseCancel = resolve; });
  const s = await setup({ cookies: { 'firefox-default': [cookie(), cookie({ name: 'later' })] }, remove: async () => { await removeGate; return { removed: true }; } });
  const original = s.adapter.writeCurrentOperation;
  s.adapter.writeCurrentOperation = async value => { if (value.state === 'cancel_requested') await cancelGate; return original(value); };
  const p = await s.request('previewBurn'); await s.request('startBurn', { previewToken: p.data.previewToken });
  while (!removes(s.adapter).length) await new Promise(resolve => setTimeout(resolve, 1));
  const cancel = s.request('cancelBurn', { operationId: s.app.burner.view().id });
  while (s.app.burner.view().state !== 'cancel_requested') await new Promise(resolve => setTimeout(resolve, 1));
  releaseRemove(); await new Promise(resolve => setTimeout(resolve, 5)); releaseCancel(); await cancel; await s.app.burner.waitForIdle();
  assert.equal(s.adapter.operation.state, 'canceled'); assert.equal(removes(s.adapter).length, 1);
});
test('BURN-19 missing settings after preview or during execution stop deletion', async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie()] } }); const p = await s.request('previewBurn'); s.adapter.setRecord(null);
  assert.equal((await s.request('startBurn', { previewToken: p.data.previewToken })).error.code, 'CONFIGURATION_UNAVAILABLE'); assert.equal(removes(s.adapter).length, 0);
  let adapter;
  const t = await setup({ cookies: { 'firefox-default': [cookie(), cookie({ name: 'second' })] }, remove: () => { adapter.setRecord(null); return { removed: true }; } }); adapter = t.adapter;
  const q = await t.request('previewBurn'); await t.request('startBurn', { previewToken: q.data.previewToken }); await t.app.burner.waitForIdle();
  assert.equal(removes(adapter).length, 1); assert.equal(t.app.burner.view().state, 'partial');
});
test('BURN-A06 same-revision native changes cannot reuse a preview after state refresh', async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie()] } });
  const preview = await s.request('previewBurn'); const changed = s.adapter.storedRecord;
  changed.rules = [rule()]; s.adapter.setRecord(changed); await s.state();
  const result = await s.request('startBurn', { previewToken: preview.data.previewToken });
  assert.equal(result.ok, false); assert.equal(removes(s.adapter).length, 0);
});
