import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../../../src/backend/gateway/application.js';
import { createTestAdapter, cookie } from '../../harness/adapter.js';
import { envelope, sender, rule, emptyRecord } from '../../harness/fixtures.js';

async function setup(options = {}) {
  const adapter = createTestAdapter(options);
  adapter.setTab({ cookieStoreId: 'firefox-default' });
  const app = createApplication(adapter, { extensionId: sender.id, baseURL: 'moz-extension://test/' });
  await app.ready();
  const request = (action, payload = {}, revision = app.configuration.view().revision, owner = sender) => app.dispatch(envelope(action, payload, revision), owner);
  const capture = async (payload = {}) => {
    const context = await request('getSiteContext', { windowId: 1 });
    assert.equal(context.ok, true);
    assert.ok(context.data.contextToken, JSON.stringify(context));
    const response = await request('getSiteCookieDomains', { contextToken: context.data.contextToken, ...payload });
    assert.equal(response.ok, true, JSON.stringify(response));
    return { contextToken: context.data.contextToken, ...response.data };
  };
  return { adapter, app, request, capture };
}
const siteCookie = overrides => cookie({ domain: 'shop.example.com', ...overrides });
const newRule = overrides => rule({ domain: 'shop.example.com', includeSubdomains: false, scope: { type: 'selected', storeRefs: ['normal'] }, ...overrides });
function navigate(adapter, documentId = 'current-document') {
  const common = { tabId: 1, frameId: 0, parentFrameId: -1, documentId, host: 'shop.example.com', scheme: 'https:', storeId: 'firefox-default' };
  adapter.emitSiteActivity({ ...common, kind: 'beforeNavigate' });
  adapter.emitSiteActivity({ ...common, kind: 'request', requestType: 'main_frame', requestId: documentId });
  adapter.emitSiteActivity({ ...common, kind: 'committed' });
}

test('CSI-A07 requests do not invalidate contexts or retain observation state', async () => {
  const s = await setup({ cookies: { 'firefox-default': [siteCookie()] } });
  navigate(s.adapter);
  const page = await s.capture();
  for (let i = 0; i < 2000; i++) s.adapter.emitSiteActivity({ kind: 'request', tabId: 1, frameId: 0, host: `r${i}.example.net` });
  const saved = await s.request('saveSiteRule', { domainToken: page.domains[0].domainToken, ruleIndex: null, rule: newRule() }, page.revision);
  assert.equal(saved.ok, true);
  assert.deepEqual(await s.adapter.readSiteObservations(), {});
});

test('SITE-A01/A02/A03 domain snapshot selects exact host-only and ancestor domain cookies, once each, from only the current store', async () => {
  const s = await setup({ cookies: {
    'firefox-default': [siteCookie(), cookie({ hostOnly: false }), cookie({ domain: '.EXAMPLE.COM', hostOnly: false, name: 'variant' }), cookie(), cookie({ domain: 'sibling.example.com' }), cookie({ domain: 'ample.com', hostOnly: false }), siteCookie({ path: '/private', secure: false, httpOnly: false, session: false })],
    'firefox-container-4': [siteCookie({ name: 'other-store' })]
  } });
  const snapshot = await s.capture();
  assert.deepEqual(snapshot.domains.map(({ domain, cookieCount }) => ({ domain, cookieCount })), [{ domain: 'example.com', cookieCount: 2 }, { domain: 'shop.example.com', cookieCount: 2 }]);
  assert.equal(snapshot.storeRef, 'normal');
  assert.deepEqual(s.adapter.calls.filter(call => call.type === 'list').map(call => call.storeId), ['firefox-default']);
  assert.equal(snapshot.coverage.state, 'stored');
  assert.equal(snapshot.coverage.reason, null);
  assert.equal(snapshot.nextPageToken, null);
  assert.equal(JSON.stringify(snapshot).includes('firstPartyDomain'), false);
});

