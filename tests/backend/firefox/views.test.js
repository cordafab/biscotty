import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../../../src/backend/gateway/application.js';
import { createTestAdapter, cookie } from '../../harness/adapter.js';
import { envelope, sender } from '../../harness/fixtures.js';
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
test('UI-A08 navigation during queued native validation prevents quick-protection commit', async () => {
  const s = await setup(); const site = (await s.request('getSiteContext', { windowId: 1 })).data;
  const original = s.adapter.classifyHost;
  s.adapter.classifyHost = async host => { s.adapter.setTab({ url: 'https://other.example.net/' }); return original(host); };
  const result = await s.request('setSiteProtection', { contextToken: site.contextToken, enabled: true });
  assert.equal(result.error.code, 'STALE_SITE_CONTEXT'); assert.equal(s.app.configuration.readConfiguration().record.rules.length, 0);
});
