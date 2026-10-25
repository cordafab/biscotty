import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../../src/backend/client/client.js';
import { createEditorModel, createPopupModel, createImportModel, siteStatus, operationTitle } from '../../src/frontend/models.js';
const rule = { domain: 'example.com', includeSubdomains: true, name: null, path: null, scope: { type: 'selected', storeRefs: ['work'] } };
function fixture() {
  const state = { configuration: { rules: [structuredClone(rule)], protectedContainerRefs: [] }, configurationStatus: 'valid', revision: 1, stores: [{ ref: 'normal', name: 'Normal browsing', kind: 'normal', availability: 'available' }, { ref: 'work', name: 'Work', kind: 'container', availability: 'available' }], capabilities: { canBurn: true, canReadCookies: true, canChangeProtection: true }, operation: null };
  let event;
  const calls = [];
  const handlers = {
    getState: () => structuredClone(state),
    getSiteContext: () => ({ contextToken: 'captured-site', target: { domain: 'example.com', includeSubdomains: true }, store: state.stores[1], status: 'full', reasons: ['Saved rule in Work'], controls: { canRemove: true } }),
    saveConfiguration(payload, request) {
      if (request.expectedRevision !== state.revision) throw Object.assign(new Error('Review newer saved settings.'), { code: 'REVISION_CONFLICT' });
      state.configuration = { rules: structuredClone(payload.rules), protectedContainerRefs: structuredClone(payload.protectedContainerRefs) };
      state.revision++;
      return { configuration: structuredClone(state.configuration), revision: state.revision };
    },
    previewBurn: () => ({ previewToken: 'bounded-preview', revision: state.revision, eligibleAttempts: 2, ruleProtected: 1, ambiguous: 0, stores: [state.stores[0]] }),
    startBurn: () => { state.operation = { id: 'operation', state: 'running' }; return { operationId: 'operation' }; },
    cancelBurn: () => { state.operation.state = 'cancel_requested'; return { state: 'cancel_requested' }; },
    dismissOperation: () => { state.operation = null; return {}; },
    setSiteProtection: () => ({ revision: state.revision }),
    inspectImport: () => ({ importHandle: 'inspection', containers: [{ ref: 'source', name: 'Work' }], mode: 'merge' }),
    planImport: () => ({ planToken: 'plan', conflicts: [{ id: 'scope-conflict', choices: ['existing', 'imported', 'combine'] }], unresolvedConflicts: ['scope-conflict'], canCommit: false, preview: {} }),
    resolveImport: () => ({ planToken: 'resolved-plan', conflicts: [], unresolvedConflicts: [], canCommit: true, preview: { rules: [rule] } }),
    commitImport: () => { state.revision++; return { configuration: state.configuration, revision: state.revision }; }
  };
  const client = createClient({
    async send(request) {
      calls.push(structuredClone(request));
      try { return { protocolVersion: 1, requestId: request.requestId, ok: true, data: await handlers[request.action](request.payload, request) }; }
      catch (error) { return { protocolVersion: 1, requestId: request.requestId, ok: false, error: { code: error.code, message: error.message } }; }
    },
    subscribe(listener) { event = listener; return () => { event = null; }; },
    windowContext: async () => ({ windowId: 4 })
  });
  return { client, state, calls, handlers, event: async () => { event?.({ type: 'stateChanged', sequence: 1 }); await new Promise(resolve => setTimeout(resolve, 0)); } };
}
test('UI-A09 draft changes do not call the backend; Cancel requires discard decision; Save commits once', async () => {
  const f = fixture(); const editor = createEditorModel(f.client); await editor.refresh();
  editor.edit(draft => draft.rules[0].domain = 'changed.example');
  assert.equal(f.state.configuration.rules[0].domain, 'example.com');
  assert.equal(f.calls.filter(call => call.action === 'saveConfiguration').length, 0);
  assert.equal(await editor.cancel(false), false); assert.equal(editor.dirty, true);
  await editor.cancel(true); assert.equal(editor.draft.rules[0].domain, 'example.com');
  editor.edit(draft => draft.rules[0].name = ''); await editor.save();
  assert.equal(f.state.configuration.rules[0].name, ''); assert.equal(editor.dirty, false); assert.equal(editor.baseRevision, 2);
});
test('UI-A10 UI-A31 concurrent saved changes preserve the draft and its original revision', async () => {
  const f = fixture(); const editor = createEditorModel(f.client); await editor.refresh(); editor.subscribe();
  editor.edit(draft => draft.rules[0].name = 'draft'); f.state.revision = 2; await f.event();
  assert.equal(editor.stale, true); assert.equal(editor.baseRevision, 1); assert.equal(editor.draft.rules[0].name, 'draft');
  await assert.rejects(editor.save(), { code: 'REVISION_CONFLICT' });
  assert.equal(editor.dirty, true); assert.equal(editor.draft.rules[0].name, 'draft');
});
test('UI-A10 active operation blocks editor changes and import application', async () => {
  const f = fixture(); const editor = createEditorModel(f.client); await editor.refresh();
  f.state.operation = { id: 'operation', state: 'running' }; await editor.refresh();
  assert.equal(editor.canEdit, false); assert.equal(editor.edit(draft => draft.rules = []), false);
  const importer = createImportModel(f.client, editor); importer.plan = { canCommit: true, planToken: 'x' };
  await assert.rejects(importer.apply(), /Resolve every decision/);
});
test('UI-A02 UI-A03 UI-A06 UI-A07 site labels use saved-policy response without inventory calls', async () => {
  const f = fixture(); const popup = createPopupModel(f.client);
  for (const status of ['full', 'partial', 'none', 'unavailable']) {
    f.handlers.getSiteContext = () => ({ status, controls: {}, reasons: [] }); await popup.refresh(); assert.equal(popup.site.status, status);
  }
  assert.equal(f.calls.some(call => call.action === 'getCookies'), false);
  assert.equal(siteStatus('full'), 'Fully protected'); assert.equal(siteStatus('partial'), 'Partly protected');
  assert.deepEqual(f.calls.find(call => call.action === 'getSiteContext').payload, { windowId: 4 });
});
test('UI-A04 UI-A05 UI-A08 quick protection sends only captured authorization and never retries a stale mutation', async () => {
  const f = fixture(); const popup = createPopupModel(f.client); await popup.refresh();
  await popup.protect(true); await popup.protect(false);
  const changes = f.calls.filter(call => call.action === 'setSiteProtection');
  assert.deepEqual(changes.map(call => call.payload), [{ contextToken: 'captured-site', enabled: true }, { contextToken: 'captured-site', enabled: false }]);
  f.handlers.setSiteProtection = () => { throw Object.assign(new Error('Refresh site context.'), { code: 'STALE_SITE_CONTEXT' }); };
  await assert.rejects(popup.protect(true), { code: 'STALE_SITE_CONTEXT' });
  assert.equal(f.calls.filter(call => call.action === 'setSiteProtection').length, 3);
});
test('UI-A01 UI-A13 preview requires separate confirmation; reopen recovers operation and Dismiss clears current result', async () => {
  const f = fixture(); const popup = createPopupModel(f.client); await popup.refresh();
  await popup.makePreview(); assert.equal(f.calls.some(call => call.action === 'startBurn'), false);
  popup.cancelPreview(); await popup.start(); assert.equal(f.calls.some(call => call.action === 'startBurn'), false);
  await popup.makePreview(); await popup.start(); assert.equal(popup.state.operation.state, 'running');
  const reopened = createPopupModel(f.client); await reopened.refresh(); assert.equal(reopened.state.operation.id, 'operation');
  await reopened.cancelBurn(); assert.equal(reopened.state.operation.state, 'cancel_requested');
  f.state.operation.state = 'canceled'; await reopened.refresh(); assert.equal(operationTitle(reopened.state.operation), 'Burn canceled');
  await reopened.dismiss(); assert.equal(reopened.state.operation, null);
});
test('UI-A12 import requires individual choices, uses refreshed plan tokens, and mode changes discard dependent decisions', async () => {
  const f = fixture(); const editor = createEditorModel(f.client); await editor.refresh(); const importer = createImportModel(f.client, editor);
  await importer.inspect('{"format":"fixture"}'); assert.equal(importer.mode, 'merge');
  await importer.planMappings([{ sourceRef: 'source', action: 'map', targetRef: 'work' }]);
  assert.deepEqual(importer.decisions, []); assert.equal(importer.plan.canCommit, false);
  await assert.rejects(importer.apply(), /Resolve every decision/);
  await importer.resolve([{ conflictId: 'scope-conflict', choice: 'combine' }], { replace: true });
  assert.equal(importer.plan.planToken, 'resolved-plan'); await importer.apply();
  assert.equal(f.calls.find(call => call.action === 'commitImport').payload.planToken, 'resolved-plan');
  await importer.inspect('{}', 'replace'); assert.equal(importer.mode, 'replace'); assert.equal(importer.plan, null); assert.deepEqual(importer.decisions, []);
});
test('UI recovery uses restricted Replace import and recovery token with null revision', async () => {
  const f = fixture(); f.state.configuration = null; f.state.revision = null; f.state.recoveryToken = 'recovery'; f.state.configurationStatus = 'invalid'; f.state.capabilities.canRecoverConfiguration = true;
  const editor = createEditorModel(f.client); await editor.refresh(); const importer = createImportModel(f.client, editor); await importer.inspect('{}', 'merge');
  assert.equal(importer.mode, 'replace');
  const request = f.calls.find(call => call.action === 'inspectImport'); assert.equal(request.expectedRevision, null); assert.equal(request.payload.recoveryToken, 'recovery');
});
function deferred() { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
test('QA-13 canceling preview preparation discards a late response and never starts deletion', async () => {
  const f = fixture(); const pending = deferred(); f.handlers.previewBurn = () => pending.promise;
  const popup = createPopupModel(f.client); await popup.refresh();
  const work = popup.makePreview(); assert.equal(popup.preparing, true);
  popup.cancelPreview(); assert.equal(popup.preparing, false);
  pending.resolve({ previewToken: 'late', revision: 1, eligibleAttempts: 10000 }); await work;
  assert.equal(popup.preview, null); await popup.start(); assert.equal(f.calls.some(call => call.action === 'startBurn'), false);
});
test('QA-13 canceling import validation discards its response and preserves the editor draft', async () => {
  const f = fixture(); const pending = deferred(); f.handlers.inspectImport = () => pending.promise;
  const editor = createEditorModel(f.client); await editor.refresh(); editor.edit(draft => draft.rules[0].name = 'unsaved');
  const importer = createImportModel(f.client, editor); const work = importer.inspect('{}'); assert.ok(importer.pending);
  importer.reset(); pending.resolve({ importHandle: 'late', containers: [] }); await work;
  assert.equal(importer.inspection, null); assert.equal(importer.pending, null); assert.equal(editor.dirty, true); assert.equal(editor.draft.rules[0].name, 'unsaved');
  assert.equal(f.calls.some(call => call.action === 'commitImport'), false);
});
test('QA-13 canceling import conflict calculation cannot restore the canceled plan', async () => {
  const f = fixture(); const pending = deferred(); f.handlers.planImport = () => pending.promise;
  const editor = createEditorModel(f.client); await editor.refresh(); const importer = createImportModel(f.client, editor); await importer.inspect('{}');
  const work = importer.planMappings([{ sourceRef: 'source', action: 'retain' }]); assert.ok(importer.pending);
  importer.reset(); pending.resolve({ planToken: 'late-plan', canCommit: true }); await work;
  assert.equal(importer.plan, null); assert.equal(importer.pending, null); assert.equal(f.calls.some(call => call.action === 'commitImport'), false);
});
test('UI stale catalog changes discard an unconfirmed preview even when revision is unchanged', async () => {
  const f = fixture(); f.state.catalogGeneration = 1; const popup = createPopupModel(f.client); await popup.refresh(); await popup.makePreview();
  f.state.catalogGeneration = 2; await popup.refresh(); assert.equal(popup.preview, null);
});
test('Inactive reference draft review shows resulting scopes, retained destination protection, and required manual removals', async () => {
  const { reviewInactiveDecision } = await import('../../src/frontend/models.js');
  const draft = { rules: [{ ...structuredClone(rule), scope: { type: 'selected', storeRefs: ['inactive', 'personal', 'work'] } }, { ...structuredClone(rule), scope: { type: 'selected', storeRefs: ['inactive'] } }], protectedContainerRefs: ['inactive', 'work'], inactiveDecisions: [{ ref: 'inactive', action: 'map', targetRef: 'work' }] };
  const mapped = reviewInactiveDecision(draft, draft.inactiveDecisions[0]);
  assert.deepEqual(mapped.affectedRules[0].resultingStoreRefs, ['personal', 'work']); assert.deepEqual(mapped.affectedRules[1].resultingStoreRefs, ['work']);
  assert.equal(mapped.transfersWholeContainerProtection, true); assert.equal(mapped.destinationAlreadyProtected, true); assert.equal(mapped.affectedRules[0].requiresEdit, false);
  draft.inactiveDecisions = [{ ref: 'inactive', action: 'remove' }];
  const removed = reviewInactiveDecision(draft, draft.inactiveDecisions[0]);
  assert.equal(removed.affectedRules.length, 2); assert.equal(removed.affectedRules[0].requiresEdit, true); assert.equal(removed.affectedRules[1].emptyScope, true); assert.equal(removed.removesWholeContainerProtection, true);
  assert.deepEqual(draft.rules[1].scope.storeRefs, ['inactive']);
});
