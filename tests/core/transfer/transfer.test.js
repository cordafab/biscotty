import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sizedRecord } from '../../harness/size-fixtures.js';
import { parsePortableText, validatePortable, exportPortable, serializePortable, createImportPlan, resolveImportPlan } from '../../../src/core/transfer/index.js';
const facts = Object.fromEntries(['example.com', 'example.net', 'other.test'].map(host => [host, { host, kind: 'dns', knownSuffix: false, baseDomain: host }]));
const rule = (overrides = {}) => ({ domain: 'example.com', includeSubdomains: true, name: null, path: null, scope: { type: 'all' }, ...overrides });
const binding = (ref, overrides = {}) => ({ ref, cookieStoreId: `native-${ref}`, name: 'Duplicate name', color: 'blue', icon: 'briefcase', state: 'active', ...overrides });
const record = (overrides = {}) => ({ schemaVersion: 1, revision: 4, containerBindings: [binding('work'), binding('personal')], rules: [], protectedContainerRefs: [], ...overrides });
const source = (overrides = {}) => ({ format: 'biscotty-config', schemaVersion: 1, containers: [{ ref: 'a', name: 'Duplicate name', color: 'blue', icon: 'briefcase', state: 'active' }, { ref: 'b', name: 'Duplicate name', color: 'green', icon: 'fingerprint', state: 'inactive' }], rules: [], protectedContainerRefs: [], ...overrides });
const mapping = [{ sourceRef: 'a', action: 'map', targetRef: 'work' }, { sourceRef: 'b', action: 'map', targetRef: 'personal' }];
const makePlan = (overrides = {}) => createImportPlan({ source: source(), existing: record(), mode: 'merge', mappings: mapping, ...overrides });
const exception = (overrides = {}) => ({ cookieDomain: 'example.com', cookieIncludeSubdomains: false, topLevelDomain: 'example.net', topLevelIncludeSubdomains: false, scheme: 'https', name: '', path: null, scope: { type: 'selected', storeRefs: ['work'] }, enabled: false, ...overrides });

test('partition exceptions round-trip and require explicit resolution when mapped scopes differ', () => {
  const saved = record({ schemaVersion: 2, exceptions: [exception()] });
  const portable = validatePortable(parsePortableText(serializePortable(saved)), facts);
  assert.equal(portable.schemaVersion, 2);
  assert.deepEqual(portable.exceptions[0].scope.storeRefs, ['c1']);
  assert.equal(portable.exceptions[0].enabled, false);
  const mapped = createImportPlan({ source: portable, existing: record({ schemaVersion: 2, exceptions: [exception({ scope: { type: 'selected', storeRefs: ['personal'] } })] }), mode: 'merge', mappings: [{ sourceRef: 'c1', action: 'map', targetRef: 'work' }, { sourceRef: 'c2', action: 'map', targetRef: 'personal' }] });
  assert.equal(mapped.conflicts[0].type, 'exception');
  const resolved = resolveImportPlan(mapped, [{ conflictId: mapped.conflicts[0].id, choice: 'combine' }]);
  assert.deepEqual(resolved.candidate.exceptions[0].scope.storeRefs, ['personal', 'work']);
  assert.equal(resolved.canCommit, true);
  const excluded = createImportPlan({ source: portable, existing: saved, mode: 'replace', mappings: [{ sourceRef: 'c1', action: 'exclude' }, { sourceRef: 'c2', action: 'exclude' }] });
  assert.equal(resolveImportPlan(excluded).candidate.exceptions.length, 0);
  assert.ok(excluded.excluded.some(item => item.type === 'exception'));
});

