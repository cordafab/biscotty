import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCookie, assessSelector, getSiteProtection, planQuickProtection } from '../../../src/core/policy/index.js';
import { emptyRecord, rule } from '../../harness/fixtures.js';
const cookie = { domain: '.example.com', name: 'login', path: '/', secure: false, httpOnly: false, session: true, firstPartyDomain: '', partitionKey: null };
const configuration = rules => ({ ...emptyRecord(), rules });
const selected = (...storeRefs) => ({ type: 'selected', storeRefs });
test('RULE-A01/A02 selected store scopes keep Work, Personal and Normal separate', () => {
  let cfg = configuration([rule({ scope: selected('work') })]);
  assert.equal(matchCookie(cookie, cfg, 'work').protected, true);
  for (const ref of ['personal', 'normal']) assert.equal(matchCookie(cookie, cfg, ref).protected, false);
  cfg = configuration([rule({ scope: selected('work', 'personal') })]);
  for (const ref of ['work', 'personal']) assert.equal(matchCookie(cookie, cfg, ref).protected, true);
  assert.equal(matchCookie(cookie, cfg, 'normal').protected, false);
});
test('RULE-A03/A04 all stores include future containers; whole-container protection is independent', () => {
  for (const ref of ['work', 'personal', 'normal', 'future']) assert.equal(matchCookie(cookie, configuration([rule()]), ref).protected, true);
  const cfg = { ...emptyRecord(), protectedContainerRefs: ['work'] };
  assert.equal(matchCookie(cookie, cfg, 'work').protected, true);
  assert.equal(matchCookie(cookie, cfg, 'normal').protected, false);
});
test('RULE-A05 exact domains, boundary subdomains, case-sensitive names and null/empty distinctions', () => {
  const cfg = configuration([rule({ includeSubdomains: false, name: '', path: '/' })]);
  assert.equal(matchCookie({ ...cookie, domain: 'EXAMPLE.COM.', name: '' }, cfg, 'normal').protected, true);
  for (const changed of [{ domain: 'sub.example.com' }, { name: 'login' }, { path: '/a' }]) assert.equal(matchCookie({ ...cookie, name: '', ...changed }, cfg, 'normal').protected, false);
  const broad = configuration([rule()]);
  assert.equal(matchCookie({ ...cookie, domain: 'sub.example.com' }, broad, 'normal').protected, true);
  for (const domain of ['badexample.com', 'example.com.attacker.test']) assert.equal(matchCookie({ ...cookie, domain }, broad, 'normal').protected, false);
  assert.equal(matchCookie({ ...cookie, name: 'Login' }, configuration([rule({ name: 'login' })]), 'normal').protected, false);
});
test('RULE-A06 protection is independent of partition and cookie flags', () => {
  const cfg = configuration([rule()]);
  for (const partitionKey of [null, { topLevelSite: 'https://other.test' }, { topLevelSite: 'https://third.test', hasCrossSiteAncestor: true }]) assert.equal(matchCookie({ ...cookie, partitionKey, firstPartyDomain: 'first.test', secure: true, httpOnly: true, session: false }, cfg, 'normal').protected, true);
});
const selector = overrides => ({ model: 'firefox-url-v1', url: 'https://sub.example.com/account/login', name: 'login', storeRef: 'normal', firstPartyDomain: '', partitionKey: null, ...overrides });
test('SAFE-02/03/04/05 selector guard intersects future protected parent domains and matching paths', () => {
  const cfg = configuration([rule({ includeSubdomains: false, path: '/account', name: 'login' })]);
  assert.equal(assessSelector(selector(), cfg, 'normal').status, 'unsafe');
  assert.equal(assessSelector(selector({ url: 'https://sub.example.com/accounting' }), cfg, 'normal').status, 'safe');
  assert.equal(assessSelector(selector({ name: 'other' }), cfg, 'normal').status, 'safe');
  assert.equal(assessSelector(selector(), configuration([rule({ domain: 'child.sub.example.com' })]), 'normal').status, 'safe');
  assert.equal(assessSelector(selector(), configuration([rule({ scope: selected('work') })]), 'normal').status, 'safe');
});
test('SAFE-06/07 unknown model, missing partition context, unknown partition fields and encoded paths skip', () => {
  for (const overrides of [{ model: 'unknown' }, { firstPartyDomain: undefined }, { partitionKey: undefined }, { partitionKey: { topLevelSite: 'https://a.test', future: true } }, { url: 'https://example.com/a%2Fb' }]) assert.equal(assessSelector(selector(overrides), emptyRecord(), 'normal').status, 'unknown');
  assert.equal(assessSelector(selector({ partitionKey: { topLevelSite: 'https://a.test', hasCrossSiteAncestor: true } }), emptyRecord(), 'normal').status, 'safe');
});
test('UI-A02/A03 saved rules determine full/partial site state without cookies', () => {
  const target = { domain: 'example.com', includeSubdomains: true };
  assert.equal(getSiteProtection(target, configuration([rule()]), 'normal').status, 'full');
  for (const overrides of [{ name: 'login' }, { path: '/' }, { includeSubdomains: false }, { domain: 'sub.example.com' }]) assert.equal(getSiteProtection(target, configuration([rule(overrides)]), 'normal').status, 'partial');
  assert.equal(getSiteProtection(target, emptyRecord(), 'normal').status, 'none');
});
test('UI-A04/A05 quick add/removal affects current store and preserves narrower rules', () => {
  const target = { domain: 'example.com', includeSubdomains: true };
  const initial = configuration([rule({ scope: selected('personal') }), rule({ name: 'login', scope: selected('work') })]);
  const added = planQuickProtection(initial, target, 'work', true).candidate;
  assert.deepEqual(added.rules[0].scope.storeRefs, ['personal', 'work']);
  const removed = planQuickProtection(added, target, 'work', false).candidate;
  assert.deepEqual(removed.rules[0].scope.storeRefs, ['personal']);
  assert.equal(getSiteProtection(target, removed, 'work').status, 'partial');
  assert.deepEqual(initial.rules[0].scope.storeRefs, ['personal']);
});
test('UI-A06 inherited all-store, broader and whole-container protection require editor', () => {
  const target = { domain: 'sub.example.com', includeSubdomains: true };
  for (const cfg of [configuration([rule()]), { ...emptyRecord(), protectedContainerRefs: ['work'] }]) {
    const result = planQuickProtection(cfg, target, 'work', false);
    assert.equal(result.editorRequired, true);
    assert.deepEqual(result.candidate, cfg);
  }
});
test('SAFE-07 noncanonical selector hosts cannot bypass protection through a final hostname dot', () => {
  const result = assessSelector(selector({ url: 'https://example.com./account' }), configuration([rule()]), 'normal');
  assert.equal(result.status, 'unknown');
});