test('SITE-A04 domains exclude unrelated partitions and first-party contexts and disclose unknown associations', async () => {
  const s = await setup({ cookies: { 'firefox-default': [
    siteCookie(),
    siteCookie({ name: 'partition', partitionKey: { topLevelSite: 'https://example.com', hasCrossSiteAncestor: true } }),
    siteCookie({ name: 'fpi', firstPartyDomain: 'example.com' }),
    siteCookie({ name: 'other-partition', partitionKey: { topLevelSite: 'https://other.com' } }),
    siteCookie({ name: 'other-scheme', partitionKey: { topLevelSite: 'http://example.com' } }),
    siteCookie({ name: 'other-fpi', firstPartyDomain: 'other.com' }),
    siteCookie({ name: 'unknown-partition', partitionKey: { unknownContext: 'example.com' } })
  ] } });
  const snapshot = await s.capture();
  assert.deepEqual(snapshot.domains.map(row => [row.group, row.cookieCount]), [['own', 1], ['unpartitioned', 1]]);
  assert.equal(snapshot.coverage.state, 'partial');
});

test('ARCH-A10 domain handles belong to their sending document even on the same packaged page', async () => {
  const s = await setup({ cookies: { 'firefox-default': [siteCookie()] } });
  const firstOwner = { ...sender, documentId: 'first-document' };
  const secondOwner = { ...sender, documentId: 'second-document' };
  const site = (await s.request('getSiteContext', { windowId: 1 }, undefined, firstOwner)).data;
  const page = (await s.request('getSiteCookieDomains', { contextToken: site.contextToken }, undefined, firstOwner)).data;
  const result = await s.request('saveSiteRule', { domainToken: page.domains[0].domainToken, ruleIndex: null, rule: newRule() }, page.revision, secondOwner);
  assert.equal(result.error.code, 'STALE_SITE_CONTEXT');
  assert.equal(s.adapter.storedRecord.rules.length, 0);
});

test('SITE-A12 exact domain policy retains restricted rules and indexes even under whole-container protection', async () => {
  const record = emptyRecord();
  record.rules = [rule({ name: 'absent-name', path: '/absent' }), newRule({ domain: 'sibling.example.com' }), newRule({ scope: { type: 'all' } })];
  const s = await setup({ record, cookies: { 'firefox-default': [siteCookie()] } });
  let snapshot = await s.capture();
  assert.equal(snapshot.domains[0].status, 'full');
  assert.deepEqual(snapshot.domains[0].matchingRuleIndexes, [0, 2]);
  // Restricted unmatched rules remain accessible by index while status describes stored cookies.

  const restricted = await setup({ record: { ...emptyRecord(), rules: [record.rules[0]] }, cookies: { 'firefox-default': [siteCookie()] } });
  snapshot = await restricted.capture();
  assert.equal(snapshot.domains[0].status, 'partial');
  assert.deepEqual(snapshot.domains[0].matchingRuleIndexes, [0]);
  assert.deepEqual(snapshot.domains[0].reasons, []);
  // The full rule remains available by index even when no current cookie matches its name and path.
  const current = s.app.configuration.readConfiguration().record;
  const workRef = current.containerBindings.find(binding => binding.cookieStoreId === 'firefox-container-4').ref;
  const saved = await s.request('saveConfiguration', { rules: record.rules, protectedContainerRefs: [workRef], inactiveDecisions: [] });
  assert.equal(saved.ok, true);
  s.adapter.cookies['firefox-container-4'] = [siteCookie()];
  s.adapter.setTab({ cookieStoreId: 'firefox-container-4' });
  snapshot = await s.capture();
  assert.equal(snapshot.domains[0].status, 'full');
  assert.deepEqual(snapshot.domains[0].matchingRuleIndexes, [0, 2]);
  assert.ok(snapshot.domains[0].reasons.some(reason => reason.type === 'container'));
});

