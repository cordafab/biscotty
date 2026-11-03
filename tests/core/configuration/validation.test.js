import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDomain, normalizeRule, validateConfiguration } from '../../../src/core/configuration/index.js';
import { emptyRecord, rule } from '../../harness/fixtures.js';
const fact = domain => ({ host: domain, kind: domain.startsWith('[') ? 'ipv6' : /^\d+\.\d+\.\d+\.\d+$/u.test(domain) ? 'ipv4' : 'dns', knownSuffix: ['com', 'co.uk'].includes(domain), baseDomain: null });
const facts = (...domains) => Object.fromEntries(domains.map(domain => [domain, fact(domain)]));
test('CFG-04/05/06 canonicalization uses IDNA and accepts hostname-only inputs', () => {
  assert.equal(normalizeDomain('.EXAMPLE.com.'), 'example.com');
  assert.equal(normalizeDomain('BÜCHER.example'), 'xn--bcher-kva.example');
  assert.equal(normalizeDomain('[2001:db8::1]'), '[2001:db8::1]');
  for (const domain of ['https://example.com', 'example.com:80', 'x@example.com', 'example.com/path', '*.example.com', '/example/', 'example.com?x', 'example.com#x', 'a..com', 'bad_host.test']) assert.throws(() => normalizeDomain(domain), { code: 'VALIDATION_FAILED' });
});
test('CFG-07/08 domain facts reject public suffixes and IP subdomain rules', () => {
  for (const domain of ['com', 'co.uk']) assert.throws(() => normalizeRule(rule({ domain }), facts(domain)), { code: 'VALIDATION_FAILED' });
  for (const domain of ['127.0.0.1', '[::1]']) {
    assert.throws(() => normalizeRule(rule({ domain }), facts(domain)), { code: 'VALIDATION_FAILED' });
    assert.equal(normalizeRule(rule({ domain, includeSubdomains: false }), facts(domain)).domain, domain);
  }
  assert.throws(() => normalizeRule(rule()), { code: 'VALIDATION_FAILED' });
});
test('CFG-01/02/03 rejects unknown fields, undefined refs, empty scopes and duplicate canonical matchers', () => {
  const cfg = { ...emptyRecord(), rules: [rule()] };
  assert.deepEqual(validateConfiguration(cfg, facts('example.com')), cfg);
  for (const bad of [{ ...cfg, extra: true }, { ...cfg, rules: [rule({ value: 'x' })] }, { ...cfg, rules: [rule({ scope: { type: 'selected', storeRefs: [] } })] }, { ...cfg, rules: [rule({ scope: { type: 'selected', storeRefs: ['missing'] } })] }, { ...cfg, rules: [rule(), rule({ domain: '.EXAMPLE.COM.' })] }, { ...cfg, protectedContainerRefs: ['normal'] }]) assert.throws(() => validateConfiguration(bad, facts('example.com')), { code: 'VALIDATION_FAILED' });
});
test('CFG-09 exact names and paths preserve case, empty names and literal wildcard characters', () => {
  const normalized = normalizeRule(rule({ name: '*Login', path: '/Account/%2F' }), facts('example.com'));
  assert.equal(normalized.name, '*Login'); assert.equal(normalized.path, '/Account/%2F');
  assert.notEqual(normalizeRule(rule({ name: '' }), facts('example.com')).name, null);
});
test('CFG-A06 limits admit 10,000 rules and reject rule/string/hostname/binding/byte overflows', () => {
  const rules = Array.from({ length: 10000 }, (_, index) => rule({ name: `${index}` }));
  assert.equal(validateConfiguration({ ...emptyRecord(), rules }, facts('example.com')).rules.length, 10000);
  assert.throws(() => validateConfiguration({ ...emptyRecord(), rules: [...rules, rule({ name: 'extra' })] }, facts('example.com')), { code: 'VALIDATION_FAILED' });
  assert.throws(() => normalizeRule(rule({ name: 'a'.repeat(4097) }), facts('example.com')), { code: 'VALIDATION_FAILED' });
  assert.throws(() => normalizeDomain(`${'a'.repeat(63)}.${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}`), { code: 'VALIDATION_FAILED' });
  const bindings = Array.from({ length: 1001 }, (_, i) => ({ ref: `c${i}`, cookieStoreId: null, name: '', color: '', icon: '', state: 'inactive' }));
  assert.throws(() => validateConfiguration({ ...emptyRecord(), containerBindings: bindings }), { code: 'VALIDATION_FAILED' });
  const large = Array.from({ length: 1000 }, (_, i) => rule({ name: `${i}${'x'.repeat(3000)}` }));
  assert.throws(() => validateConfiguration({ ...emptyRecord(), rules: large }, facts('example.com')), { code: 'VALIDATION_FAILED' });
});

test('version 2 validates exception selectors and keeps version 1 strict', async () => {
  const { validateConfiguration } = await import('../../../src/core/configuration/index.js');
  const facts = Object.fromEntries(['example.com', 'other.test'].map(host => [host, { host, kind: 'dns', knownSuffix: false, baseDomain: host }]));
  const entry = { cookieDomain: '.EXAMPLE.com', cookieIncludeSubdomains: false, topLevelDomain: 'other.test', topLevelIncludeSubdomains: true, scheme: 'https', name: null, path: '/', scope: { type: 'selected', storeRefs: ['normal'] }, enabled: true };
  const value = { schemaVersion: 2, revision: 4, containerBindings: [], protectedContainerRefs: [], rules: [], exceptions: [entry] };
  assert.equal(validateConfiguration(value, facts).exceptions[0].cookieDomain, 'example.com');
  for (const bad of [ { ...value, exceptions: [entry, { ...entry, enabled: false }] }, { ...value, exceptions: [{ ...entry, scheme: 'ftp' }] }, { ...value, exceptions: [{ ...entry, scope: { type: 'selected', storeRefs: ['missing'] } }] }, { ...value, schemaVersion: 1 } ]) {
    assert.throws(() => validateConfiguration(bad, facts), { code: 'VALIDATION_FAILED' });
  }
});
