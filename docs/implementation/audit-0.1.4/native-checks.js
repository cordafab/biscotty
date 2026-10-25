import { createNativeClient } from '../src/backend/client/native.js';
import { mode, fixturePort, importedText } from './input.js';

const client = createNativeClient();
const results = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
async function check(name, action) {
  try { await action(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: String(error.message).slice(0, 400) }); }
}
async function rejects(action, codes) {
  try { await action(); } catch (error) { assert(codes.includes(error.code), `Unexpected rejection: ${error.code}`); return; }
  throw new Error('Action unexpectedly succeeded');
}
async function state() { return client.getState(); }
async function settled() {
  for (let i = 0; i < 400; i++) {
    const value = await state();
    if (value.operation && !['running', 'cancel_requested'].includes(value.operation.state)) return value;
    await pause(25);
  }
  throw new Error('Burn did not finish');
}
const save = async (rules, refs = []) => {
  const current = await state();
  return client.saveConfiguration({ rules, protectedContainerRefs: refs, inactiveDecisions: [] }, current.revision);
};
const rule = (domain, name, storeRefs = ['normal']) => ({ domain, includeSubdomains: true, name, path: null, scope: { type: 'selected', storeRefs } });
const setCookie = async (name, storeId = 'firefox-default', extra = {}) => browser.cookies.set({ url: 'https://audit.example.com/deep/page', name, value: 'SYNTHETIC_COOKIE_SECRET_014', path: '/', storeId, firstPartyDomain: '', ...extra });
const allCookies = storeId => browser.cookies.getAll({ storeId, partitionKey: {}, firstPartyDomain: null });
let exportedText = null;
let containerA, containerB, keptRule, protectedRefs;

await check('fresh install initializes valid local configuration', async () => {
  for (let i = 0; i < 100; i++) { if ((await state()).configurationStatus === 'valid') break; await pause(25); }
  const current = await state();
  assert(current.configurationStatus === 'valid', 'Configuration was not initialized');
  assert(current.capabilities.canBurn, 'Full website access unavailable');
  assert(await browser.extension.isAllowedIncognitoAccess() === false, 'Private access enabled');
});