test('Current Site policy status ignores cookie counts and only applies exceptions to their captured partition', async () => {
  const record = { ...emptyRecord(), schemaVersion: 2, rules: [newRule({ domain: 'tracker.other.com' })], exceptions: [
    { cookieDomain: 'tracker.other.com', cookieIncludeSubdomains: false, topLevelDomain: 'unrelated.test', topLevelIncludeSubdomains: false, scheme: 'https', name: null, path: null, scope: { type: 'all' }, enabled: true }
  ] };
  const s = await setup({ record, cookies: { 'firefox-default': [cookie({ domain: 'tracker.other.com', partitionKey: { topLevelSite: 'https://example.com' } })] } });
  const snapshot = await s.capture();
  assert.equal(snapshot.domains[0].status, 'full');
  assert.deepEqual(snapshot.domains[0].reasons.map(reason => reason.type), ['rule']);

  const matchingRecord = { ...record, exceptions: [{ ...record.exceptions[0], topLevelDomain: 'example.com' }] };
  const matching = await setup({ record: matchingRecord, cookies: { 'firefox-default': [cookie({ domain: 'tracker.other.com', partitionKey: { topLevelSite: 'https://example.com' } })] } });
  const matchingSnapshot = await matching.capture();
  assert.equal(matchingSnapshot.domains[0].status, 'partial');
  assert.deepEqual(matchingSnapshot.domains[0].reasons.map(reason => reason.type), ['rule', 'exception']);

  const unpartitionedRecord = { ...emptyRecord(), schemaVersion: 2, rules: [newRule()], exceptions: [
    { cookieDomain: 'shop.example.com', cookieIncludeSubdomains: false, topLevelDomain: 'unrelated.test', topLevelIncludeSubdomains: false, scheme: 'all', name: null, path: null, scope: { type: 'all' }, enabled: true }
  ] };
  const unpartitioned = await setup({ record: unpartitionedRecord, cookies: { 'firefox-default': [siteCookie()] } });
  const unpartitionedSnapshot = await unpartitioned.capture();
  assert.equal(unpartitionedSnapshot.domains[0].status, 'full');
  assert.deepEqual(unpartitionedSnapshot.domains[0].reasons.map(reason => reason.type), ['rule']);
});

test('ARCH-A09 domain continuation retains captured order and counts; page-size changes and cross-owner tokens fail', async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie({ hostOnly: false }), siteCookie({ hostOnly: false }), cookie({ domain: 'a.shop.example.com' })] } });
  s.adapter.setTab({ url: 'https://a.shop.example.com/' });
  const first = await s.capture({ pageSize: 1 });
  assert.equal(first.domains.length, 1);
  assert.ok(first.nextPageToken);
  const captured = first.domains.map(row => [row.domain, row.cookieCount]);
  s.adapter.cookies['firefox-default'].push(siteCookie({ name: 'later' }));
  let token = first.nextPageToken;
  while (token) {
    const result = await s.request('getSiteCookieDomains', { contextToken: first.contextToken, pageSize: 1, pageToken: token });
    assert.equal(result.ok, true, JSON.stringify(result));
    captured.push(...result.data.domains.map(row => [row.domain, row.cookieCount]));
    token = result.data.nextPageToken;
  }
  assert.deepEqual(captured, [['a.shop.example.com', 1], ['example.com', 1], ['shop.example.com', 1]]);
  assert.equal((await s.request('getSiteCookieDomains', { contextToken: first.contextToken, pageSize: 2, pageToken: first.nextPageToken })).error.code, 'INVALID_REQUEST');
  const otherOwner = { ...sender, url: 'moz-extension://test/src/frontend/popup.html' };
  assert.equal((await s.request('getSiteCookieDomains', { contextToken: first.contextToken, pageSize: 1, pageToken: first.nextPageToken }, undefined, otherOwner)).error.code, 'STALE_SITE_CONTEXT');
});

