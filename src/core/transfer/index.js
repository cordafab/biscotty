import { fail, clone } from '../errors.js';
import { normalizeDomain, validateConfiguration, matcherKey, LIMITS } from '../configuration/index.js';

export const MAX_BYTES = LIMITS.bytes;
const portableKeys = ['format', 'schemaVersion', 'containers', 'protectedContainerRefs', 'rules'];
const containerKeys = ['ref', 'name', 'color', 'icon', 'state'];
const bytes = value => new TextEncoder().encode(value).length;
const exact = (value, keys, field) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) {
    fail('VALIDATION_FAILED', 'The configuration contains missing or unknown fields.', { field });
  }
};
const text = (value, field) => {
  if (typeof value !== 'string' || [...value].length > 4096) fail('VALIDATION_FAILED', 'A configuration string is invalid or too long.', { field });
  return value;
};
const uniqueSorted = values => [...new Set(values)].sort();
const scopeKey = scope => scope.type === 'all' ? 'all' : JSON.stringify(uniqueSorted(scope.storeRefs));
export function parsePortableText(value) {
  if (typeof value !== 'string') fail('VALIDATION_FAILED', 'Choose a UTF-8 JSON configuration file.', { field: 'text' });
  if (bytes(value) > MAX_BYTES) fail('VALIDATION_FAILED', 'The configuration file exceeds 2 MiB.', { field: 'text' });
  let parsed;
  try { parsed = JSON.parse(value); } catch { fail('VALIDATION_FAILED', 'The configuration file is not valid JSON.', { field: 'text' }); }
  if (parsed?.format !== 'biscotty-config' || parsed?.schemaVersion !== 1) fail('UNSUPPORTED_FORMAT', 'This configuration format or version is unsupported.');
  return parsed;
}
export function portableDomains(raw) {
  if (!Array.isArray(raw?.rules) || raw.rules.length > 10000) fail('VALIDATION_FAILED', 'The allow-rule list is invalid or too large.', { field: 'rules' });
  return uniqueSorted(raw.rules.map(rule => normalizeDomain(rule?.domain)));
}
export function validatePortable(raw, facts) {
  exact(raw, portableKeys, 'configuration');
  if (raw.format !== 'biscotty-config' || raw.schemaVersion !== 1) fail('UNSUPPORTED_FORMAT', 'This configuration format or version is unsupported.');
  if (!Array.isArray(raw.containers) || raw.containers.length > 1000) fail('VALIDATION_FAILED', 'The container list is invalid or too large.', { field: 'containers' });
  const references = new Set();
  const containers = raw.containers.map((container, index) => {
    exact(container, containerKeys, `containers.${index}`);
    const ref = text(container.ref, `containers.${index}.ref`);
    if (!ref || ref === 'normal' || references.has(ref)) fail('VALIDATION_FAILED', 'Container references must be unique and cannot use Normal browsing.', { field: `containers.${index}.ref` });
    references.add(ref);
    if (!['active', 'inactive'].includes(container.state)) fail('VALIDATION_FAILED', 'The container state is invalid.', { field: `containers.${index}.state` });
    return { ref, name: text(container.name, `containers.${index}.name`), color: text(container.color, `containers.${index}.color`), icon: text(container.icon, `containers.${index}.icon`), state: container.state };
  });
  const record = validateConfiguration({
    schemaVersion: 1,
    revision: 0,
    containerBindings: containers.map(container => ({ ...container, cookieStoreId: null, state: 'inactive' })),
    protectedContainerRefs: raw.protectedContainerRefs,
    rules: raw.rules
  }, facts);
  return { format: 'biscotty-config', schemaVersion: 1, containers, protectedContainerRefs: record.protectedContainerRefs, rules: record.rules };
}
export function exportPortable(record) {
  const refs = new Map(record.containerBindings.map((binding, index) => [binding.ref, `c${index + 1}`]));
  const ref = value => value === 'normal' ? 'normal' : refs.get(value);
  return {
    format: 'biscotty-config', schemaVersion: 1,
    containers: record.containerBindings.map(binding => ({ ref: ref(binding.ref), name: binding.name, color: binding.color, icon: binding.icon, state: binding.state })),
    protectedContainerRefs: uniqueSorted(record.protectedContainerRefs.map(ref)),
    rules: record.rules.map(rule => ({ domain: rule.domain, includeSubdomains: rule.includeSubdomains, name: rule.name, path: rule.path, scope: rule.scope.type === 'all' ? { type: 'all' } : { type: 'selected', storeRefs: uniqueSorted(rule.scope.storeRefs.map(ref)) } }))
  };
}
function encodePortable(record) {
  const text = `${JSON.stringify(exportPortable(record))}\n`;
  return { text, bytes: bytes(text) };
}
export function portableExportStatus(record) {
  const { bytes } = encodePortable(record);
  return { bytes, limitBytes: MAX_BYTES, canExport: bytes <= MAX_BYTES };
}
export function serializePortable(record) {
  const encoded = encodePortable(record);
  if (encoded.bytes > MAX_BYTES) fail('VALIDATION_FAILED', 'The complete portable configuration exceeds 2 MiB. Reduce rules, remove unused inactive references, or shorten container names in Firefox.', { field: 'configuration', bytes: encoded.bytes, limitBytes: MAX_BYTES });
  return encoded.text;
}
export function combineScopes(left, right) {
  return left.type === 'all' || right.type === 'all' ? { type: 'all' } : { type: 'selected', storeRefs: uniqueSorted([...left.storeRefs, ...right.storeRefs]) };
}

