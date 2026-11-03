const copy = value => structuredClone(value);
const activeStates = new Set(['running', 'cancel_requested']);
export const operationActive = operation => activeStates.has(operation?.state);
export const siteStatus = status => ({ full: 'Fully protected', partial: 'Partly protected', none: 'Unprotected', unavailable: 'Unavailable' }[status] || 'Unavailable');
export const reasonText = reasons => (reasons || []).map(reason => typeof reason === 'string' ? reason : reason.message || reason.label || reason.type || 'Saved protection applies.').join(' ');
export const storeLabel = store => store?.label || store?.name || 'Unavailable store';
export const operationTitle = operation => ({ running: 'Burn in progress', cancel_requested: 'Stopping after the pending deletion', completed: operation?.safetySkips ? 'Completed with skipped cookies' : 'Completed', partial: 'Partly completed', canceled: 'Burn canceled', interrupted: 'Burn interrupted' }[operation?.state] || 'Cookie burner');

// Group only captured rows; an absent association must never be invented.
export function groupCookieInventory(cookies) {
  const stores = new Map();
  for (const cookie of cookies) {
    if (!stores.has(cookie.storeRef)) stores.set(cookie.storeRef, new Map());
    const sites = stores.get(cookie.storeRef), association = cookie.association;
    const main = association?.kind === 'partitioned' && association.topLevelSite ? association.topLevelSite : association?.kind === 'unpartitioned' ? cookie.domain.replace(/^\./, '') : null;
    const siteKey = JSON.stringify([association?.kind === 'partitioned' ? 'partitioned' : association?.kind === 'unpartitioned' ? 'unpartitioned' : 'unknown', main]);
    if (!sites.has(siteKey)) sites.set(siteKey, { main, kind: association?.kind || 'unknown', jars: new Map() });
    const site = sites.get(siteKey);
    const jarKind = association?.kind === 'partitioned' ? association.relationship === 'third-party' ? 'third-party' : association.relationship === 'own' ? 'own' : 'unknown' : association?.kind === 'unpartitioned' ? 'unpartitioned' : 'unknown';
    const jarKey = JSON.stringify([jarKind, cookie.domain]);
    if (!site.jars.has(jarKey)) site.jars.set(jarKey, { kind: jarKind, domain: cookie.domain, cookies: [] });
    site.jars.get(jarKey).cookies.push(cookie);
  }
  return [...stores].map(([storeRef, sites]) => ({ storeRef, sites: [...sites.values()].map(site => ({ ...site, jars: [...site.jars.values()] })) }));
}