if (mode === 'denied') {
  await check('host revocation blocks reads, preview, and saves without changing configuration', async () => {
    const before = await state();
    assert(await browser.permissions.remove({ origins: ['http://*/*', 'https://*/*'] }), 'Could not revoke host access');
    await pause(100);
    const current = await state();
    assert(!current.capabilities.canBurn && !current.capabilities.canReadCookies, 'Capabilities remained enabled');
    await rejects(() => client.previewBurn({}, current.revision), ['PERMISSION_REQUIRED']);
    await rejects(() => client.getCookies(), ['PERMISSION_REQUIRED']);
    await rejects(() => client.saveConfiguration({ ...current.configuration, inactiveDecisions: [] }, current.revision), ['PERMISSION_REQUIRED']);
    assert(JSON.stringify((await state()).configuration) === JSON.stringify(before.configuration), 'Protection changed after permission revocation');
    const observations = (await browser.storage.session.get('biscotty.siteObservations'))['biscotty.siteObservations'] || {};
    assert(Object.keys(observations).length === 0, 'Observation metadata retained after revocation');
  });
} else {
  await check('new containers reconcile to distinct available stores', async () => {
    containerA = await browser.contextualIdentities.create({ name: 'Audit Work', color: 'blue', icon: 'briefcase' });
    containerB = await browser.contextualIdentities.create({ name: 'Audit Personal', color: 'red', icon: 'fingerprint' });
    await pause(100);
    const current = await state();
    const work = current.stores.find(store => store.name === 'Audit Work');
    const personal = current.stores.find(store => store.name === 'Audit Personal');
    assert(work && personal && work.ref !== personal.ref, 'Container references missing');
    protectedRefs = [personal.ref];
    keptRule = rule('audit.example.com', 'keep');
    await save([keptRule], protectedRefs);
  });
  await check('native inventory omits cookie values and exposes every requested store', async () => {
    await setCookie('keep'); await setCookie('erase');
    await setCookie('erase', containerA.cookieStoreId);
    await setCookie('erase', containerB.cookieStoreId);
    const inventory = await client.getCookies({ pageSize: 200 });
    assert(inventory.cookies.some(cookie => cookie.name === 'keep' && cookie.protected), 'Protected cookie absent');
    assert(inventory.cookies.every(cookie => !Object.hasOwn(cookie, 'value')), 'Cookie value field exposed');
    assert(!JSON.stringify(inventory).includes('SYNTHETIC_COOKIE_SECRET_014'), 'Cookie secret leaked');
  });
  await check('saved change invalidates a native burn preview before any deletion', async () => {
    const current = await state();
    const preview = await client.previewBurn({}, current.revision);
    await save([keptRule], protectedRefs);
    const updated = await state();
    await rejects(() => client.startBurn({ previewToken: preview.previewToken }, updated.revision), ['STALE_PREVIEW']);
    assert((await allCookies('firefox-default')).some(cookie => cookie.name === 'erase'), 'Stale preview deleted cookies');
  });
  await check('confirmed native burn preserves selected rules and protected closed containers', async () => {
    const current = await state();
    const preview = await client.previewBurn({}, current.revision);
    assert(preview.eligibleAttempts >= 2 && preview.skippedStores.some(store => store.name === 'Audit Personal'), 'Preview store scope wrong');
    await client.startBurn({ previewToken: preview.previewToken }, current.revision);
    const finished = await settled();
    assert(finished.operation.state === 'completed', `Terminal state: ${finished.operation.state}`);
    assert((await allCookies('firefox-default')).some(cookie => cookie.name === 'keep'), 'Protected cookie deleted');
    assert(!(await allCookies('firefox-default')).some(cookie => cookie.name === 'erase'), 'Normal eligible cookie retained');
    assert(!(await allCookies(containerA.cookieStoreId)).some(cookie => cookie.name === 'erase'), 'Closed eligible container retained');
    assert((await allCookies(containerB.cookieStoreId)).some(cookie => cookie.name === 'erase'), 'Protected container cookie deleted');
    assert(!Object.hasOwn(await browser.storage.local.get(), 'biscotty.inProgress'), 'Completed marker retained');
    await client.dismissOperation({ operationId: finished.operation.id });
    assert((await state()).operation === null, 'Dismissal retained result');
  });
  await check('partition and first-party contexts retain protected identities', async () => {
    await setCookie('keep', 'firefox-default', { partitionKey: { topLevelSite: 'https://example.org' } });
    await setCookie('keep', 'firefox-default', { firstPartyDomain: 'example.com' });
    const before = (await allCookies('firefox-default')).filter(cookie => cookie.name === 'keep').length;
    assert(before >= 2, 'Distinct partition fixture absent');
    await setCookie('partition-erase', 'firefox-default', { partitionKey: { topLevelSite: 'https://example.org' } });
    await setCookie('fpi-erase', 'firefox-default', { firstPartyDomain: 'example.com' });
    const current = await state();
    const preview = await client.previewBurn({}, current.revision);
    await client.startBurn({ previewToken: preview.previewToken }, current.revision);
    const finished = await settled();
    assert((await allCookies('firefox-default')).filter(cookie => cookie.name === 'keep').length === before, 'Protected partition identity lost');
    assert(!(await allCookies('firefox-default')).some(cookie => ['partition-erase', 'fpi-erase'].includes(cookie.name)), 'Eligible partition or first-party cookie retained');
    await client.dismissOperation({ operationId: finished.operation.id });
  });
  await check('future protected parent collision prevents an unsafe native selector', async () => {
    await save([{ ...rule('example.com', 'collision'), includeSubdomains: false }], protectedRefs);
    await setCookie('collision', 'firefox-default', { url: 'https://child.other.example.com/', domain: 'child.other.example.com' });
    await setCookie('safety-control');
    const current = await state();
    const preview = await client.previewBurn({}, current.revision);
    assert(preview.ambiguous >= 1, 'Unsafe parent intersection not skipped');
    await setCookie('collision', 'firefox-default', { url: 'https://example.com/', domain: '.example.com' });
    assert((await allCookies('firefox-default')).some(cookie => cookie.domain === '.example.com' && cookie.name === 'collision'), 'Protected fixture absent');
    await client.startBurn({ previewToken: preview.previewToken }, current.revision);
    const finished = await settled();
    assert((await allCookies('firefox-default')).some(cookie => cookie.domain === '.example.com' && cookie.name === 'collision'), 'Future protected parent cookie deleted');
    assert(!(await allCookies('firefox-default')).some(cookie => cookie.name === 'safety-control'), 'Safe unrelated deletion did not run');
    await client.dismissOperation({ operationId: finished.operation.id });
  });
  await check('local export contains no native IDs, cookie secrets, tokens, or revision', async () => {
    await save([keptRule], protectedRefs);
    const current = await state();
    exportedText = (await client.prepareExport({}, current.revision)).text;
    assert(!/SYNTHETIC_COOKIE_SECRET_014|firefox-container|cookieStoreId|previewToken|"revision"/.test(exportedText), 'Export contains private metadata');
    const parsed = JSON.parse(exportedText);
    assert(parsed.rules.length === 1 && parsed.containers.length >= 2, 'Portable settings incomplete');
  });
  if (importedText) await check('separate profile import requires mapping and commits reviewed Replace result', async () => {
    const current = await state();
    const inspected = await client.inspectImport({ text: importedText, mode: 'replace' }, current.revision);
    const mappings = inspected.containers.map(container => ({ sourceRef: container.ref, action: 'retain' }));
    let plan = await client.planImport({ importHandle: inspected.importHandle, mode: 'replace', mappings }, current.revision);
    plan = await client.resolveImport({ planToken: plan.planToken, decisions: plan.conflicts.map(conflict => ({ conflictId: conflict.id, choice: 'imported' })), acknowledgments: { replace: true, exclusions: true, manyToOne: true } }, current.revision);
    assert(plan.canCommit, 'Reviewed Replace plan not committable');
    await client.commitImport({ planToken: plan.planToken }, current.revision);
    assert((await state()).configuration.rules.some(rule => rule.domain === 'audit.example.com' && rule.name === 'keep'), 'Imported rule absent');
  });
  await check('redirect and nested-frame observation stores only reduced current-page metadata', async () => {
    await browser.cookies.set({ url: `http://localhost:${fixturePort}/`, name: 'local-associated', value: 'SYNTHETIC_COOKIE_SECRET_014', firstPartyDomain: '' });
    await browser.cookies.set({ url: `http://127.0.0.1:${fixturePort}/`, name: 'third-associated', value: 'SYNTHETIC_COOKIE_SECRET_014', firstPartyDomain: '' });
    const tab = await browser.tabs.create({ url: `http://localhost:${fixturePort}/redirect?secret=URL_SECRET_014`, active: true });
    for (let i = 0; i < 100; i++) { if ((await browser.tabs.get(tab.id)).status === 'complete') break; await pause(30); }
    await pause(400);
    const context = await client.getSiteContext({ windowId: tab.windowId });
    assert(context.contextToken, 'Site context unavailable');
    const domains = await client.getSiteCookieDomains({ contextToken: context.contextToken, pageSize: 200 });
    assert(domains.domains.some(row => row.domain === 'localhost'), 'First-party domain absent');
    assert(domains.domains.some(row => row.domain === '127.0.0.1'), 'Observed third-party domain absent');
    const session = await browser.storage.session.get();
    const serialized = JSON.stringify(session);
    assert(!/URL_SECRET_014|SYNTHETIC_COOKIE_SECRET_014|\/frame|\/nested|\/redirect|requestHeaders|requestBody/.test(serialized), 'Sensitive observation fields retained');
    assert(Object.keys(await browser.storage.local.get()).every(key => key === 'biscotty.configuration'), 'Unexpected persistent data');
    await browser.tabs.update(tab.id, { url: `http://localhost:${fixturePort}/next` });
    await pause(300);
    await rejects(() => client.getSiteCookieDomains({ contextToken: context.contextToken }), ['STALE_SITE_CONTEXT']);
    await browser.tabs.remove(tab.id);
    await pause(500);
    const retained = (await browser.storage.session.get('biscotty.siteObservations'))['biscotty.siteObservations'] || {};
    assert(!Object.hasOwn(retained, tab.id), 'Closed tab observation retained');
  });
  await check('production options page renders controls and imported strings remain inert', async () => {
    assert(document.querySelector('button') && document.querySelector('main'), 'Options UI missing');
    const { element } = await import('../src/frontend/dom.js');
    const hostile = '<img src=x onerror="globalThis.AUDIT_XSS=true">';
    const node = element('span', {}, hostile);
    document.body.append(node);
    assert(node.textContent === hostile && node.querySelector('img') === null && !globalThis.AUDIT_XSS, 'Untrusted markup interpreted');
    node.remove();
  });
}
document.documentElement.setAttribute('data-audit-results', JSON.stringify({ results, exportedText }));