export function createImportPlan({ source, existing, mode, mappings, retainedRefs = {} }) {
  if (!['merge', 'replace'].includes(mode)) fail('INVALID_REQUEST', 'Choose Merge or Replace.');
  if (!Array.isArray(mappings) || mappings.length !== source.containers.length) fail('UNRESOLVED_CONFLICTS', 'Confirm a mapping for every source container.');
  const bySource = new Map();
  const existingBindingRefs = new Set(existing.containerBindings.map(binding => binding.ref));
  const existingProtected = new Set(existing.protectedContainerRefs);
  const sourceProtected = new Set(source.protectedContainerRefs);
  const available = new Map(existing.containerBindings.filter(binding => binding.state === 'active' && binding.cookieStoreId !== null).map(binding => [binding.ref, binding]));
  const sourceRefs = new Set(source.containers.map(container => container.ref));
  for (const mapping of mappings) {
    const allowed = mapping?.action === 'map' ? ['sourceRef', 'action', 'targetRef'] : ['sourceRef', 'action'];
    exact(mapping, allowed, 'mappings');
    if (!sourceRefs.has(mapping.sourceRef) || bySource.has(mapping.sourceRef) || !['map', 'retain', 'exclude'].includes(mapping.action)) fail('UNRESOLVED_CONFLICTS', 'Every source container requires one valid mapping.');
    if (mapping.action === 'map' && !available.has(mapping.targetRef)) fail('VALIDATION_FAILED', 'Map only to an available destination container.', { field: 'mappings' });
    bySource.set(mapping.sourceRef, mapping);
  }
  const bindings = clone(existing.containerBindings);
  const usedRefs = new Set(bindings.map(binding => binding.ref));
  const mapped = new Map([['normal', 'normal']]);
  const destinations = new Map();
  const excluded = [];
  const inactive = [];
  for (let index = 0; index < source.containers.length; index++) {
    const container = source.containers[index];
    const decision = bySource.get(container.ref);
    if (decision.action === 'exclude') {
      mapped.set(container.ref, null);
      excluded.push({ type: 'container', sourceRef: container.ref, name: container.name, protected: sourceProtected.has(container.ref) });
      continue;
    }
    let targetRef = decision.targetRef;
    if (decision.action === 'retain') {
      targetRef = retainedRefs[container.ref];
      if (typeof targetRef !== 'string' || !targetRef || targetRef === 'normal' || usedRefs.has(targetRef)) {
        let number = index + 1;
        do { targetRef = `retained-${number++}`; } while (usedRefs.has(targetRef));
      }
      usedRefs.add(targetRef);
      const binding = { ref: targetRef, cookieStoreId: null, name: container.name, color: container.color, icon: container.icon, state: 'inactive' };
      bindings.push(binding);
      inactive.push({ ref: targetRef, sourceRef: container.ref, name: container.name });
    }
    mapped.set(container.ref, targetRef);
    if (!destinations.has(targetRef)) destinations.set(targetRef, []);
    destinations.get(targetRef).push({ sourceRef: container.ref, name: container.name, protected: sourceProtected.has(container.ref) });
  }
  const importedRules = [];
  for (let index = 0; index < source.rules.length; index++) {
    const rule = source.rules[index];
    if (rule.scope.type === 'all') importedRules.push(clone(rule));
    else {
      const storeRefs = uniqueSorted(rule.scope.storeRefs.map(ref => mapped.get(ref)).filter(Boolean));
      const removedRefs = rule.scope.storeRefs.filter(ref => ref !== 'normal' && mapped.get(ref) === null);
      if (removedRefs.length) excluded.push({ type: storeRefs.length ? 'ruleScope' : 'rule', sourceIndex: index, rule: clone(rule), sourceRefs: removedRefs, remainingStoreRefs: storeRefs });
      if (storeRefs.length) importedRules.push({ ...clone(rule), scope: { type: 'selected', storeRefs } });
    }
  }
  const conflicts = [];
  const duplicates = [];
  const existingRules = new Map(existing.rules.map(rule => [matcherKey(rule), rule]));
  for (let index = 0; index < importedRules.length; index++) {
    const imported = importedRules[index];
    const old = existingRules.get(matcherKey(imported));
    if (old && scopeKey(old.scope) !== scopeKey(imported.scope)) conflicts.push({ id: `rule-${index}`, type: 'scope', key: matcherKey(imported), existing: clone(old), imported: clone(imported), choices: ['existing', 'imported', 'combine'] });
    else if (old) duplicates.push({ type: 'rule', rule: clone(imported) });
  }
  const importedProtection = [];
  const manyToOne = [];
  for (const [targetRef, sources] of destinations) {
    if (sources.length > 1) manyToOne.push({ targetRef, sources: clone(sources) });
    const old = existingProtected.has(targetRef);
    const mixed = new Set(sources.map(source => source.protected)).size > 1;
    if (mixed) {
      conflicts.push({ id: `mapping-${importedProtection.length}`, type: 'mappingProtection', targetRef, existing: { protected: old }, imported: clone(sources), choices: ['protected', 'unprotected'] });
      importedProtection.push({ targetRef, conflictId: conflicts.at(-1).id });
    } else {
      const value = sources[0].protected;
      const bound = existingBindingRefs.has(targetRef);
      if (bound && old !== value) {
        conflicts.push({ id: `protection-${importedProtection.length}`, type: 'protection', targetRef, existing: { protected: old }, imported: { protected: value }, choices: ['existing', 'imported'] });
        importedProtection.push({ targetRef, conflictId: conflicts.at(-1).id });
      } else importedProtection.push({ targetRef, protected: value });
    }
  }
  return { mode, source: clone(source), existing: clone(existing), bindings, importedRules, importedProtection, conflicts, duplicates, excluded, inactive, manyToOne, decisions: {}, acknowledgments: {} };
}