test('SITE-A10 domain snapshots distinguish empty, invalid, unavailable, and permission errors', async () => {
  const s = await setup();
  const first = await s.capture();
  assert.deepEqual(first.domains, []);
  assert.equal(first.nextPageToken, null);
  for (const pageSize of [0, 201, 1.5, '10']) assert.equal((await s.request('getSiteCookieDomains', { contextToken: first.contextToken, pageSize })).error.code, 'INVALID_REQUEST');
  s.adapter.faults.enumerate = true;
  assert.equal((await s.request('getSiteCookieDomains', { contextToken: first.contextToken })).error.code, 'CONTEXT_UNAVAILABLE');
  s.adapter.faults.enumerate = false;
  s.adapter.setAccess({ granted: false });
  const before = s.adapter.calls.length;
  assert.equal((await s.request('getSiteCookieDomains', { contextToken: first.contextToken })).error.code, 'PERMISSION_REQUIRED');
  assert.equal(s.adapter.calls.length, before);
});

test('ARCH-A11 popup save changes one offered rule, preserves unrelated settings, and deduplicates accepted requests', async () => {
  const record = { ...emptyRecord(), rules: [rule({ name: 'restricted' }), rule({ domain: 'unrelated.com' })] };
  const s = await setup({ record, cookies: { 'firefox-default': [siteCookie()] } });
  const before = s.app.configuration.readConfiguration().record;
  const snapshot = await s.capture();
  const edited = newRule({ domain: 'different.com', scope: { type: 'all' } });
  const message = envelope('saveSiteRule', { domainToken: snapshot.domains[0].domainToken, ruleIndex: 0, rule: edited }, snapshot.revision);
  const [one, two] = await Promise.all([s.app.dispatch(message, sender), s.app.dispatch(message, sender)]);
  assert.equal(one.ok, true, JSON.stringify(one));
  assert.deepEqual(two, one);
  const after = s.app.configuration.readConfiguration().record;
  assert.equal(after.revision, before.revision + 1);
  assert.deepEqual(after.rules, [edited, before.rules[1]]);
  assert.deepEqual(after.containerBindings, before.containerBindings);
  assert.deepEqual(after.protectedContainerRefs, before.protectedContainerRefs);
  assert.equal((await s.request('saveSiteRule', message.payload)).error.code, 'STALE_SITE_CONTEXT');
});

test('ARCH-A10 popup saves reject unoffered indexes, cross-owner tokens, and invalid complete candidates without writes', async () => {
  const s = await setup({ record: { ...emptyRecord(), rules: [rule({ domain: 'unrelated.com' })] }, cookies: { 'firefox-default': [siteCookie()] } });
  const snapshot = await s.capture();
  const payload = { domainToken: snapshot.domains[0].domainToken, ruleIndex: 0, rule: newRule() };
  const before = s.adapter.storedRecord;
  assert.equal((await s.request('saveSiteRule', payload)).error.code, 'INVALID_REQUEST');
  assert.equal((await s.request('saveSiteRule', { ...payload, ruleIndex: null }, undefined, { ...sender, url: 'moz-extension://test/src/frontend/popup.html' })).error.code, 'STALE_SITE_CONTEXT');
  assert.equal((await s.request('saveSiteRule', { ...payload, ruleIndex: null, rule: rule({ domain: 'unrelated.com' }) })).error.code, 'VALIDATION_FAILED');
  assert.deepEqual(s.adapter.storedRecord, before);
  assert.equal((await s.request('saveSiteRule', { ...payload, ruleIndex: null })).ok, true);
});

