import test from 'node:test';
import assert from 'node:assert/strict';
import { planInventoryChoices } from '../../../src/core/policy/inventory-choices.js';
import { emptyRecord, rule } from '../../harness/fixtures.js';

const record = () => ({ ...emptyRecord(), schemaVersion: 2, exceptions: [] });
const cookie = { domain: 'example.com', name: 'login', path: '/', firstPartyDomain: '', partitionKey: { topLevelSite: 'https://other.test' } };
const facts = { cookieDomain: { host: 'example.com', kind: 'dns', knownSuffix: false, baseDomain: 'example.com' }, topLevelSite: { host: 'other.test', kind: 'dns', knownSuffix: false, baseDomain: 'other.test' } };
const pick = (choice, extra = {}) => ({ cookie, facts, storeRef: 'normal', choice, scopeAcknowledged: true, ...extra });

test('inventory choices require scope review and atomically add exact persistent rules', () => {
  const base = record();
  const pending = planInventoryChoices({ record: base, choices: [pick('keep', { scopeAcknowledged: false })] });
  assert.equal(pending.conflicts[0].code, 'SCOPE_REVIEW_REQUIRED');
  assert.deepEqual(pending.candidate, base);
  const added = planInventoryChoices({ record: base, choices: [pick('keep')] });
  assert.equal(added.conflicts.length, 0);
  assert.equal(added.candidate.rules[0].name, 'login');
  assert.deepEqual(added.candidate.rules[0].scope.storeRefs, ['normal']);
  assert.deepEqual(base.rules, []);
});
test('partition burn choice needs valid distinct sites and keeps unrelated protection', () => {
  const base = { ...record(), rules: [rule(), rule({ domain: 'unrelated.test' })] };
  const added = planInventoryChoices({ record: base, choices: [pick('burnable')] });
  assert.deepEqual(added.conflicts, []);
  assert.deepEqual(added.candidate.rules, base.rules);
  assert.equal(added.candidate.exceptions[0].topLevelDomain, 'other.test');
  const same = pick('burnable', { cookie: { ...cookie, partitionKey: { topLevelSite: 'https://example.com' } }, facts: { cookieDomain: facts.cookieDomain, topLevelSite: facts.cookieDomain } });
  const blocked = planInventoryChoices({ record: base, choices: [same] });
  assert.equal(blocked.conflicts[0].code, 'UNREPRESENTABLE');
  assert.deepEqual(blocked.candidate, base);
});
test('existing exceptions cannot silently undo keep and batches reject conflicts without changes', () => {
  const base = record();
  const exception = { cookieDomain: 'example.com', cookieIncludeSubdomains: false, topLevelDomain: 'other.test', topLevelIncludeSubdomains: false, scheme: 'https', name: 'login', path: '/', scope: { type: 'all' }, enabled: true };
  base.exceptions = [exception];
  const blocked = planInventoryChoices({ record: base, choices: [pick('keep')] });
  assert.equal(blocked.conflicts[0].code, 'EXCEPTION_OVERRIDE');
  assert.deepEqual(blocked.candidate, base);
  const mixed = planInventoryChoices({ record: record(), choices: [pick('keep'), pick('burnable')] });
  assert.equal(mixed.conflicts[0].code, 'CONTRADICTORY_CHOICE');
  assert.deepEqual(mixed.candidate, record());
});
test('protected containers and missing classification remain protected', () => {
  const base = { ...record(), protectedContainerRefs: ['work'], containerBindings: [{ ref: 'work', cookieStoreId: 'id', name: 'Work', color: 'blue', icon: 'briefcase', state: 'active' }] };
  assert.equal(planInventoryChoices({ record: base, choices: [pick('burnable', { storeRef: 'work' })] }).conflicts[0].code, 'CONTAINER_PROTECTED');
  const existing = { ...record(), rules: [rule()], exceptions: [{ cookieDomain: 'example.com', cookieIncludeSubdomains: false, topLevelDomain: 'other.test', topLevelIncludeSubdomains: false, scheme: 'https', name: null, path: null, scope: { type: 'all' }, enabled: true }] };
  assert.equal(planInventoryChoices({ record: existing, choices: [pick('keep', { facts: undefined })] }).conflicts[0].code, 'DOMAIN_UNAVAILABLE');
});

test('jar choices persist for future names and paths and require scope review', () => {
  const base = record();
  const ask = planInventoryChoices({ record: base, choices: [pick('keep', { jarChoice: true, scopeAcknowledged: false })] });
  assert.equal(ask.conflicts[0].code, 'SCOPE_REVIEW_REQUIRED');
  assert.equal(ask.conflicts[0].scope.name, null);
  const kept = planInventoryChoices({ record: base, choices: [pick('keep', { jarChoice: true })] });
  assert.deepEqual(kept.conflicts, []);
  assert.equal(kept.candidate.rules[0].name, null);
  assert.equal(kept.candidate.rules[0].path, null);
  const burned = planInventoryChoices({ record: base, choices: [pick('burnable', { jarChoice: true })] });
  assert.deepEqual(burned.conflicts, []);
  assert.equal(burned.candidate.exceptions[0].name, null);
  assert.equal(burned.candidate.exceptions[0].path, null);
  assert.equal(burned.candidate.exceptions[0].topLevelDomain, 'other.test');
});
test('jar keep refuses enabled exception ambiguity and contradictory individual choices atomically', () => {
  const base = record();
  const selected = [pick('keep', { jarChoice: true }), pick('burnable')];
  const result = planInventoryChoices({ record: base, choices: selected });
  assert.equal(result.conflicts[0].code, 'CONTRADICTORY_CHOICE');
  assert.deepEqual(result.candidate, base);
  const withException = { ...base, exceptions: [{ cookieDomain: 'example.com', cookieIncludeSubdomains: false, topLevelDomain: 'other.test', topLevelIncludeSubdomains: false, scheme: 'https', name: 'future', path: null, scope: { type: 'all' }, enabled: true }] };
  const conflict = planInventoryChoices({ record: withException, choices: [pick('keep', { jarChoice: true })] });
  assert.equal(conflict.conflicts[0].code, 'EXCEPTION_CONFLICT');
  assert.deepEqual(conflict.candidate, withException);
});
test('jar keep permits unrelated exceptions while rejecting overlapping subdomain exceptions', () => {
  const item = { cookieDomain: 'other.example', cookieIncludeSubdomains: false, topLevelDomain: 'other.test', topLevelIncludeSubdomains: false, scheme: 'https', name: null, path: null, scope: { type: 'all' }, enabled: true };
  const unrelated = { ...record(), exceptions: [item] };
  assert.deepEqual(planInventoryChoices({ record: unrelated, choices: [pick('keep', { jarChoice: true })] }).conflicts, []);
  const overlap = { ...record(), exceptions: [{ ...item, cookieDomain: 'example.com', topLevelDomain: 'test', topLevelIncludeSubdomains: true }] };
  assert.equal(planInventoryChoices({ record: overlap, choices: [pick('keep', { jarChoice: true })] }).conflicts[0].code, 'EXCEPTION_CONFLICT');
});

test('jar conflicts with a different individual cookie in either order', () => {
  const jar = pick('keep', { jarChoice: true });
  const individual = pick('burnable', { cookie: { ...cookie, name: 'other' } });
  for (const choices of [[jar, individual], [individual, jar]]) {
    const result = planInventoryChoices({ record: record(), choices });
    assert.ok(result.conflicts.some(item => item.code === 'CONTRADICTORY_CHOICE'));
    assert.deepEqual(result.candidate, record());
  }
});
