import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../../../src/backend/gateway/application.js';
import { createTestAdapter, cookie } from '../../harness/adapter.js';
import { envelope, sender, rule } from '../../harness/fixtures.js';
import { sanitizeCookie } from '../../../src/backend/firefox/adapter.js';
async function setup(options) {
  const adapter = createTestAdapter(options); const app = createApplication(adapter, { extensionId: sender.id, baseURL: 'moz-extension://test/' }); await app.ready();
  return { adapter, app, request: (action, payload = {}, rev = app.configuration.view().revision) => app.dispatch(envelope(action, payload, rev), sender) };
}
test('ARCH-A08 native cookie sanitization excludes values and preserves partition identity', () => {
  const row = sanitizeCookie({ ...cookie(), value: 'NEVER-EXPOSE', partitionKey: { topLevelSite: 'https://site.test', hasCrossSiteAncestor: true } });
  assert.equal(JSON.stringify(row).includes('NEVER-EXPOSE'), false); assert.equal(row.partitionKey.hasCrossSiteAncestor, true);
});
test('UI-A02/A04/A08 site uses saved policy without cookies, scoped add and stale context rejection', async () => {
  const s = await setup(); let site = (await s.request('getSiteContext', { windowId: 1 })).data; assert.equal(site.status, 'none'); assert.equal(site.target.domain, 'example.com');
  let result = await s.request('setSiteProtection', { contextToken: site.contextToken, enabled: true }); assert.equal(result.data.status, 'full');
  const rule = s.app.configuration.readConfiguration().record.rules[0]; assert.equal(rule.scope.type, 'selected'); assert.equal(rule.scope.storeRefs.length, 1); assert.notEqual(rule.scope.storeRefs[0], 'normal');
  site = (await s.request('getSiteContext', { windowId: 1 })).data; s.adapter.setTab({ url: 'https://different.example.net/' }); result = await s.request('setSiteProtection', { contextToken: site.contextToken, enabled: false }); assert.equal(result.error.code, 'STALE_SITE_CONTEXT');
});
test('getCookies paginates only sanitized plain data; permission loss rejects inventory', async () => {
  const s = await setup({ cookies: { 'firefox-default': Array.from({length: 205}, (_, i) => cookie({ name: `name-${i}`, value: 'SECRET' })) } });
  const first = await s.request('getCookies', { pageSize: 200 }); assert.equal(first.data.cookies.length, 200); assert.ok(first.data.nextPageToken); assert.equal(JSON.stringify(first).includes('SECRET'), false);
  const second = await s.request('getCookies', { pageToken: first.data.nextPageToken, pageSize: 200 }); assert.equal(second.data.cookies.length, 5);
  s.adapter.setAccess({ granted: false }); assert.equal((await s.request('getCookies')).error.code, 'PERMISSION_REQUIRED');
});
test('getCookies rejects a snapshot if protection changes during enumeration', async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie()] } });
  let entered, release;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const list = s.adapter.listCookies;
  s.adapter.listCookies = async storeId => { entered(); await gate; return list(storeId); };
  const pending = s.request('getCookies', { storeRefs: ['normal'] });
  await waiting;
  const { record, catalogGeneration } = s.app.configuration.readConfiguration();
  record.rules = [rule()];
  await s.app.configuration.commitConfiguration({ expectedRevision: record.revision, expectedCatalogGeneration: catalogGeneration, candidate: record });
  release();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'CONTEXT_UNAVAILABLE');
  const refreshed = await s.request('getCookies', { storeRefs: ['normal'] });
  assert.equal(refreshed.data.cookies[0].protected, true);
});
test('getCookies rejects a same-revision native settings replacement during enumeration', async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie()] } });
  let entered, release;
  const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const list = s.adapter.listCookies;
  s.adapter.listCookies = async storeId => { entered(); await gate; return list(storeId); };
  const pending = s.request('getCookies', { storeRefs: ['normal'] });
  await waiting;
  const replacement = s.adapter.storedRecord;
  replacement.rules = [rule()];
  s.adapter.setRecord(replacement);
  release();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'REVISION_CONFLICT');
  const refreshed = await s.request('getCookies', { storeRefs: ['normal'] });
  assert.equal(refreshed.data.cookies[0].protected, true);
});
test('getCookies waits for a concurrent configuration write before verifying storage', async () => {
  const s = await setup({ cookies: { 'firefox-default': [cookie()] } });
  let listEntered, releaseList, writeEntered, releaseWrite;
  const listing = new Promise(resolve => { listEntered = resolve; });
  const listGate = new Promise(resolve => { releaseList = resolve; });
  const writing = new Promise(resolve => { writeEntered = resolve; });
  const writeGate = new Promise(resolve => { releaseWrite = resolve; });
  const list = s.adapter.listCookies;
  const write = s.adapter.writeConfigurationRecord;
  s.adapter.listCookies = async storeId => { listEntered(); await listGate; return list(storeId); };
  s.adapter.writeConfigurationRecord = async value => { await write(value); writeEntered(); await writeGate; };
  const pending = s.request('getCookies', { storeRefs: ['normal'] });
  await listing;
  const { record, catalogGeneration } = s.app.configuration.readConfiguration();
  record.rules = [rule()];
  const commit = s.app.configuration.commitConfiguration({ expectedRevision: record.revision, expectedCatalogGeneration: catalogGeneration, candidate: record });
  await writing;
  releaseList();
  let finished = false;
  pending.then(() => { finished = true; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(finished, false);
  releaseWrite();
  await commit;
  assert.equal((await pending).error.code, 'CONTEXT_UNAVAILABLE');
  assert.equal(s.app.configuration.view().configurationStatus, 'valid');
});
test('site snapshots reject a same-revision native settings replacement', async () => {
  const s = await setup();
  const site = (await s.request('getSiteContext', { windowId: 1 })).data;
  const replacement = s.adapter.storedRecord;
  replacement.rules = [rule()];
  s.adapter.setRecord(replacement);
  const result = await s.request('getSiteCookieDomains', { contextToken: site.contextToken });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'REVISION_CONFLICT');
});
test('UI-A08 navigation during queued native validation prevents quick-protection commit', async () => {
  const s = await setup(); const site = (await s.request('getSiteContext', { windowId: 1 })).data;
  const original = s.adapter.classifyHost;
  s.adapter.classifyHost = async host => { s.adapter.setTab({ url: 'https://other.example.net/' }); return original(host); };
  const result = await s.request('setSiteProtection', { contextToken: site.contextToken, enabled: true });
  assert.equal(result.error.code, 'STALE_SITE_CONTEXT'); assert.equal(s.app.configuration.readConfiguration().record.rules.length, 0);
});
