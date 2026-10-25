import { fail, clone, opaqueId, yieldTask } from '../../core/errors.js';
import { validateConfiguration } from '../../core/configuration/index.js';
import { parsePortableText, portableDomains, validatePortable, serializePortable, createImportPlan, resolveImportPlan } from '../../core/transfer/index.js';

function catalogKey(catalog) {
  if (!catalog || typeof catalog.normalStoreId !== 'string' || !Array.isArray(catalog.containers)) fail('STORE_CATALOG_UNAVAILABLE', 'The complete container catalog is unavailable.');
  return JSON.stringify({ normalStoreId: catalog.normalStoreId, containers: catalog.containers.map(container => ({ cookieStoreId: container.cookieStoreId, name: container.name, color: container.color, icon: container.icon })).sort((a, b) => a.cookieStoreId.localeCompare(b.cookieStoreId)) });
}
const accessKey = access => JSON.stringify({ granted: access.granted === true, available: access.available === true, reason: access.reason || '' });
const editable = record => ({ rules: clone(record.rules), protectedContainerRefs: clone(record.protectedContainerRefs) });
const planView = (token, plan) => ({ planToken: token, conflicts: clone(plan.conflicts), unresolvedConflicts: clone(plan.unresolvedConflicts), preview: clone(plan.preview), canCommit: plan.canCommit });

