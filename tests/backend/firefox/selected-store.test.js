import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../../../src/backend/gateway/application.js';
import { createTestAdapter, cookie } from '../../harness/adapter.js';
import { envelope, sender } from '../../harness/fixtures.js';

async function fixture(cookies = {}) {
  const adapter = createTestAdapter({ cookies });
  const app = createApplication(adapter, { extensionId: sender.id, baseURL: 'moz-extension://test/' });
  await app.ready();
  const request = (action, payload = {}, revision = app.configuration.view().revision) => app.dispatch(envelope(action, payload, revision), sender);
  const stores = (await request('getState')).data.stores;
  return { adapter, app, request, personal: stores.find(store => store.label === 'Personal').ref };
}

test('UX-A02/A03 selected container owns quick protection and cookie enumeration independently of the active tab', async () => {
  const f = await fixture({
    'firefox-container-4': [cookie({ domain: 'shop.example.com', name: 'work-only' })],
    'firefox-container-9': [cookie({ domain: 'shop.example.com', name: 'personal-only' })]
  });
  const site = (await f.request('getSiteContext', { windowId: 1, storeRef: f.personal })).data;
  assert.equal(site.store.label, 'Personal');
  assert.equal(site.tabStore.label, 'Work');
  const page = await f.request('getCookies', { contextToken: site.contextToken });
  assert.deepEqual(page.data.cookies.map(row => row.name), ['personal-only']);
  const result = await f.request('setSiteProtection', { contextToken: site.contextToken, enabled: true });
  assert.equal(result.ok, true);
  assert.deepEqual(f.app.configuration.readConfiguration().record.rules[0].scope.storeRefs, [f.personal]);
  const active = (await f.request('getSiteContext', { windowId: 1 })).data;
  assert.equal(active.store.label, 'Work');
  assert.equal(active.status, 'none');
});

test('UX-A04/A06 site metadata binds contexts and omits unrelated shared cookies and partitions', async () => {
  const f = await fixture({ 'firefox-container-9': [
    cookie({ domain: 'shop.example.com', name: 'own' }),
    cookie({ domain: 'login.example.net', name: 'shared-third-party' }),
    cookie({ domain: 'login.example.net', name: 'jar', partitionKey: { topLevelSite: 'https://example.com' } }),
    cookie({ domain: 'login.example.net', name: 'other-site', partitionKey: { topLevelSite: 'https://other.com' } }),
    cookie({ domain: 'login.example.net', name: 'other-scheme', partitionKey: { topLevelSite: 'http://example.com' } })
  ] });
  const site = (await f.request('getSiteContext', { windowId: 1, storeRef: f.personal })).data;
  const first = await f.request('getCookies', { contextToken: site.contextToken, pageSize: 1 });
  assert.equal(first.data.cookies[0].name, 'own');
  assert.ok(first.data.nextPageToken);
  const second = await f.request('getCookies', { contextToken: site.contextToken, pageToken: first.data.nextPageToken, pageSize: 1 });
  assert.deepEqual(second.data.cookies.map(row => row.name), ['jar']);
  assert.equal(second.data.nextPageToken, null);
  assert.equal((await f.request('getCookies', { pageToken: first.data.nextPageToken })).error.code, 'INVALID_REQUEST');
  const another = (await f.request('getSiteContext', { windowId: 1, storeRef: f.personal })).data;
  assert.equal((await f.request('getCookies', { contextToken: another.contextToken, pageToken: first.data.nextPageToken })).error.code, 'INVALID_REQUEST');
  assert.equal((await f.request('getCookies', { contextToken: site.contextToken, storeRefs: ['normal'] })).error.code, 'INVALID_REQUEST');
  f.adapter.setTab({ cookieStoreId: 'firefox-default' });
  assert.equal((await f.request('getCookies', { contextToken: site.contextToken })).error.code, 'STALE_SITE_CONTEXT');
  assert.equal((await f.request('setSiteProtection', { contextToken: site.contextToken, enabled: true })).error.code, 'STALE_SITE_CONTEXT');
});

test('UX-A04 selected-store reads reject navigation occurring during enumeration', async () => {
  const f = await fixture();
  const site = (await f.request('getSiteContext', { windowId: 1, storeRef: f.personal })).data;
  const list = f.adapter.listCookies;
  f.adapter.listCookies = async id => { f.adapter.setTab({ url: 'https://other.com/' }); return list(id); };
  assert.equal((await f.request('getCookies', { contextToken: site.contextToken })).error.code, 'STALE_SITE_CONTEXT');
  assert.equal((await f.request('getSiteContext', { windowId: 1, storeRef: 'missing' })).data.status, 'unavailable');
});