test('ARCH-A11 stale revisions and failed writes preserve saved protection', async () => {
  const s = await setup({ cookies: { 'firefox-default': [siteCookie()] } });
  let snapshot = await s.capture();
  const payload = { domainToken: snapshot.domains[0].domainToken, ruleIndex: null, rule: newRule() };
  const saved = await s.request('saveConfiguration', { rules: [rule({ domain: 'unrelated.com' })], protectedContainerRefs: [], inactiveDecisions: [] });
  assert.equal(saved.ok, true);
  assert.equal((await s.request('saveSiteRule', payload, snapshot.revision)).error.code, 'REVISION_CONFLICT');
  snapshot = await s.capture();
  s.adapter.faults.write = true;
  assert.equal((await s.request('saveSiteRule', { ...payload, domainToken: snapshot.domains[0].domainToken })).error.code, 'STORAGE_FAILED');
  assert.equal(s.adapter.storedRecord.rules.length, 1);
  assert.equal(s.adapter.storedRecord.rules[0].domain, 'unrelated.com');
});

test('CSI-A01/A02/A03 third-party partitions appear without observing requests', async () => {
  const s = await setup({ cookies: { 'firefox-default': [siteCookie(), cookie({ domain: 'tracker.other.com', partitionKey: { topLevelSite: 'https://example.com' } }), cookie({ domain: 'unrelated.other.com' }), cookie({ domain: 'wrong.other.com', partitionKey: { topLevelSite: 'https://other.com' } })] } });
  const snapshot = await s.capture();
  assert.deepEqual(snapshot.domains.map(row => [row.domain, row.group]), [['shop.example.com', 'unpartitioned'], ['tracker.other.com', 'third-party']]);
  assert.equal(snapshot.coverage.state, 'stored');
});

test('SITE-A06/ARCH-A10 same-host navigation invalidates domain and continuation tokens', async () => {
  const s = await setup({ cookies: { 'firefox-default': [siteCookie(), cookie({ hostOnly: false })] } });
  navigate(s.adapter, 'first-document');
  const snapshot = await s.capture({ pageSize: 1 });
  navigate(s.adapter, 'second-document');
  const before = s.adapter.storedRecord;
  assert.equal((await s.request('saveSiteRule', { domainToken: snapshot.domains[0].domainToken, ruleIndex: null, rule: newRule() })).error.code, 'STALE_SITE_CONTEXT');
  assert.equal((await s.request('getSiteCookieDomains', { contextToken: snapshot.contextToken, pageSize: 1, pageToken: snapshot.nextPageToken })).error.code, 'STALE_SITE_CONTEXT');
  assert.deepEqual(s.adapter.storedRecord, before);
});

test('ARCH-A10 navigation during queued candidate validation prevents a popup rule write', async () => {
  const s = await setup({ cookies: { 'firefox-default': [siteCookie()] } });
  navigate(s.adapter, 'first-document');
  const snapshot = await s.capture();
  const classify = s.adapter.classifyHost;
  let changed = false;
  s.adapter.classifyHost = async host => {
    if (!changed) { changed = true; navigate(s.adapter, 'second-document'); }
    return classify(host);
  };
  const result = await s.request('saveSiteRule', { domainToken: snapshot.domains[0].domainToken, ruleIndex: null, rule: newRule() });
  assert.equal(result.error.code, 'STALE_SITE_CONTEXT');
  assert.deepEqual(s.adapter.storedRecord.rules, []);
});

test('ARCH-A11 a live burn permits snapshots but blocks popup rule saves', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const s = await setup({ cookies: { 'firefox-default': [siteCookie()] }, remove: async () => { await pending; return { removed: true }; } });
  const preview = await s.request('previewBurn');
  assert.equal(preview.ok, true);
  const start = await s.request('startBurn', { previewToken: preview.data.previewToken });
  assert.equal(start.ok, true);
  try {
    const snapshot = await s.capture();
    const before = s.adapter.storedRecord;
    const response = await s.request('saveSiteRule', { domainToken: snapshot.domains[0].domainToken, ruleIndex: null, rule: newRule() });
    assert.equal(response.error.code, 'OPERATION_ACTIVE');
    assert.deepEqual(s.adapter.storedRecord, before);
  } finally { release(); await s.app.burner.waitForIdle(); }
});