export function createTransfer({ adapter, configuration, handles, isLocked = () => false }) {
  async function factsFor(raw) {
    const facts = Object.create(null);
    const domains = portableDomains(raw);
    for (let index = 0; index < domains.length; index++) {
      facts[domains[index]] = await adapter.classifyHost(domains[index]);
      if (index % 100 === 99) await yieldTask();
    }
    return facts;
  }
  async function snapshot(payload, request) {
    await configuration.assertRevision(request.expectedRevision, payload.recoveryToken);
    const state = await configuration.readConfiguration();
    const recovery = request.expectedRevision === null;
    if (recovery && !['missing', 'invalid'].includes(state.status)) fail('STALE_IMPORT', 'The configuration recovery state has changed. Start again.');
    const catalog = await adapter.getCatalog();
    const access = await adapter.getAccess();
    return { state, recovery, expectedRevision: request.expectedRevision, recoveryToken: payload.recoveryToken, catalogKey: catalogKey(catalog), accessKey: accessKey(access), catalog };
  }
  async function checkStage(stage, payload, request) {
    if (stage.expectedRevision !== request.expectedRevision || stage.recoveryToken !== payload.recoveryToken) fail('STALE_IMPORT', 'The import belongs to another saved configuration. Start again.');
    const current = await snapshot(payload, request);
    if (current.state.catalogGeneration !== stage.state.catalogGeneration || current.catalogKey !== stage.catalogKey || current.accessKey !== stage.accessKey) fail('STALE_IMPORT', 'Container availability or website access changed. Start the import again.');
    return current;
  }
  function requireImportHandle(token, owner, expectedStage) {
    const current = handles.get(token, 'import', owner, 'STALE_IMPORT');
    if (current !== expectedStage) fail('STALE_IMPORT', 'The import session changed. Start again.');
  }
  function requirePlanGeneration(stage, generation) {
    if (stage.planGeneration !== generation) fail('STALE_IMPORT', 'The import mapping or mode changed. Review the new preview.');
  }
  function requireActivePlan(token, owner, stored) {
    const current = handles.get(token, 'importPlan', owner, 'STALE_IMPORT');
    requireImportHandle(stored.importHandle, owner, stored.stage);
    if (current !== stored || stored.stage.activePlanToken !== token) fail('STALE_IMPORT', 'The import plan changed. Review the new preview.');
  }
  function recoveryRecord(stage) {
    const bindings = stage.state.recoveryBindings;
    if (!Array.isArray(bindings)) fail('STORE_CATALOG_UNAVAILABLE', 'Recovery container references are unavailable. Refresh settings.');
    return { schemaVersion: 1, revision: 0, containerBindings: clone(bindings), rules: [], protectedContainerRefs: [] };
  }
  const handlers = {
    async prepareExport(payload, request) {
      await configuration.assertRevision(request.expectedRevision);
      const { record } = await configuration.readConfiguration();
      if (!record) fail('CONFIGURATION_UNAVAILABLE', 'Saved protection settings are unavailable.');
      return { filename: 'biscotty-configuration.json', text: serializePortable(record) };
    },
    async inspectImport(payload, request) {
      // Check the byte limit before parsing, native validation, or retaining staged data.
      const raw = parsePortableText(payload.text);
      if (!['merge', 'replace'].includes(payload.mode)) fail('INVALID_REQUEST', 'Choose Merge or Replace.');
      const initial = await snapshot(payload, request);
      if (initial.recovery && payload.mode !== 'replace') fail('CONFIGURATION_UNAVAILABLE', 'Configuration recovery requires a reviewed Replace import.');
      const stage = { ...initial, activePlanToken: null, planGeneration: 0 };
      // This private handle also guards against invalidation while native checks are pending.
      const token = handles.issue('import', request.owner, stage);
      try {
        stage.source = validatePortable(raw, await factsFor(raw));
        const current = await checkStage(stage, payload, request);
        requireImportHandle(token, request.owner, stage);
        stage.existing = current.state.record || recoveryRecord(current);
        return { importHandle: token, containers: clone(stage.source.containers), mode: payload.mode, recovery: stage.recovery };
      } catch (error) {
        handles.remove(token);
        throw error;
      }
    },
    async planImport(payload, request) {
      const stage = handles.get(payload.importHandle, 'import', request.owner, 'STALE_IMPORT');
      // A newer mapping request invalidates an older request even when native checks are still pending.
      const generation = ++stage.planGeneration;
      if (stage.activePlanToken) handles.remove(stage.activePlanToken);
      stage.activePlanToken = null;
      await checkStage(stage, payload, request);
      requireImportHandle(payload.importHandle, request.owner, stage);
      requirePlanGeneration(stage, generation);
      if (stage.recovery && payload.mode !== 'replace') fail('CONFIGURATION_UNAVAILABLE', 'Configuration recovery requires Replace.');
      const retainedRefs = Object.create(null);
      for (const container of stage.source.containers) retainedRefs[container.ref] = opaqueId();
      const base = createImportPlan({ source: stage.source, existing: stage.existing, mode: payload.mode, mappings: payload.mappings, retainedRefs });
      base.recovery = stage.recovery;
      const plan = resolveImportPlan(base);
      if (plan.unresolvedConflicts.length === 0) plan.candidate = validateConfiguration(plan.candidate, await factsFor({ rules: plan.candidate.rules }));
      await checkStage(stage, payload, request);
      requireImportHandle(payload.importHandle, request.owner, stage);
      requirePlanGeneration(stage, generation);
      const token = handles.issue('importPlan', request.owner, { stage, plan, importHandle: payload.importHandle });
      stage.activePlanToken = token;
      return planView(token, plan);
    },
    async resolveImport(payload, request) {
      const stored = handles.get(payload.planToken, 'importPlan', request.owner, 'STALE_IMPORT');
      requireActivePlan(payload.planToken, request.owner, stored);
      await checkStage(stored.stage, payload, request);
      requireActivePlan(payload.planToken, request.owner, stored);
      const plan = resolveImportPlan(stored.plan, payload.decisions || [], payload.acknowledgments || {});
      // Validate the actual resolved result before presenting it as committable.
      if (plan.unresolvedConflicts.length === 0) plan.candidate = validateConfiguration(plan.candidate, await factsFor({ rules: plan.candidate.rules }));
      await checkStage(stored.stage, payload, request);
      requireActivePlan(payload.planToken, request.owner, stored);
      handles.remove(payload.planToken);
      const token = handles.issue('importPlan', request.owner, { ...stored, plan });
      stored.stage.activePlanToken = token;
      return planView(token, plan);
    },
    async commitImport(payload, request) {
      const stored = handles.get(payload.planToken, 'importPlan', request.owner, 'STALE_IMPORT');
      requireActivePlan(payload.planToken, request.owner, stored);
      await checkStage(stored.stage, payload, request);
      requireActivePlan(payload.planToken, request.owner, stored);
      if (isLocked()) fail('OPERATION_ACTIVE', 'Wait for the active cookie burn before applying settings.');
      if (!stored.plan.canCommit) fail('UNRESOLVED_CONFLICTS', 'Resolve each conflict and confirm the final preview before applying.');
      const candidate = validateConfiguration(stored.plan.candidate, await factsFor({ rules: stored.plan.candidate.rules }));
      await checkStage(stored.stage, payload, request);
      requireActivePlan(payload.planToken, request.owner, stored);
      const result = await configuration.commitConfiguration({
        expectedRevision: request.expectedRevision,
        expectedCatalogGeneration: stored.stage.state.catalogGeneration,
        candidate,
        recoveryToken: payload.recoveryToken
      });
      handles.remove(payload.planToken);
      handles.remove(stored.importHandle);
      return { configuration: editable(result.record), revision: result.record.revision };
    }
  };
  return { handlers };
}
