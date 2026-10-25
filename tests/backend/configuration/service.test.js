import test from 'node:test';
import assert from 'node:assert/strict';
import { createConfiguration } from '../../../src/backend/configuration/service.js';
import { createGateway } from '../../../src/backend/gateway/gateway.js';
import { emptyRecord, rule, sender, envelope } from '../../harness/fixtures.js';
function fixture(initial = null) {
  let stored = structuredClone(initial);
  const controls = { readFails: false, writeFails: false, partialWrite: false, locked: false, granted: true, writes: 0, catalog: { normalStoreId: 'firefox-default', containers: [{ cookieStoreId: 'firefox-container-1', name: 'Work', color: 'blue', icon: 'briefcase' }] } };
  const adapter = {
    async readConfigurationRecord() { if (controls.readFails) throw Error('read'); return structuredClone(stored); },
    async writeConfigurationRecord(record) { controls.writes++; if (controls.partialWrite) stored = structuredClone(record); if (controls.writeFails) throw Error('write'); stored = structuredClone(record); },
    async getCatalog() { return structuredClone(controls.catalog); },
    async getAccess() { return { granted: controls.granted, available: true }; },
    classifyHost: host => ({ host, kind: 'dns', knownSuffix: host === 'com', baseDomain: host })
  };
  const events = [];
  const configuration = createConfiguration({ adapter, emit: type => events.push(type), isLocked: () => controls.locked });
  const dispatch = createGateway({ extensionId: sender.id, baseURL: 'moz-extension://test/', handlers: configuration.handlers });
  const save = (rules = [rule()], expectedRevision = configuration.view().revision, extras = {}) => dispatch(envelope('saveConfiguration', { rules, protectedContainerRefs: [], inactiveDecisions: [], ...extras }, expectedRevision), sender);
  return { configuration, controls, events, adapter, save, read: () => structuredClone(stored), replace: value => { stored = structuredClone(value); } };
}
test('CFG-A01 confirmed first install writes empty protection; unexpected absence requires recovery', async () => {
  const fx = fixture();
  await fx.configuration.initialize();
  assert.equal(fx.configuration.view().configurationStatus, 'missing');
  assert.equal(fx.controls.writes, 0);
  assert.ok(fx.configuration.view().recoveryToken);
  await fx.configuration.initialize({ firstInstall: true });
  assert.deepEqual(fx.configuration.view().configuration, { rules: [], protectedContainerRefs: [] });
  assert.equal(fx.configuration.view().revision, 0);
  assert.equal(fx.read().containerBindings.length, 1);
});
test('CFG-A02 invalid settings block mutation, retain observed state and supply recovery choices', async () => {
  const fx = fixture({ invalid: true });
  await fx.configuration.initialize({ firstInstall: true });
  assert.equal(fx.configuration.view().configurationStatus, 'invalid');
  assert.equal((await fx.save()).error.code, 'INVALID_REQUEST');
  assert.throws(() => fx.configuration.assertRevision(0), { code: 'CONFIGURATION_UNAVAILABLE' });
  assert.equal(fx.controls.writes, 0);
  assert.ok(fx.configuration.view().stores.some(store => store.kind === 'container'));
});
test('CFG-A03/ARCH-A05 concurrent public saves commit once and reject stale revision', async () => {
  const fx = fixture(emptyRecord()); await fx.configuration.initialize();
  const results = await Promise.all([fx.save([rule({ name: 'one' })], 0), fx.save([rule({ name: 'two' })], 0)]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.find(result => !result.ok).error.code, 'REVISION_CONFLICT');
  assert.equal(fx.read().revision, 1);
  assert.equal(fx.read().rules.length, 1);
});
test('CFG-A04 storage failure preserves confirmed protection; ambiguous partial write blocks actions', async () => {
  const fx = fixture(emptyRecord()); await fx.configuration.initialize();
  const original = fx.configuration.readConfiguration().record;
  fx.controls.writeFails = true;
  assert.equal((await fx.save()).error.code, 'STORAGE_FAILED');
  assert.deepEqual(fx.configuration.readConfiguration().record, original);
  fx.controls.partialWrite = true;
  assert.equal((await fx.save()).error.code, 'STORAGE_FAILED');
  assert.equal(fx.configuration.view().configurationStatus, 'unreadable');
  assert.equal(fx.configuration.view().configuration, null);
});
test('CFG-A05 renaming retains binding; delete and recreate same name yields a new unprotected reference', async () => {
  const fx = fixture(emptyRecord()); await fx.configuration.initialize();
  const ref = fx.configuration.view().stores.find(store => store.kind === 'container').ref;
  assert.equal((await fx.save([rule({ scope: { type: 'selected', storeRefs: [ref] } })], 0, { protectedContainerRefs: [ref] })).ok, true);
  fx.controls.catalog.containers[0].name = 'Office';
  await fx.configuration.reconcileCatalog(fx.controls.catalog);
  assert.equal(fx.configuration.view().stores.find(store => store.ref === ref).label, 'Office');
  assert.equal(fx.configuration.view().revision, 1);
  fx.controls.catalog.containers = [];
  await fx.configuration.reconcileCatalog(fx.controls.catalog);
  fx.controls.catalog.containers = [{ cookieStoreId: 'firefox-container-2', name: 'Office', color: 'blue', icon: 'briefcase' }];
  await fx.configuration.reconcileCatalog(fx.controls.catalog);
  const stores = fx.configuration.view().stores;
  assert.equal(stores.find(store => store.ref === ref).availability, 'inactive');
  const recreated = stores.find(store => store.kind === 'container' && store.availability === 'available');
  assert.notEqual(recreated.ref, ref); assert.equal(recreated.protected, false);
  assert.deepEqual(fx.configuration.view().configuration.rules[0].scope.storeRefs, [ref]);
});
test('CFG-A06 invalid large draft leaves settings unchanged', async () => {
  const fx = fixture(emptyRecord()); await fx.configuration.initialize();
  const before = fx.read();
  const response = await fx.save([rule({ name: 'x'.repeat(4097) })]);
  assert.equal(response.error.code, 'VALIDATION_FAILED'); assert.deepEqual(fx.read(), before);
});
test('CFG-A07 update initialization retains saved protection', async () => {
  const fx = fixture({ ...emptyRecord(), rules: [rule()] }); await fx.configuration.initialize();
  const before = fx.read(); await fx.configuration.initialize();
  assert.deepEqual(fx.read(), before); assert.equal(fx.configuration.view().revision, 0);
});
test('CFG-A08 recovery requires current token, complete valid candidate and readable storage', async () => {
  const fx = fixture({ invalid: true }); await fx.configuration.initialize();
  const current = fx.configuration.readConfiguration();
  const candidate = { ...emptyRecord(), containerBindings: current.recoveryBindings, rules: [rule()] };
  await assert.rejects(fx.configuration.commitConfiguration({ expectedRevision: null, expectedCatalogGeneration: current.catalogGeneration, candidate, recoveryToken: 'wrong' }), { code: 'STALE_IMPORT' });
  const result = await fx.configuration.commitConfiguration({ expectedRevision: null, expectedCatalogGeneration: current.catalogGeneration, candidate, recoveryToken: current.recoveryToken });
  assert.equal(result.record.revision, 1); assert.equal(fx.configuration.view().recoveryToken, null);
  const blocked = fixture({ invalid: true }); await blocked.configuration.initialize();
  const recovery = blocked.configuration.readConfiguration(); blocked.controls.readFails = true;
  await assert.rejects(blocked.configuration.commitConfiguration({ expectedRevision: null, expectedCatalogGeneration: recovery.catalogGeneration, candidate, recoveryToken: recovery.recoveryToken }), { code: 'CONFIGURATION_UNAVAILABLE' });
  assert.equal(blocked.controls.writes, 0); assert.equal(blocked.configuration.view().recoveryToken, null);
});
test('ARCH-13/CFG-17 active operation and missing permission reject saves', async () => {
  const fx = fixture(emptyRecord()); await fx.configuration.initialize();
  fx.controls.locked = true;
  assert.equal((await fx.save()).error.code, 'OPERATION_ACTIVE');
  fx.controls.locked = false; fx.controls.granted = false;
  assert.equal((await fx.save()).error.code, 'PERMISSION_REQUIRED');
});
test('unchanged catalog refresh emits no invalidation; locked catalog reconciliation does not change scope', async () => {
  const fx = fixture(emptyRecord()); await fx.configuration.initialize();
  const before = fx.events.length;
  await fx.configuration.reconcileCatalog(fx.controls.catalog);
  assert.equal(fx.events.length, before);
  fx.controls.locked = true; fx.controls.catalog.containers = [];
  await fx.configuration.reconcileCatalog(fx.controls.catalog);
  assert.equal(fx.configuration.view().stores.find(store => store.kind === 'container').availability, 'available');
});
test('CFG-20 explicit inactive mapping unions selected scopes and whole-container protection', async () => {
  const fx = fixture({ ...emptyRecord(), containerBindings: [{ ref: 'old', cookieStoreId: null, name: 'Old Work', color: 'red', icon: 'briefcase', state: 'inactive' }], rules: [rule({ scope: { type: 'selected', storeRefs: ['old'] } })], protectedContainerRefs: ['old'] });
  await fx.configuration.initialize();
  const target = fx.configuration.view().stores.find(store => store.kind === 'container' && store.availability === 'available').ref;
  const response = await fx.save(fx.configuration.view().configuration.rules, 0, { protectedContainerRefs: ['old'], inactiveDecisions: [{ ref: 'old', action: 'map', targetRef: target }] });
  assert.equal(response.ok, true);
  assert.deepEqual(fx.read().rules[0].scope.storeRefs, [target]);
  assert.deepEqual(fx.read().protectedContainerRefs, [target]);
  assert.ok(!fx.read().containerBindings.some(binding => binding.ref === 'old'));
});
test('CFG-20 inactive removal refuses orphaned selected scope and then accepts explicit rule removal', async () => {
  const fx = fixture({ ...emptyRecord(), containerBindings: [{ ref: 'old', cookieStoreId: null, name: 'Old Work', color: 'red', icon: 'briefcase', state: 'inactive' }], rules: [rule({ scope: { type: 'selected', storeRefs: ['old'] } })] });
  await fx.configuration.initialize();
  const inactiveDecisions = [{ ref: 'old', action: 'remove' }];
  assert.equal((await fx.save(fx.configuration.view().configuration.rules, 0, { inactiveDecisions })).error.code, 'VALIDATION_FAILED');
  assert.equal((await fx.save([], 0, { inactiveDecisions })).ok, true);
  assert.ok(!fx.read().containerBindings.some(binding => binding.ref === 'old'));
});
test('verifyConfiguration blocks native settings disappearance, corruption, read failure and changed protection', async () => {
  for (const mode of ['missing', 'invalid', 'readFailure', 'changed']) {
    const fx = fixture(emptyRecord()); await fx.configuration.initialize();
    if (mode === 'missing') fx.replace(null);
    if (mode === 'invalid') fx.replace({ invalid: true });
    if (mode === 'readFailure') fx.controls.readFails = true;
    if (mode === 'changed') fx.replace({ ...fx.read(), rules: [rule()] });
    await assert.rejects(fx.configuration.runExclusive(() => fx.configuration.verifyConfiguration()), { code: mode === 'changed' ? 'REVISION_CONFLICT' : 'CONFIGURATION_UNAVAILABLE' });
    assert.ok(fx.events.includes('configuration'));
    if (mode !== 'changed') assert.equal(fx.configuration.readConfiguration().record, null);
  }
});
test('verifyConfiguration cannot adopt externally changed settings during a locked operation', async () => {
  const fx = fixture(emptyRecord()); await fx.configuration.initialize();
  const before = fx.read();
  await fx.configuration.verifyConfiguration();
  fx.controls.locked = true;
  fx.replace({ ...before, rules: [rule()] });
  await assert.rejects(fx.configuration.verifyConfiguration(), { code: 'CONFIGURATION_UNAVAILABLE' });
  assert.equal(fx.configuration.view().configurationStatus, 'unreadable');
  assert.equal(fx.configuration.view().configuration, null);
  fx.controls.locked = false;
  await fx.configuration.initialize();
  assert.deepEqual(fx.configuration.view().configuration.rules, [rule()]);
});
test('configuration commit rechecks catalog, access and native record after asynchronous domain validation', async () => {
  for (const mode of ['catalog', 'permission', 'record']) {
    const fx = fixture(emptyRecord()); await fx.configuration.initialize();
    const original = fx.read();
    let injected = false;
    fx.adapter.classifyHost = async host => {
      if (!injected) {
        injected = true;
        if (mode === 'catalog') fx.controls.catalog.containers[0].name = 'Renamed while validating';
        if (mode === 'permission') fx.controls.granted = false;
        if (mode === 'record') fx.replace({ ...original, revision: 1, rules: [rule({ name: 'other' })] });
      }
      return { host, kind: 'dns', knownSuffix: false, baseDomain: host };
    };
    const response = await fx.save([rule()], 0);
    assert.equal(response.ok, false);
    assert.equal(response.error.code, mode === 'catalog' ? 'STALE_IMPORT' : mode === 'permission' ? 'PERMISSION_REQUIRED' : 'REVISION_CONFLICT');
    if (mode !== 'record') assert.equal(fx.read().rules.length, 0);
    else assert.equal(fx.read().rules[0].name, 'other');
  }
});
test('final beforeWrite context validation runs inside mutation queue and prevents stale-context commit', async () => {
  const fx = fixture(emptyRecord()); await fx.configuration.initialize();
  const state = fx.configuration.readConfiguration();
  const before = fx.read();
  let release;
  let entered;
  const contextStarted = new Promise(resolve => { entered = resolve; });
  const pause = new Promise(resolve => { release = resolve; });
  const changing = fx.configuration.commitConfiguration({ expectedRevision: 0, expectedCatalogGeneration: state.catalogGeneration, candidate: { ...state.record, rules: [rule()] }, beforeWrite: async () => {
    entered(); await pause;
    const error = new Error('The captured page changed.'); error.code = 'STALE_SITE_CONTEXT'; throw error;
  } });
  await contextStarted;
  const otherSave = fx.save([rule({ name: 'other' })], 0);
  assert.deepEqual(fx.read(), before);
  release();
  await assert.rejects(changing, { code: 'STALE_SITE_CONTEXT' });
  assert.equal((await otherSave).ok, true);
  assert.equal(fx.read().revision, 1);
  assert.equal(fx.read().rules[0].name, 'other');
});
test('queued reconciliation checks the operation lock before reading or adopting native settings', async () => {
  const fx = fixture(emptyRecord()); await fx.configuration.initialize();
  const original = fx.configuration.readConfiguration();
  let release;
  let entered;
  const queueStarted = new Promise(resolve => { entered = resolve; });
  const pause = new Promise(resolve => { release = resolve; });
  const acceptance = fx.configuration.runExclusive(async () => { entered(); await pause; fx.controls.locked = true; });
  await queueStarted;
  let nativeReads = 0;
  const read = fx.adapter.readConfigurationRecord;
  fx.adapter.readConfigurationRecord = async () => { nativeReads++; return read(); };
  const queued = fx.configuration.reconcileCatalog(fx.controls.catalog);
  fx.replace({ ...fx.read(), rules: [rule()] });
  release();
  await acceptance;
  assert.equal(await queued, false);
  assert.equal(nativeReads, 0);
  assert.deepEqual(fx.configuration.readConfiguration(), original);
  await assert.rejects(fx.configuration.verifyConfiguration(), { code: 'CONFIGURATION_UNAVAILABLE' });
  assert.equal(nativeReads, 1);
});
test('native protection change at unchanged revision invalidates configuration handles exactly once on reconciliation', async () => {
  const fx = fixture(emptyRecord()); await fx.configuration.initialize();
  const generation = fx.configuration.readConfiguration().catalogGeneration;
  const initialEvents = fx.events.length;
  fx.replace({ ...fx.read(), rules: [rule()] });
  await fx.configuration.reconcileCatalog(fx.controls.catalog);
  assert.deepEqual(fx.events.slice(initialEvents), ['configuration']);
  assert.equal(fx.configuration.view().revision, 0);
  assert.equal(fx.configuration.readConfiguration().catalogGeneration, generation);
  assert.deepEqual(fx.configuration.view().configuration.rules, [rule()]);
  const afterChange = fx.events.length;
  await fx.configuration.reconcileCatalog(fx.controls.catalog);
  assert.equal(fx.events.length, afterChange);
});
test('native availability status changes emit invalidation once, including read failure and recovery', async () => {
  const fx = fixture(emptyRecord()); await fx.configuration.initialize();
  const initialEvents = fx.events.length;
  fx.controls.readFails = true;
  await fx.configuration.reconcileCatalog(fx.controls.catalog);
  assert.deepEqual(fx.events.slice(initialEvents), ['configuration']);
  await fx.configuration.reconcileCatalog(fx.controls.catalog);
  assert.equal(fx.events.length, initialEvents + 1);
  fx.controls.readFails = false;
  await fx.configuration.reconcileCatalog(fx.controls.catalog);
  assert.deepEqual(fx.events.slice(initialEvents), ['configuration', 'configuration']);
});
test('a save cannot overwrite newly observed external protection even when its native revision is unchanged', async () => {
  const fx = fixture(emptyRecord()); await fx.configuration.initialize();
  const externallyChanged = { ...fx.read(), rules: [rule({ name: 'external' })] };
  fx.replace(externallyChanged);
  const response = await fx.save([rule({ name: 'draft' })], 0);
  assert.equal(response.error.code, 'REVISION_CONFLICT');
  assert.deepEqual(fx.read(), externallyChanged);
});
