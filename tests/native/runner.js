// Loaded only by the disposable native test package; never shipped.
import { client } from '../../src/backend/client/native.js';
import { createFirefoxAdapter } from '../../src/backend/firefox/adapter.js';
import { createObservations } from '../../src/backend/firefox/observations.js';
import { selectorFor, nativeSelector } from '../../src/backend/burner/selectors.js';
import { importedText, fixturePort } from './input.js';
const results = [];
const setCookie = details => browser.cookies.set({ firstPartyDomain: '', ...details });
const assert = (value, message = 'Unexpected result') => { if (!value) throw new Error(message); };
async function check(name, task) {
  try { await task(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, error: String(error.message).slice(0, 1000) }); }
}
const adapter = createFirefoxAdapter();
const state = () => client.getState();
let work, personal, verifyObservationCleanup;
async function save(rules = [], protectedContainerRefs = []) {
  const current = await state();
  return client.saveConfiguration({ rules, protectedContainerRefs, inactiveDecisions: [] }, current.revision);
}
async function burn() {
  const current = await state();
  const preview = await client.previewBurn({}, current.revision);
  if (!preview.eligibleAttempts) return { preview, operation: null };
  await client.startBurn({ previewToken: preview.previewToken }, current.revision);
  for (let i = 0; i < 1000; i++) {
    const operation = (await state()).operation;
    if (!['running','cancel_requested'].includes(operation.state)) return { preview, operation };
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Burn did not finish');
}
try {
  if (importedText) await browser.contextualIdentities.create({ name: 'Native ID offset', color: 'orange', icon: 'circle' });
  await check('Native manifest/event page initializes empty settings and complete permissions', async () => {
    const current = await state();
    assert(current.configurationStatus === 'valid', JSON.stringify(current));
    assert(current.capabilities.canBurn, JSON.stringify(current.capabilities));
    assert(current.configuration.rules.length === 0);
    assert(!JSON.stringify(current).includes('cookieStoreId'));
  });
  await check('UX native section tabs preserve mounted drafts and keyboard selection', async () => {
    for (let i = 0; i < 200 && document.getElementById('draft-status').textContent.includes('Loading'); i++) await new Promise(resolve => setTimeout(resolve, 20));
    const rules = document.getElementById('tab-rules');
    rules.click();
    assert(!document.getElementById('panel-rules').hidden);
    document.getElementById('add-rule').click();
    document.getElementById('rule-domain').value = 'ui-draft.example.com';
    document.querySelector('#rule-form button[type=submit]').click();
    assert(document.getElementById('draft-status').textContent.includes('Unsaved'));
    rules.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert(document.getElementById('tab-containers').getAttribute('aria-selected') === 'true');
    document.getElementById('tab-rules').click();
    assert(document.getElementById('rules-list').textContent.includes('ui-draft.example.com'));
    document.getElementById('cancel').click();
    document.getElementById('confirm-discard').click();
    for (let i = 0; i < 200 && !document.getElementById('cancel').disabled; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert(!(await state()).configuration.rules.some(rule => rule.domain === 'ui-draft.example.com'));
    document.getElementById('tab-cookies').click();
  });
  await check('Native domain adapter: public suffix, IDN, IP and unknown suffix', async () => {
    assert((await adapter.classifyHost('shop.example.co.uk')).baseDomain === 'example.co.uk');
    assert((await adapter.classifyHost('co.uk')).knownSuffix);
    assert((await adapter.classifyHost('localhost')).baseDomain === null);
    assert((await adapter.classifyHost('[::1]')).kind === 'ipv6');
    assert((await adapter.classifyHost('xn--bcher-kva.de')).baseDomain === 'xn--bcher-kva.de');
  });
  verifyObservationCleanup = async () => {
    const key = 'biscotty.siteObservations';
    await browser.storage.session.set({ [key]: { 1: { hosts: ['old.example'] } } });
    const tracker = createObservations({ adapter: { ...adapter, onSiteActivity() {} } });
    await tracker.ready;
    assert((await browser.storage.session.get(key))[key] === undefined, 'Legacy observations were not cleared');
    assert(!browser.runtime.getManifest().permissions.includes('webRequest'), 'Request permission remains');
  };
  await check('SITE native redirects, nested frames, domain snapshots and same-host reload invalidate popup saves', async () => {
    const topURL = `http://localhost:${fixturePort}`;
    await setCookie({ url: `${topURL}/`, name: 'observed-top', value: 'synthetic' });
    await setCookie({ url: `http://127.0.0.1:${fixturePort}/`, name: 'observed-frame', value: 'synthetic' });
    const tab = await browser.tabs.create({ url: `${topURL}/redirect`, active: true });
    try {
      for (let i = 0; i < 200; i++) {
        const current = await browser.tabs.get(tab.id);
        if (current.status === 'complete' && current.url?.endsWith('/page')) break;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      const site = await client.getSiteContext({ windowId: tab.windowId });
      assert(site.contextToken, JSON.stringify(site));
      const snapshot = await client.getSiteCookieDomains({ contextToken: site.contextToken });
      assert(snapshot.domains.some(row => row.domain === 'localhost'), JSON.stringify(snapshot));
      assert(!snapshot.domains.some(row => row.domain === '127.0.0.1'), 'Unpartitioned third-party cookie was attributed to this site');
      const popup = document.createElement('iframe');
      popup.src = browser.runtime.getURL('src/frontend/popup.html');
      popup.style.width = '380px'; popup.style.height = '560px';
      document.body.prepend(popup);
      try {
        for (let i = 0; i < 200 && popup.contentDocument?.getElementById('view-cookies')?.disabled !== false; i++) await new Promise(resolve => setTimeout(resolve, 20));
        popup.contentDocument.getElementById('view-cookies').click();
        for (let i = 0; i < 200 && popup.contentDocument?.querySelector('[aria-label="Edit protection for localhost"]')?.disabled !== false; i++) await new Promise(resolve => setTimeout(resolve, 20));
        const ui = popup.contentDocument;
        const pencil = ui.querySelector('[aria-label="Edit protection for localhost"]');
        assert(pencil, 'Native popup did not render the stored-cookie domain.');
        pencil.closest('details').open = true;
        pencil.click();
        assert(ui.querySelector('#site-rule-dialog').open, 'Pencil did not open the native dialog.');
        assert(ui.querySelector('#site-rule-fields input').value === 'localhost');
        ui.querySelector('#cancel-site-rule').click();
        assert(!ui.querySelector('#site-rule-dialog').open, 'Cancel did not close the dialog.');
        assert(!(await state()).configuration.rules.some(rule => rule.domain === 'localhost'), 'Cancel changed saved rules.');
        ui.querySelector('[aria-label="Edit protection for localhost"]').click();
        ui.querySelector('#save-site-rule').click();
        for (let i = 0; i < 200 && ui.querySelector('#site-rule-dialog').open; i++) await new Promise(resolve => setTimeout(resolve, 20));
        assert(!ui.querySelector('#site-rule-dialog').open, 'Successful Save did not close the dialog.');
        assert((await state()).configuration.rules.some(rule => rule.domain === 'localhost'), 'Popup Save did not commit the new rule.');
      } finally { popup.remove(); }
      const refreshed = await client.getSiteContext({ windowId: tab.windowId });
      const currentSnapshot = await client.getSiteCookieDomains({ contextToken: refreshed.contextToken });
      const row = currentSnapshot.domains.find(row => row.domain === 'localhost');
      await browser.tabs.reload(tab.id);
      await new Promise(resolve => setTimeout(resolve, 150));
      let failure;
      try { await client.saveSiteRule({ domainToken: row.domainToken, ruleIndex: null, rule: { domain: 'localhost', includeSubdomains: false, name: null, path: null, scope: { type: 'selected', storeRefs: ['normal'] } } }, currentSnapshot.revision); }
      catch (error) { failure = error.code; }
      assert(failure === 'STALE_SITE_CONTEXT', String(failure));
    } finally { await browser.tabs.remove(tab.id); }
  });
  await check('Named containers without open tabs are cataloged', async () => {
    work = await browser.contextualIdentities.create({ name: 'Native Work', color: 'blue', icon: 'briefcase' });
    personal = await browser.contextualIdentities.create({ name: 'Native Personal', color: 'green', icon: 'fingerprint' });
    const current = await state();
    assert(current.stores.some(store => store.label === 'Native Work'));
    assert(current.stores.some(store => store.label === 'Native Personal'));
    await setCookie({ url: 'https://example.com/', name: 'work', value: 'synthetic', storeId: work.cookieStoreId });
    await setCookie({ url: 'https://example.com/', name: 'personal', value: 'synthetic', storeId: personal.cookieStoreId });
    const workRef = current.stores.find(store => store.label === 'Native Work').ref;
    await save([], [workRef]);
    const result = await burn(); assert(result.operation.state === 'completed', JSON.stringify(result));
    assert((await adapter.listCookies(work.cookieStoreId)).some(cookie => cookie.name === 'work'));
    assert(!(await adapter.listCookies(personal.cookieStoreId)).some(cookie => cookie.name === 'personal'));
  });
  await check('Native selector avoids future protected parent domain/path collisions', async () => {
    await save([{ domain: 'example.com', includeSubdomains: false, name: 'collision', path: '/account', scope: { type: 'all' } }]);
    await setCookie({ url: 'https://shop.example.com/account/deep', name: 'collision', path: '/account/deep', value: 'synthetic' });
    const current = await state(); const preview = await client.previewBurn({}, current.revision);
    assert(preview.ambiguous >= 1);
    await setCookie({ url: 'https://example.com/account', domain: '.example.com', name: 'collision', path: '/account', value: 'protected-synthetic' });
    if (preview.eligibleAttempts) { await client.startBurn({ previewToken: preview.previewToken }, current.revision); await new Promise(resolve => setTimeout(resolve, 100)); }
    assert((await adapter.listCookies('firefox-default')).filter(cookie => cookie.name === 'collision').length === 2);
  });
  await check('Native partitions, Secure/HttpOnly metadata and bounded deletion', async () => {
    await save();
    await setCookie({ url: 'https://example.net/', name: 'partitioned', value: 'synthetic', secure: true, httpOnly: true, partitionKey: { topLevelSite: 'https://example.org' } });
    await setCookie({ url: 'https://example.net/', name: 'plain', value: 'synthetic', secure: true });
    const inventory = await adapter.listCookies('firefox-default');
    const partitioned = inventory.find(cookie => cookie.name === 'partitioned');
    assert(partitioned?.partitionKey?.topLevelSite === 'https://example.org', JSON.stringify(partitioned));
    assert(partitioned.httpOnly && partitioned.secure);
    assert(!JSON.stringify(inventory).includes('synthetic'));
    const result = await burn(); assert(result.operation.state === 'completed', JSON.stringify(result));
    assert(result.operation.attemptedCalls === result.operation.plannedAttempts);
    assert(!(await adapter.listCookies('firefox-default')).some(cookie => ['partitioned','plain'].includes(cookie.name)));
  });
  await check('PEX native exception burns only the selected partition and store', async () => {
    const current = await state();
    const rule = { domain: 'example.net', includeSubdomains: false, name: 'pex-native', path: '/', scope: { type: 'all' } };
    const exception = { cookieDomain: 'example.net', cookieIncludeSubdomains: false, topLevelDomain: 'example.org', topLevelIncludeSubdomains: false, scheme: 'https', name: 'pex-native', path: '/', scope: { type: 'selected', storeRefs: ['normal'] }, enabled: true };
    await client.saveConfiguration({ rules: [rule], exceptions: [exception], protectedContainerRefs: [], inactiveDecisions: [] }, current.revision);
    try {
      await setCookie({ url: 'https://example.net/', name: 'pex-native', value: 'synthetic', secure: true, partitionKey: { topLevelSite: 'https://example.org' } });
      await setCookie({ url: 'https://example.net/', name: 'pex-native', value: 'synthetic', secure: true });
      await setCookie({ url: 'https://example.net/', name: 'pex-native', value: 'synthetic', secure: true, partitionKey: { topLevelSite: 'https://example.org' }, storeId: work.cookieStoreId });
      const result = await burn();
      assert(result.preview.exceptionEligible >= 1, JSON.stringify(result.preview));
      assert(result.operation?.state === 'completed', JSON.stringify(result.operation));
      const normal = (await adapter.listCookies('firefox-default')).filter(cookie => cookie.name === 'pex-native');
      const workCookies = (await adapter.listCookies(work.cookieStoreId)).filter(cookie => cookie.name === 'pex-native');
      assert(normal.length === 1 && !normal[0].partitionKey, JSON.stringify(normal));
      assert(workCookies.length === 1 && workCookies[0].partitionKey, JSON.stringify(workCookies));
    } finally {
      const latest = await state();
      await client.saveConfiguration({ rules: [], exceptions: [], protectedContainerRefs: [], inactiveDecisions: [] }, latest.revision);
    }
  });
  await check('Encoded paths are conservatively skipped; IDN and IPv6 selectors preserve hosts', async () => {
    const base = { domain: 'example.com', name: 'encoded', path: '/a%2Fb', firstPartyDomain: '', partitionKey: null, secure: true };
    assert(selectorFor(base, 'normal') === null);
    assert(selectorFor({ ...base, domain: '.xn--bcher-kva.de', path: '/' }, 'normal').url === 'https://xn--bcher-kva.de/');
    assert(selectorFor({ ...base, domain: '[::1]', path: '/' }, 'normal').url === 'https://[::1]/');
    await setCookie({ url: 'https://example.com/a%2Fb', name: 'encoded', path: '/a%2Fb', value: 'synthetic' });
    const preview = await client.previewBurn({}, (await state()).revision); assert(preview.ambiguous >= 1);
    const missing = await adapter.removeCookie(nativeSelector({ url: 'https://example.com/', name: 'absent', firstPartyDomain: '', partitionKey: null }, 'firefox-default')); assert(missing === null);
  });
  await check('Export strips native identifiers and reimport uses explicit mapping and conflicts', async () => {
    const current = await state();
    const exported = await client.prepareExport({}, current.revision);
    assert(!exported.text.includes('firefox-'));
    const inspected = await client.inspectImport({ text: exported.text, mode: 'merge' }, current.revision);
    const mappings = inspected.containers.map(container => ({ sourceRef: container.ref, action: 'retain' }));
    const plan = await client.planImport({ importHandle: inspected.importHandle, mode: 'merge', mappings }, current.revision);
    assert(plan.planToken && Array.isArray(plan.conflicts));
  });
  await check('Dismissal clears current result; local storage contains configuration only', async () => {
    const current = await state();
    if (current.operation) await client.dismissOperation({ operationId: current.operation.id });
    const stored = await browser.storage.local.get(null);
    assert(Object.keys(stored).every(key => key === 'biscotty.configuration'), JSON.stringify(Object.keys(stored)));
    assert((await state()).operation === null);
  });
  await check('Options UI renders accessible controls with no remote resources', async () => {
    assert(document.querySelector('h1'));
    assert(document.querySelectorAll('button').length > 5);
    assert([...document.querySelectorAll('script[src],link[href],img[src]')].every(element => new URL(element.src || element.href).protocol === 'moz-extension:'));
  });
} catch (error) { results.push({ name: 'Runner setup', ok: false, error: String(error.message) }); }
await check('Native DOM text safety and form semantics', async () => {
  const fixture = document.createElement('div'); fixture.id = 'fixture';
  const output = document.createElement('pre'); output.id = 'results';
  document.body.append(fixture, output);
  await import('../../tests/frontend/browser.js');
  const text = output.textContent;
  assert(text.includes('PASS UI-A11') && !text.includes('FAIL'), text);
  output.remove();
});
await check('First-party contexts enumerate and delete with explicit separation', async () => {
  await save();
  await setCookie({ url: 'https://example.net/', name: 'first-party', value: 'synthetic', firstPartyDomain: 'example.org' });
  const inventory = await adapter.listCookies('firefox-default');
  assert(inventory.some(cookie => cookie.name === 'first-party' && cookie.firstPartyDomain === 'example.org'));
  const result = await burn();
  assert(result.operation.state === 'completed', JSON.stringify(result));
  assert(!(await adapter.listCookies('firefox-default')).some(cookie => cookie.name === 'first-party'));
});
if (importedText) await check('Cross-profile Replace maps portable settings to different native identifiers', async () => {
  const current = await state();
  const inspected = await client.inspectImport({ text: importedText, mode: 'replace' }, current.revision);
  const destinations = current.stores.filter(store => store.kind === 'container' && store.availability === 'available');
  const mappings = inspected.containers.map((container, i) => ({ sourceRef: container.ref, action: 'map', targetRef: destinations[i % destinations.length].ref }));
  let plan = await client.planImport({ importHandle: inspected.importHandle, mode: 'replace', mappings }, current.revision);
  const decisions = plan.conflicts.map(conflict => ({ conflictId: conflict.id, choice: conflict.choices.includes('imported') ? 'imported' : conflict.choices[0] }));
  plan = await client.resolveImport({ planToken: plan.planToken, decisions, acknowledgments: { replace: true, manyToOne: true, exclusions: true, recovery: true } }, current.revision);
  assert(plan.canCommit, JSON.stringify(plan));
  const committed = await client.commitImport({ planToken: plan.planToken }, current.revision);
  assert(committed.configuration.rules.some(rule => rule.domain === 'example.org'));
});
await check('Native settings dialog preserves unsaved drafts and confirms Save and Cancel', async () => {
  const wait = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('Settings did not update'); };
  await save();
  await wait(() => !document.getElementById('add-rule').disabled);
  const openDraft = async () => {
    document.getElementById('add-rule').click();
    const dialog = document.getElementById('rule-dialog'); assert(dialog.open);
    document.getElementById('rule-domain').value = 'ui.example.org';
    document.getElementById('rule-form').requestSubmit();
    await wait(() => !dialog.open);
    await wait(() => !document.getElementById('save').disabled);
  };
  await openDraft();
  assert(!(await state()).configuration.rules.some(rule => rule.domain === 'ui.example.org'));
  document.getElementById('cancel').click();
  assert(document.getElementById('discard-dialog').open);
  document.getElementById('confirm-discard').click();
  await wait(() => document.getElementById('save').disabled);
  assert(!(await state()).configuration.rules.some(rule => rule.domain === 'ui.example.org'));
  await openDraft(); document.getElementById('save').click();
  for (let i = 0; i < 100; i++) { if ((await state()).configuration.rules.some(rule => rule.domain === 'ui.example.org')) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Settings Save did not commit');
});
await check('XFER-A17 native import maps a prototype-named reference and reaches its final preview', async () => {
  const wait = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error(document.getElementById('messages').textContent || 'Import UI did not advance'); };
  const findButton = text => [...document.querySelectorAll('button')].find(button => button.textContent === text);
  const before = (await state()).revision;
  document.getElementById('start-import').click();
  const input = document.querySelector('#import-workflow input[type="file"]');
  assert(input, 'Import file control is missing.');
  const refs = ['__proto__', 'constructor', 'toString', ...Array.from({ length: 20 }, (_, index) => `source-${index}`)];
  const portable = { format: 'biscotty-config', schemaVersion: 1, containers: refs.map(ref => ({ ref, name: `Imported ${ref}`, color: 'blue', icon: 'briefcase', state: 'inactive' })), protectedContainerRefs: [], rules: [] };
  const files = new DataTransfer();
  files.items.add(new File([JSON.stringify(portable)], 'prototype-reference.json', { type: 'application/json' }));
  input.files = files.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  try {
    await wait(() => document.getElementById('mapping-__proto__') && !document.getElementById('mapping-__proto__').disabled);
    for (let page = 0; page < 2; page++) {
      for (const select of document.querySelectorAll('#import-workflow select[id^="mapping-"]')) {
        select.value = 'retain'; select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (page === 0) findButton('Next containers').click();
    }
    findButton('Build import plan').click();
    await wait(() => findButton('Apply configuration'));
    assert((await state()).revision === before, 'Mapping changed saved protection before Apply.');
    findButton('Change mode or mappings').click();
    await wait(() => document.getElementById('mapping-__proto__') && !document.getElementById('mapping-__proto__').disabled);
    assert(document.getElementById('mapping-__proto__').value === '', 'Changing mappings did not reset the choices.');
  } finally { findButton('Cancel import')?.click(); }
});
await check('CFG-A10 native Settings explains legacy portable excess and permits a fitting reduction', async () => {
  const key = 'biscotty.configuration';
  const original = (await browser.storage.local.get(key))[key];
  const inactive = Array.from({ length: 520 }, (_, index) => ({ ref: `legacy-${index}`, cookieStoreId: null, name: 'x'.repeat(4096), color: 'blue', icon: 'briefcase', state: 'inactive' }));
  await browser.storage.local.set({ [key]: { ...original, containerBindings: [...original.containerBindings, ...inactive] } });
  const over = await state();
  assert(over.configurationStatus === 'valid' && over.capabilities.canChangeProtection && !over.exportStatus.canExport, JSON.stringify(over.exportStatus));
  for (let i = 0; i < 200 && !document.getElementById('availability').textContent.includes('the limit is 2 MiB'); i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert(document.getElementById('availability').textContent.includes('the limit is 2 MiB'), 'Settings did not explain the portable limit.');
  assert(document.getElementById('export').disabled && !document.getElementById('add-rule').disabled, 'Portable excess disabled editing or allowed an oversized export.');
  await client.saveConfiguration({ rules: original.rules, protectedContainerRefs: original.protectedContainerRefs, inactiveDecisions: inactive.map(binding => ({ ref: binding.ref, action: 'remove' })) }, over.revision);
  const reduced = await state();
  assert(reduced.exportStatus.canExport);
  assert(JSON.stringify(reduced.configuration.rules) === JSON.stringify(original.rules), 'Reduction changed existing allow rules.');
});
// Isolated restoration runs after the production UI/navigation checks.
await check('CSI-A07/A08 native upgrade clears legacy observation data and drops webRequest permission', verifyObservationCleanup);
await check('Portable snapshot contains selected scope and exact empty name', async () => {
  const current = await state();
  const store = current.stores.find(store => store.label === 'Native Work');
  await save([{ domain: 'example.org', includeSubdomains: true, name: '', path: '/', scope: { type: 'selected', storeRefs: [store.ref, 'normal'] } }], [store.ref]);
  const exported = await client.prepareExport({}, (await state()).revision);
  document.documentElement.setAttribute('data-native-export', exported.text);
});
document.documentElement.setAttribute('data-native-results', JSON.stringify(results));