test('XFER-A01 export/reimport preserves null and empty exact names and inactive references', () => {
  const saved = record({ containerBindings: [binding('private-local-reference', { cookieStoreId: null, state: 'inactive' })], protectedContainerRefs: ['private-local-reference'], rules: [rule({ name: '' }), rule({ domain: 'example.net', name: null, scope: { type: 'selected', storeRefs: ['normal', 'private-local-reference'] } })] });
  const portable = validatePortable(parsePortableText(serializePortable(saved)), facts);
  assert.equal(portable.rules[0].name, ''); assert.equal(portable.rules[1].name, null);
  assert.equal(portable.containers[0].state, 'inactive');
  assert.deepEqual(portable.protectedContainerRefs, ['c1']);
});
test('XFER-A02 XFER-A03 duplicate names and inactive source states never infer destination identity', () => {
  assert.throws(() => makePlan({ mappings: [] }), { code: 'UNRESOLVED_CONFLICTS' });
  const plan = resolveImportPlan(makePlan({ source: source({ rules: [rule({ scope: { type: 'selected', storeRefs: ['a'] } })] }) }));
  assert.deepEqual(plan.candidate.rules[0].scope.storeRefs, ['work']);
  assert.equal(plan.candidate.containerBindings[0].cookieStoreId, 'native-work');
  assert.throws(() => makePlan({ mappings: [{ sourceRef: 'a', action: 'map', targetRef: 'normal' }, mapping[1]] }), { code: 'VALIDATION_FAILED' });
});
test('XFER-A04 retaining inactive creates only a local reference; exclusion is explicit', () => {
  const input = source({ protectedContainerRefs: ['a'], rules: [rule({ scope: { type: 'selected', storeRefs: ['b'] } })] });
  const plan = resolveImportPlan(makePlan({ source: input, mappings: [{ sourceRef: 'a', action: 'retain' }, { sourceRef: 'b', action: 'exclude' }] }));
  assert.equal(plan.candidate.containerBindings.at(-1).state, 'inactive');
  assert.equal(plan.candidate.containerBindings.at(-1).cookieStoreId, null);
  assert.equal(plan.preview.excluded.filter(entry => entry.type === 'rule').length, 1);
  assert.equal(plan.canCommit, false);
  assert.equal(resolveImportPlan(plan, [], { exclusions: true }).canCommit, true);
});
test('XFER-A05 Merge keeps existing-only entries; Replace previews and confirms removal', () => {
  const existing = record({ rules: [rule({ domain: 'other.test' })], protectedContainerRefs: ['work'] });
  const merge = resolveImportPlan(makePlan({ existing, mappings: [{ sourceRef: 'a', action: 'exclude' }, { sourceRef: 'b', action: 'exclude' }] }));
  assert.equal(merge.candidate.rules.length, 1); assert.deepEqual(merge.candidate.protectedContainerRefs, ['work']);
  const replace = resolveImportPlan(makePlan({ existing, mode: 'replace', mappings: [{ sourceRef: 'a', action: 'exclude' }, { sourceRef: 'b', action: 'exclude' }] }));
  assert.equal(replace.preview.removed.length, 2); assert.equal(replace.canCommit, false);
  assert.equal(resolveImportPlan(replace, [], { replace: true, exclusions: true }).canCommit, true);
});
test('XFER-A06 each mapped scope and protection difference requires a decision', () => {
  const plan = resolveImportPlan(makePlan({ source: source({ protectedContainerRefs: ['a'], rules: [rule()] }), existing: record({ rules: [rule({ scope: { type: 'selected', storeRefs: ['normal'] } })] }) }));
  assert.equal(plan.conflicts.length, 2); assert.equal(plan.unresolvedConflicts.length, 2); assert.equal(plan.canCommit, false);
  const one = resolveImportPlan(plan, [{ conflictId: plan.conflicts[0].id, choice: 'existing' }]);
  assert.equal(one.unresolvedConflicts.length, 1);
  assert.throws(() => resolveImportPlan(plan, [{ conflictId: 'invented', choice: 'existing' }]), { code: 'VALIDATION_FAILED' });
});
for (const choice of ['existing', 'imported', 'combine']) test(`XFER-A07 Replace honors ${choice} scope`, () => {
  const existing = record({ rules: [rule({ scope: { type: 'selected', storeRefs: ['work'] } })] });
  const input = source({ rules: [rule({ scope: { type: 'selected', storeRefs: ['b'] } })] });
  const plan = makePlan({ source: input, existing, mode: 'replace' });
  const result = resolveImportPlan(plan, [{ conflictId: plan.conflicts[0].id, choice }], { replace: true });
  assert.deepEqual(result.candidate.rules[0].scope.storeRefs, choice === 'existing' ? ['work'] : choice === 'imported' ? ['personal'] : ['personal', 'work']);
  assert.equal(result.canCommit, true);
});
test('XFER-A06 contradictory source flags mapped many-to-one require an explicit final flag', () => {
  const plan = resolveImportPlan(makePlan({ source: source({ protectedContainerRefs: ['a'] }), mappings: [{ sourceRef: 'a', action: 'map', targetRef: 'work' }, { sourceRef: 'b', action: 'map', targetRef: 'work' }] }));
  assert.equal(plan.conflicts[0].type, 'mappingProtection'); assert.equal(plan.canCommit, false);
  const resolved = resolveImportPlan(plan, [{ conflictId: plan.conflicts[0].id, choice: 'protected' }], { manyToOne: true });
  assert.equal(resolved.canCommit, true); assert.deepEqual(resolved.candidate.protectedContainerRefs, ['work']);
});
test('XFER-A09 malformed, unsupported, oversized, duplicate, and undefined inputs fail', () => {
  assert.throws(() => parsePortableText('{'), { code: 'VALIDATION_FAILED' });
  assert.throws(() => parsePortableText(JSON.stringify({ format: 'other', schemaVersion: 1 })), { code: 'UNSUPPORTED_FORMAT' });
  assert.throws(() => parsePortableText(' '.repeat(2 * 1024 * 1024 + 1)), { code: 'VALIDATION_FAILED' });
  assert.throws(() => validatePortable(source({ containers: [source().containers[0], source().containers[0]] }), facts), { code: 'VALIDATION_FAILED' });
  assert.throws(() => validatePortable(source({ rules: [rule({ scope: { type: 'selected', storeRefs: ['undefined'] } })] }), facts), { code: 'VALIDATION_FAILED' });
});
test('XFER-A10 unknown and prototype-related fields cannot change application objects', () => {
  const raw = parsePortableText(JSON.stringify(source()).replace('"format":', '"__proto__":{"polluted":true},"format":'));
  assert.throws(() => validatePortable(raw, facts), { code: 'VALIDATION_FAILED' });
  assert.equal({}.polluted, undefined);
  assert.throws(() => validatePortable(source({ rules: [{ ...rule(), value: 'forbidden' }] }), facts), { code: 'VALIDATION_FAILED' });
});
test('XFER-A12 export contains no private binding refs, identifiers, revisions, tokens, or inventories', () => {
  const saved = record({ containerBindings: [binding('local-secret-ref', { cookieStoreId: 'firefox-container-84' })] });
  const exported = serializePortable(saved);
  for (const forbidden of ['local-secret-ref', 'firefox-container-84', 'cookieStoreId', 'revision', 'token', 'cookies']) assert.equal(exported.includes(forbidden), false);
  assert.deepEqual(Object.keys(exportPortable(saved)).sort(), ['containers', 'format', 'protectedContainerRefs', 'rules', 'schemaVersion']);
});
test('XFER-A13 excluding named references never narrows All stores', () => {
  const plan = resolveImportPlan(makePlan({ source: source({ rules: [rule()] }), mappings: [{ sourceRef: 'a', action: 'exclude' }, { sourceRef: 'b', action: 'exclude' }] }));
  assert.deepEqual(plan.candidate.rules[0].scope, { type: 'all' });
  assert.match(plan.preview.allStoresNotice, /all available named containers/);
});
test('XFER-A14 supplied PRD example validates and retains protection meaning', async () => {
  const prd = await readFile(new URL('../../../docs/prd/05-configuration-transfer.md', import.meta.url), 'utf8');
  const example = validatePortable(parsePortableText(prd.match(/```json\n([\s\S]*?)\n```/)[1]), facts);
  assert.deepEqual(example.rules[0].scope, { type: 'selected', storeRefs: ['c1'] });
  assert.deepEqual(example.protectedContainerRefs, ['c2']);
  assert.equal(example.rules[1].name, 'login'); assert.deepEqual(example.rules[1].scope, { type: 'all' });
});
test('XFER-16 even matching many-to-one flags require explicit combined-effects acknowledgment', () => {
  const plan = resolveImportPlan(makePlan({ mappings: [{ sourceRef: 'a', action: 'map', targetRef: 'work' }, { sourceRef: 'b', action: 'map', targetRef: 'work' }] }));
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.preview.manyToOne.length, 1);
  assert.equal(plan.canCommit, false);
  assert.equal(resolveImportPlan(plan, [], { manyToOne: true }).canCommit, true);
});
test('XFER-A07 All stores combined with selected remains All stores', () => {
  const plan = makePlan({ source: source({ rules: [rule()] }), existing: record({ rules: [rule({ scope: { type: 'selected', storeRefs: ['normal'] } })] }), mode: 'replace' });
  const resolved = resolveImportPlan(plan, [{ conflictId: plan.conflicts[0].id, choice: 'combine' }], { replace: true });
  assert.deepEqual(resolved.candidate.rules[0].scope, { type: 'all' });
});
test('CFG-A06 XFER-A09 10,000 rules validate in full; one excess rule or overlong string fails', () => {
  const rules = Array.from({ length: 10000 }, (_, index) => rule({ name: `cookie-${index}` }));
  assert.equal(validatePortable(source({ rules }), facts).rules.length, 10000);
  assert.throws(() => validatePortable(source({ rules: [...rules, rule({ name: 'extra' })] }), facts), { code: 'VALIDATION_FAILED' });
  assert.throws(() => validatePortable(source({ containers: [{ ...source().containers[0], name: 'x'.repeat(4097) }] }), facts), { code: 'VALIDATION_FAILED' });
});

test('XFER-A15 large supported configurations export compactly and round-trip all rules', () => {
  const rules = Array.from({ length: 10000 }, (_, index) => rule({ name: `cookie-${index}`, scope: { type: 'selected', storeRefs: ['normal'] } }));
  const exported = serializePortable(record({ rules }));
  assert.ok(Buffer.byteLength(exported) <= 2 * 1024 * 1024);
  assert.equal(exported.split('\n').length, 2);
  assert.deepEqual(validatePortable(parsePortableText(exported), facts).rules, rules);
});

test('XFER-A15 portable UTF-8 size includes escaping, metadata, and the final newline', () => {
  const limit = 2 * 1024 * 1024;
  const exact = sizedRecord(limit);
  const exported = serializePortable(exact);
  assert.equal(Buffer.byteLength(exported), limit);
  assert.deepEqual(validatePortable(parsePortableText(exported), facts).rules, exact.rules);
  assert.throws(() => serializePortable(sizedRecord(limit + 1)), { code: 'VALIDATION_FAILED' });
});
