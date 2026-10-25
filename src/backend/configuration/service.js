import { clone, fail, opaqueId, yieldTask } from '../../core/errors.js';
import { checkFields, checkSize, LIMITS, normalizeDomain, validateConfiguration } from '../../core/configuration/index.js';

const emptyRecord = () => ({ schemaVersion: 1, revision: 0, containerBindings: [], protectedContainerRefs: [], rules: [] });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function createConfiguration({ adapter, emit = () => {}, isLocked = () => false }) {
  let record = null;
  let status = 'missing';
  let observed = null;
  let catalog = null;
  let catalogGeneration = 0;
  let catalogSignature = '';
  let recoveryToken = null;
  let recoveryBindings = [];
  let tail = Promise.resolve();
  const runExclusive = task => {
    const result = tail.then(task);
    tail = result.catch(() => {});
    return result;
  };
  function unavailable() { fail('CONFIGURATION_UNAVAILABLE', 'Saved protection is unavailable. Review configuration recovery.'); }
  function checkCatalog(value) {
    if (!value || typeof value.normalStoreId !== 'string' || !Array.isArray(value.containers) || value.containers.length > LIMITS.containers) fail('STORE_CATALOG_UNAVAILABLE', 'The complete container catalog is unavailable.');
    const ids = new Set([value.normalStoreId]);
    for (const container of value.containers) {
      if (!container || typeof container.cookieStoreId !== 'string' || ids.has(container.cookieStoreId) || ['name', 'color', 'icon'].some(key => typeof container[key] !== 'string' || [...container[key]].length > LIMITS.string)) fail('STORE_CATALOG_UNAVAILABLE', 'The complete container catalog is unavailable.');
      ids.add(container.cookieStoreId);
    }
    return clone(value);
  }
  async function factsFor(value) {
    const facts = Object.create(null);
    if (!Array.isArray(value?.rules) || value.rules.length > LIMITS.rules) return facts;
    const domains = new Set();
    for (const rule of value.rules) {
      try { domains.add(normalizeDomain(rule?.domain)); } catch { /* Full validation supplies field errors. */ }
    }
    let count = 0;
    for (const domain of domains) {
      facts[domain] = await adapter.classifyHost(domain);
      if (++count % 100 === 0) await yieldTask();
    }
    return facts;
  }
  function updateRecovery(previousObserved) {
    if ((status === 'missing' || status === 'invalid') && catalog) {
      if (!recoveryToken || !same(previousObserved, observed)) recoveryToken = opaqueId();
    } else recoveryToken = null;
  }
  async function readStored() {
    const previousObserved = observed;
    const previousStatus = status;
    try {
      let raw;
      try { raw = await adapter.readConfigurationRecord(); }
      catch {
        status = 'unreadable'; record = null; recoveryToken = null;
        return;
      }
      observed = clone(raw ?? null);
      if (raw == null) { status = 'missing'; record = null; updateRecovery(previousObserved); return; }
      let facts;
      try { facts = await factsFor(raw); }
      catch { status = 'unreadable'; record = null; recoveryToken = null; return; }
      try { record = validateConfiguration(raw, facts); status = 'valid'; recoveryToken = null; }
      catch { record = null; status = 'invalid'; updateRecovery(previousObserved); }
    } finally {
      // Native changes can preserve the revision, including corruption or manual replacement.
      // Any newly observed record or availability change invalidates dependent handles.
      if (status !== previousStatus || !same(observed, previousObserved)) emit('configuration');
    }
  }
  function setCatalog(value) {
    const next = checkCatalog(value);
    const signature = JSON.stringify({ normalStoreId: next.normalStoreId, containers: [...next.containers].sort((a, b) => a.cookieStoreId.localeCompare(b.cookieStoreId)) });
    const changed = signature !== catalogSignature;
    if (changed) {
      catalogGeneration += 1; catalogSignature = signature; recoveryToken = null;
      recoveryBindings = next.containers.map(entry => ({ ref: opaqueId(), cookieStoreId: entry.cookieStoreId, name: entry.name, color: entry.color, icon: entry.icon, state: 'active' }));
    }
    catalog = next;
    updateRecovery(observed);
    return changed;
  }
  async function write(candidate) {
    const previous = clone(record);
    try { await adapter.writeConfigurationRecord(clone(candidate)); }
    catch {
      // A native write can fail after changing storage. Re-read before permitting further actions.
      await readStored();
      if (!same(record, previous)) { record = null; status = 'unreadable'; recoveryToken = null; }
      fail('STORAGE_FAILED', 'The settings write could not be confirmed. Refresh before trying again.');
    }
    record = clone(candidate); observed = clone(candidate); status = 'valid'; recoveryToken = null;
  }
  function reconciledCandidate() {
    const candidate = clone(record);
    const available = new Map(catalog.containers.map(entry => [entry.cookieStoreId, entry]));
    for (const binding of candidate.containerBindings) {
      const current = binding.state === 'active' ? available.get(binding.cookieStoreId) : null;
      if (current) {
        Object.assign(binding, { name: current.name, color: current.color, icon: current.icon, state: 'active' });
        available.delete(binding.cookieStoreId);
      } else { binding.state = 'inactive'; binding.cookieStoreId = null; }
    }
    for (const entry of available.values()) candidate.containerBindings.push({ ref: opaqueId(), cookieStoreId: entry.cookieStoreId, name: entry.name, color: entry.color, icon: entry.icon, state: 'active' });
    return candidate;
  }
  async function reconcileInside(value) {
    if (isLocked()) return false;
    const catalogChanged = setCatalog(value);
    if (status !== 'valid') { if (catalogChanged) emit('stores'); return false; }
    const candidate = reconciledCandidate();
    const validated = validateConfiguration(candidate, await factsFor(candidate));
    const recordChanged = !same(record, validated);
    if (recordChanged) await write(validated);
    if (catalogChanged || recordChanged) emit('stores');
    return true;
  }
  async function initialize({ firstInstall = false } = {}) {
    return runExclusive(async () => {
      await readStored();
      let currentCatalog;
      try { currentCatalog = await adapter.getCatalog(); checkCatalog(currentCatalog); }
      catch { catalog = null; recoveryToken = null; catalogGeneration += 1; return view(); }
      if (firstInstall && status === 'missing') {
        setCatalog(currentCatalog);
        record = emptyRecord();
        try { await write(reconciledCandidate()); }
        catch { return view(); }
      } else await reconcileInside(currentCatalog);
      updateRecovery(observed);
      return view();
    });
  }
  function readConfiguration() { return { record: clone(record), catalogGeneration, status, recoveryToken, recoveryBindings: clone(recoveryBindings) }; }
  function view() {
    const stores = [];
    if (catalog) stores.push({ ref: 'normal', label: 'Normal browsing', name: 'Normal browsing', color: '', icon: '', kind: 'normal', state: 'active', availability: 'available', protected: false });
    if (record) for (const binding of record.containerBindings) stores.push({ ref: binding.ref, label: binding.name, name: binding.name, color: binding.color, icon: binding.icon, kind: 'container', state: binding.state, availability: catalog && binding.state === 'active' ? 'available' : 'inactive', protected: record.protectedContainerRefs.includes(binding.ref) });
    // Recovery still needs destination choices, but these references are reserved only for this catalog generation.
    if (!record && catalog) for (const entry of recoveryBindings) stores.push({ ref: entry.ref, label: entry.name, name: entry.name, color: entry.color, icon: entry.icon, kind: 'container', state: 'active', availability: 'available', protected: false });
    return { configuration: record ? { rules: clone(record.rules), protectedContainerRefs: clone(record.protectedContainerRefs) } : null, revision: record?.revision ?? null, stores, configurationStatus: status, recoveryToken, catalogGeneration };
  }
  async function verifyConfiguration() {
    let raw;
    try { raw = await adapter.readConfigurationRecord(); }
    catch {
      status = 'unreadable'; record = null; recoveryToken = null;
      emit('configuration');
      unavailable();
    }
    if (!same(raw ?? null, observed)) {
      // Never adopt a changed native record into an active operation's policy.
      // The next explicit refresh may validate it after execution stops.
      if (isLocked()) { status = 'unreadable'; record = null; recoveryToken = null; }
      else await readStored();
      emit('configuration');
      if (status === 'valid') fail('REVISION_CONFLICT', 'Saved protection changed. Refresh and prepare the action again.');
      unavailable();
    }
    if (status !== 'valid' || !record) unavailable();
    return clone(record);
  }
  function assertRevision(expectedRevision, token) {
    if (expectedRevision === null && token && token === recoveryToken && (status === 'missing' || status === 'invalid') && catalog) return;
    if (status !== 'valid') unavailable();
    if (record.revision !== expectedRevision) fail('REVISION_CONFLICT', 'Saved protection changed. Review the current saved settings before trying again.');
  }
  async function commitConfiguration({ expectedRevision, expectedCatalogGeneration, candidate, recoveryToken: token, beforeWrite }) {
    return runExclusive(async () => {
      if (isLocked()) fail('OPERATION_ACTIVE', 'A burn is active. Wait before changing protection.');
      if (adapter.getAccess) {
        const access = await adapter.getAccess();
        if (!access.granted || !access.available) fail('PERMISSION_REQUIRED', 'Restore website access before changing protection.');
      }
      const originalObserved = clone(observed);
      const originalToken = recoveryToken;
      await readStored();
      if (!same(originalObserved, observed) || (expectedRevision === null && token !== originalToken)) {
        fail(expectedRevision === null ? 'STALE_IMPORT' : 'REVISION_CONFLICT', 'Saved protection changed. Refresh and review the settings again.');
      }
      assertRevision(expectedRevision, token);
      let currentCatalog;
      try { currentCatalog = checkCatalog(await adapter.getCatalog()); }
      catch { fail('STORE_CATALOG_UNAVAILABLE', 'The complete container catalog is unavailable.'); }
      const newSignature = JSON.stringify({ normalStoreId: currentCatalog.normalStoreId, containers: [...currentCatalog.containers].sort((a, b) => a.cookieStoreId.localeCompare(b.cookieStoreId)) });
      if (newSignature !== catalogSignature || expectedCatalogGeneration !== catalogGeneration) {
        await reconcileInside(currentCatalog);
        fail('STALE_IMPORT', 'Available containers changed. Refresh and review the settings again.');
      }
      const validated = validateConfiguration(candidate, await factsFor(candidate));
      // Candidates cannot invent active native bindings or drop an existing active binding.
      const available = new Map(currentCatalog.containers.map(entry => [entry.cookieStoreId, entry]));
      for (const binding of validated.containerBindings) {
        if (binding.state !== 'active') continue;
        const native = available.get(binding.cookieStoreId);
        if (!native || binding.name !== native.name || binding.color !== native.color || binding.icon !== native.icon) fail('VALIDATION_FAILED', 'An active container binding does not match the current catalog.');
        available.delete(binding.cookieStoreId);
      }
      if (available.size) fail('VALIDATION_FAILED', 'The configuration must retain every available named container.');
      validated.revision = expectedRevision === null ? 1 : record.revision + 1;
      if (!Number.isSafeInteger(validated.revision)) fail('STORAGE_FAILED', 'The configuration revision limit was reached.');
      // Domain validation can yield while native permissions, containers, or settings change.
      // Recheck each authoritative input immediately before committing the complete record.
      if (adapter.getAccess) {
        const access = await adapter.getAccess();
        if (!access.granted || !access.available) fail('PERMISSION_REQUIRED', 'Restore website access before changing protection.');
      }
      let finalCatalog;
      try { finalCatalog = checkCatalog(await adapter.getCatalog()); }
      catch { fail('STORE_CATALOG_UNAVAILABLE', 'The complete container catalog is unavailable.'); }
      const finalSignature = JSON.stringify({ normalStoreId: finalCatalog.normalStoreId, containers: [...finalCatalog.containers].sort((a, b) => a.cookieStoreId.localeCompare(b.cookieStoreId)) });
      if (finalSignature !== catalogSignature) {
        await reconcileInside(finalCatalog);
        fail('STALE_IMPORT', 'Available containers changed. Refresh and review the settings again.');
      }
      let finalStored;
      try { finalStored = await adapter.readConfigurationRecord(); }
      catch { status = 'unreadable'; record = null; recoveryToken = null; unavailable(); }
      if (!same(finalStored ?? null, observed)) {
        await readStored();
        emit('configuration');
        fail(expectedRevision === null ? 'STALE_IMPORT' : 'REVISION_CONFLICT', 'Saved protection changed. Refresh and review the settings again.');
      }
      if (beforeWrite !== undefined) {
        if (typeof beforeWrite !== 'function') fail('INVALID_REQUEST', 'The action context validator is invalid.');
        await beforeWrite();
      }
      if (isLocked()) fail('OPERATION_ACTIVE', 'A burn is active. Wait before changing protection.');
      await write(validated);
      emit('configuration');
      return { record: clone(record), catalogGeneration };
    });
  }
  function editableCandidate(payload) {
    checkFields(payload, ['rules', 'protectedContainerRefs', 'inactiveDecisions'], 'draft');
    checkSize(payload, 'draft');
    if (!Array.isArray(payload.inactiveDecisions)) fail('VALIDATION_FAILED', 'Inactive-reference decisions must be an array.');
    const candidate = { ...clone(record), rules: clone(payload.rules), protectedContainerRefs: clone(payload.protectedContainerRefs) };
    const decisions = new Map();
    for (const decision of payload.inactiveDecisions) {
      const fields = decision?.action === 'map' ? ['ref', 'action', 'targetRef'] : ['ref', 'action'];
      checkFields(decision, fields, 'inactiveDecisions');
      if (decisions.has(decision.ref) || !['keep', 'remove', 'map'].includes(decision.action)) fail('VALIDATION_FAILED', 'Each inactive reference needs at most one valid decision.');
      const binding = record.containerBindings.find(binding => binding.ref === decision.ref && binding.state === 'inactive');
      if (!binding) fail('VALIDATION_FAILED', 'The decision must identify an inactive reference.');
      if (decision.action === 'map' && !record.containerBindings.some(binding => binding.ref === decision.targetRef && binding.state === 'active')) fail('VALIDATION_FAILED', 'Map only to an available named container.');
      decisions.set(decision.ref, decision);
    }
    for (const [ref, decision] of decisions) {
      if (decision.action === 'keep') continue;
      candidate.containerBindings = candidate.containerBindings.filter(binding => binding.ref !== ref);
      if (decision.action === 'map') {
        if (record.protectedContainerRefs.includes(ref) && !candidate.protectedContainerRefs.includes(decision.targetRef)) candidate.protectedContainerRefs.push(decision.targetRef);
        candidate.rules = candidate.rules.map(rule => rule.scope?.type !== 'selected' ? rule : { ...rule, scope: { type: 'selected', storeRefs: [...new Set(rule.scope.storeRefs.map(value => value === ref ? decision.targetRef : value))].sort() } });
      }
      candidate.protectedContainerRefs = candidate.protectedContainerRefs.filter(value => value !== ref);
      // Removal requires the editable draft itself to remove all affected rule references.
      // Validation rejects any undeclared reference or remaining empty scope.
    }
    return candidate;
  }
  const handlers = {
    async saveConfiguration(payload, request) {
      assertRevision(request.expectedRevision);
      if (!catalog) fail('STORE_CATALOG_UNAVAILABLE', 'The complete container catalog is unavailable.');
      const candidate = editableCandidate(payload);
      const result = await commitConfiguration({ expectedRevision: request.expectedRevision, expectedCatalogGeneration: catalogGeneration, candidate });
      return { configuration: { rules: result.record.rules, protectedContainerRefs: result.record.protectedContainerRefs }, revision: result.record.revision };
    }
  };
  return { initialize, refresh: initialize, readConfiguration, view, assertRevision, verifyConfiguration, runExclusive, commitConfiguration, reconcileCatalog: value => runExclusive(async () => {
    // A burn can acquire the lock while this reconciliation waits in the queue.
    // Do not adopt native settings into its frozen policy or observed-record baseline.
    if (isLocked()) return false;
    await readStored();
    return reconcileInside(value ?? await adapter.getCatalog());
  }), handlers };
}
