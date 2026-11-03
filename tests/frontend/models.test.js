import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../../src/backend/client/client.js';
import { createEditorModel, createPopupModel, createImportModel, createInventoryChoicesModel, siteStatus, operationTitle, groupCookieInventory } from '../../src/frontend/models.js';
import { editableException } from '../../src/frontend/exception-form.js';
const rule = { domain: 'example.com', includeSubdomains: true, name: null, path: null, scope: { type: 'selected', storeRefs: ['work'] } };
test('cookie inventory groups known partitions by store and main site without inventing unknown associations', () => {
  const rows = [
    { storeRef: 'normal', domain: '.third.test', association: { kind: 'partitioned', topLevelSite: 'https://main.test', relationship: 'third-party' } },
    { storeRef: 'work', domain: '.third.test', association: { kind: 'partitioned', topLevelSite: 'https://main.test', relationship: 'third-party' } },
    { storeRef: 'normal', domain: '.main.test', association: { kind: 'unpartitioned', topLevelSite: null, relationship: null } },
    { storeRef: 'normal', domain: 'other.test', association: { kind: 'unknown', topLevelSite: null, relationship: null } }
  ];
  const groups = groupCookieInventory(rows);
  assert.equal(groups.length, 2); assert.equal(groups[0].sites[0].main, 'https://main.test');
  assert.equal(groups[0].sites[0].jars[0].kind, 'third-party'); assert.equal(groups[0].sites[1].kind, 'unpartitioned');
  assert.equal(groups[0].sites[2].main, null); assert.equal(groups[0].sites[2].jars[0].kind, 'unknown');
  assert.equal(groups[1].storeRef, 'work');
});
test('partition exception form retains exact empty names and rejects an empty selected scope', () => {
  const fields = { cookieDomain: 'example.com', cookieIncludeSubdomains: false, topLevelDomain: 'other.test', topLevelIncludeSubdomains: true, scheme: 'https', anyName: false, name: '', anyPath: true, path: '', scope: 'selected', storeRefs: ['work'], enabled: false };
  const result = editableException(fields);
  assert.equal(result.name, ''); assert.equal(result.path, null); assert.deepEqual(result.scope.storeRefs, ['work']); assert.equal(result.enabled, false);
  assert.throws(() => editableException({ ...fields, storeRefs: [] }), /Select at least one store/);
});
test('inventory choices require explicit scope review and cannot commit a stale draft', async () => {
  const editor = { draft: { rules: [], exceptions: [], protectedContainerRefs: [], inactiveDecisions: [] }, baseRevision: 2, canEdit: true, refresh: async () => {} };
  let commits = 0;
  const client = { planInventoryChoices: async ({ choices }) => choices[0].scopeAcknowledged ? { planToken: 'ready', conflicts: [] } : { conflicts: [{ code: 'SCOPE_REVIEW_REQUIRED', scope: { stores: ['work'] } }] }, commitInventoryChoices: async () => { commits++; } };
  const inventory = createInventoryChoicesModel(client, editor);
  inventory.stage(['row'], 'burnable'); await inventory.review();
  await assert.rejects(inventory.commit(), /resolve every conflict/i);
  inventory.acknowledgeScopes(); await inventory.review();
  editor.draft.rules.push(structuredClone(rule));
  await assert.rejects(inventory.commit(), /review the current choices/i);
  await inventory.review(); assert.equal(inventory.plan.conflicts[0].code, 'SCOPE_REVIEW_REQUIRED');
  inventory.acknowledgeScopes(); await inventory.review(); await inventory.commit();
  assert.equal(commits, 1); assert.equal(inventory.dirty, false);
});
function fixture() {
  const state = { configuration: { rules: [structuredClone(rule)], protectedContainerRefs: [] }, configurationStatus: 'valid', revision: 1, stores: [{ ref: 'normal', name: 'Normal browsing', kind: 'normal', availability: 'available' }, { ref: 'work', name: 'Work', kind: 'container', availability: 'available' }], capabilities: { canBurn: true, canReadCookies: true, canChangeProtection: true }, operation: null };
  let event;
  let sequence = 0;
  const calls = [];
  const handlers = {
    getState: () => structuredClone(state),
    getSiteContext: () => ({ contextToken: 'captured-site', target: { domain: 'example.com', includeSubdomains: true }, store: state.stores[1], status: 'full', reasons: ['Saved rule in Work'], controls: { canRemove: true } }),
    getSiteCookieDomains: () => ({ domains: [{ domain: 'example.com', cookieCount: 4, status: 'full', reasons: [], matchingRuleIndexes: [0], domainToken: 'domain-token' }], revision: state.revision, storeRef: 'work', coverage: { state: 'observed', reason: null }, nextPageToken: null }),
    saveSiteRule: () => { state.revision++; return { revision: state.revision }; },
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
  return { client, state, calls, handlers, event: async (reason) => { event?.({ type: 'stateChanged', sequence: ++sequence, reason }); await new Promise(resolve => setTimeout(resolve, 0)); } };
}

test('XFER-A17 prototype-related mapping references retain every choice across pages and reset', async () => {
  const f = fixture();
  const editor = createEditorModel(f.client); await editor.refresh();
  const importer = createImportModel(f.client, editor);
  const refs = ['__proto__', 'constructor', 'toString', ...Array.from({ length: 22 }, (_, index) => `source-${index}`)];
  f.handlers.inspectImport = () => ({ importHandle: 'inspection', containers: refs.map(ref => ({ ref, name: ref })) });
  await importer.inspect('{}');
  const choices = ['retain', 'exclude', 'map:work'];
  for (let offset = 0; offset < choices.length; offset++) {
    refs.forEach((ref, index) => importer.mappingChoices.set(ref, choices[(index + offset) % choices.length]));
    importer.mappingPage = 1;
    const mappings = importer.mappingDecisions();
    assert.deepEqual(mappings, refs.map((sourceRef, index) => ({ sourceRef, action: ['retain', 'exclude', 'map'][(index + offset) % 3], ...((index + offset) % 3 === 2 ? { targetRef: 'work' } : {}) })));
    await importer.planMappings(mappings);
    assert.deepEqual(f.calls.filter(call => call.action === 'planImport').at(-1).payload.mappings, mappings);
  }
  await importer.inspect('{}', 'replace');
  assert.equal(importer.mappingChoices.size, 0);
  assert.equal(importer.mappingPage, 0);
  assert.throws(() => importer.mappingDecisions(), /Choose a valid mapping/);
});

test('XFER-A17 mapping decisions reject unknown actions, nonstrings, and unavailable destinations', async () => {
  const f = fixture(); const editor = createEditorModel(f.client); await editor.refresh();
  const importer = createImportModel(f.client, editor); await importer.inspect('{}');
  for (const invalid of [undefined, {}, 1, '', 'unknown', 'map:normal', 'map:missing']) {
    importer.mappingChoices.set('source', invalid);
    assert.throws(() => importer.mappingDecisions(), /Choose a valid mapping/);
  }
  importer.mappingChoices.set('source', 'map:work');
  editor.state.stores.find(store => store.ref === 'work').availability = 'inactive';
  assert.throws(() => importer.mappingDecisions(), /Choose a valid mapping/);
});
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
test('an open rule form cannot overwrite a different rule after a saved-state refresh', async () => {
  const f = fixture(); const editor = createEditorModel(f.client); await editor.refresh();
  const formRevision = editor.state.revision;
  f.state.configuration.rules.unshift({ ...structuredClone(rule), domain: 'new.example' });
  f.state.revision++;
  await editor.refresh();
  assert.equal(editor.edit(draft => { draft.rules[0].domain = 'edited.example'; }, formRevision), false);
  assert.deepEqual(editor.draft.rules.map(item => item.domain), ['new.example', 'example.com']);
  assert.equal(editor.dirty, false);
});
test('Current Site exception prefill uses captured third-party domain, site and store and rejects stale edits', async () => {
  const f = fixture();
  f.handlers.getSiteCookieDomains = () => ({ domains: [{ domain: 'third.example', group: 'third-party', topLevelSite: 'https://main.example', cookieCount: 1, status: 'full', reasons: [], matchingRuleIndexes: [], domainToken: 'captured-domain' }], revision: f.state.revision, storeRef: 'work', coverage: { state: 'stored', reason: null }, nextPageToken: null });
  f.handlers.saveSiteException = () => ({ revision: ++f.state.revision });
  const popup = createPopupModel(f.client); await popup.refresh();
  popup.openSiteException(popup.domains[0]);
  const draft = structuredClone(popup.exceptionEditor.exception);
  assert.equal(draft.cookieDomain, 'third.example'); assert.equal(draft.topLevelDomain, 'main.example'); assert.equal(draft.scheme, 'all'); assert.deepEqual(draft.scope, { type: 'selected', storeRefs: ['work'] });
  await popup.saveSiteException(draft);
  const sent = f.calls.find(call => call.action === 'saveSiteException');
  assert.equal(sent.payload.domainToken, 'captured-domain'); assert.equal(sent.expectedRevision, 1);
  popup.openSiteException(popup.domains[0]); popup.exceptionEditor.reviewRequired = true;
  await popup.saveSiteException(draft);
  assert.equal(f.calls.filter(call => call.action === 'saveSiteException').length, 1);
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
  const draft = { rules: [{ ...structuredClone(rule), scope: { type: 'selected', storeRefs: ['inactive', 'personal', 'work'] } }, { ...structuredClone(rule), scope: { type: 'selected', storeRefs: ['inactive'] } }], exceptions: [{ cookieDomain: 'third.test', topLevelDomain: 'main.test', enabled: true, scope: { type: 'selected', storeRefs: ['inactive'] } }], protectedContainerRefs: ['inactive', 'work'], inactiveDecisions: [{ ref: 'inactive', action: 'map', targetRef: 'work' }] };
  const mapped = reviewInactiveDecision(draft, draft.inactiveDecisions[0]);
  assert.deepEqual(mapped.affectedRules[0].resultingStoreRefs, ['personal', 'work']); assert.deepEqual(mapped.affectedRules[1].resultingStoreRefs, ['work']);
  assert.equal(mapped.transfersWholeContainerProtection, true); assert.equal(mapped.destinationAlreadyProtected, true); assert.equal(mapped.affectedRules[0].requiresEdit, false);
  assert.deepEqual(mapped.affectedExceptions[0].resultingStoreRefs, ['work']); assert.equal(mapped.affectedExceptions[0].exception.enabled, true);
  draft.inactiveDecisions = [{ ref: 'inactive', action: 'remove' }];
  const removed = reviewInactiveDecision(draft, draft.inactiveDecisions[0]);
  assert.equal(removed.affectedRules.length, 2); assert.equal(removed.affectedRules[0].requiresEdit, true); assert.equal(removed.affectedRules[1].emptyScope, true); assert.equal(removed.removesWholeContainerProtection, true);
  assert.equal(removed.affectedExceptions[0].requiresEdit, true); assert.equal(removed.affectedExceptions[0].emptyScope, true);
  assert.deepEqual(draft.rules[1].scope.storeRefs, ['inactive']);
});

test('UI-A14 UI-A15 UI-A21 domain pages append one captured snapshot; operation events do not enumerate again', async () => {
  const f = fixture();
  const rows = Array.from({ length: 101 }, (_, index) => ({ domain: `${String(index).padStart(3, '0')}.example.com`, cookieCount: index + 1, status: 'none', matchingRuleIndexes: [], reasons: [], domainToken: `domain-${index}` }));
  f.handlers.getSiteCookieDomains = payload => ({ domains: structuredClone(payload.pageToken ? rows.slice(100) : rows.slice(0, 100)), nextPageToken: payload.pageToken ? null : 'page-2', revision: 1, storeRef: 'work', coverage: { state: 'partial', reason: 'The page loaded before observation.' } });
  const popup = createPopupModel(f.client); await popup.refresh(); popup.subscribe();
  assert.equal(popup.domains.length, 100); assert.equal(popup.coverage.state, 'partial');
  rows[0].cookieCount = 999;
  f.state.operation = { state: 'running' }; await f.event('operation');
  assert.equal(popup.domains[0].cookieCount, 1);
  assert.equal(f.calls.filter(call => call.action === 'getSiteCookieDomains').length, 1);
  await popup.loadMoreDomains(); assert.equal(popup.domains.length, 101); assert.equal(new Set(popup.domains.map(row => row.domain)).size, 101);
  assert.equal(popup.nextPageToken, null);
  assert.deepEqual(f.calls.filter(call => call.action === 'getSiteCookieDomains')[1].payload, { contextToken: 'captured-site', pageSize: 100, pageToken: 'page-2' });
});
test('UI-A16 UI-A17 UI-A18 popup choices retain full saved fields; new rule captures exact domain and current store', async () => {
  const f = fixture(); const popup = createPopupModel(f.client); await popup.refresh();
  popup.openSiteRule(popup.domains[0]); assert.equal(popup.ruleEditor.rule, null);
  popup.selectSiteRule(0); assert.deepEqual(popup.ruleEditor.rule, rule);
  popup.ruleEditor.rule.domain = 'draft.example'; assert.equal(f.state.configuration.rules[0].domain, 'example.com');
  popup.selectSiteRule(null);
  assert.deepEqual(popup.ruleEditor.rule, { domain: 'example.com', includeSubdomains: false, name: null, path: null, scope: { type: 'selected', storeRefs: ['work'] } });
  assert.equal(popup.cancelSiteRule(), true); assert.equal(popup.ruleEditor, null);
  assert.equal(f.calls.some(call => call.action === 'saveSiteRule'), false);
});
test('UI-A19 popup save submits once with captured revision, locks Cancel, then refreshes summary and domains', async () => {
  const f = fixture(); const pending = deferred(); f.handlers.saveSiteRule = () => pending.promise;
  const popup = createPopupModel(f.client); await popup.refresh(); popup.openSiteRule(popup.domains[0]); popup.selectSiteRule(null);
  const edited = structuredClone(popup.ruleEditor.rule); edited.name = '';
  const saving = popup.saveSiteRule(edited);
  assert.equal(popup.cancelSiteRule(), false); assert.equal(popup.canSaveRule, false);
  await popup.saveSiteRule(edited);
  assert.equal(f.calls.filter(call => call.action === 'saveSiteRule').length, 1);
  pending.resolve({ revision: 2 }); await saving;
  const save = f.calls.find(call => call.action === 'saveSiteRule');
  assert.equal(save.expectedRevision, 1); assert.equal(save.payload.ruleIndex, null); assert.equal(save.payload.rule.name, '');
  assert.equal(popup.ruleEditor, null); assert.equal(f.calls.filter(call => call.action === 'getSiteCookieDomains').length, 2);
});
test('UI-A23 revision and validation failures preserve popup draft without retrying or rebasing', async () => {
  for (const code of ['VALIDATION_FAILED', 'REVISION_CONFLICT', 'STALE_SITE_CONTEXT']) {
    const f = fixture(); const popup = createPopupModel(f.client); await popup.refresh(); popup.openSiteRule(popup.domains[0]); popup.selectSiteRule(0);
    f.handlers.saveSiteRule = () => { throw Object.assign(new Error('Review your rule.'), { code }); };
    const edited = structuredClone(rule); edited.domain = 'draft.example';
    await assert.rejects(popup.saveSiteRule(edited), { code });
    assert.equal(popup.ruleEditor.rule.domain, 'draft.example'); assert.equal(popup.ruleEditor.revision, 1);
    assert.equal(f.calls.filter(call => call.action === 'saveSiteRule').length, 1);
    assert.equal(popup.canSaveRule, code === 'VALIDATION_FAILED');
    if (code === 'STALE_SITE_CONTEXT') assert.deepEqual(popup.domains, []);
  }
});
test('UI-A21 UI-A23 saved-setting events mark snapshot stale; navigation clears rows; refresh requires new target review', async () => {
  const f = fixture(); const popup = createPopupModel(f.client); await popup.refresh(); popup.subscribe();
  popup.openSiteRule(popup.domains[0]); popup.selectSiteRule(0); popup.ruleEditor.rule.name = 'unsaved';
  f.state.revision = 2; await f.event('configuration');
  assert.equal(popup.domains.length, 1); assert.equal(popup.domainStale, true); assert.equal(popup.canSaveRule, false);
  assert.equal(popup.ruleEditor.rule.name, 'unsaved');
  await f.event('site'); assert.deepEqual(popup.domains, []);
  await popup.refresh(); assert.equal(popup.ruleEditor.rule.name, 'unsaved'); assert.equal(popup.ruleEditor.reviewRequired, true);
  assert.equal(popup.canSaveRule, false); assert.equal(f.calls.filter(call => call.action === 'getSiteCookieDomains').length, 2);
});
test('UI-A25 empty, unavailable and failed domain inventory remain distinct from summary and coverage', async () => {
  const f = fixture(); const popup = createPopupModel(f.client);
  f.handlers.getSiteCookieDomains = () => ({ domains: [], revision: 1, nextPageToken: null, coverage: { state: 'partial', reason: 'Unobserved load.' } });
  await popup.refresh(); assert.equal(popup.domainStatus, 'empty'); assert.equal(popup.site.status, 'full'); assert.equal(popup.coverage.state, 'partial');
  f.handlers.getSiteCookieDomains = () => { throw Object.assign(new Error('No cookie access.'), { code: 'PERMISSION_REQUIRED' }); };
  await popup.refresh(); assert.equal(popup.domainStatus, 'unavailable');
  f.handlers.getSiteCookieDomains = () => { throw Object.assign(new Error('Storage failure.'), { code: 'INTERNAL_FAILURE' }); };
  await popup.refresh(); assert.equal(popup.domainStatus, 'error');
});
test('Shared rule form preserves unrestricted and exact empty fields and requires selected stores', async () => {
  const { editableRule } = await import('../../src/frontend/rule-form.js');
  const fields = { domain: 'example.com', includeSubdomains: false, anyName: false, name: '', anyPath: false, path: '/', scope: 'selected', storeRefs: ['normal'] };
  assert.equal(editableRule(fields).name, ''); assert.equal(editableRule({ ...fields, anyName: true }).name, null);
  assert.throws(() => editableRule({ ...fields, storeRefs: [] }), /Select at least one store/);
});
test('UI-A20 a lost popup save reply preserves draft but requires saved-state refresh and target review before another mutation', async () => {
  const f = fixture(); const popup = createPopupModel(f.client); await popup.refresh(); popup.openSiteRule(popup.domains[0]); popup.selectSiteRule(null);
  f.handlers.saveSiteRule = () => { f.state.revision++; throw new Error('The reply was lost.'); };
  await assert.rejects(popup.saveSiteRule(popup.ruleEditor.rule));
  assert.equal(popup.canSaveRule, false); assert.ok(popup.ruleEditor.rule);
  const reopened = createPopupModel(f.client); await reopened.refresh();
  assert.equal(reopened.state.revision, 2); assert.equal(reopened.ruleEditor, null);
});