test('partition exceptions override matching rules only with supported third-party identity and trusted facts', () => {
  const exception = { cookieDomain: 'example.com', cookieIncludeSubdomains: true, topLevelDomain: 'other.test', topLevelIncludeSubdomains: false, scheme: 'https', name: 'login', path: '/', scope: selected('work'), enabled: true };
  const cfg = { ...configuration([rule()]), exceptions: [exception] };
  const partitioned = { ...cookie, partitionKey: { topLevelSite: 'https://other.test', hasCrossSiteAncestor: true } };
  const facts = { cookieDomain: { host: 'example.com', kind: 'dns', knownSuffix: false, baseDomain: 'example.com' }, topLevelSite: { host: 'other.test', kind: 'dns', knownSuffix: false, baseDomain: 'other.test' } };
  const result = matchCookie(partitioned, cfg, 'work', facts);
  assert.equal(result.protected, false);
  assert.deepEqual(result.matchingExceptionIndexes, [0]);
  assert.equal(result.overriddenRules[0].ruleIndex, 0);
  for (const [item, config, store, context] of [
    [partitioned, cfg, 'normal', facts], [partitioned, cfg, 'work', undefined],
    [{ ...partitioned, partitionKey: null }, cfg, 'work', facts],
    [{ ...partitioned, partitionKey: { ...partitioned.partitionKey, future: true } }, cfg, 'work', facts],
    [{ ...partitioned, partitionKey: { topLevelSite: 'http://other.test' } }, cfg, 'work', facts],
    [partitioned, { ...cfg, exceptions: [{ ...exception, enabled: false }] }, 'work', facts],
    [partitioned, { ...cfg, protectedContainerRefs: ['work'] }, 'work', facts],
    [partitioned, cfg, 'work', { ...facts, topLevelSite: { ...facts.topLevelSite, baseDomain: 'example.com' } }]
  ]) assert.equal(matchCookie(item, config, store, context).protected, true);
});

