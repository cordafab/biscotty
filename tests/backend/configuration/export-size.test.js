import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../../../src/backend/gateway/application.js';
import { createClient } from '../../../src/backend/client/client.js';
import { exportPortable, validatePortable, parsePortableText } from '../../../src/core/transfer/index.js';
import { createTestAdapter, cookie } from '../../harness/adapter.js';
import { sizedRecord } from '../../harness/size-fixtures.js';
const limit = 2 * 1024 * 1024;
const binding = { ref: 'work', cookieStoreId: 'firefox-container-1', name: 'Work', color: 'blue', icon: 'briefcase', state: 'active' };
const catalog = { normalStoreId: 'firefox-default', containers: [{ cookieStoreId: binding.cookieStoreId, name: binding.name, color: binding.color, icon: binding.icon }] };
async function fixture(record, currentCatalog = { normalStoreId: 'firefox-default', containers: [] }) {
  const adapter = createTestAdapter({ record, catalog: currentCatalog, cookies: { 'firefox-default': [cookie()] } });
  adapter.setTab({ cookieStoreId: 'firefox-default', url: 'https://example.com/path' });
  const app = createApplication(adapter, { extensionId: 'size@test', baseURL: 'moz-extension://size/' });
  await app.ready();
  const client = createClient({ send: request => app.dispatch(request, { id: 'size@test', url: 'moz-extension://size/src/frontend/options.html', documentId: 'size-test' }) });
  return { adapter, client };
}
const save = (client, record, revision) => client.saveConfiguration({ rules: record.rules, protectedContainerRefs: record.protectedContainerRefs, inactiveDecisions: [] }, revision);

test('CFG-A09 public saves accept the exact portable limit and reject one additional byte atomically', async () => {
  const { client, adapter } = await fixture({ schemaVersion: 1, revision: 0, rules: [], protectedContainerRefs: [], containerBindings: [] });
  await save(client, sizedRecord(limit), 0);
  const before = adapter.storedRecord;
  const text = (await client.prepareExport({}, 1)).text;
  assert.equal(Buffer.byteLength(text), limit);
  await assert.rejects(save(client, sizedRecord(limit + 1), 1), { code: 'VALIDATION_FAILED' });
  assert.deepEqual(adapter.storedRecord, before);
  assert.deepEqual((await client.getState()).exportStatus, { bytes: limit, limitBytes: limit, canExport: true });
});

test('CFG-A09 popup shortcut and domain-rule saves cannot bypass the portable limit', async () => {
  const largeBinding = { ...binding, name: 'w'.repeat(1000) };
  const { client, adapter } = await fixture(sizedRecord(limit - 1, { containerBindings: [largeBinding] }), { ...catalog, containers: [{ ...catalog.containers[0], name: largeBinding.name }] });
  const state = await client.getState();
  const context = await client.getSiteContext({ windowId: 1 });
  const before = adapter.storedRecord;
  await assert.rejects(client.setSiteProtection({ contextToken: context.contextToken, enabled: true }, state.revision), { code: 'VALIDATION_FAILED' });
  const snapshot = await client.getSiteCookieDomains({ contextToken: context.contextToken });
  await assert.rejects(client.saveSiteRule({ domainToken: snapshot.domains[0].domainToken, ruleIndex: null, rule: { domain: 'example.com', includeSubdomains: false, name: null, path: null, scope: { type: 'selected', storeRefs: ['normal'] } } }, state.revision), { code: 'VALIDATION_FAILED' });
  assert.deepEqual(adapter.storedRecord, before);
});

test('CFG-A10 legacy portable size excess stays valid, protected, and editable for reduction', async () => {
  const record = sizedRecord(limit + 100, { containerBindings: [binding], protectedContainerRefs: ['work'] });
  const { client, adapter } = await fixture(record, catalog);
  const state = await client.getState();
  assert.equal(state.configurationStatus, 'valid');
  assert.equal(state.capabilities.canChangeProtection, true);
  assert.deepEqual(state.exportStatus, { bytes: limit + 100, limitBytes: limit, canExport: false });
  assert.deepEqual(state.configuration.protectedContainerRefs, ['work']);
  await assert.rejects(client.prepareExport({}, state.revision), { code: 'VALIDATION_FAILED' });
  await save(client, { ...record, rules: [] }, state.revision);
  assert.equal((await client.getState()).exportStatus.canExport, true);
  assert.deepEqual(adapter.storedRecord.protectedContainerRefs, ['work']);
});