export function createInventoryChoicesModel(client, editor, changed = () => {}) {
  const model = {
    choices: new Map(), plan: null, signature: null, acknowledgmentSignature: null, pending: false,
    get dirty() { return model.choices.size > 0; },
    get current() { return Boolean(model.plan && model.signature === JSON.stringify([editor.draft, [...model.choices]])); },
    stage(rowTokens, choice, kind = 'row', selectionKey = null) {
      if (!['keep', 'burnable'].includes(choice)) throw new Error('Choose whether to keep or make the selected cookies burnable.');
      if (!['row', 'jar'].includes(kind)) throw new Error('Select a cookie or jar.');
      const next = new Set([...model.choices.keys(), ...rowTokens.filter(token => typeof token === 'string' && token).map(token => `${kind}:${selectionKey ?? token}`)]);
      if (next.size > 200) throw new Error('A batch can include at most 200 cookies. Save or clear these choices before selecting more.');
      for (const token of rowTokens) if (typeof token === 'string' && token) model.choices.set(`${kind}:${selectionKey ?? token}`, { [kind === 'row' ? 'rowToken' : 'jarToken']: token, choice, scopeAcknowledged: false });
      for (const item of model.choices.values()) item.scopeAcknowledged = false;
      model.acknowledgmentSignature = null; model.plan = null; changed();
    },
    clear() { model.choices.clear(); model.plan = null; model.signature = null; model.acknowledgmentSignature = null; changed(); },
    acknowledgeScopes() { for (const choice of model.choices.values()) choice.scopeAcknowledged = true; model.acknowledgmentSignature = JSON.stringify([editor.draft, [...model.choices.values()].map(({ rowToken, jarToken, choice }) => [rowToken, jarToken, choice])]); model.plan = null; changed(); },
    async review() {
      if (!model.dirty || !editor.canEdit || model.pending) return;
      if (model.acknowledgmentSignature !== JSON.stringify([editor.draft, [...model.choices.values()].map(({ rowToken, jarToken, choice }) => [rowToken, jarToken, choice])])) {
        for (const choice of model.choices.values()) choice.scopeAcknowledged = false;
        model.acknowledgmentSignature = null;
      }
      const signature = JSON.stringify([editor.draft, [...model.choices]]);
      model.pending = true; changed();
      try {
        const plan = await client.planInventoryChoices({ draft: copy(editor.draft), choices: copy([...model.choices.values()]) }, editor.baseRevision);
        if (signature !== JSON.stringify([editor.draft, [...model.choices]])) return;
        model.plan = plan; model.signature = signature;
      } finally { model.pending = false; changed(); }
    },
    async commit() {
      if (!model.current || model.plan.conflicts?.length || !model.plan.planToken || !editor.canEdit || model.pending) throw new Error('Review the current choices and resolve every conflict before saving.');
      model.pending = true; changed();
      try { await client.commitInventoryChoices({ planToken: model.plan.planToken }, editor.baseRevision); model.clear(); await editor.refresh({ discard: true }); }
      finally { model.pending = false; changed(); }
    }
  };
  return model;
}

export function createEditorModel(client, changed = () => {}) {
  const model = {
    state: null, draft: null, baseRevision: null, dirty: false, stale: false, saving: false, error: null,
    get locked() { return operationActive(model.state?.operation); },
    get canEdit() { return Boolean(model.state?.configuration && model.state?.capabilities?.canChangeProtection && !model.locked); },
    async refresh({ discard = false } = {}) {
      const state = await client.getState();
      model.state = state;
      if (!model.dirty || discard) {
        model.draft = state.configuration ? { ...copy(state.configuration), inactiveDecisions: [] } : null;
        model.baseRevision = state.revision;
        model.dirty = false;
        model.stale = false;
      } else model.stale = state.revision !== model.baseRevision;
      changed();
      return state;
    },
    edit(change, expectedRevision = null) {
      if (!model.canEdit || !model.draft || (expectedRevision !== null && expectedRevision !== model.state.revision)) return false;
      change(model.draft);
      model.dirty = true;
      model.error = null;
      changed();
      return true;
    },
    async save() {
      if (!model.canEdit || !model.draft || model.saving) return;
      model.saving = true;
      model.error = null;
      changed();
      try {
        await client.saveConfiguration(copy(model.draft), model.baseRevision);
        await model.refresh({ discard: true });
      } catch (error) {
        model.error = error;
        if (error.code === 'REVISION_CONFLICT') model.stale = true;
        throw error;
      } finally { model.saving = false; changed(); }
    },
    async cancel(discardConfirmed) {
      if (model.dirty && !discardConfirmed) return false;
      await model.refresh({ discard: true });
      return true;
    },
    addCookieRule(cookie) {
      return model.edit(draft => draft.rules.push({ domain: cookie.domain.replace(/^\./, ''), includeSubdomains: false, name: cookie.name, path: cookie.path, scope: { type: 'selected', storeRefs: [cookie.storeRef] } }));
    },
    subscribe() { return client.subscribe(() => model.refresh().catch(error => { model.error = error; changed(); })); }
  };
  return model;
}