test('exception site comparison rejects same base domains and supports multiple enabled matches', () => {
  const exception = { cookieDomain: 'example.com', cookieIncludeSubdomains: true, topLevelDomain: 'site.example.com', topLevelIncludeSubdomains: false, scheme: 'all', name: null, path: null, scope: { type: 'all' }, enabled: true };
  const item = { ...cookie, domain: 'sub.example.com', partitionKey: { topLevelSite: 'https://site.example.com' } };
  const facts = { cookieDomain: { host: 'sub.example.com', kind: 'dns', knownSuffix: false, baseDomain: 'example.com' }, topLevelSite: { host: 'site.example.com', kind: 'dns', knownSuffix: false, baseDomain: 'example.com' } };
  assert.equal(matchCookie(item, { ...configuration([rule()]), exceptions: [exception] }, 'normal', facts).protected, true);
  const separate = { ...item, partitionKey: { topLevelSite: 'https://other.test' } };
  const otherFacts = { ...facts, topLevelSite: { host: 'other.test', kind: 'dns', knownSuffix: false, baseDomain: 'other.test' } };
  const first = { ...exception, topLevelDomain: 'other.test' };
  const second = { ...first, scheme: 'https' };
  const cfg = { ...configuration([rule()]), exceptions: [first, second] };
  assert.deepEqual(matchCookie(separate, cfg, 'normal', otherFacts).matchingExceptionIndexes, [0, 1]);
  cfg.exceptions[0].enabled = false;
  assert.deepEqual(matchCookie(separate, cfg, 'normal', otherFacts).matchingExceptionIndexes, [1]);
});

test('selector proof permits only completely covered protected cookie domains and paths', async () => {
  const { selectorCandidateHosts } = await import('../../../src/core/policy/index.js');
  const s = selector({ partitionKey: { topLevelSite: 'https://other.test' } });
  const exception = { cookieDomain: 'example.com', cookieIncludeSubdomains: true, topLevelDomain: 'other.test', topLevelIncludeSubdomains: false, scheme: 'https', name: null, path: null, scope: { type: 'all' }, enabled: true };
  const cfg = { ...configuration([rule()]), exceptions: [exception] };
  const domainFact = host => ({ host, kind: 'dns', knownSuffix: host === 'com', baseDomain: host === 'com' ? null : 'example.com' });
  const facts = { cookieDomains: new Map(selectorCandidateHosts(s).map(host => [host, domainFact(host)])), topLevelSite: { host: 'other.test', kind: 'dns', knownSuffix: false, baseDomain: 'other.test' } };
  assert.deepEqual(selectorCandidateHosts(s), ['sub.example.com', 'example.com', 'com']);
  assert.equal(assessSelector(s, cfg, 'normal', facts).status, 'safe');
  assert.equal(assessSelector({ ...s, firstPartyDomain: 'different.test' }, cfg, 'normal', facts).status, 'unsafe');
  assert.equal(assessSelector(s, cfg, 'normal').status, 'unsafe');
  assert.equal(assessSelector(s, { ...cfg, exceptions: [{ ...exception, cookieIncludeSubdomains: false }] }, 'normal', facts).status, 'unsafe');
  assert.equal(assessSelector(s, { ...cfg, exceptions: [{ ...exception, path: '/account' }] }, 'normal', facts).status, 'unsafe');
  assert.equal(assessSelector(s, { ...cfg, rules: [rule({ path: '/account' })], exceptions: [{ ...exception, path: '/account' }] }, 'normal', facts).status, 'safe');
  facts.cookieDomains.delete('example.com');
  assert.equal(assessSelector(s, cfg, 'normal', facts).status, 'unsafe');
});

test('site policy summaries cannot claim full protection over an applicable exception', async () => {
  const { getDomainProtection } = await import('../../../src/core/policy/index.js');
  const entry = { cookieDomain: 'example.com', cookieIncludeSubdomains: false, topLevelDomain: 'other.test', topLevelIncludeSubdomains: false, scheme: 'https', name: null, path: null, scope: { type: 'all' }, enabled: true };
  const cfg = { ...configuration([rule()]), exceptions: [entry] };
  assert.equal(getSiteProtection({ domain: 'example.com', includeSubdomains: true }, cfg, 'normal').status, 'partial');
  assert.equal(getDomainProtection('example.com', cfg, 'normal').status, 'partial');
  assert.equal(getDomainProtection('sub.example.com', cfg, 'normal').status, 'full');
  assert.equal(getSiteProtection({ domain: 'example.com', includeSubdomains: true }, { ...cfg, protectedContainerRefs: ['work'] }, 'work').status, 'full');
  assert.equal(getSiteProtection({ domain: 'example.com', includeSubdomains: true }, { ...cfg, exceptions: [{ ...entry, enabled: false }] }, 'normal').status, 'full');
});
