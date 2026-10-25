import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfiguration } from '../../../src/backend/configuration/service.js';
import { createTransfer } from '../../../src/backend/transfer/service.js';
import { createHandles } from '../../../src/backend/gateway/handles.js';
import { createGateway } from '../../../src/backend/gateway/gateway.js';
import { createClient } from '../../../src/backend/client/client.js';
const source = (overrides = {}) => ({ format: 'biscotty-config', schemaVersion: 1, containers: [{ ref: 'src', name: 'Work', color: 'blue', icon: 'briefcase', state: 'active' }], protectedContainerRefs: [], rules: [{ domain: 'example.com', includeSubdomains: true, name: '', path: null, scope: { type: 'selected', storeRefs: ['src'] } }], ...overrides });
async function fixture({ stored = null, firstInstall = true } = {}) {
  let saved = structuredClone(stored), locked = false, writeFailure = false, factGate = null;
  let access = { granted: true, available: true, reason: '' };
  let catalog = { normalStoreId: 'firefox-default', containers: [{ cookieStoreId: 'firefox-container-destination', name: 'Work', color: 'blue', icon: 'briefcase' }] };
  const adapter = {
    readConfigurationRecord: async () => structuredClone(saved),
    writeConfigurationRecord: async candidate => { if (writeFailure) throw new Error('native storage failure'); saved = structuredClone(candidate); },
    getCatalog: async () => structuredClone(catalog),
    getAccess: async () => structuredClone(access),
    classifyHost: async host => {
      if (factGate) { const gate = factGate; factGate = null; gate.enter(); await gate.pending; }
      return { host, kind: 'dns', knownSuffix: host === 'com', baseDomain: host };
    }
  };
  const configuration = createConfiguration({ adapter, isLocked: () => locked });
  await configuration.initialize({ firstInstall });
  const handles = createHandles();
  const transfer = createTransfer({ adapter, configuration, handles, isLocked: () => locked });
  const sender = { id: 'test', url: 'moz-extension://test/src/frontend/options.html' };
  const gateway = createGateway({ extensionId: 'test', baseURL: 'moz-extension://test/', handlers: { ...transfer.handlers, ...configuration.handlers } });
  const client = createClient({ send: request => gateway(request, sender) });
  return { client, configuration, gateway, sender, handles, pauseFacts() {
    let enter, release;
    const entered = new Promise(resolve => { enter = resolve; });
    const pending = new Promise(resolve => { release = resolve; });
    factGate = { enter, pending };
    return { entered, release };
  }, get saved() { return saved; }, setLocked: value => { locked = value; }, setWriteFailure: value => { writeFailure = value; }, changeCatalog: value => { catalog = value; }, changeAccess: value => { access = value; } };
}
async function stage(f, { mode = 'merge', input = source(), recoveryToken } = {}) {
  const revision = recoveryToken ? null : f.configuration.view().revision;
  const extra = recoveryToken ? { recoveryToken } : {};
  const inspected = await f.client.inspectImport({ text: JSON.stringify(input), mode, ...extra }, revision);
  const destination = f.configuration.view().stores.find(store => store.kind === 'container');
  const plan = await f.client.planImport({ importHandle: inspected.importHandle, mode, mappings: input.containers.map(container => ({ sourceRef: container.ref, action: 'map', targetRef: destination.ref })), ...extra }, revision);
  return { ...plan, inspected, revision, extra };
}
test('XFER-A01 A02 A12 public actions export portable data and commit one destination record', async () => {
  const f = await fixture();
  const plan = await stage(f);
  assert.equal(plan.canCommit, true);
  const result = await f.client.commitImport({ planToken: plan.planToken }, plan.revision);
  assert.equal(result.revision, 1);
  assert.equal(f.saved.rules[0].name, '');
  assert.equal(f.saved.containerBindings[0].cookieStoreId, 'firefox-container-destination');
  const exported = await f.client.prepareExport({}, 1);
  assert.equal(exported.filename, 'biscotty-configuration.json');
  assert.equal(exported.text.includes('firefox-container-destination'), false);
  assert.equal(exported.text.includes(f.saved.containerBindings[0].ref), false);
  await assert.rejects(f.client.commitImport({ planToken: plan.planToken }, 1), { code: 'STALE_IMPORT' });
});
test('XFER-A08 changing mode invalidates previous token and resets every conflict decision', async () => {
  const f = await fixture();
  const initial = await stage(f);
  const replacement = await f.client.planImport({ importHandle: initial.inspected.importHandle, mode: 'replace', mappings: [{ sourceRef: 'src', action: 'retain' }] }, initial.revision);
  await assert.rejects(f.client.commitImport({ planToken: initial.planToken }, initial.revision), { code: 'STALE_IMPORT' });
  assert.equal(replacement.canCommit, false);
  const ready = await f.client.resolveImport({ planToken: replacement.planToken, decisions: [], acknowledgments: { replace: true } }, initial.revision);
  assert.equal(ready.canCommit, true);
  await f.client.commitImport({ planToken: ready.planToken }, initial.revision);
  assert.equal(f.saved.containerBindings.filter(binding => binding.state === 'inactive').length, 1);
});
test('XFER-A08 invalid new mapping also invalidates previously resolved plan', async () => {
  const f = await fixture(); const plan = await stage(f);
  await assert.rejects(f.client.planImport({ importHandle: plan.inspected.importHandle, mode: 'merge', mappings: [] }, plan.revision), { code: 'UNRESOLVED_CONFLICTS' });
  await assert.rejects(f.client.commitImport({ planToken: plan.planToken }, plan.revision), { code: 'STALE_IMPORT' });
});
test('XFER-A09 public invalid import changes no settings and cancellation commits nothing', async () => {
  const f = await fixture(); const before = structuredClone(f.saved);
  for (const text of ['{', JSON.stringify(source({ injected: true })), 'x'.repeat(2 * 1024 * 1024 + 1)]) {
    await assert.rejects(f.client.inspectImport({ text, mode: 'merge' }, 0));
    assert.deepEqual(f.saved, before);
  }
  await stage(f); assert.deepEqual(f.saved, before);
});
test('XFER-A11 active burn and concurrent revision prevent commits', async () => {
  const f = await fixture(); const plan = await stage(f);
  f.setLocked(true);
  await assert.rejects(f.client.commitImport({ planToken: plan.planToken }, 0), { code: 'OPERATION_ACTIVE' });
  f.setLocked(false);
  await f.client.saveConfiguration({ rules: [], protectedContainerRefs: [], inactiveDecisions: [] }, 0);
  await assert.rejects(f.client.commitImport({ planToken: plan.planToken }, 0), { code: 'REVISION_CONFLICT' });
  assert.equal(f.saved.rules.length, 0);
});
test('XFER-A11 changed native catalog or access rejects staged work', async () => {
  const f = await fixture(); const plan = await stage(f);
  f.changeAccess({ granted: false, available: true, reason: 'PERMISSION_REQUIRED' });
  await assert.rejects(f.client.commitImport({ planToken: plan.planToken }, 0), { code: 'STALE_IMPORT' });
  const g = await fixture(); const other = await stage(g);
  g.changeCatalog({ normalStoreId: 'firefox-default', containers: [] });
  await assert.rejects(g.client.commitImport({ planToken: other.planToken }, 0), { code: 'STALE_IMPORT' });
});
test('XFER-28 failed storage preserves previous saved protection', async () => {
  const f = await fixture(); const plan = await stage(f); const before = structuredClone(f.saved);
  f.setWriteFailure(true);
  await assert.rejects(f.client.commitImport({ planToken: plan.planToken }, 0), { code: 'STORAGE_FAILED' });
  assert.deepEqual(f.saved, before); assert.deepEqual(f.configuration.readConfiguration().record, before);
});
test('CFG-A08 restricted recovery requires Replace, full mapping and explicit acknowledgment', async () => {
  const f = await fixture({ firstInstall: false });
  const recoveryToken = f.configuration.view().recoveryToken;
  assert.ok(recoveryToken);
  await assert.rejects(f.client.inspectImport({ text: JSON.stringify(source()), mode: 'merge', recoveryToken }, null), { code: 'CONFIGURATION_UNAVAILABLE' });
  const plan = await stage(f, { mode: 'replace', recoveryToken });
  assert.equal(plan.canCommit, false);
  assert.match(plan.preview.recoveryWarning, /Previous protection is unknown/);
  await assert.rejects(f.client.commitImport({ planToken: plan.planToken, recoveryToken }, null), { code: 'UNRESOLVED_CONFLICTS' });
  const resolved = await f.client.resolveImport({ planToken: plan.planToken, decisions: [], acknowledgments: { replace: true, recovery: true }, recoveryToken }, null);
  assert.equal(resolved.canCommit, true);
  const result = await f.client.commitImport({ planToken: resolved.planToken, recoveryToken }, null);
  assert.equal(result.revision, 1); assert.equal(f.configuration.view().configurationStatus, 'valid');
});
test('ARCH-10 import handles are creator-bound', async () => {
  const f = await fixture(); const plan = await stage(f);
  const otherPage = createClient({ send: request => f.gateway(request, { ...f.sender, url: 'moz-extension://test/src/frontend/popup.html' }) });
  await assert.rejects(otherPage.commitImport({ planToken: plan.planToken }, 0), { code: 'STALE_IMPORT' });
});
for (const phase of ['inspect', 'plan', 'resolve', 'commit']) test(`XFER-A11 environment invalidation during pending ${phase} never resurrects handles`, async () => {
  const f = await fixture();
  let inspected, plan;
  if (phase !== 'inspect') inspected = await f.client.inspectImport({ text: JSON.stringify(source()), mode: 'merge' }, 0);
  const mappings = [{ sourceRef: 'src', action: 'map', targetRef: f.configuration.view().stores.find(store => store.kind === 'container').ref }];
  if (phase === 'resolve' || phase === 'commit') plan = await f.client.planImport({ importHandle: inspected.importHandle, mode: 'merge', mappings }, 0);
  const gate = f.pauseFacts();
  const pending = phase === 'inspect' ? f.client.inspectImport({ text: JSON.stringify(source()), mode: 'merge' }, 0)
    : phase === 'plan' ? f.client.planImport({ importHandle: inspected.importHandle, mode: 'merge', mappings }, 0)
      : phase === 'resolve' ? f.client.resolveImport({ planToken: plan.planToken, decisions: [] }, 0)
        : f.client.commitImport({ planToken: plan.planToken }, 0);
  await gate.entered;
  // The environment can return to the same grants/catalog while the old handle remains invalid.
  f.changeAccess({ granted: false, available: true, reason: 'PERMISSION_REQUIRED' });
  f.handles.invalidate('import'); f.handles.invalidate('importPlan');
  f.changeAccess({ granted: true, available: true, reason: '' });
  gate.release();
  await assert.rejects(pending, { code: 'STALE_IMPORT' });
  assert.equal(f.saved.rules.length, 0);
});
test('XFER-A08 concurrent plan requests leave only the newest plan usable', async () => {
  const f = await fixture();
  const inspected = await f.client.inspectImport({ text: JSON.stringify(source()), mode: 'merge' }, 0);
  const mappings = [{ sourceRef: 'src', action: 'map', targetRef: f.configuration.view().stores.find(store => store.kind === 'container').ref }];
  const gate = f.pauseFacts();
  const first = f.client.planImport({ importHandle: inspected.importHandle, mode: 'merge', mappings }, 0);
  await gate.entered;
  const second = await f.client.planImport({ importHandle: inspected.importHandle, mode: 'replace', mappings }, 0);
  gate.release();
  await assert.rejects(first, { code: 'STALE_IMPORT' });
  const final = await f.client.resolveImport({ planToken: second.planToken, decisions: [], acknowledgments: { replace: true } }, 0);
  assert.equal(final.canCommit, true);
});
test('CFG-A08 replacement acknowledgment alone cannot authorize unknown-protection recovery', async () => {
  const f = await fixture({ firstInstall: false });
  const recoveryToken = f.configuration.view().recoveryToken;
  const plan = await stage(f, { mode: 'replace', recoveryToken });
  const resolved = await f.client.resolveImport({ planToken: plan.planToken, decisions: [], acknowledgments: { replace: true }, recoveryToken }, null);
  assert.equal(resolved.canCommit, false);
  await assert.rejects(f.client.commitImport({ planToken: resolved.planToken, recoveryToken }, null), { code: 'UNRESOLVED_CONFLICTS' });
  assert.equal(f.saved, null);
});
test('CFG-A06 public import accepts a valid file below 2 MiB even when wire escaping exceeds that size', async () => {
  const f = await fixture();
  const input = source({ rules: Array.from({ length: 10000 }, (_, index) => ({ domain: 'example.com', includeSubdomains: true, name: `${'"'.repeat(40)}${index}`, path: null, scope: { type: 'all' } })) });
  const text = JSON.stringify(input);
  assert.ok(new TextEncoder().encode(text).length < 2 * 1024 * 1024);
  assert.ok(new TextEncoder().encode(JSON.stringify({ text })).length > 2 * 1024 * 1024 + 65536);
  const inspected = await f.client.inspectImport({ text, mode: 'merge' }, 0);
  assert.equal(inspected.containers.length, 1);
  assert.equal(f.saved.rules.length, 0);
});
