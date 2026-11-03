import { fail, clone, yieldTask } from '../../core/errors.js';
import { normalizeDomain } from '../../core/configuration/index.js';
import { matchCookie, getSiteProtection, getDomainProtection, planQuickProtection } from '../../core/policy/index.js';
import { catalogKey } from '../burner/service.js';
import { createInventoryClassifier, INVENTORY_LIMITS } from './inventory.js';
import { planInventoryChoices as planChoices } from '../../core/policy/inventory-choices.js';
const reasonViews = reasons => (reasons || []).map(reason => typeof reason === 'string' ? { message: reason } : { ...reason, message: reason.message || (reason.type === 'container' ? 'This entire container is protected.' : reason.type === 'exception' ? `Deletion exception for ${reason.domain}.` : reason.domain ? `Saved rule for ${reason.domain}.` : 'Protection comes from saved settings.') });
const cookieIdentity = cookie => JSON.stringify([cookie.domain, cookie.name, cookie.path, cookie.hostOnly, cookie.firstPartyDomain, cookie.partitionKey]);
export function createViews({ adapter, configuration, burner, handles, siteHandles = handles, observations }) {
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
      const tabRef = tab.cookieStoreId === catalog.normalStoreId ? 'normal' : record.containerBindings.find(binding => binding.state === 'active' && binding.cookieStoreId === tab.cookieStoreId)?.ref;
      if (!tabRef) fail('CONTEXT_UNAVAILABLE', 'The current store is unavailable.');
      const stores = (await configuration.view()).stores;
      const ref = payload.storeRef === undefined ? tabRef : payload.storeRef;
      const store = stores.find(item => item.ref === ref && item.availability === 'available');
      if (!store) fail('CONTEXT_UNAVAILABLE', 'The selected store is unavailable.');
      const storeId = ref === 'normal' ? catalog.normalStoreId : record.containerBindings.find(binding => binding.ref === ref && binding.state === 'active')?.cookieStoreId;
      if (!storeId) fail('CONTEXT_UNAVAILABLE', 'The selected store is unavailable.');
      const target = { domain: facts.baseDomain || facts.host, includeSubdomains: Boolean(facts.baseDomain && facts.kind === 'dns') };
      const effective = getSiteProtection(target, record, ref);
      const addition = planQuickProtection(record, target, ref, true);
      const removal = planQuickProtection(record, target, ref, false);
      const localEquivalent = record.rules.some(rule => rule.domain === target.domain && rule.includeSubdomains === target.includeSubdomains && rule.name === null && rule.path === null && rule.scope.type === 'selected' && rule.scope.storeRefs.includes(ref));
      const observation = await observations.get(tab);
      const contextToken = siteHandles.issue('site', request.owner, { generation: observation.generation, windowId: payload.windowId, tabId: tab.id, host: facts.host, tabStoreId: tab.cookieStoreId, storeId, ref, scheme: url.protocol, target, revision: record.revision, catalogGeneration, catalog: catalogKey(catalog) });
      return { contextToken, target, host: facts.host, store, tabStore: stores.find(item => item.ref === tabRef), status: effective.status, reasons: reasonViews(effective.reasons), controls: { canProtect: !burner.isLocked() && effective.status !== 'full' && !addition.editorRequired, canRemove: !burner.isLocked() && localEquivalent && !removal.editorRequired, editorRequired: Boolean(addition.editorRequired || removal.editorRequired) } };
    } catch (error) {
      return { contextToken: null, target: null, store: null, status: 'unavailable', reasons: [{ message: error.code ? error.message : 'The current page is unavailable.' }], controls: { canProtect: false, canRemove: false, editorRequired: false } };
    }
  }
  async function setSiteProtection(payload, request) {
    if (typeof payload.enabled !== 'boolean') fail('INVALID_REQUEST', 'Choose the protection state.');
    if (burner.isLocked()) fail('OPERATION_ACTIVE', 'Protection changes are unavailable during a burn.');
    await requireAccess();
    await configuration.assertRevision(request.expectedRevision);
    const context = siteHandles.get(payload.contextToken, 'site', request.owner, 'STALE_SITE_CONTEXT');
    const { record, catalogGeneration } = await configuration.readConfiguration();
    const tab = await adapter.getActiveTab({ windowId: context.windowId });
    let host;
    try { const url = new URL(tab.url); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); host = normalizeDomain(url.hostname); } catch { fail('STALE_SITE_CONTEXT', 'The page changed. Refresh the site view.'); }
    if ((await observations.get(tab)).generation !== context.generation || tab.incognito || tab.id !== context.tabId || host !== context.host || tab.cookieStoreId !== (context.tabStoreId ?? context.storeId) || record.revision !== context.revision || catalogGeneration !== context.catalogGeneration || catalogKey(await adapter.getCatalog()) !== context.catalog) fail('STALE_SITE_CONTEXT', 'The page or store changed. Refresh the site view.');
    const plan = planQuickProtection(record, context.target, context.ref, payload.enabled);
    if (plan.editorRequired || !plan.candidate) fail('VALIDATION_FAILED', 'Open Settings to review inherited protection.');
    const result = await configuration.commitConfiguration({ expectedRevision: request.expectedRevision, expectedCatalogGeneration: context.catalogGeneration, candidate: plan.candidate, beforeWrite: async () => {
      const active = await adapter.getActiveTab({ windowId: context.windowId });
      let currentHost;
      try { const currentURL = new URL(active.url); if (!['http:', 'https:'].includes(currentURL.protocol)) throw new Error(); currentHost = normalizeDomain(currentURL.hostname); } catch { fail('STALE_SITE_CONTEXT', 'The page changed. Refresh the site view.'); }
      if ((await observations.get(active)).generation !== context.generation || active.incognito || active.id !== context.tabId || currentHost !== context.host || active.cookieStoreId !== (context.tabStoreId ?? context.storeId)) fail('STALE_SITE_CONTEXT', 'The page or store changed. Refresh the site view.');
    } });
    siteHandles.remove(payload.contextToken);
    const effective = getSiteProtection(context.target, result.record, context.ref);
    return { revision: result.record.revision, status: effective.status, reasons: reasonViews(effective.reasons) };
  }
  async function getCookies(payload, request) {
    const contextToken = payload.contextToken ?? null;
    const siteContext = contextToken === null ? null : siteHandles.get(contextToken, 'site', request.owner, 'STALE_SITE_CONTEXT');
    if (siteContext) await validateReadContext(siteContext);
    if (siteContext && payload.storeRefs !== undefined) fail('INVALID_REQUEST', 'Site cookie scope comes from its context.');

    await requireAccess();
    const pageSize = payload.pageSize ?? 100;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200 || (payload.search !== undefined && (typeof payload.search !== 'string' || payload.search.length > 4096))) fail('INVALID_REQUEST', 'Cookie page size must be between 1 and 200.');
    const catalog = await adapter.getCatalog();
    if (!burner.isLocked()) await configuration.reconcileCatalog(catalog);
    const { record, catalogGeneration } = await configuration.readConfiguration();
    if (!record) fail('CONFIGURATION_UNAVAILABLE', 'Restore the saved configuration to inspect protection.');
    const key = catalogKey(catalog);
    let rows, offset, coverage, scope, jars;
    if (payload.pageToken) {
      const page = handles.get(payload.pageToken, 'cookies', request.owner);
      if ((page.contextToken ?? null) !== contextToken) fail('INVALID_REQUEST', 'Keep the original site context while paging.');
      if (page.revision !== record.revision || page.catalogGeneration !== catalogGeneration || page.catalog !== key) fail('INVALID_REQUEST', 'The cookie list changed. Refresh its first page.');
      rows = page.rows; offset = page.offset; coverage = page.coverage; scope = page.scope; jars = page.jars;
    } else {
      const stores = (await configuration.view()).stores;
      const refs = siteContext ? [siteContext.ref] : payload.storeRefs ?? stores.filter(store => store.availability === 'available').map(store => store.ref);
      if (!Array.isArray(refs) || refs.some(ref => !stores.some(store => store.ref === ref && store.availability === 'available'))) fail('INVALID_REQUEST', 'Select available cookie stores.');
      scope = { storeRefs: [...new Set(refs)] };
      const inactive = stores.some(store => store.availability !== 'available');
      coverage = inactive ? { state: 'partial', reason: 'Some saved container references are unavailable and were not inspected.' } : { state: 'complete', reason: null };
      const search = (payload.search || '').toLowerCase();
      rows = []; jars = new Map(); offset = 0;
      let count = 0, bytes = 0;
      const classify = createInventoryClassifier(adapter);
      for (const ref of [...new Set(refs)]) {
        const store = stores.find(store => store.ref === ref);
        const storeId = ref === 'normal' ? catalog.normalStoreId : record.containerBindings.find(binding => binding.ref === ref)?.cookieStoreId;
        if (!storeId) fail('CONTEXT_UNAVAILABLE', 'The cookie store is unavailable.');
        let cookies;
        try { cookies = await adapter.listCookies(storeId); } catch { fail('CONTEXT_UNAVAILABLE', 'Cookie enumeration failed. Refresh to try again.'); }
        for (let index = 0; index < cookies.length; index++) {
          const cookie = cookies[index];
          if (++count > INVENTORY_LIMITS.cookies) fail('CONTEXT_UNAVAILABLE', 'The cookie inventory is too large to capture safely.');
          const { association, facts } = await classify(cookie);
          if (association.kind === 'unknown') coverage = { state: 'partial', reason: 'Some saved containers or cookie partition associations are unavailable or unknown.' };
          if (siteContext) {
            if (association.kind === 'unknown') continue;
            const domain = normalizeDomain(cookie.domain);
            if (association.kind === 'unpartitioned') {
              if (!(siteContext.host === domain || (cookie.hostOnly === false && !siteContext.host.startsWith('[') && siteContext.host.endsWith(`.${domain}`)))) continue;
            } else {
              const siteURL = new URL(association.topLevelSite);
              if (siteURL.hostname !== siteContext.target.domain || siteURL.protocol !== siteContext.scheme) continue;
            }
          }
          const protection = matchCookie(cookie, record, ref, facts);
          const row = { domain: cookie.domain, name: cookie.name, path: cookie.path, storeRef: ref, partitionLabel: association.kind === 'partitioned' ? association.topLevelSite : association.kind === 'unpartitioned' ? 'Unpartitioned' : 'Unknown association', association, protected: protection.protected, reasons: reasonViews(protection.reasons), overriddenRules: reasonViews(protection.overriddenRules), matchingExceptionIndexes: protection.matchingExceptionIndexes || [], secure: cookie.secure, httpOnly: cookie.httpOnly, session: cookie.session, _identity: { cookie, storeId, storeRef: ref } };
          bytes += new TextEncoder().encode(JSON.stringify(row)).length;
          if (bytes > INVENTORY_LIMITS.bytes) fail('CONTEXT_UNAVAILABLE', 'The cookie inventory is too large to capture safely.');
          if (association.kind === 'partitioned' && association.relationship === 'third-party') {
            row._jarKey = JSON.stringify([ref, normalizeDomain(cookie.domain), association.topLevelSite]);
            if (!jars.has(row._jarKey)) jars.set(row._jarKey, []);
            jars.get(row._jarKey).push(row._identity);
          }
          if (!search || [row.domain, row.name, row.path, store.label, row.partitionLabel, row.protected ? 'protected' : 'eligible'].some(value => String(value).toLowerCase().includes(search))) rows.push(row);
          if (index % 100 === 0) await yieldTask();
        }
      }
    }
    await requireAccess();
    if (catalogKey(await adapter.getCatalog()) !== key) fail('CONTEXT_UNAVAILABLE', 'The container catalog changed. Refresh the list.');
    const latest = await configuration.runExclusive(async () => {
      await configuration.verifyConfiguration();
      return configuration.readConfiguration();
    });
    await requireAccess();
    if (!latest.record || latest.record.revision !== record.revision || latest.catalogGeneration !== catalogGeneration) fail('CONTEXT_UNAVAILABLE', 'Saved protection changed. Refresh the list.');
    if (siteContext) await validateReadContext(siteContext);
    const nextOffset = offset + pageSize;
    const nextPageToken = nextOffset < rows.length ? handles.issue('cookies', request.owner, { rows, jars, offset: nextOffset, revision: record.revision, catalogGeneration, catalog: key, coverage, scope, contextToken }) : null;
    const cookies = rows.slice(offset, nextOffset).map(row => {
      const { _identity, _jarKey, ...view } = row;
      const jar = _jarKey ? jars.get(_jarKey) : null;
      return { ...clone(view), rowToken: siteHandles.issue('inventoryRow', request.owner, { ..._identity, revision: record.revision, catalogGeneration, catalog: key }), jarToken: jar ? siteHandles.issue('inventoryJar', request.owner, { rows: jar, key: _jarKey, revision: record.revision, catalogGeneration, catalog: key }) : null, jarSize: jar?.length ?? null };
    });
    return { cookies, coverage, scope, nextPageToken };
  }
  async function validateContext(context) {
    await requireAccess();
    const { record, catalogGeneration } = await configuration.readConfiguration();
    const catalog = await adapter.getCatalog();
    const tab = await adapter.getActiveTab({ windowId: context.windowId });
    let host;
    try {
      const url = new URL(tab.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      host = normalizeDomain(url.hostname);
    } catch { fail('STALE_SITE_CONTEXT', 'The page changed. Refresh the site view.'); }
    const observation = await observations.get(tab);
    if (!record || tab.incognito || tab.id !== context.tabId || host !== context.host || tab.cookieStoreId !== (context.tabStoreId ?? context.storeId) || observation.generation !== context.generation || record.revision !== context.revision || catalogGeneration !== context.catalogGeneration || catalogKey(catalog) !== context.catalog) fail('STALE_SITE_CONTEXT', 'The page or saved protection changed. Refresh the site view.');
    return { record, observation };
  }
  async function validateReadContext(context) {
    return configuration.runExclusive(async () => {
      await configuration.verifyConfiguration();
      return validateContext(context);
    });
  }
  async function getSiteCookieDomains(payload, request) {
    const pageSize = payload.pageSize ?? 100;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200 || typeof payload.contextToken !== 'string') fail('INVALID_REQUEST', 'Choose a site context and a page size between 1 and 200.');
    await requireAccess();
    const context = siteHandles.get(payload.contextToken, 'site', request.owner, 'STALE_SITE_CONTEXT');
    const { record } = await validateReadContext(context);
    let snapshot, offset = 0;
    if (payload.pageToken !== undefined && payload.pageToken !== null) {
      snapshot = handles.get(payload.pageToken, 'sitePage', request.owner, 'STALE_SITE_CONTEXT');
      if (snapshot.contextToken !== payload.contextToken || snapshot.pageSize !== pageSize) fail('INVALID_REQUEST', 'Keep the original context and page size while paging.');
      offset = snapshot.offset;
    } else {
      let cookies;
      try { cookies = await adapter.listCookies(context.storeId); }
      catch { fail('CONTEXT_UNAVAILABLE', 'Cookie enumeration failed. Refresh to try again.'); }
      const groups = new Map();
      let coverage = { state: 'stored', reason: null };
      const partial = () => { coverage = { state: 'partial', reason: 'Some stored cookies have an unknown partition or first-party association.' }; };
      const tab = await adapter.getActiveTab({ windowId: context.windowId });
      const scheme = new URL(tab.url).protocol;
      const facts = await adapter.classifyHost(context.host);
      const firstParty = facts.baseDomain || facts.host;
      const site = `${scheme}//${firstParty}`;
      const classify = createInventoryClassifier(adapter);
      let bytes = 0;
      if (cookies.length > INVENTORY_LIMITS.cookies) fail('CONTEXT_UNAVAILABLE', 'The cookie inventory is too large to capture safely.');
      for (let index = 0; index < cookies.length; index++) {
        if (index % 100 === 0) await yieldTask();
        const cookie = cookies[index];
        let domain;
        try { domain = normalizeDomain(cookie.domain); } catch { partial(); continue; }
        const { association, facts: cookieFacts } = await classify(cookie);
        if (association.kind === 'unknown') { partial(); continue; }
        let group;
        if (association.kind === 'unpartitioned') {
          if (!(context.host === domain || (cookie.hostOnly === false && !context.host.startsWith('[') && context.host.endsWith(`.${domain}`)))) continue;
          group = 'unpartitioned';
        } else {
          if (association.topLevelSite !== site) continue;
          group = association.relationship;
        }
        const key = JSON.stringify([domain, group]);
        let row = groups.get(key);
        if (!row) {
          const partition = { group, topLevelSite: association.topLevelSite };
          const effective = getDomainProtection(domain, record, context.ref, partition);
          row = { domain, group, topLevelSite: group === 'unpartitioned' ? null : site, cookieCount: 0, status: effective.status, reasons: [], matchingRuleIndexes: effective.matchingRuleIndexes };
          groups.set(key, row);
        }
        row.cookieCount++;
        const protection = matchCookie(cookie, record, context.ref, cookieFacts);
        const reasons = protection.protected ? protection.reasons : [
          ...(protection.overriddenRules || []),
          ...(protection.matchingExceptionIndexes || []).map(exceptionIndex => ({ type: 'exception', exceptionIndex, domain: record.exceptions?.[exceptionIndex]?.cookieDomain }))
        ];
        for (const reason of reasonViews(reasons)) if (!row.reasons.some(existing => JSON.stringify(existing) === JSON.stringify(reason))) row.reasons.push(reason);
      }
      const rows = [...groups.values()].sort((a, b) => a.domain < b.domain ? -1 : a.domain > b.domain ? 1 : a.group.localeCompare(b.group)).map(row => {
        const result = { ...row };
        bytes += new TextEncoder().encode(JSON.stringify(result)).length;
        if (bytes > INVENTORY_LIMITS.bytes) fail('CONTEXT_UNAVAILABLE', 'The cookie inventory is too large to capture safely.');
        return result;
      });
      await validateReadContext(context);
      snapshot = { rows, coverage, contextToken: payload.contextToken, pageSize };
    }
    const nextOffset = offset + pageSize;
    const domains = snapshot.rows.slice(offset, nextOffset).map(row => ({ ...clone(row), domainToken: siteHandles.issue('domain', request.owner, { ...context, domain: row.domain, matchingRuleIndexes: row.matchingRuleIndexes }) }));
    const nextPageToken = nextOffset < snapshot.rows.length ? handles.issue('sitePage', request.owner, { ...snapshot, offset: nextOffset }) : null;
    return { domains, storeRef: context.ref, revision: context.revision, coverage: clone(snapshot.coverage), nextPageToken };
  }
  async function saveSiteRule(payload, request) {
    if (typeof payload.domainToken !== 'string' || !(payload.ruleIndex === null || (Number.isInteger(payload.ruleIndex) && payload.ruleIndex >= 0)) || !payload.rule || typeof payload.rule !== 'object' || Array.isArray(payload.rule)) fail('INVALID_REQUEST', 'Choose a domain and a complete rule.');
    if (burner.isLocked()) fail('OPERATION_ACTIVE', 'Protection changes are unavailable during a burn.');
    await requireAccess();
    await configuration.assertRevision(request.expectedRevision);
    const context = siteHandles.get(payload.domainToken, 'domain', request.owner, 'STALE_SITE_CONTEXT');
    if (payload.ruleIndex !== null && !context.matchingRuleIndexes.includes(payload.ruleIndex)) fail('INVALID_REQUEST', 'Choose a rule offered by this domain row.');
    const { record } = await validateContext(context);
    const candidate = clone(record);
    if (payload.ruleIndex === null) candidate.rules.push(clone(payload.rule));
    else candidate.rules[payload.ruleIndex] = clone(payload.rule);
    const result = await configuration.commitConfiguration({ expectedRevision: request.expectedRevision, expectedCatalogGeneration: context.catalogGeneration, candidate, beforeWrite: () => validateContext(context) });
    siteHandles.remove(payload.domainToken);
    return { revision: result.record.revision };
  }
  async function saveSiteException(payload, request) {
    if (typeof payload.domainToken !== 'string' || !payload.exception || typeof payload.exception !== 'object' || Array.isArray(payload.exception)) fail('INVALID_REQUEST', 'Choose a domain and a complete exception.');
    if (burner.isLocked()) fail('OPERATION_ACTIVE', 'Protection changes are unavailable during a burn.');
    await requireAccess();
    await configuration.assertRevision(request.expectedRevision);
    const context = siteHandles.get(payload.domainToken, 'domain', request.owner, 'STALE_SITE_CONTEXT');
    const { record } = await validateContext(context);
    const candidate = clone(record);
    candidate.exceptions.push(clone(payload.exception));
    const result = await configuration.commitConfiguration({ expectedRevision: request.expectedRevision, expectedCatalogGeneration: context.catalogGeneration, candidate, beforeWrite: () => validateContext(context) });
    siteHandles.remove(payload.domainToken);
    return { revision: result.record.revision };
  }
  async function evaluateCookiePolicy(payload, request) {
    if (typeof payload.rowToken !== 'string') fail('INVALID_REQUEST', 'Choose a cookie from the inventory.');
    await requireAccess();
    const row = siteHandles.get(payload.rowToken, 'inventoryRow', request.owner, 'STALE_IMPORT');
    const state = await configuration.runExclusive(async () => {
      await configuration.verifyConfiguration();
      return configuration.readConfiguration();
    });
    if (!state.record || state.record.revision !== row.revision || state.catalogGeneration !== row.catalogGeneration || catalogKey(await adapter.getCatalog()) !== row.catalog) fail('STALE_IMPORT', 'The inventory changed. Refresh and review it again.');
    const { facts } = await createInventoryClassifier(adapter)(row.cookie);
    const policy = matchCookie(row.cookie, state.record, row.storeRef, facts);
    await configuration.runExclusive(async () => {
      await configuration.verifyConfiguration();
      const latest = configuration.readConfiguration();
      if (JSON.stringify(latest.record) !== JSON.stringify(state.record) || latest.catalogGeneration !== state.catalogGeneration) fail('STALE_IMPORT', 'Saved protection changed. Refresh the inventory.');
    });
    await requireAccess();
    return { protected: policy.protected, reasons: reasonViews(policy.reasons), overriddenRules: reasonViews(policy.overriddenRules), matchingExceptionIndexes: policy.matchingExceptionIndexes || [] };
  }
  async function planInventoryChoices(payload, request) {
    if (!payload.draft || !Array.isArray(payload.choices) || !payload.choices.length || payload.choices.length > 200) fail('INVALID_REQUEST', 'Choose between 1 and 200 inventory items.');
    if (burner.isLocked()) fail('OPERATION_ACTIVE', 'Protection changes are unavailable during a burn.');
    await requireAccess();
    await configuration.assertRevision(request.expectedRevision);
    const { record, catalogGeneration } = configuration.readConfiguration();
    const catalog = catalogKey(await adapter.getCatalog());
    const classify = createInventoryClassifier(adapter);
    const selected = [];
    const selectedJars = [];
    let jarCount = 0;
    for (const [index, choice] of payload.choices.entries()) {
      const isRow = typeof choice?.rowToken === 'string', isJar = typeof choice?.jarToken === 'string';
      if (isRow === isJar || !['keep', 'burnable'].includes(choice.choice) || typeof choice.scopeAcknowledged !== 'boolean') fail('INVALID_REQUEST', 'Each choice needs one row or jar, outcome, and scope decision.');
      const token = siteHandles.get(isRow ? choice.rowToken : choice.jarToken, isRow ? 'inventoryRow' : 'inventoryJar', request.owner, 'STALE_IMPORT');
      if (token.revision !== record.revision || token.catalogGeneration !== catalogGeneration || token.catalog !== catalog) fail('STALE_IMPORT', 'The inventory changed. Refresh before choosing.');
      const rows = isRow ? [token] : [token.rows[0]];
      if (isJar) {
        const existing = selectedJars.find(jar => jar.key === token.key);
        if (existing && JSON.stringify(existing.rows.map(row => cookieIdentity(row.cookie)).sort()) !== JSON.stringify(token.rows.map(row => cookieIdentity(row.cookie)).sort())) fail('STALE_IMPORT', 'Jar snapshots differ. Refresh and review the choices.');
        if (!existing) {
          jarCount += token.rows.length;
          if (jarCount > INVENTORY_LIMITS.cookies) fail('INVALID_REQUEST', 'The selected jars exceed the inventory identity limit.');
          selectedJars.push({ key: token.key, rows: token.rows });
        }
      }
      for (const row of rows) {
        const { facts } = await classify(row.cookie);
        selected.push({ ...row, choice: choice.choice, scopeAcknowledged: choice.scopeAcknowledged, facts, selectionIndex: index, jarChoice: isJar });
      }
    }
    return configuration.runExclusive(async () => {
      await configuration.verifyConfiguration();
      const latest = configuration.readConfiguration();
      if (JSON.stringify(latest.record) !== JSON.stringify(record) || latest.catalogGeneration !== catalogGeneration || catalogKey(await adapter.getCatalog()) !== catalog) fail('STALE_IMPORT', 'Saved protection or available stores changed. Review the inventory again.');
      await requireAccess();
      const candidate = configuration.candidateFromDraft(payload.draft);
      const result = planChoices({ record: candidate, choices: selected });
      const planToken = result.conflicts.length ? null : handles.issue('inventoryPlan', request.owner, { candidate: result.candidate, selected, selectedJars, revision: record.revision, catalogGeneration, catalog });
      return { planToken, conflicts: result.conflicts.map(conflict => ({ ...conflict, index: selected[conflict.index].selectionIndex })), configuration: { rules: clone(result.candidate.rules), exceptions: clone(result.candidate.exceptions), protectedContainerRefs: clone(result.candidate.protectedContainerRefs) } };
    });
  }
  async function commitInventoryChoices(payload, request) {
    if (typeof payload.planToken !== 'string') fail('INVALID_REQUEST', 'Review the inventory choices before saving.');
    if (burner.isLocked()) fail('OPERATION_ACTIVE', 'Protection changes are unavailable during a burn.');
    await requireAccess();
    await configuration.assertRevision(request.expectedRevision);
    const plan = handles.get(payload.planToken, 'inventoryPlan', request.owner, 'STALE_IMPORT');
    if (plan.revision !== request.expectedRevision) fail('REVISION_CONFLICT', 'Saved protection changed. Review the choices again.');
    const result = await configuration.commitConfiguration({ expectedRevision: request.expectedRevision, expectedCatalogGeneration: plan.catalogGeneration, candidate: plan.candidate, beforeWrite: async () => {
      await requireAccess();
      if (catalogKey(await adapter.getCatalog()) !== plan.catalog) fail('STALE_IMPORT', 'Available stores changed. Refresh the inventory.');
      const byStore = new Map();
      for (const row of plan.selected) {
        if (!byStore.has(row.storeId)) {
          let cookies;
          try { cookies = await adapter.listCookies(row.storeId); } catch { fail('CONTEXT_UNAVAILABLE', 'Cookie enumeration failed. Refresh the inventory.'); }
          if (cookies.length > INVENTORY_LIMITS.cookies) fail('CONTEXT_UNAVAILABLE', 'The cookie inventory is too large to validate safely.');
          byStore.set(row.storeId, { cookies, identities: new Set(cookies.map(cookieIdentity)) });
        }
        if (!byStore.get(row.storeId).identities.has(cookieIdentity(row.cookie))) fail('CONTEXT_UNAVAILABLE', 'A selected cookie changed or disappeared. Refresh and review the choices.');
      }
      const classify = createInventoryClassifier(adapter);
      for (const jar of plan.selectedJars) {
        const [ref, domain, topLevelSite] = JSON.parse(jar.key);
        const actual = [];
        let index = 0;
        for (const cookie of byStore.get(jar.rows[0].storeId).cookies) {
          if (index++ % 100 === 0) await yieldTask();
          const { association } = await classify(cookie);
          let host;
          try { host = normalizeDomain(cookie.domain); } catch { continue; }
          if (association.kind === 'partitioned' && association.relationship === 'third-party' && association.topLevelSite === topLevelSite && host === domain) actual.push(cookieIdentity(cookie));
        }
        const expected = jar.rows.map(row => cookieIdentity(row.cookie));
        if (ref !== jar.rows[0].storeRef || JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort())) fail('CONTEXT_UNAVAILABLE', 'The selected jar changed. Refresh and review the choices.');
      }
      await requireAccess();
      if (catalogKey(await adapter.getCatalog()) !== plan.catalog) fail('STALE_IMPORT', 'Available stores changed. Refresh the inventory.');
      await configuration.verifyConfiguration();
    } });
    handles.remove(payload.planToken);
    return { revision: result.record.revision, configuration: { rules: clone(result.record.rules), exceptions: clone(result.record.exceptions), protectedContainerRefs: clone(result.record.protectedContainerRefs) } };
  }
  return { handlers: { getSiteContext, setSiteProtection, getCookies, getSiteCookieDomains, saveSiteRule, saveSiteException, evaluateCookiePolicy, planInventoryChoices, commitInventoryChoices } };
}