export function createPopupModel(client, changed = () => {}) {
  let previewGeneration = 0;
  let snapshotGeneration = 0;
  let refreshGeneration = 0;
  const model = {
    state: null, site: null, selectedStoreRef: null, preview: null, preparing: false, busy: false, error: null,
    cookies: [], cookieStatus: 'idle', cookieError: null, nextCookiePageToken: null,
    domains: [], domainStatus: 'loading', coverage: null, nextPageToken: null, domainRevision: null, domainStale: false, domainError: null, ruleEditor: null, exceptionEditor: null,
    get canSaveRule() { return Boolean(model.ruleEditor?.rule && !model.ruleEditor.saving && !model.ruleEditor.reviewRequired && !model.domainStale && model.state?.capabilities.canChangeProtection && !operationActive(model.state?.operation)); },
    async selectStore(ref) {
      if (model.ruleEditor || model.exceptionEditor) return;
      model.selectedStoreRef = ref;
      model.domainStale = true;
      snapshotGeneration++;
      model.cookies = []; model.cookieStatus = 'idle'; model.nextCookiePageToken = null;
      await model.refresh();
    },
    async refresh() {
      const generation = ++refreshGeneration;
      const previousCatalog = model.state?.catalogGeneration;
      const state = await client.getState();
      let site;
      try { site = await client.getSiteContext({ ...await client.windowContext(), ...(model.selectedStoreRef === null ? {} : { storeRef: model.selectedStoreRef }) }); }
      catch (error) { site = { status: 'unavailable', reasons: [error.message], controls: {} }; }
      if (generation !== refreshGeneration) return;
      model.state = state;
      model.site = site;
      if (site.store) model.selectedStoreRef = site.store.ref;
      if (model.preview && (model.preview.revision !== state.revision || previousCatalog !== state.catalogGeneration || !state.capabilities.canBurn)) model.cancelPreview();
      await model.refreshDomains();
      changed();
    },
    async loadSiteCookies(more = false) {
      if (!model.site?.contextToken || model.domainStale || model.cookieStatus === 'loading') return;
      const generation = snapshotGeneration, contextToken = model.site.contextToken;
      const pageToken = more ? model.nextCookiePageToken : null;
      if (more && !pageToken) return;
      model.cookieStatus = 'loading'; model.cookieError = null; changed();
      try {
        const page = await client.getCookies({ contextToken, pageSize: 100, ...(pageToken ? { pageToken } : {}) });
        if (generation !== snapshotGeneration || contextToken !== model.site?.contextToken) return;
        model.cookies = more ? [...model.cookies, ...page.cookies] : page.cookies;
        model.nextCookiePageToken = page.nextPageToken;
        model.cookieStatus = model.cookies.length ? 'ready' : 'empty';
        if (page.coverage?.state === 'partial') model.coverage = page.coverage;
      } catch (error) {
        if (generation !== snapshotGeneration) return;
        model.cookieError = error; model.cookieStatus = 'error';
        if (['STALE_SITE_CONTEXT', 'REVISION_CONFLICT'].includes(error.code)) model.domainStale = true;
      } finally { changed(); }
    },
    async refreshDomains() {
      const generation = ++snapshotGeneration;
      model.cookies = []; model.cookieStatus = 'idle'; model.cookieError = null; model.nextCookiePageToken = null;
      model.domains = []; model.nextPageToken = null; model.domainError = null; model.domainStale = false; model.coverage = null;
      if (model.ruleEditor) model.ruleEditor.reviewRequired = true;
      if (model.exceptionEditor) model.exceptionEditor.reviewRequired = true;
      if (!model.site?.contextToken) { model.domainStatus = 'unavailable'; changed(); return; }
      model.domainStatus = 'loading'; changed();
      try {
        const page = await client.getSiteCookieDomains({ contextToken: model.site.contextToken, pageSize: 100 });
        if (generation !== snapshotGeneration) return;
        model.domains = page.domains; model.coverage = page.coverage; model.domainRevision = page.revision; model.nextPageToken = page.nextPageToken;
        model.domainStatus = page.domains.length ? 'ready' : 'empty';
      } catch (error) {
        if (generation !== snapshotGeneration) return;
        model.domainError = error; model.domainStatus = ['PERMISSION_REQUIRED', 'CONTEXT_UNAVAILABLE', 'STALE_SITE_CONTEXT'].includes(error.code) ? 'unavailable' : 'error';
      } finally { changed(); }
    },
    async loadMoreDomains() {
      if (!model.nextPageToken || model.domainStale || model.domainStatus === 'loadingMore') return;
      const generation = snapshotGeneration;
      model.domainStatus = 'loadingMore'; changed();
      try {
        const page = await client.getSiteCookieDomains({ contextToken: model.site.contextToken, pageSize: 100, pageToken: model.nextPageToken });
        if (generation !== snapshotGeneration) return;
        model.domains.push(...page.domains); model.nextPageToken = page.nextPageToken; model.domainStatus = 'ready';
      } catch (error) {
        if (generation !== snapshotGeneration) return;
        model.domainError = error; model.domainStatus = 'error';
        if (['STALE_SITE_CONTEXT', 'REVISION_CONFLICT'].includes(error.code)) model.domainStale = true;
      } finally { changed(); }
    },
    openSiteRule(row) {
      if (model.domainStale) return;
      model.ruleEditor = { row: copy(row), ruleIndex: null, rule: null, saving: false, error: null, reviewRequired: false, revision: model.domainRevision };
      if (!row.matchingRuleIndexes.length) model.selectSiteRule(null);
      changed();
    },
    selectSiteRule(index) {
      const editor = model.ruleEditor;
      if (!editor || editor.saving || editor.reviewRequired || (index !== null && !editor.row.matchingRuleIndexes.includes(index))) return;
      editor.ruleIndex = index;
      editor.rule = index === null ? { domain: editor.row.domain, includeSubdomains: false, name: null, path: null, scope: { type: 'selected', storeRefs: [model.site.store.ref] } } : copy(model.state.configuration.rules[index]);
      editor.error = null; changed();
    },
    cancelSiteRule() { if (model.ruleEditor?.saving) return false; model.ruleEditor = null; changed(); return true; },
    openSiteException(row) {
      if (model.domainStale || row.group !== 'third-party' || !row.topLevelSite) return;
      let host;
      try { host = new URL(row.topLevelSite).hostname; } catch { return; }
      model.exceptionEditor = { row: copy(row), revision: model.domainRevision, saving: false, reviewRequired: false, error: null, exception: { cookieDomain: row.domain, cookieIncludeSubdomains: false, topLevelDomain: host, topLevelIncludeSubdomains: false, scheme: 'all', name: null, path: null, scope: { type: 'selected', storeRefs: [model.site.store.ref] }, enabled: true } };
      changed();
    },
    cancelSiteException() { if (model.exceptionEditor?.saving) return false; model.exceptionEditor = null; changed(); return true; },
    async saveSiteException(exception) {
      const editor = model.exceptionEditor;
      if (!editor || editor.saving || editor.reviewRequired || model.domainStale || !model.state?.capabilities.canChangeProtection || operationActive(model.state?.operation)) return;
      editor.exception = copy(exception); editor.saving = true; editor.error = null; changed();
      try {
        await client.saveSiteException({ domainToken: editor.row.domainToken, exception: copy(exception) }, editor.revision);
        model.exceptionEditor = null; await model.refresh();
      } catch (error) {
        editor.error = error;
        if (!error.code || ['REVISION_CONFLICT', 'STALE_SITE_CONTEXT', 'STORAGE_FAILED', 'INTERNAL_FAILURE', 'PERMISSION_REQUIRED', 'INVALID_REQUEST'].includes(error.code)) { editor.reviewRequired = true; model.domainStale = true; }
        throw error;
      } finally { editor.saving = false; changed(); }
    },
    async saveSiteRule(rule) {
      if (!model.canSaveRule) return;
      const editor = model.ruleEditor;
      editor.rule = copy(rule); editor.saving = true; editor.error = null; changed();
      try {
        await client.saveSiteRule({ domainToken: editor.row.domainToken, ruleIndex: editor.ruleIndex, rule: copy(rule) }, editor.revision);
        model.ruleEditor = null;
        await model.refresh();
      } catch (error) {
        editor.error = error;
        if (!error.code || ['REVISION_CONFLICT', 'STALE_SITE_CONTEXT', 'STORAGE_FAILED', 'INTERNAL_FAILURE', 'PERMISSION_REQUIRED', 'INVALID_REQUEST'].includes(error.code)) {
          editor.reviewRequired = true; model.domainStale = true;
          if (error.code === 'STALE_SITE_CONTEXT') { model.domains = []; model.domainStatus = 'unavailable'; }
        }
        throw error;
      } finally { editor.saving = false; changed(); }
    },
    async makePreview() {
      const generation = ++previewGeneration;
      model.preparing = true; changed();
      try {
        const preview = await client.previewBurn({}, model.state.revision);
        if (generation === previewGeneration) model.preview = preview;
      } catch (error) { if (generation === previewGeneration) throw error; }
      finally { if (generation === previewGeneration) { model.preparing = false; changed(); } }
    },
    async start() {
      if (!model.preview) return;
      const preview = model.preview;
      model.preview = null;
      await client.startBurn({ previewToken: preview.previewToken }, preview.revision);
      await model.refresh();
    },
    cancelPreview() { previewGeneration++; model.preview = null; model.preparing = false; changed(); },
    async protect(enabled) {
      await client.setSiteProtection({ contextToken: model.site.contextToken, enabled }, model.state.revision);
      await model.refresh();
    },
    async cancelBurn() { await client.cancelBurn({ operationId: model.state.operation.id }); await model.refresh(); },
    async dismiss() { await client.dismissOperation({ operationId: model.state.operation.id }); await model.refresh(); },
    subscribe() { return client.subscribe(async event => {
      if (event.gap || ['configuration', 'stores', 'capabilities'].includes(event.reason)) model.cancelPreview();
      if (event.gap || ['configuration', 'stores', 'capabilities', 'site', 'siteContext'].includes(event.reason)) {
        snapshotGeneration++; refreshGeneration++; model.domainStale = true; model.cookies = []; model.cookieStatus = 'idle'; model.nextCookiePageToken = null;
        if (model.ruleEditor) model.ruleEditor.reviewRequired = true;
        if (model.exceptionEditor) model.exceptionEditor.reviewRequired = true;
        if (event.gap || ['site', 'siteContext', 'capabilities'].includes(event.reason)) { model.domains = []; model.nextPageToken = null; model.domainStatus = 'unavailable'; }
      }
      try { model.state = await client.getState(); }
      catch (error) { model.error = error; }
      changed();
    }); }
  };
  return model;
}

