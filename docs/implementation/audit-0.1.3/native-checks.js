import { client } from '../../src/backend/client/native.js';
import { createFirefoxAdapter } from '../../src/backend/firefox/adapter.js';
import { fixturePort } from './input.js';
const results = [];
const adapter = createFirefoxAdapter();
const assert = (value, message = 'Assertion failed') => { if (!value) throw new Error(message); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function check(name, task) {
  try { await task(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: `${error.code || error.name}: ${error.message}` }); }
}
async function save(rules = [], protectedContainerRefs = []) {
  const current = await client.getState();
  return client.saveConfiguration({ rules, protectedContainerRefs, inactiveDecisions: [] }, current.revision);
}
async function settled() {
  for (let i = 0; i < 1000; i++) {
    const operation = (await client.getState()).operation;
    if (operation && !['running', 'cancel_requested'].includes(operation.state)) return operation;
    await sleep(10);
  }
  throw new Error('Operation timeout');
}
async function dismiss() {
  const operation = (await client.getState()).operation;
  if (operation) await client.dismissOperation({ operationId: operation.id });
}
const set = details => browser.cookies.set({ firstPartyDomain: '', ...details });
let protectedContainer;
await check('Independent CSP rejects outbound requests and string compilation', async () => {
  let networkBlocked = false, evalBlocked = false;
  try { await fetch(`http://127.0.0.1:${fixturePort}/audit-must-not-connect`); } catch { networkBlocked = true; }
  try { new Function('return 1')(); } catch { evalBlocked = true; }
  assert(networkBlocked && evalBlocked, JSON.stringify({ networkBlocked, evalBlocked }));
});
await check('Independent non-allowlisted packaged page cannot read state or start burn', async () => {
  const iframe = document.createElement('iframe');
  iframe.src = browser.runtime.getURL('tests/native/denied.html');
  document.body.append(iframe);
  try {
    for (let i = 0; i < 200 && !iframe.contentDocument?.documentElement.dataset.audit; i++) await sleep(10);
    const response = JSON.parse(iframe.contentDocument.documentElement.dataset.audit);
    assert(response.length === 2 && response.every(row => row.ok === false && row.error.code === 'INVALID_REQUEST'), JSON.stringify(response));
  } finally { iframe.remove(); }
});
await check('Independent native exact-name/path protection and whole-container separation', async () => {
  protectedContainer = await browser.contextualIdentities.create({ name: 'Independent protected', color: 'blue', icon: 'briefcase' });
  const current = await client.getState();
  const protectedRef = current.stores.find(store => store.label === 'Independent protected').ref;
  await save([{ domain: 'example.com', includeSubdomains: false, name: 'same-name', path: '/protected', scope: { type: 'selected', storeRefs: ['normal'] } }], [protectedRef]);
  await set({ url: 'https://example.com/protected', name: 'same-name', path: '/protected', value: 'audit-protected-value', secure: true, httpOnly: true });
  await set({ url: 'https://example.com/other', name: 'same-name', path: '/other', value: 'audit-eligible-value', secure: true });
  await set({ url: 'https://example.com/', name: 'eligible-root', value: 'audit-root-value' });
  await set({ url: 'https://example.com/', name: 'whole-container', value: 'audit-container-value', storeId: protectedContainer.cookieStoreId });
  const preview = await client.previewBurn({}, (await client.getState()).revision);
  assert(preview.eligibleAttempts === 2 && preview.ruleProtected === 1 && preview.skippedStores.length === 1, JSON.stringify(preview));
  await client.startBurn({ previewToken: preview.previewToken }, preview.revision);
  const operation = await settled();
  assert(operation.state === 'completed' && operation.attemptedCalls === 2, JSON.stringify(operation));
  const normal = await adapter.listCookies('firefox-default');
  assert(normal.length === 1 && normal[0].name === 'same-name' && normal[0].path === '/protected');
  assert((await adapter.listCookies(protectedContainer.cookieStoreId)).length === 1);
  await dismiss();
});
await check('Independent values never cross public inventory/state/export interfaces', async () => {
  const state = await client.getState();
  const inventory = await client.getCookies({ pageSize: 200 });
  const exported = await client.prepareExport({}, state.revision);
  const serialized = JSON.stringify([state, inventory, exported]);
  assert(!serialized.includes('audit-protected-value') && !serialized.includes('audit-container-value') && !serialized.includes('cookieStoreId'));
  assert(!exported.text.includes('firefox-'));
});
await check('Independent old preview fails after protection changes', async () => {
  await set({ url: 'https://example.net/', name: 'stale-protected', value: 'audit-stale-value' });
  const state = await client.getState();
  const preview = await client.previewBurn({}, state.revision);
  await save([{ domain: 'example.net', includeSubdomains: false, name: null, path: null, scope: { type: 'all' } }]);
  let code;
  try { await client.startBurn({ previewToken: preview.previewToken }, state.revision); } catch (error) { code = error.code; }
  assert(['REVISION_CONFLICT', 'STALE_PREVIEW'].includes(code), String(code));
  assert((await adapter.listCookies('firefox-default')).some(cookie => cookie.name === 'stale-protected'));
});
await check('Independent native cancellation stops subsequent deletion and clears marker', async () => {
  await save();
  for (let i = 0; i < 60; i++) await set({ url: 'https://cancel.example.org/', name: `cancel-${i}`, value: 'audit-cancel-value' });
  const preview = await client.previewBurn({}, (await client.getState()).revision);
  const accepted = await client.startBurn({ previewToken: preview.previewToken }, preview.revision);
  await client.cancelBurn({ operationId: accepted.operationId });
  const operation = await settled();
  assert(operation.state === 'canceled' && operation.attemptedCalls < operation.plannedAttempts, JSON.stringify(operation));
  const before = (await adapter.listCookies('firefox-default')).length;
  await sleep(150);
  assert((await adapter.listCookies('firefox-default')).length === before);
  assert(!('biscotty.inProgress' in await browser.storage.local.get(null)));
  await dismiss();
});
await check('Independent observation storage omits URL path/query/fragment', async () => {
  const tab = await browser.tabs.create({ url: `http://localhost:${fixturePort}/page?audit_secret_query=1#audit_secret_fragment`, active: true });
  try {
    for (let i = 0; i < 200; i++) { const loaded = await browser.tabs.get(tab.id); if (loaded.status === 'complete' && loaded.url?.includes('audit_secret_query')) break; await sleep(10); }
    const context = await client.getSiteContext({ windowId: tab.windowId });
    assert(context.contextToken, JSON.stringify(context));
    await client.getSiteCookieDomains({ contextToken: context.contextToken });
    const session = JSON.stringify(await browser.storage.session.get(null));
    assert(!session.includes('audit_secret_query') && !session.includes('audit_secret_fragment') && !session.includes('/page'), `Unexpected retained URL data: ${session}`);
    assert(!JSON.stringify(await browser.storage.local.get(null)).includes('localhost'), 'Observed hostname persisted in local storage');
  } finally { await browser.tabs.remove(tab.id); }
});
await check('Reproduces valid prototype-named import reference failing in the actual Firefox mapping UI', async () => {
  const findButton = label => [...document.querySelectorAll('button')].find(button => button.textContent === label);
  document.getElementById('start-import').click();
  const input = document.querySelector('#import-workflow input[type="file"]');
  assert(input, 'Import file control absent');
  const portable = { format: 'biscotty-config', schemaVersion: 1, containers: [{ ref: '__proto__', name: 'Audit Work', color: 'blue', icon: 'briefcase', state: 'active' }], protectedContainerRefs: ['__proto__'], rules: [] };
  const files = new DataTransfer();
  files.items.add(new File([JSON.stringify(portable)], 'audit-valid.json', { type: 'application/json' }));
  input.files = files.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  for (let i = 0; i < 200 && !document.getElementById('mapping-__proto__'); i++) await sleep(10);
  const mapping = document.getElementById('mapping-__proto__');
  assert(mapping && !mapping.disabled, 'Valid file did not reach mapping');
  mapping.value = 'retain';
  mapping.dispatchEvent(new Event('change', { bubbles: true }));
  findButton('Build import plan').click();
  for (let i = 0; i < 200 && !document.getElementById('messages').textContent.includes('choice.startsWith'); i++) await sleep(10);
  assert(document.getElementById('messages').textContent.includes('choice.startsWith'), document.getElementById('messages').textContent);
  findButton('Cancel import').click();
});
await check('Independent native host-permission revocation disables burn and rejects prepared preview', async () => {
  await set({ url: 'https://permission.example.org/', name: 'permission-survivor', value: 'audit-permission-value' });
  const state = await client.getState();
  const preview = await client.previewBurn({}, state.revision);
  await browser.permissions.remove({ origins: ['http://*/*', 'https://*/*'] });
  const denied = await client.getState();
  assert(!denied.capabilities.canBurn && !denied.capabilities.canReadCookies);
  let error;
  try { await client.startBurn({ previewToken: preview.previewToken }, state.revision); } catch (failure) { error = failure.code; }
  assert(error && (await client.getState()).operation === null, String(error));
});
document.documentElement.setAttribute('data-native-results', JSON.stringify(results));