test('ARCH-A09 a full 200-domain page retains its context and every row authorization for later saves', async () => {
  const cookies = Array.from({ length: 205 }, (_, index) => cookie({ domain: `host-${String(index).padStart(3, '0')}.other.com`, partitionKey: { topLevelSite: 'https://example.com' } }));
  const s = await setup({ cookies: { 'firefox-default': cookies } });
  navigate(s.adapter);
  for (const [index, item] of cookies.entries()) s.adapter.emitSiteActivity({ kind: 'request', tabId: 1, frameId: 0, documentId: 'current-document', host: item.domain, scheme: 'https:', storeId: 'firefox-default', requestType: 'script', requestId: `request-${index}` });
  const first = await s.capture({ pageSize: 200 });
  assert.equal(first.domains.length, 200);
  const last = await s.request('getSiteCookieDomains', { contextToken: first.contextToken, pageSize: 200, pageToken: first.nextPageToken });
  assert.equal(last.ok, true, JSON.stringify(last));
  assert.equal(last.data.domains.length, 5);
  assert.equal(last.data.nextPageToken, null);
  const domains = [...first.domains, ...last.data.domains].map(row => row.domain);
  assert.equal(new Set(domains).size, 205);
  assert.deepEqual(domains, cookies.map(item => item.domain));
  const save = await s.request('saveSiteRule', { domainToken: first.domains[0].domainToken, ruleIndex: null, rule: newRule({ domain: first.domains[0].domain }) });
  assert.equal(save.ok, true, JSON.stringify(save));
});

test('SITE-A11/ARCH-A04/A08 new site actions reject website senders and never return cookie values or native store identity', async () => {
  const s = await setup({ cookies: { 'firefox-default': [siteCookie({ value: 'PRIVATE-COOKIE-VALUE', name: 'PRIVATE-COOKIE-NAME', path: '/PRIVATE-COOKIE-PATH' })] } });
  const snapshot = await s.capture();
  const serialized = JSON.stringify(snapshot);
  for (const secret of ['PRIVATE-COOKIE-VALUE', 'PRIVATE-COOKIE-NAME', 'PRIVATE-COOKIE-PATH', 'firefox-default']) assert.equal(serialized.includes(secret), false);
  const outsider = { ...sender, url: 'https://shop.example.com/' };
  assert.equal((await s.request('getSiteCookieDomains', { contextToken: snapshot.contextToken }, undefined, outsider)).error.code, 'INVALID_REQUEST');
  assert.equal((await s.request('saveSiteRule', { domainToken: snapshot.domains[0].domainToken, ruleIndex: null, rule: newRule() }, undefined, outsider)).error.code, 'INVALID_REQUEST');
});

test('PEX-A08 popup exception save binds navigation and preserves unrelated policy', async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie({ domain: 'tracker.other.com', partitionKey: { topLevelSite: 'https://example.com' } })] } });
  const first = await s.capture();
  const exception = { cookieDomain: 'tracker.other.com', cookieIncludeSubdomains: false, topLevelDomain: 'example.com', topLevelIncludeSubdomains: false, scheme: 'all', name: null, path: null, scope: { type: 'selected', storeRefs: ['normal'] }, enabled: true };
  const result = await s.request('saveSiteException', { domainToken: first.domains[0].domainToken, exception }, first.revision);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(s.adapter.storedRecord.exceptions, [exception]);
  assert.deepEqual(s.adapter.storedRecord.rules, []);
  const second = await s.capture();
  navigate(s.adapter, 'new-page');
  const stale = await s.request('saveSiteException', { domainToken: second.domains[0].domainToken, exception: { ...exception, name: 'different' } }, second.revision);
  assert.equal(stale.error.code, 'STALE_SITE_CONTEXT');
  assert.equal(s.adapter.storedRecord.exceptions.length, 1);
});