export function createImportModel(client, editor, changed = () => {}) {
  let generation = 0;
  const model = {
    text: '', mode: 'merge', pending: null, applying: false, inspection: null, plan: null, decisions: [], acknowledgments: {}, mappingChoices: new Map(), conflictChoices: {}, ackChoices: {}, manyToOne: false, mappingPage: 0, conflictPage: 0, revision: null, recoveryToken: null,
    reset() {
      generation++; model.pending = null;
      model.text = ''; model.inspection = null; model.plan = null; model.decisions = []; model.acknowledgments = {}; model.mappingChoices = new Map(); model.conflictChoices = {}; model.ackChoices = {}; model.manyToOne = false; model.mappingPage = 0; model.conflictPage = 0; changed();
    },
    mappingDecisions() {
      return (model.inspection?.containers || []).map(container => {
        const choice = model.mappingChoices.get(container.ref);
        if (choice === 'retain' || choice === 'exclude') return { sourceRef: container.ref, action: choice };
        if (typeof choice === 'string' && choice.startsWith('map:')) {
          const targetRef = choice.slice(4);
          if (editor.state.stores.some(store => store.ref === targetRef && store.kind === 'container' && store.availability === 'available')) return { sourceRef: container.ref, action: 'map', targetRef };
        }
        throw new Error('Choose a valid mapping decision for every source container, including other pages.');
      });
    },
    async inspect(text, mode = 'merge') {
      model.reset();
      model.text = text;
      model.mode = editor.state?.capabilities?.canRecoverConfiguration ? 'replace' : mode;
      model.revision = editor.state.revision;
      model.recoveryToken = editor.state.recoveryToken;
      const current = generation;
      model.pending = 'Validating the complete configuration'; changed();
      try {
        const inspection = await client.inspectImport({ text, mode: model.mode, ...(model.recoveryToken ? { recoveryToken: model.recoveryToken } : {}) }, model.revision);
        if (current !== generation) return null;
        model.inspection = inspection; return inspection;
      } catch (error) { if (current === generation) throw error; }
      finally { if (current === generation) { model.pending = null; changed(); } }
    },
    async planMappings(mappings, acknowledgeManyToOne = false) {
      const current = generation;
      model.pending = 'Calculating mapped protection and conflicts'; changed();
      try {
        const plan = await client.planImport({ importHandle: model.inspection.importHandle, mode: model.mode, mappings, acknowledgeManyToOne, ...(model.recoveryToken ? { recoveryToken: model.recoveryToken } : {}) }, model.revision);
        if (current !== generation) return null;
        model.plan = plan; model.decisions = []; model.acknowledgments = {}; return plan;
      } catch (error) { if (current === generation) throw error; }
      finally { if (current === generation) { model.pending = null; changed(); } }
    },
    async resolve(decisions, acknowledgments) {
      const current = generation;
      model.pending = 'Validating the final configuration'; changed();
      try {
        const plan = await client.resolveImport({ planToken: model.plan.planToken, decisions, acknowledgments, ...(model.recoveryToken ? { recoveryToken: model.recoveryToken } : {}) }, model.revision);
        if (current !== generation) return null;
        model.plan = plan; model.decisions = copy(decisions); model.acknowledgments = copy(acknowledgments); return plan;
      } catch (error) { if (current === generation) throw error; }
      finally { if (current === generation) { model.pending = null; changed(); } }
    },
    async apply() {
      if (!model.plan?.canCommit || editor.locked) throw new Error('Resolve every decision and review the final preview before applying.');
      model.applying = true; changed();
      try {
        await client.commitImport({ planToken: model.plan.planToken, ...(model.recoveryToken ? { recoveryToken: model.recoveryToken } : {}) }, model.revision);
        model.reset();
        await editor.refresh({ discard: true });
      } finally { model.applying = false; changed(); }
    }
  };
  return model;
}

