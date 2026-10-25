import { fail, clone, opaqueId, yieldTask } from '../../core/errors.js';
import { matchCookie, assessSelector } from '../../core/policy/index.js';
import { selectorFor, nativeSelector } from './selectors.js';
export const catalogKey = catalog => JSON.stringify([catalog.normalStoreId, [...catalog.containers].sort((a,b) => a.cookieStoreId.localeCompare(b.cookieStoreId))]);
const liveStates = new Set(['running', 'cancel_requested']);
export function createBurner({ adapter, configuration, handles, emit }) {
  let operation = null;
  let locked = false;
  let live = false;
  let execution = Promise.resolve();
  let environmentGeneration = 0;
  let viewWrites = Promise.resolve();
  const isLocked = () => locked;
  function saveView() {
    const snapshot = clone(operation);
    const result = viewWrites.then(() => adapter.writeCurrentOperation(snapshot));
    viewWrites = result.catch(() => {});
    return result.then(() => emit('operation'));
  }
  async function initialize() {
    let marker;
    try {
      marker = await adapter.readMarker();
      operation = await adapter.readCurrentOperation();
      if (marker || liveStates.has(operation?.state)) {
        operation = { id: typeof marker === 'string' ? marker : opaqueId(), state: 'interrupted', plannedAttempts: null, attemptedCalls: null, removedCalls: null, notFoundCalls: null, errors: null, unattemptedCalls: null, safetySkips: null, reason: 'EXECUTION_INTERRUPTED' };
        locked = true;
        await saveView();
      }
    } catch {
      locked = true;
      live = false;
      operation = { id: opaqueId(), state: 'interrupted', plannedAttempts: null, attemptedCalls: null, removedCalls: null, notFoundCalls: null, errors: null, unattemptedCalls: null, safetySkips: null, reason: 'STORAGE_FAILED' };
    }
  }
  function invalidate() { environmentGeneration++; handles.invalidate('burn'); }
  async function access() {
    const value = await adapter.getAccess();
    if (!value.granted || !value.available) fail('PERMISSION_REQUIRED', value.reason || 'Complete website access is required.');
    return value;
  }
  async function previewBurn(payload, request) {
    if (locked) fail('OPERATION_ACTIVE', 'Dismiss the current interruption or wait for the active burn.');
    await configuration.assertRevision(request.expectedRevision);
    await access();
    const generation = environmentGeneration;
    const catalog = await adapter.getCatalog();
    await configuration.reconcileCatalog(catalog);
    const { record, catalogGeneration } = await configuration.readConfiguration();
    await configuration.assertRevision(request.expectedRevision);
    if (!record) fail('CONFIGURATION_UNAVAILABLE', 'Restore your configuration before burning cookies.');
    const views = (await configuration.view()).stores;
    const stores = [{ ref: 'normal', id: catalog.normalStoreId }, ...record.containerBindings.filter(binding => binding.state === 'active').map(binding => ({ ref: binding.ref, id: binding.cookieStoreId }))];
    const candidates = [];
    let ruleProtected = 0, ambiguous = 0;
    const skippedStores = [];
    for (const store of stores) {
      if (record.protectedContainerRefs.includes(store.ref)) { skippedStores.push(views.find(view => view.ref === store.ref)); continue; }
      let cookies;
      try { cookies = await adapter.listCookies(store.id); }
      catch { fail('CONTEXT_UNAVAILABLE', 'Cookie enumeration failed. No burn preview was created.'); }
      for (let index = 0; index < cookies.length; index++) {
        const cookie = cookies[index];
        if (matchCookie(cookie, record, store.ref).protected) { ruleProtected++; continue; }
        const selector = selectorFor(cookie, store.ref);
        if (!selector || assessSelector(selector, record, store.ref).status !== 'safe') { ambiguous++; continue; }
        candidates.push({ selector, storeId: store.id });
        if (index % 100 === 0) await yieldTask();
      }
      await yieldTask();
    }
    await access();
    const latest = await configuration.readConfiguration();
    if (generation !== environmentGeneration || catalogKey(catalog) !== catalogKey(await adapter.getCatalog()) || latest.record?.revision !== record.revision || latest.catalogGeneration !== catalogGeneration || locked) fail('STALE_PREVIEW', 'Settings or access changed. Prepare a new preview.');
    const previewToken = handles.issue('burn', request.owner, { candidates, record, catalogGeneration, catalog: catalogKey(catalog), generation, ambiguous, ruleProtected, skippedStoreCount: skippedStores.length });
    return { previewToken, revision: record.revision, stores: stores.filter(store => !record.protectedContainerRefs.includes(store.ref)).map(store => views.find(view => view.ref === store.ref)), eligibleAttempts: candidates.length, ruleProtected, ambiguous, skippedStores, scope: 'Accessible HTTP/HTTPS cookies in Normal browsing and available named containers. Protected stores are skipped without enumeration; their cookies are not included in counts.', warning: 'Burning cookies may sign you out. Counts are estimates. Active websites can recreate cookies. Successful calls do not confirm the exact removed cookie identity.' };
  }
  async function startBurn(payload, request) {
    return configuration.runExclusive(async () => {
      if (locked) fail('OPERATION_ACTIVE', 'A burn or interruption is already active.');
      await configuration.verifyConfiguration();
      await configuration.assertRevision(request.expectedRevision);
      const preview = handles.get(payload.previewToken, 'burn', request.owner, 'STALE_PREVIEW');
      const current = await configuration.readConfiguration();
      await access();
      if (preview.generation !== environmentGeneration || JSON.stringify(current.record) !== JSON.stringify(preview.record) || current.catalogGeneration !== preview.catalogGeneration || catalogKey(await adapter.getCatalog()) !== preview.catalog) fail('STALE_PREVIEW', 'Settings or access changed. Prepare a new preview.');
      if (!preview.candidates.length) fail('INVALID_REQUEST', 'No eligible deletion is available.');
      locked = true;
      live = true;
      operation = { id: opaqueId(), state: 'running', plannedAttempts: preview.candidates.length, attemptedCalls: 0, removedCalls: 0, notFoundCalls: 0, errors: 0, unattemptedCalls: preview.candidates.length, safetySkips: preview.ambiguous, ruleProtected: preview.ruleProtected, skippedStores: preview.skippedStoreCount, reason: null };
      try { await adapter.writeMarker(operation.id); await saveView(); }
      catch {
        live = false;
        operation.state = 'interrupted'; operation.reason = 'STORAGE_FAILED';
        try { await saveView(); } catch { /* Keep the lock and marker until acknowledgment. */ }
        fail('STORAGE_FAILED', 'The interruption marker could not be confirmed. No cookies were deleted.');
      }
      handles.invalidate('burn');
      live = true;
      execution = execute(preview).catch(async () => {
        operation.state = 'interrupted'; operation.reason = 'INTERNAL_FAILURE'; live = false;
        try { await saveView(); } catch { /* Marker remains authoritative. */ }
      });
      return { operationId: operation.id };
    });
  }
  async function execute(preview) {
    let partial = false;
    for (const candidate of preview.candidates) {
      await yieldTask();
      if (operation.state === 'cancel_requested') break;
      try {
        await configuration.verifyConfiguration();
        await access();
        if (preview.generation !== environmentGeneration || catalogKey(await adapter.getCatalog()) !== preview.catalog) { operation.reason = 'COVERAGE_CHANGED'; partial = true; break; }
      } catch { operation.reason = 'ACCESS_OR_SCOPE_LOST'; partial = true; break; }
      if (operation.state === 'cancel_requested') break;
      const safety = assessSelector(candidate.selector, preview.record, candidate.selector.storeRef);
      if (safety.status !== 'safe') { operation.safetySkips++; continue; }
      // No asynchronous work belongs between the final cancellation check and native call.
      operation.attemptedCalls++; operation.unattemptedCalls--;
      try {
        const removed = await adapter.removeCookie(nativeSelector(candidate.selector, candidate.storeId));
        if (removed === null) operation.notFoundCalls++; else operation.removedCalls++;
      } catch { operation.errors++; partial = true; }
      await saveView();
    }
    const canceled = operation.state === 'cancel_requested';
    operation.state = canceled ? 'canceled' : partial ? 'partial' : 'completed';
    operation.reason ||= canceled ? 'USER_CANCELED' : partial ? 'DELETION_FAILED' : null;
    try {
      await saveView();
      await adapter.clearMarker();
      locked = false;
    } catch {
      operation.state = 'interrupted'; operation.reason = 'CLEANUP_FAILED';
      try { await saveView(); } catch { /* Retain lock and marker. */ }
    }
    live = false;
    emit('operation');
  }
  async function cancelBurn({ operationId }) {
    if (operation?.id !== operationId || !live) fail('INVALID_REQUEST', 'There is no matching active burn.');
    operation.state = 'cancel_requested';
    // State changes synchronously before any storage await.
    await saveView();
    return { cancellationRequested: true };
  }
  async function dismissOperation({ operationId }) {
    return configuration.runExclusive(async () => {
      if (operation?.id !== operationId || live || liveStates.has(operation?.state)) fail('OPERATION_ACTIVE', 'An active burn cannot be dismissed.');
      await viewWrites;
      await adapter.clearMarker();
      await adapter.clearCurrentOperation();
      operation = null; locked = false; emit('operation');
      return { dismissed: true };
    });
  }
  return { initialize, isLocked, invalidate, view: () => clone(operation), waitForIdle: () => execution, handlers: { previewBurn, startBurn, cancelBurn, dismissOperation } };
}