for (const change of ['rename', 'addition']) test(`CFG-A10 native container ${change} reports portable excess without losing protection or editing access`, async () => {
  const record = sizedRecord(limit - 10, { containerBindings: [binding], protectedContainerRefs: ['work'] });
  const { client, adapter } = await fixture(record, catalog);
  assert.equal((await client.getState()).exportStatus.canExport, true);
  const changedCatalog = { ...catalog, containers: change === 'rename' ? [{ ...catalog.containers[0], name: 'x'.repeat(300) }] : [...catalog.containers, { ...catalog.containers[0], cookieStoreId: 'firefox-container-2', name: 'New container' }] };
  adapter.setCatalog(changedCatalog);
  const state = await client.getState();
  assert.equal(state.configurationStatus, 'valid');
  assert.equal(state.capabilities.canChangeProtection, true);
  assert.equal(state.exportStatus.canExport, false);
  assert.deepEqual(state.configuration.protectedContainerRefs, ['work']);
  assert.equal(state.revision, record.revision);
  await save(client, { ...record, rules: [] }, state.revision);
  assert.equal((await client.getState()).exportStatus.canExport, true);
  for (const native of changedCatalog.containers) assert.equal(adapter.storedRecord.containerBindings.find(binding => binding.cookieStoreId === native.cookieStoreId).name, native.name);
});

test('XFER-A16 conflict resolution checks the full portable result before presenting a committable preview', async () => {
  const record = sizedRecord(limit - 1000);
  const { client, adapter } = await fixture(record);
  const source = { format: 'biscotty-config', schemaVersion: 1, rules: [{ ...record.rules[0], scope: { type: 'selected', storeRefs: ['normal'] } }], protectedContainerRefs: [], containers: [{ ref: 'incoming', name: 'x'.repeat(4096), color: 'blue', icon: 'briefcase', state: 'inactive' }] };
  const inspected = await client.inspectImport({ text: JSON.stringify(source), mode: 'merge' }, 0);
  const plan = await client.planImport({ importHandle: inspected.importHandle, mode: 'merge', mappings: [{ sourceRef: 'incoming', action: 'retain' }] }, 0);
  assert.equal(plan.canCommit, false);
  assert.equal(plan.conflicts.length, 1);
  const before = adapter.storedRecord;
  await assert.rejects(client.resolveImport({ planToken: plan.planToken, decisions: [{ conflictId: plan.conflicts[0].id, choice: 'existing' }], acknowledgments: {} }, 0), { code: 'VALIDATION_FAILED' });
  assert.deepEqual(adapter.storedRecord, before);
  await assert.rejects(client.commitImport({ planToken: plan.planToken }, 0), { code: 'UNRESOLVED_CONFLICTS' });
});

test('XFER-A16 a fitting source cannot make an oversized Merge result ready or change settings', async () => {
  const { client, adapter } = await fixture(sizedRecord(limit - 1000));
  const source = { format: 'biscotty-config', schemaVersion: 1, rules: [], protectedContainerRefs: [], containers: [{ ref: 'incoming', name: 'x'.repeat(4096), color: 'blue', icon: 'briefcase', state: 'inactive' }] };
  const text = JSON.stringify(source);
  assert.ok(Buffer.byteLength(text) < limit);
  const inspected = await client.inspectImport({ text, mode: 'merge' }, 0);
  const before = adapter.storedRecord;
  await assert.rejects(client.planImport({ importHandle: inspected.importHandle, mode: 'merge', mappings: [{ sourceRef: 'incoming', action: 'retain' }] }, 0), { code: 'VALIDATION_FAILED' });
  assert.deepEqual(adapter.storedRecord, before);
  assert.ok(Buffer.byteLength(JSON.stringify(exportPortable(before))) < limit);
  assert.equal(validatePortable(parsePortableText(text), {}).containers.length, 1);
});
