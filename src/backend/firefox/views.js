import { fail, clone, yieldTask } from '../../core/errors.js';
import { normalizeDomain } from '../../core/configuration/index.js';
import { matchCookie, getSiteProtection, planQuickProtection } from '../../core/policy/index.js';
import { catalogKey } from '../burner/service.js';
const reasonViews = reasons => (reasons || []).map(reason => typeof reason === 'string' ? { message: reason } : { ...reason, message: reason.message || (reason.type === 'container' ? 'This entire container is protected.' : reason.domain ? `Saved rule for ${reason.domain}.` : 'Protection comes from saved settings.') });
export function createViews({ adapter, configuration, burner, handles }) {
  async function requireAccess() {
    const value = await adapter.getAccess();
    if (!value.granted || !value.available) fail('PERMISSION_REQUIRED', value.reason || 'Restore website access in Firefox permissions.');
  }
  async function getSiteContext(payload, request) {
    try {
      await requireAccess();
      const catalog = await adapter.getCatalog();
      if (!burner.isLocked()) await configuration.reconcileCatalog(catalog);
      const { record, catalogGeneration } = await configuration.readConfiguration();
      if (!record) fail('CONFIGURATION_UNAVAILABLE', 'Restore the saved configuration first.');
      const tab = await adapter.getActiveTab(payload);
      if (tab.incognito) fail('PRIVATE_UNSUPPORTED', 'Private browsing is outside Biscotty’s scope.');
      let url;
      try { url = new URL(tab.url); } catch { fail('CONTEXT_UNAVAILABLE', 'The current page cannot be evaluated.'); }
      if (!['http:', 'https:'].includes(url.protocol)) fail('CONTEXT_UNAVAILABLE', 'Site protection is available on HTTP and HTTPS pages.');
      const facts = await adapter.classifyHost(normalizeDomain(url.hostname));
      if (facts.knownSuffix) fail('CONTEXT_UNAVAILABLE', 'A public suffix cannot be protected as a site.');
      const ref = tab.cookieStoreId === catalog.normalStoreId ? 'normal' : record.containerBindings.find(binding => binding.state === 'active' && binding.cookieStoreId === tab.cookieStoreId)?.ref;
      if (!ref) fail('CONTEXT_UNAVAILABLE', 'The current store is unavailable.');
      const target = { domain: facts.baseDomain || facts.host, includeSubdomains: Boolean(facts.baseDomain && facts.kind === 'dns') };
      const effective = getSiteProtection(target, record, ref);
      const removal = planQuickProtection(record, target, ref, false);
      const localEquivalent = record.rules.some(rule => rule.domain === target.domain && rule.includeSubdomains === target.includeSubdomains && rule.name === null && rule.path === null && rule.scope.type === 'selected' && rule.scope.storeRefs.includes(ref));
      const store = (await configuration.view()).stores.find(store => store.ref === ref);
      const contextToken = handles.issue('site', request.owner, { windowId: payload.windowId, tabId: tab.id, host: facts.host, storeId: tab.cookieStoreId, ref, target, revision: record.revision, catalogGeneration, catalog: catalogKey(catalog) });
      return { contextToken, target, host: facts.host, store, status: effective.status, reasons: reasonViews(effective.reasons), controls: { canProtect: !burner.isLocked() && effective.status !== 'full', canRemove: !burner.isLocked() && localEquivalent && !removal.editorRequired, editorRequired: Boolean(removal.editorRequired) } };
    } catch (error) {
      return { contextToken: null, target: null, store: null, status: 'unavailable', reasons: [{ message: error.code ? error.message : 'The current page is unavailable.' }], controls: { canProtect: false, canRemove: false, editorRequired: false } };
    }
  }
  async function setSiteProtection(payload, request) {
    if (typeof payload.enabled !== 'boolean') fail('INVALID_REQUEST', 'Choose the protection state.');
    if (burner.isLocked()) fail('OPERATION_ACTIVE', 'Protection changes are unavailable during a burn.');
    await requireAccess();
    await configuration.assertRevision(request.expectedRevision);
    const context = handles.get(payload.contextToken, 'site', request.owner, 'STALE_SITE_CONTEXT');
    const { record, catalogGeneration } = await configuration.readConfiguration();
    const tab = await adapter.getActiveTab({ windowId: context.windowId });
    let host;
    try { const url = new URL(tab.url); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); host = normalizeDomain(url.hostname); } catch { fail('STALE_SITE_CONTEXT', 'The page changed. Refresh the site view.'); }
    if (tab.incognito || tab.id !== context.tabId || host !== context.host || tab.cookieStoreId !== context.storeId || record.revision !== context.revision || catalogGeneration !== context.catalogGeneration || catalogKey(await adapter.getCatalog()) !== context.catalog) fail('STALE_SITE_CONTEXT', 'The page or store changed. Refresh the site view.');
    const plan = planQuickProtection(record, context.target, context.ref, payload.enabled);
    if (plan.editorRequired || !plan.candidate) fail('VALIDATION_FAILED', 'Open Settings to review inherited protection.');
    const result = await configuration.commitConfiguration({ expectedRevision: request.expectedRevision, expectedCatalogGeneration: context.catalogGeneration, candidate: plan.candidate, beforeWrite: async () => {
      const active = await adapter.getActiveTab({ windowId: context.windowId });
      let currentHost;
      try { const currentURL = new URL(active.url); if (!['http:', 'https:'].includes(currentURL.protocol)) throw new Error(); currentHost = normalizeDomain(currentURL.hostname); } catch { fail('STALE_SITE_CONTEXT', 'The page changed. Refresh the site view.'); }
      if (active.incognito || active.id !== context.tabId || currentHost !== context.host || active.cookieStoreId !== context.storeId) fail('STALE_SITE_CONTEXT', 'The page or store changed. Refresh the site view.');
    } });
    handles.remove(payload.contextToken);
    const effective = getSiteProtection(context.target, result.record, context.ref);
    return { revision: result.record.revision, status: effective.status, reasons: reasonViews(effective.reasons) };
  }
  async function getCookies(payload, request) {
    await requireAccess();
    const pageSize = payload.pageSize ?? 100;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200 || (payload.search !== undefined && (typeof payload.search !== 'string' || payload.search.length > 4096))) fail('INVALID_REQUEST', 'Cookie page size must be between 1 and 200.');
    const catalog = await adapter.getCatalog();
    if (!burner.isLocked()) await configuration.reconcileCatalog(catalog);
    const { record, catalogGeneration } = await configuration.readConfiguration();
    if (!record) fail('CONFIGURATION_UNAVAILABLE', 'Restore the saved configuration to inspect protection.');
    const key = catalogKey(catalog);
    let rows, offset;
    if (payload.pageToken) {
      const page = handles.get(payload.pageToken, 'cookies', request.owner);
      if (page.revision !== record.revision || page.catalogGeneration !== catalogGeneration || page.catalog !== key) fail('INVALID_REQUEST', 'The cookie list changed. Refresh its first page.');
      rows = page.rows; offset = page.offset;
    } else {
      const stores = (await configuration.view()).stores;
      const refs = payload.storeRefs ?? stores.filter(store => store.availability === 'available').map(store => store.ref);
      if (!Array.isArray(refs) || refs.some(ref => !stores.some(store => store.ref === ref && store.availability === 'available'))) fail('INVALID_REQUEST', 'Select available cookie stores.');
      const search = (payload.search || '').toLowerCase();
      rows = []; offset = 0;
      for (const ref of [...new Set(refs)]) {
        const store = stores.find(store => store.ref === ref);
        const storeId = ref === 'normal' ? catalog.normalStoreId : record.containerBindings.find(binding => binding.ref === ref)?.cookieStoreId;
        if (!storeId) fail('CONTEXT_UNAVAILABLE', 'The cookie store is unavailable.');
        let cookies;
        try { cookies = await adapter.listCookies(storeId); } catch { fail('CONTEXT_UNAVAILABLE', 'Cookie enumeration failed. Refresh to try again.'); }
        for (let index = 0; index < cookies.length; index++) {
          const cookie = cookies[index];
          const protection = matchCookie(cookie, record, ref);
          const row = { domain: cookie.domain, name: cookie.name, path: cookie.path, storeRef: ref, partitionLabel: cookie.partitionKey ? JSON.stringify(cookie.partitionKey) : cookie.firstPartyDomain ? `First party: ${cookie.firstPartyDomain}` : 'Unpartitioned', protected: protection.protected, reasons: reasonViews(protection.reasons), secure: cookie.secure, httpOnly: cookie.httpOnly, session: cookie.session };
          if (!search || [row.domain, row.name, row.path, store.label, row.protected ? 'protected' : 'eligible'].some(value => String(value).toLowerCase().includes(search))) rows.push(row);
          if (index % 100 === 0) await yieldTask();
        }
      }
    }
    await requireAccess();
    if (catalogKey(await adapter.getCatalog()) !== key) fail('CONTEXT_UNAVAILABLE', 'The container catalog changed. Refresh the list.');
    const nextOffset = offset + pageSize;
    const nextPageToken = nextOffset < rows.length ? handles.issue('cookies', request.owner, { rows, offset: nextOffset, revision: record.revision, catalogGeneration, catalog: key }) : null;
    return { cookies: clone(rows.slice(offset, nextOffset)), nextPageToken };
  }
  return { handlers: { getSiteContext, setSiteProtection, getCookies } };
}