export function resolveImportPlan(plan, decisions = [], acknowledgments = {}) {
  if (!Array.isArray(decisions) || !acknowledgments || typeof acknowledgments !== 'object' || Array.isArray(acknowledgments)) fail('INVALID_REQUEST', 'Import decisions are invalid.');
  const choices = { ...plan.decisions };
  const conflictsById = new Map(plan.conflicts.map(conflict => [conflict.id, conflict]));
  const scopeConflicts = new Map(plan.conflicts.filter(conflict => conflict.type === 'scope').map(conflict => [conflict.key, conflict]));
  const supplied = new Set();
  for (const decision of decisions) {
    exact(decision, ['conflictId', 'choice'], 'decisions');
    const conflict = conflictsById.get(decision.conflictId);
    if (!conflict || !conflict.choices.includes(decision.choice) || supplied.has(decision.conflictId)) fail('VALIDATION_FAILED', 'Choose one valid resolution for each conflict.', { field: 'decisions' });
    supplied.add(decision.conflictId);
    choices[decision.conflictId] = decision.choice;
  }
  if (Object.keys(acknowledgments).some(key => !['replace', 'exclusions', 'manyToOne', 'recovery'].includes(key) || typeof acknowledgments[key] !== 'boolean')) fail('VALIDATION_FAILED', 'Import acknowledgments are invalid.');
  const acks = { ...plan.acknowledgments, ...acknowledgments };
  const unresolved = plan.conflicts.filter(conflict => !choices[conflict.id]);
  const resultRules = new Map((plan.mode === 'merge' ? plan.existing.rules : []).map(rule => [matcherKey(rule), clone(rule)]));
  for (const imported of plan.importedRules) {
    const key = matcherKey(imported);
    const conflict = scopeConflicts.get(key);
    if (!conflict) resultRules.set(key, clone(imported));
    else {
      const choice = choices[conflict.id];
      if (choice === 'existing') resultRules.set(key, clone(conflict.existing));
      else if (choice === 'imported') resultRules.set(key, clone(imported));
      else if (choice === 'combine') resultRules.set(key, { ...clone(imported), scope: combineScopes(conflict.existing.scope, imported.scope) });
      else resultRules.delete(key);
    }
  }
  const protectedRefs = new Set(plan.mode === 'merge' ? plan.existing.protectedContainerRefs : []);
  for (const entry of plan.importedProtection) {
    let value = entry.protected;
    if (entry.conflictId) {
      const conflict = conflictsById.get(entry.conflictId);
      const choice = choices[entry.conflictId];
      value = conflict.type === 'mappingProtection' ? choice === 'protected' : choice === 'existing' ? conflict.existing.protected : choice === 'imported' ? conflict.imported.protected : undefined;
    }
    if (value === true) protectedRefs.add(entry.targetRef);
    else protectedRefs.delete(entry.targetRef);
  }
  const candidate = { schemaVersion: 1, revision: plan.existing.revision, containerBindings: clone(plan.bindings), rules: [...resultRules.values()], protectedContainerRefs: uniqueSorted(protectedRefs) };
  if (plan.mode === 'replace') {
    const retained = new Set([...candidate.protectedContainerRefs, ...plan.inactive.map(entry => entry.ref)]);
    for (const rule of candidate.rules) if (rule.scope.type === 'selected') for (const ref of rule.scope.storeRefs) retained.add(ref);
    // Replacement keeps active native catalog bindings and inactive references with reviewed protection.
    candidate.containerBindings = candidate.containerBindings.filter(binding => binding.state === 'active' || retained.has(binding.ref));
  }
  const oldRules = new Map(plan.existing.rules.map(rule => [matcherKey(rule), rule]));
  const added = [], changed = [], removed = [];
  for (const [key, rule] of resultRules) {
    const old = oldRules.get(key);
    if (!old) added.push({ type: 'rule', rule: clone(rule) });
    else if (scopeKey(old.scope) !== scopeKey(rule.scope)) changed.push({ type: 'rule', existing: clone(old), result: clone(rule) });
  }
  for (const [key, rule] of oldRules) if (!resultRules.has(key)) removed.push({ type: 'rule', rule: clone(rule) });
  for (const ref of candidate.protectedContainerRefs) if (!plan.existing.protectedContainerRefs.includes(ref)) added.push({ type: 'containerProtection', ref });
  for (const ref of plan.existing.protectedContainerRefs) if (!protectedRefs.has(ref)) removed.push({ type: 'containerProtection', ref });
  const finalBindingRefs = new Set(candidate.containerBindings.map(binding => binding.ref));
  for (const binding of plan.existing.containerBindings) if (!finalBindingRefs.has(binding.ref)) removed.push({ type: 'inactiveReference', ref: binding.ref, name: binding.name });
  const requiredAcknowledgments = [];
  if (plan.mode === 'replace') requiredAcknowledgments.push('replace');
  if (plan.excluded.length) requiredAcknowledgments.push('exclusions');
  if (plan.manyToOne.length) requiredAcknowledgments.push('manyToOne');
  if (plan.recovery) requiredAcknowledgments.push('recovery');
  const preview = {
    rules: clone(candidate.rules), protectedContainerRefs: clone(candidate.protectedContainerRefs),
    added, changed, removed, duplicates: clone(plan.duplicates), excluded: clone(plan.excluded), inactive: candidate.containerBindings.filter(binding => binding.state === 'inactive').map(binding => ({ ref: binding.ref, name: binding.name, ...(plan.inactive.find(entry => entry.ref === binding.ref) || {}) })), manyToOne: clone(plan.manyToOne),
    decisions: plan.conflicts.filter(conflict => choices[conflict.id]).map(conflict => ({ conflictId: conflict.id, choice: choices[conflict.id] })), requiredAcknowledgments,
    ...(plan.source.rules.some(rule => rule.scope.type === 'all') && plan.excluded.length ? { allStoresNotice: 'All stores rules continue to protect Normal browsing and all available named containers, including excluded mappings.' } : {}),
    ...(plan.recovery ? { recoveryWarning: 'Previous protection is unknown and cannot be preserved automatically. This replacement uses only the reviewed imported settings.' } : {})
  };
  return { ...plan, decisions: choices, acknowledgments: acks, candidate, preview, unresolvedConflicts: clone(unresolved), canCommit: unresolved.length === 0 && requiredAcknowledgments.every(key => acks[key] === true) };
}