// This is a draft impact view. The backend validates and applies the final decision.
export function reviewInactiveDecision(draft, decision, savedConfiguration = draft) {
  const decisions = new Map((draft.inactiveDecisions || []).map(item => [item.ref, item]));
  const affectedRules = draft.rules.filter(rule => rule.scope.type === 'selected' && rule.scope.storeRefs.includes(decision.ref)).map(rule => {
    let requiresEdit = false;
    const resultingStoreRefs = [...new Set(rule.scope.storeRefs.flatMap(ref => {
      const change = decisions.get(ref);
      if (change?.action === 'remove') { requiresEdit = true; return []; }
      return [change?.action === 'map' ? change.targetRef : ref];
    }))].sort();
    return { rule: copy(rule), resultingStoreRefs, requiresEdit, emptyScope: resultingStoreRefs.length === 0 };
  });
  const affectedExceptions = (draft.exceptions || []).filter(item => item.scope.type === 'selected' && item.scope.storeRefs.includes(decision.ref)).map(exception => {
    let requiresEdit = false;
    const resultingStoreRefs = [...new Set(exception.scope.storeRefs.flatMap(ref => {
      const change = decisions.get(ref);
      if (change?.action === 'remove') { requiresEdit = true; return []; }
      return [change?.action === 'map' ? change.targetRef : ref];
    }))].sort();
    return { exception: copy(exception), resultingStoreRefs, requiresEdit, emptyScope: resultingStoreRefs.length === 0 };
  });
  return {
    affectedRules, affectedExceptions,
    transfersWholeContainerProtection: decision.action === 'map' && savedConfiguration.protectedContainerRefs.includes(decision.ref),
    destinationAlreadyProtected: decision.action === 'map' && draft.protectedContainerRefs.includes(decision.targetRef),
    removesWholeContainerProtection: decision.action === 'remove' && draft.protectedContainerRefs.includes(decision.ref)
  };
}
