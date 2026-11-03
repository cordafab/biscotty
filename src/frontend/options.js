import { setupSettingsTabs } from './tabs.js';
import { editableRule } from './rule-form.js';
import { createExceptionFields } from './exception-form.js';
import { client } from '../backend/client/native.js';
import { createEditorModel, createImportModel, createInventoryChoicesModel, operationActive, operationTitle, storeLabel, reasonText, groupCookieInventory, reviewInactiveDecision } from './models.js';
import { element as el, button, field, checkbox, replace, notice, showError, helpControl } from './dom.js';
const $ = id => document.getElementById(id);
setupSettingsTabs();
let busy = false;
let rulePage = 0;
let exceptionPage = 0;
let containerPage = 0;
let ruleIndex = null;
let ruleRevision = null;
let originalRule = null;
let formDirty = false;
let nextPageToken;
let cookieQuery;
let cookieResult = null;
let cookieRevision = null, cookieCatalogGeneration = null;
const selectedCookies = new Set();
let importVisible = false;
let discardAction;
let exceptionIndex = null, exceptionRevision = null, exceptionOriginal = null, exceptionFields;
const model = createEditorModel(client, render);
const importer = createImportModel(client, model, renderImport);
const inventory = createInventoryChoicesModel(client, model, render);
const exceptionList = el('div', { id: 'exception-list' });
const exceptionSection = el('section', { className: 'card', 'aria-labelledby': 'exceptions-heading', hidden: true }, el('h2', { id: 'exceptions-heading' }, 'Partition exceptions ', helpControl('Partition exceptions', 'An enabled exception can make known third-party partitioned cookies burnable even when an allow rule matches. Unpartitioned cookies cannot receive site-specific exceptions. Whole-container protection and deletion safety still apply.')), button('Add exception', () => openException(), { id: 'add-exception' }), exceptionList);
$('rules-section').after(exceptionSection);
const sectionHelp = [
  ['rules-heading', 'Allow rules', 'Rules combine to protect matching cookies. Selected-store rules have no effect in other stores. Changes remain a draft until Save changes.'],
  ['containers-heading', 'Container protection', 'Skip a named container in full during every burn. Normal browsing uses per-rule protection.'],
  ['cookies-heading', 'Stored cookie groups', 'A third-party jar groups cookies from another domain for one main site and container. Unpartitioned cookies may be shared across sites in the same container; Firefox cannot reliably identify every site using them. Snapshots can change after capture. Cookie values are never shown.'],
  ['transfer-heading', 'Configuration transfer', 'Transfer saved protection in a local JSON file. Cookie values and native container identities are excluded. Import requires explicit mapping, conflict decisions and final review.']
];
for (const [id, title, text] of sectionHelp) $(id).append(' ', helpControl(title, text));

const exceptionDialog = el('dialog', { 'aria-labelledby': 'exception-dialog-heading' });
const exceptionFieldsArea = el('div');
const exceptionError = el('div', { role: 'alert', tabindex: '-1' });
const exceptionForm = el('form', {}, el('h2', { id: 'exception-dialog-heading' }, 'Partition exception'), el('p', {}, 'This creates a persistent policy that may apply to cookies recreated later. Review the domains and stores before saving the draft.'), exceptionFieldsArea, exceptionError, el('div', { className: 'actions' }, el('button', { type: 'submit', className: 'primary' }, 'Keep in draft'), button('Cancel exception', () => { formDirty = false; exceptionDialog.close(); })));
exceptionDialog.append(exceptionForm); document.body.append(exceptionDialog);
exceptionForm.addEventListener('input', () => { formDirty = true; });
exceptionDialog.addEventListener('cancel', () => { formDirty = false; });
exceptionForm.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const value = exceptionFields.read();
    if ((exceptionIndex !== null && JSON.stringify(model.draft?.exceptions?.[exceptionIndex]) !== exceptionOriginal) || !model.edit(draft => { if (exceptionIndex === null) draft.exceptions.push(value); else draft.exceptions[exceptionIndex] = value; }, exceptionRevision)) throw new Error('Saved settings changed while this form was open. Close it and review the current exceptions before editing again.');
    formDirty = false; exceptionDialog.close();
  } catch (error) { showError(error, exceptionError); }
});
function openException(index = null) {
  exceptionIndex = index; exceptionRevision = model.state.revision;
  const value = index === null ? { cookieDomain: '', cookieIncludeSubdomains: false, topLevelDomain: '', topLevelIncludeSubdomains: false, scheme: 'all', name: null, path: null, scope: { type: 'all' }, enabled: true } : model.draft.exceptions[index];
  exceptionOriginal = index === null ? null : JSON.stringify(value);
  exceptionFields = createExceptionFields(value, model.state.stores); replace(exceptionFieldsArea, exceptionFields.node); replace(exceptionError); formDirty = false; exceptionDialog.showModal();
}
function renderExceptions() {
  exceptionSection.hidden = !Array.isArray(model.draft?.exceptions);
  if (exceptionSection.hidden) return;
  $('add-exception').disabled = busy || !model.canEdit;
  const pages = Math.max(1, Math.ceil(model.draft.exceptions.length / 50));
  exceptionPage = Math.min(exceptionPage, pages - 1);
  const rows = model.draft.exceptions.map((item, index) => ({ item, index })).slice(exceptionPage * 50, (exceptionPage + 1) * 50).map(({ item, index }) => el('div', { className: 'row' }, el('div', {}, el('strong', {}, `${item.cookieDomain}${item.cookieIncludeSubdomains ? ' and subdomains' : ''} in ${item.topLevelDomain}${item.topLevelIncludeSubdomains ? ' and subdomains' : ''}`), el('p', { className: 'muted' }, `${item.enabled ? 'Enabled' : 'Disabled'} · ${item.scheme === 'all' ? 'HTTP and HTTPS' : item.scheme.toUpperCase()} · ${describeScope(item.scope)}`)), el('div', { className: 'actions' }, button('Edit', () => openException(index), { disabled: busy || !model.canEdit, 'aria-label': `Edit exception for ${item.cookieDomain} in ${item.topLevelDomain}` }), button(item.enabled ? 'Disable' : 'Enable', () => model.edit(draft => { draft.exceptions[index].enabled = !draft.exceptions[index].enabled; }), { disabled: busy || !model.canEdit }), button('Remove', () => model.edit(draft => draft.exceptions.splice(index, 1)), { disabled: busy || !model.canEdit, 'aria-label': `Remove exception for ${item.cookieDomain} in ${item.topLevelDomain}` }))));
  replace(exceptionList, rows.length ? rows : el('p', { className: 'empty' }, 'No partition exceptions.'), pages > 1 ? el('div', { className: 'actions' }, button('Previous exceptions', () => { exceptionPage--; renderExceptions(); }, { disabled: exceptionPage === 0 }), el('small', {}, `Page ${exceptionPage + 1} of ${pages}`), button('Next exceptions', () => { exceptionPage++; renderExceptions(); }, { disabled: exceptionPage === pages - 1 })) : null);
}
let labelCacheStores;
let labelCache = new Map();
function labels() {
  const stores = model.state?.stores || [];
  if (labelCacheStores !== stores) {
    labelCacheStores = stores;
    const counts = new Map();
    for (const store of stores) counts.set(storeLabel(store), (counts.get(storeLabel(store)) || 0) + 1);
    labelCache = new Map(stores.map((store, index) => {
      const name = storeLabel(store);
      return [store.ref, counts.get(name) === 1 ? name : `${name} · ${store.color || 'default color'} · ${store.icon || 'container'} · container ${index + 1}`];
    }));
  }
  return labelCache;
}
function storeOptionLabel(store) { return labels().get(store.ref) || storeLabel(store); }
const labelRef = ref => labels().get(ref) || importer.plan?.preview?.inactive?.find(item => item.ref === ref)?.name || importer.inspection?.containers?.find(item => item.ref === ref)?.name || 'Retained inactive container';
const describeScope = scope => scope?.type === 'all' ? 'All stores' : `Selected stores: ${(scope?.storeRefs || []).map(labelRef).join(', ')}`;
const describeRule = rule => `${rule.domain}${rule.includeSubdomains ? ' and subdomains' : ' (exact domain)'} · ${rule.name === null ? 'Every name' : `Exact name: “${rule.name}”`} · ${rule.path === null ? 'Every path' : `Exact path: “${rule.path}”`} · ${describeScope(rule.scope)}`;
const describeException = item => `${item.cookieDomain}${item.cookieIncludeSubdomains ? ' and subdomains' : ' (exact domain)'} in ${item.topLevelDomain}${item.topLevelIncludeSubdomains ? ' and subdomains' : ' (exact site)'} · ${item.scheme === 'all' ? 'HTTP and HTTPS' : item.scheme.toUpperCase()} · ${item.name === null ? 'Every name' : `Exact name: “${item.name}”`} · ${item.path === null ? 'Every path' : `Exact path: “${item.path}”`} · ${describeScope(item.scope)} · ${item.enabled ? 'enabled' : 'disabled'}`;
const describeAffectedScope = affected => [affected.domain ? `Cookie domain: ${affected.domain}` : null, affected.topLevelDomain ? `Main site: ${affected.topLevelDomain}` : null, affected.scheme ? `Scheme: ${affected.scheme}` : null, Object.hasOwn(affected, 'name') ? affected.name === null ? 'Every name' : `Exact name: “${affected.name}”` : null, Object.hasOwn(affected, 'path') ? affected.path === null ? 'Every path' : `Exact path: “${affected.path}”` : null, affected.partitions === 'all' ? 'All partitions' : null, affected.scope ? describeScope(affected.scope) : null].filter(Boolean).join(' · ');
function describeInventoryChanges(configuration, draft) {
  if (!configuration || !draft) return [];
  const changes = [];
  for (const [key, label, describe] of [['rules', 'allow rule', describeRule], ['exceptions', 'exception', describeException]]) {
    const before = draft[key] || [], after = configuration[key] || [];
    const beforeKeys = new Set(before.map(item => JSON.stringify(item))), afterKeys = new Set(after.map(item => JSON.stringify(item)));
    for (const item of before) if (!afterKeys.has(JSON.stringify(item))) changes.push(`Remove or replace ${label}: ${describe(item)}`);
    for (const item of after) if (!beforeKeys.has(JSON.stringify(item))) changes.push(`Add or update ${label}: ${describe(item)}`);
  }
  return changes;
}
async function act(action) {
  if (busy) return;
  busy = true; replace($('messages')); render();
  try { await action(); }
  catch (error) { showError(error); }
  finally { busy = false; render(); }
}
function discardThen(action) {
  if (!model.dirty && !formDirty && !inventory.dirty) return action();
  discardAction = action;
  $('discard-dialog').showModal();
}
function render() {
  const focusedId = document.activeElement?.id;
  const state = model.state;
  if (!state) return;
  if (cookieResult && (state.revision !== cookieRevision || state.catalogGeneration !== cookieCatalogGeneration || !state.capabilities.canReadCookies)) {
    cookieResult = null; nextPageToken = null; $('next-cookies').hidden = true;
    replace($('cookie-results'), notice('Saved settings or access changed. Refresh the inventory before relying on its contents.'));
  }
  $('draft-status').textContent = model.saving || inventory.pending ? 'Working with the complete configuration…' : model.stale ? 'Saved settings changed elsewhere. Your draft is preserved; refresh to review.' : model.dirty || inventory.dirty ? 'Unsaved draft · saved protection is still active' : 'All changes saved';
  $('save').disabled = busy || !model.canEdit || (!model.dirty && !inventory.dirty) || (inventory.dirty && !cookieResult) || model.saving || inventory.pending;
  $('save').textContent = inventory.dirty && (!inventory.current || inventory.plan.conflicts?.length) ? 'Review choices' : 'Save changes';
  $('cancel').disabled = busy || (!model.dirty && !inventory.dirty);
  $('add-rule').disabled = busy || !model.canEdit;
  $('export').disabled = busy || !state.configuration || state.exportStatus?.canExport === false;
  $('start-import').disabled = busy || model.locked || (!model.canEdit && !state.capabilities.canRecoverConfiguration);
  $('load-cookies').disabled = busy || !state.capabilities.canReadCookies;
  $('next-cookies').disabled = busy;
  for (const control of document.querySelectorAll('.create-cookie-rule')) control.disabled = busy || !model.canEdit;
  $('status-indicator').textContent = state.capabilities.reason || state.configurationStatus !== 'valid' || model.stale || state.exportStatus?.canExport === false ? 'Status · Attention' : 'Status · Ready';
  renderAvailability(); renderRules(); renderExceptions(); renderContainers(); updateStoreFilter(); renderImport(); if (cookieResult) renderCookieResults();
  if (focusedId && $(focusedId) && !$(focusedId).disabled) $(focusedId).focus({ preventScroll: true });
}
function renderAvailability() {
  const state = model.state;
  const items = [];
  if (model.locked) items.push(notice(`${operationTitle(state.operation)}. Protection changes and import application are paused.`));
  if (state.configurationStatus !== 'valid') items.push(notice(state.capabilities.canRecoverConfiguration ? 'Saved protection is missing or invalid. Burning and editing are blocked. Use Replace import to recover from a valid configuration file.' : 'Saved configuration is unavailable. Restore storage access and refresh before continuing.', 'error'));
  if (state.capabilities.reason) items.push(el('p', {}, state.capabilities.reason));
  if (state.exportStatus?.canExport === false) items.push(notice(`Saved protection needs ${state.exportStatus.bytes.toLocaleString()} bytes to export; the limit is 2 MiB. Reduce rules, remove unused inactive references, or shorten container names in Firefox. Saved protection remains active.`));
  if (!items.length) items.push(el('p', {}, 'Saved configuration is available.'), el('small', {}, 'Burns cover accessible HTTP and HTTPS cookies. Firefox restrictions still apply.'));
  if (model.stale) items.push(notice('A different saved revision is active. Save will require you to review the current settings.'));
  replace($('availability'), items);
  $('request-access').hidden = !/permission|access/i.test(state.capabilities.reason || '');
  $('request-access').disabled = busy;
}
function renderRules() {
  const search = $('rule-search').value.toLocaleLowerCase();
  const rules = (model.draft?.rules || []).map((rule, index) => ({ rule, index })).filter(({ rule }) => describeRule(rule).toLocaleLowerCase().includes(search));
  const pages = Math.max(1, Math.ceil(rules.length / 50));
  rulePage = Math.min(rulePage, pages - 1);
  const rows = rules.slice(rulePage * 50, (rulePage + 1) * 50).map(({ rule, index }) => el('div', { className: 'row' }, el('div', {}, el('p', {}, el('strong', {}, rule.domain), rule.includeSubdomains ? ' + subdomains' : ' · exact domain'), el('p', { className: 'muted' }, `${rule.name === null ? 'Every name' : `Name: “${rule.name}”`} · ${rule.path === null ? 'Every path' : `Path: “${rule.path}”`}`), el('small', {}, describeScope(rule.scope))), el('div', { className: 'actions' }, button('Edit', () => openRule(index), { id: `edit-rule-${index}`, disabled: busy || !model.canEdit, 'aria-label': `Edit rule for ${rule.domain}` }), button('Remove', () => model.edit(draft => draft.rules.splice(index, 1)), { id: `remove-rule-${index}`, disabled: busy || !model.canEdit, 'aria-label': `Remove rule for ${rule.domain} from draft` }))));
  replace($('rules-list'), rows.length ? rows : el('p', { className: 'empty' }, search ? 'No rules match this search.' : 'No allow rules. Add a rule to protect a cookie group.'));
  replace($('rules-pages'), el('small', {}, `${rules.length} rules · Page ${rulePage + 1} of ${pages}`), pages > 1 ? button('Previous', () => { rulePage--; renderRules(); }, { disabled: rulePage === 0 }) : null, pages > 1 ? button('Next', () => { rulePage++; renderRules(); }, { disabled: rulePage === pages - 1 }) : null);
}
function renderContainers() {
  const stores = (model.state.stores || []).filter(store => store.kind === 'container');
  const nodes = [];
  const pages = Math.max(1, Math.ceil(stores.length / 30));
  containerPage = Math.min(containerPage, pages - 1);
  for (const store of stores.slice(containerPage * 30, (containerPage + 1) * 30)) {
    const active = store.availability === 'available';
    const protection = checkbox(`${storeLabel(store)}${active ? '' : ' · inactive'}`, model.draft?.protectedContainerRefs.includes(store.ref), { id: `container-protection-${store.ref}`, disabled: busy || !model.canEdit, onchange: event => model.edit(draft => { draft.protectedContainerRefs = event.target.checked ? [...new Set([...draft.protectedContainerRefs, store.ref])] : draft.protectedContainerRefs.filter(ref => ref !== store.ref); }) });
    const container = el('div', {}, protection.node);
    if (!active) {
      const select = el('select', { id: `inactive-${store.ref}`, disabled: busy || !model.canEdit, 'aria-label': `Inactive reference decision for ${storeLabel(store)}` }, el('option', { value: 'keep' }, 'Keep inactive'), el('option', { value: 'remove' }, 'Remove this reference'), (model.state.stores || []).filter(item => item.kind === 'container' && item.availability === 'available').map(item => el('option', { value: `map:${item.ref}` }, `Map to ${storeOptionLabel(item)}`)));
      const decision = model.draft?.inactiveDecisions.find(item => item.ref === store.ref);
      select.value = decision?.action === 'map' ? `map:${decision.targetRef}` : decision?.action || 'keep';
      select.addEventListener('change', () => model.edit(draft => { draft.inactiveDecisions = draft.inactiveDecisions.filter(item => item.ref !== store.ref); draft.inactiveDecisions.push({ ref: store.ref, action: select.value.startsWith('map:') ? 'map' : select.value, ...(select.value.startsWith('map:') ? { targetRef: select.value.slice(4) } : {}) }); }));
      const affected = (model.draft?.rules || []).filter(rule => rule.scope.type === 'selected' && rule.scope.storeRefs.includes(store.ref));
      container.append(field('Inactive reference', select), el('small', {}, `${affected.length} selected-store rules reference this container.`));
      if (decision?.action && decision.action !== 'keep') {
        const impact = reviewInactiveDecision(model.draft, decision, model.state.configuration);
        const protection = decision.action === 'map'
          ? impact.transfersWholeContainerProtection ? `Whole-container protection transfers to ${labelRef(decision.targetRef)}. Existing destination protection is preserved.` : impact.destinationAlreadyProtected ? `${labelRef(decision.targetRef)} remains protected in full.` : 'This mapping does not add whole-container protection.'
          : impact.removesWholeContainerProtection ? 'Whole-container protection on this inactive reference will be removed.' : 'This reference has no whole-container protection to remove.';
        container.append(notice(`${decision.action === 'map' ? `After Save, this reference maps to ${labelRef(decision.targetRef)}. Enabled exceptions can make cookies burnable in that store.` : 'Remove this reference from every affected rule and exception before Save. Empty selected scopes must be removed or edited.'} ${protection}`), pagedReview('Affected rules and resulting scope', impact.affectedRules, item => `${describeRule(item.rule)} → ${item.emptyScope ? 'No stores remain: remove this rule or select an available store.' : `Resulting selected stores: ${item.resultingStoreRefs.map(labelRef).join(', ')}`}${item.requiresEdit && !item.emptyScope ? ' Edit this rule to remove the inactive reference before Save.' : ''}`), pagedReview('Affected exceptions and resulting scope', impact.affectedExceptions, item => `${describeException(item.exception)} → ${item.emptyScope ? 'No stores remain: remove this exception or select an available store.' : `Resulting selected stores: ${item.resultingStoreRefs.map(labelRef).join(', ')}`}${item.requiresEdit && !item.emptyScope ? ' Edit this exception to remove the inactive reference before Save.' : ''}`));
      }
    }
    nodes.push(container);
  }
  replace($('containers'), nodes.length ? nodes : el('p', { className: 'empty' }, 'No named containers are available.'), pages > 1 ? el('div', { className: 'actions' }, button('Previous containers', () => { containerPage--; renderContainers(); }, { disabled: containerPage === 0 }), el('small', {}, `Page ${containerPage + 1} of ${pages}`), button('Next containers', () => { containerPage++; renderContainers(); }, { disabled: containerPage === pages - 1 })) : null);
}
function updateStoreFilter() {
  const select = $('cookie-store');
  const selected = select.value;
  replace(select, el('option', { value: '' }, 'All available stores'), (model.state.stores || []).filter(store => store.availability === 'available').map(store => el('option', { value: store.ref }, storeOptionLabel(store))));
  select.value = selected;
}
function openRule(index = null, seed) {
  ruleIndex = index;
  ruleRevision = model.state.revision;
  const rule = seed || (index === null ? { domain: '', includeSubdomains: false, name: null, path: null, scope: { type: 'all' } } : model.draft.rules[index]);
  originalRule = index === null ? null : JSON.stringify(rule);
  $('rule-dialog-heading').textContent = index === null ? 'Add allow rule to draft' : 'Edit allow rule in draft';
  $('rule-domain').value = rule.domain;
  $('rule-subdomains').checked = rule.includeSubdomains;
  $('rule-any-name').checked = rule.name === null; $('rule-name').value = rule.name ?? ''; $('rule-name').disabled = rule.name === null;
  $('rule-any-path').checked = rule.path === null; $('rule-path').value = rule.path ?? ''; $('rule-path').disabled = rule.path === null;
  $('rule-scope').value = rule.scope.type; $('rule-stores').hidden = rule.scope.type !== 'selected';
  replace($('rule-store-options'), (model.state.stores || []).map(store => checkbox(`${storeOptionLabel(store)}${store.availability === 'inactive' ? ' · inactive' : ''}`, rule.scope.storeRefs?.includes(store.ref), { value: store.ref, name: 'store' }).node));
  replace($('rule-errors')); formDirty = false;
  $('rule-dialog').showModal();
}
$('rule-form').addEventListener('input', () => { formDirty = true; });
$('rule-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!model.canEdit) return showError(new Error('Protection changes are paused. Close this form and review availability.'), $('rule-errors'));
  const selected = [...$('rule-store-options').querySelectorAll('input:checked')].map(input => input.value);
  if ($('rule-scope').value === 'selected' && !selected.length) return showError(new Error('Select at least one store.'), $('rule-errors'));
  const rule = editableRule({ domain: $('rule-domain').value, includeSubdomains: $('rule-subdomains').checked, anyName: $('rule-any-name').checked, name: $('rule-name').value, anyPath: $('rule-any-path').checked, path: $('rule-path').value, scope: $('rule-scope').value, storeRefs: selected });
  if ((ruleIndex !== null && JSON.stringify(model.draft?.rules[ruleIndex]) !== originalRule) || !model.edit(draft => { if (ruleIndex === null) draft.rules.push(rule); else draft.rules[ruleIndex] = rule; }, ruleRevision)) {
    return showError(new Error('Saved settings changed while this form was open. Close it and review the current rules before editing again.'), $('rule-errors'));
  }
  formDirty = false; $('rule-dialog').close();
});
$('rule-any-name').addEventListener('change', event => { $('rule-name').disabled = event.target.checked; });
$('rule-any-path').addEventListener('change', event => { $('rule-path').disabled = event.target.checked; });
$('rule-scope').addEventListener('change', event => { $('rule-stores').hidden = event.target.value !== 'selected'; });
$('close-rule').addEventListener('click', () => { formDirty = false; $('rule-dialog').close(); });
$('rule-dialog').addEventListener('cancel', () => { formDirty = false; });
$('add-rule').addEventListener('click', () => openRule());
$('rule-search').addEventListener('input', () => { rulePage = 0; renderRules(); });
$('save').addEventListener('click', () => act(() => inventory.dirty ? inventory.current && !inventory.plan.conflicts?.length ? inventory.commit() : inventory.review() : model.save()));
$('cancel').addEventListener('click', () => discardThen(() => act(async () => { inventory.clear(); selectedCookies.clear(); await model.cancel(true); })));
$('refresh').addEventListener('click', () => discardThen(() => act(async () => { inventory.clear(); selectedCookies.clear(); await model.refresh({ discard: true }); })));
$('confirm-discard').addEventListener('click', () => { $('discard-dialog').close(); formDirty = false; const action = discardAction; discardAction = null; action?.(); });
$('keep-draft').addEventListener('click', () => { discardAction = null; $('discard-dialog').close(); });
window.addEventListener('beforeunload', event => { if (model.dirty || formDirty || inventory.dirty) { event.preventDefault(); event.returnValue = ''; } });
$('request-access').addEventListener('click', () => {
  const request = client.requestHostAccess();
  act(async () => { const result = await request; if (!result.granted) replace($('messages'), notice(result.guidance)); await model.refresh(); });
});
async function loadCookies(pageToken) {
  if (!pageToken) cookieQuery = { ...($('cookie-store').value ? { storeRefs: [$('cookie-store').value] } : {}), search: $('cookie-search').value, pageSize: 100 };
  const revision = model.state.revision, catalogGeneration = model.state.catalogGeneration;
  let result;
  try {
    result = await client.getCookies({ ...cookieQuery, ...(pageToken ? { pageToken } : {}) });
    if (model.state.revision !== revision || model.state.catalogGeneration !== catalogGeneration || !model.state.capabilities.canReadCookies) throw new Error('Saved settings or access changed during inventory capture.');
  }
  catch (error) { cookieResult = null; nextPageToken = null; $('next-cookies').hidden = true; replace($('cookie-results'), notice('This inventory could not be captured or continued. Refresh before relying on it.', 'error')); throw error; }
  nextPageToken = result.nextPageToken; $('next-cookies').hidden = !nextPageToken;
  cookieResult = result; cookieRevision = revision; cookieCatalogGeneration = catalogGeneration; selectedCookies.clear(); renderCookieResults();
}
function renderCookieResults() {
  const result = cookieResult;
  const expanded = new Set([...$('cookie-results').querySelectorAll('details[open]')].map(node => node.id));
  const stageChoices = (tokens, choice, kind = 'row', selectionKey = null) => { try { inventory.stage(tokens, choice, kind, selectionKey); } catch (error) { showError(error); } };
  const cookieRow = cookie => {
    const canChoose = Boolean(cookie.rowToken && model.canEdit && !busy);
    const selectId = `inventory-select-${result.cookies.indexOf(cookie)}`;
    const select = checkbox(`Select ${cookie.name} on ${cookie.domain}`, selectedCookies.has(cookie.rowToken), { id: selectId, disabled: !canChoose, onchange: event => { if (event.target.checked) selectedCookies.add(cookie.rowToken); else selectedCookies.delete(cookie.rowToken); renderCookieResults(); $(selectId)?.focus(); } });
    return el('div', { className: 'row' }, el('div', {}, select.node, el('p', {}, el('strong', {}, cookie.domain)), el('p', {}, `Name: “${cookie.name}” · Path: “${cookie.path}”`), el('p', { className: 'muted' }, cookie.protected ? 'Kept by saved protection' : 'Burnable, subject to safety checks'), inventory.choices.has(`row:${cookie.rowToken}`) ? el('p', {}, `Draft choice: ${inventory.choices.get(`row:${cookie.rowToken}`).choice}`) : null, cookie.reasons?.length ? el('small', {}, reasonText(cookie.reasons)) : null, cookie.matchingExceptionIndexes?.length ? el('small', {}, `Matching saved exceptions: ${cookie.matchingExceptionIndexes.map(index => index + 1).join(', ')}. ${cookie.overriddenRules?.length ? `Overrides: ${reasonText(cookie.overriddenRules)}` : ''}`) : null, el('small', {}, [cookie.secure ? 'Secure' : '', cookie.httpOnly ? 'HttpOnly' : '', cookie.session ? 'Session' : 'Persistent'].filter(Boolean).join(' · '))), el('div', { className: 'actions' }, button('Keep stored', () => stageChoices([cookie.rowToken], 'keep'), { disabled: !canChoose }), button('Make burnable', () => stageChoices([cookie.rowToken], 'burnable'), { disabled: !canChoose }), button('Create rule', () => openRule(null, { domain: cookie.domain.replace(/^\./, ''), includeSubdomains: false, name: cookie.name, path: cookie.path, scope: { type: 'selected', storeRefs: [cookie.storeRef] } }), { className: 'create-cookie-rule', disabled: !model.canEdit, 'aria-label': `Create draft rule for ${cookie.name} on ${cookie.domain}` })));
  };
  const groups = groupCookieInventory(result.cookies).map((store, storeIndex) => {
    const sites = store.sites.map((site, siteIndex) => {
      const jars = site.jars.map((jar, jarIndex) => {
        const token = jar.cookies[0].jarToken;
        const key = JSON.stringify([store.storeRef, site.main, jar.domain]);
        const choices = jar.kind === 'third-party' ? el('div', { className: 'actions' },
          el('small', {}, `${jar.cookies[0].jarSize ?? 'Unknown'} cookies across snapshot pages`),
          helpControl('Jar choices', 'Jar choices are persistent and include future cookie names and paths. Keeping a jar may protect other partitions. Review the full scope before saving. Whole-container protection and deletion safety still apply.'),
          button('Keep jar', () => stageChoices([token], 'keep', 'jar', key), { disabled: busy || !model.canEdit || !token }),
          button('Make jar burnable', () => stageChoices([token], 'burnable', 'jar', key), { disabled: busy || !model.canEdit || !token })) : null;
        const cookies = jar.cookies.map(cookie => el('details', { className: 'inventory-cookie', id: `inventory-cookie-${result.cookies.indexOf(cookie)}` },
          el('summary', {}, cookie.name || '(empty name)', el('span', { className: 'pill' }, cookie.protected ? 'Preserved' : 'Burnable')), cookieRow(cookie)));
        return el('details', { className: 'inventory-jar', id: `inventory-jar-${storeIndex}-${siteIndex}-${jarIndex}` },
          el('summary', {}, jar.domain, el('small', {}, `${jar.kind === 'third-party' ? 'Third-party jar' : jar.kind === 'unpartitioned' ? 'Unpartitioned' : 'Own cookies'} · ${jar.cookies.length} on this page`)), choices, cookies);
      });
      return el('details', { className: 'inventory-site', id: `inventory-site-${storeIndex}-${siteIndex}` },
        el('summary', {}, el('strong', {}, site.main || 'Unknown association'), el('small', {}, site.kind === 'unpartitioned' ? 'Unpartitioned cookies' : site.kind === 'partitioned' ? 'Partitioned by main site' : 'Association unavailable')), jars);
    });
    return el('section', { className: 'inventory-store' }, el('h3', {}, labelRef(store.storeRef)), sites);
  });

  const unavailable = (model.state.stores || []).filter(store => store.availability !== 'available');
  const conflicts = inventory.current ? inventory.plan.conflicts || [] : [];
  const changes = inventory.current && !conflicts.length ? describeInventoryChanges(inventory.plan.configuration, model.draft) : [];
  const review = inventory.dirty ? el('section', {}, el('h3', {}, 'Draft cookie choices'), el('p', {}, `${inventory.choices.size} cookie or jar choices. These create persistent rules that can apply to recreated cookies.`), inventory.current && !conflicts.length ? notice('The backend accepted the reviewed choices. Select Save changes to commit them together with the Settings draft.') : null, changes.length ? el('div', {}, el('p', {}, 'Additional changes to the draft:'), el('ul', {}, changes.map(change => el('li', {}, change)))) : null, conflicts.map(conflict => notice(`${conflict.message}${conflict.scope ? ` Affected scope: ${describeAffectedScope(conflict.scope)}` : ''}`, 'error')), conflicts.some(conflict => conflict.code === 'SCOPE_REVIEW_REQUIRED') ? button('I reviewed the affected scopes', () => inventory.acknowledgeScopes()) : null, conflicts.some(conflict => conflict.code !== 'SCOPE_REVIEW_REQUIRED') ? el('p', {}, 'Edit the relevant rules or exception draft, then review these choices again.') : null, button('Clear cookie choices', () => inventory.clear(), { disabled: busy })) : null;
  replace($('cookie-results'), unavailable.length ? notice(`Some stores are unavailable: ${unavailable.map(storeLabel).join(', ')}. They are not included in this inventory.`) : null, result.cookies.some(cookie => cookie.association?.kind === 'unknown') ? notice('Some cookies have unknown site associations. They are not assigned to a known site.') : null, review, el('div', { className: 'actions' }, el('span', {}, `${selectedCookies.size} selected on this page`), button('Keep selected', () => stageChoices([...selectedCookies], 'keep'), { disabled: busy || !selectedCookies.size }), button('Make selected burnable', () => stageChoices([...selectedCookies], 'burnable'), { disabled: busy || !selectedCookies.size })), groups.length ? groups : el('p', { className: 'empty' }, 'No matching cookie metadata.'));
  for (const node of $('cookie-results').querySelectorAll('details')) if (expanded.has(node.id)) node.open = true;
}
$('cookie-search-form').addEventListener('submit', event => { event.preventDefault(); const load = () => act(async () => { inventory.clear(); await loadCookies(); }); if (inventory.dirty) discardThen(load); else load(); });
$('next-cookies').addEventListener('click', () => act(() => loadCookies(nextPageToken)));
$('export').addEventListener('click', () => act(async () => {
  const exported = await client.prepareExport({}, model.state.revision);
  const url = URL.createObjectURL(new Blob([exported.text], { type: 'application/json' }));
  const link = el('a', { href: url, download: exported.filename }, 'Download configuration'); document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  replace($('messages'), notice('Exported the saved configuration. Unsaved draft changes were not included.'));
}));
function describeImported(value) {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'Protected' : 'Unprotected';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return value.map(describeImported).join('; ');
  if ('ref' in value && 'name' in value) return `${value.name} · retained inactive reference`;
  if ('domain' in value) return describeRule(value);
  if (value.type === 'all' || value.type === 'selected') return describeScope(value);
  if (value.type === 'containerProtection') return `Whole-container protection: ${labelRef(value.ref)}`;
  if (value.type === 'container') return `Excluded source container: ${value.name} · ${value.protected ? 'protected' : 'unprotected'}`;
  if (value.type === 'inactiveReference') return `Inactive reference: ${value.name || labelRef(value.ref)}`;
  if (value.type === 'ruleScope') return `Imported rule: ${describeRule(value.rule)} · Remaining stores after exclusion: ${(value.remainingStoreRefs || []).map(labelRef).join(', ')}`;
  if (value.type === 'rule' && value.rule) return describeRule(value.rule);
  if ('targetRef' in value && value.sources) return `Destination ${labelRef(value.targetRef)}: ${value.sources.map(describeImported).join('; ')}`;
  if ('protected' in value) return `${value.name ? value.name + ': ' : ''}${value.protected ? 'Protected' : 'Unprotected'}`;
  return Object.entries(value).filter(([key]) => !/token|^id$|^ref$|^sourceRef$|^targetRef$|^storeRef$/i.test(key)).map(([key, item]) => `${key}: ${describeImported(item)}`).join(' · ');
}
const acknowledgmentText = {
  replace: 'I reviewed the protection scheduled for removal and want to replace the saved configuration.',
  exclusions: 'I reviewed every excluded source reference and the rules omitted because their scope became empty.',
  manyToOne: 'I reviewed the combined effects of mapping several source containers to one destination.',
  recovery: 'Previous protection is unknown and cannot be preserved automatically. I want to replace it with this file.'
};
const choiceText = { existing: 'Keep existing', imported: 'Use imported', combine: 'Combine scopes', protected: 'Protect this container', unprotected: 'Leave this container unprotected' };
function renderImport() {
  const host = $('import-workflow');
  if (!host || !importVisible) { if (host) replace(host); return; }
  const recovery = Boolean(model.state?.capabilities.canRecoverConfiguration);
  const content = [];
  const heading = text => el('h3', {}, text);
  const cancel = () => {
    if (importer.applying) return;
    importer.reset(); importVisible = false; renderImport();
    replace($('messages'), notice('Import canceled. Saved protection and your editor draft are unchanged.'));
  };
  content.push(el('div', { className: 'transfer-stage' }, heading(recovery ? 'Recover configuration with Replace import' : 'Import a configuration file')));
  if (model.dirty || inventory.dirty) content.push(notice('An import applies saved settings. Applying it discards your current unsaved draft after a separate confirmation.'));
  if (recovery) content.push(notice('Previous protection is unknown. A valid file, explicit mappings, and a confirmed Replace preview are required.'));
  if (importer.pending) {
    content.push(notice(`${importer.pending}…`), el('progress', { 'aria-label': importer.pending }), button('Cancel import preparation', cancel));
  } else if (importer.applying) {
    content.push(notice('Saving the confirmed configuration…'), el('progress', { 'aria-label': 'Saving imported configuration' }));
  } else if (!importer.inspection) {
    const mode = el('select', { disabled: recovery, 'aria-label': 'Import mode' }, el('option', { value: 'merge' }, 'Merge · retain unmatched existing protection'), el('option', { value: 'replace' }, 'Replace · review existing-only protection for removal'));
    mode.value = recovery ? 'replace' : importer.mode;
    mode.addEventListener('change', () => { importer.mode = mode.value; });
    const input = el('input', { type: 'file', accept: '.json,application/json', disabled: busy || model.locked, 'aria-label': 'Choose Biscotty configuration file' });
    input.addEventListener('change', () => act(async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) throw new Error('The file exceeds the 2 MiB configuration limit.');
      await importer.inspect(await file.text(), mode.value);
    }));
    content.push(field('Mode', mode), field('Local JSON file', input, 'Select a Biscotty configuration file. The complete file is validated before mapping.'), button('Cancel import', cancel));
  } else if (!importer.plan) {
    const mode = el('select', { disabled: recovery || busy, 'aria-label': 'Import mode' }, el('option', { value: 'merge' }, 'Merge'), el('option', { value: 'replace' }, 'Replace'));
    mode.value = importer.mode;
    mode.addEventListener('change', () => act(() => importer.inspect(importer.text, mode.value)));
    content.push(heading('Validated · map every source container'), field('Mode', mode, 'Changing mode resets dependent decisions. No destination container is created.'));
    const selectors = [];
    const sourceContainers = importer.inspection.containers || [];
    for (const container of sourceContainers.slice(importer.mappingPage * 20, (importer.mappingPage + 1) * 20)) {
      const select = el('select', { id: `mapping-${container.ref}`, required: true, disabled: busy || model.locked, 'aria-label': `Mapping for imported ${container.name}` }, el('option', { value: '' }, 'Choose explicitly…'), (model.state.stores || []).filter(store => store.kind === 'container' && store.availability === 'available').map(store => el('option', { value: `map:${store.ref}` }, `Map to ${storeOptionLabel(store)}`)), el('option', { value: 'retain' }, 'Retain as an inactive reference'), el('option', { value: 'exclude' }, 'Exclude this source reference'));
      select.value = importer.mappingChoices.get(container.ref) || '';
      select.addEventListener('change', () => { importer.mappingChoices.set(container.ref, select.value); });
      selectors.push({ container, select });
      content.push(field(`${container.name} · ${container.state === 'inactive' ? 'inactive in source' : 'active in source'} · ${container.color} · ${container.icon}`, select));
    }
    if (!sourceContainers.length) content.push(el('p', {}, 'This file has no named-container references. Normal browsing retains its defined meaning.'));
    if (sourceContainers.length > 20) content.push(el('div', { className: 'actions' }, el('small', {}, `Source containers: page ${importer.mappingPage + 1} of ${Math.ceil(sourceContainers.length / 20)}`), button('Previous containers', () => { importer.mappingPage--; renderImport(); }, { disabled: importer.mappingPage === 0 || busy }), button('Next containers', () => { importer.mappingPage++; renderImport(); }, { disabled: (importer.mappingPage + 1) * 20 >= sourceContainers.length || busy })));
    content.push(el('p', {}, `${[...importer.mappingChoices.values()].filter(Boolean).length} of ${sourceContainers.length} mapping decisions selected.`));
    content.push(notice('Mapping is explicit even when names match. All stores rules continue to include every available store after exclusions.'));
    const many = checkbox('I confirm any many-to-one destination mappings and want to review their combined effects.', importer.manyToOne);
    many.input.addEventListener('change', () => { importer.manyToOne = many.input.checked; });
    content.push(many.node, el('div', { className: 'actions' }, button('Build import plan', () => act(async () => {
      await importer.planMappings(importer.mappingDecisions(), many.input.checked);
    }), { disabled: busy || model.locked }), button('Cancel import', cancel)));
  } else if (!importer.plan.canCommit) {
    const plan = importer.plan;
    content.push(heading('Resolve each conflict and review changes'));
    const conflictSelectors = [];
    const allConflicts = plan.conflicts || [];
    for (const conflict of allConflicts.slice(importer.conflictPage * 25, (importer.conflictPage + 1) * 25)) {
      const select = el('select', { id: `conflict-${conflict.id}`, disabled: busy || model.locked, 'aria-label': `Decision for ${conflict.type} conflict` }, el('option', { value: '' }, 'Choose a resolution…'), conflict.choices.map(choice => el('option', { value: choice }, choiceText[choice] || choice)));
      const previous = importer.decisions.find(decision => decision.conflictId === conflict.id);
      select.value = importer.conflictChoices[conflict.id] || previous?.choice || '';
      select.addEventListener('change', () => { importer.conflictChoices[conflict.id] = select.value; });
      conflictSelectors.push({ conflict, select });
      content.push(el('fieldset', {}, el('legend', {}, conflict.type === 'scope' ? 'Rule scope conflict' : `Container protection conflict: ${labelRef(conflict.targetRef)}`), el('p', {}, `Existing: ${describeImported(conflict.existing)}`), el('p', {}, `Imported: ${describeImported(conflict.imported)}`), field('Individual conflict decision', select)));
    }
    if (!allConflicts.length) content.push(el('p', {}, 'There are no conflicting entries.'));
    if (allConflicts.length > 25) content.push(el('div', { className: 'actions' }, el('small', {}, `Conflicts: page ${importer.conflictPage + 1} of ${Math.ceil(allConflicts.length / 25)}`), button('Previous conflicts', () => { importer.conflictPage--; renderImport(); }, { disabled: importer.conflictPage === 0 || busy }), button('Next conflicts', () => { importer.conflictPage++; renderImport(); }, { disabled: (importer.conflictPage + 1) * 25 >= allConflicts.length || busy })));
    content.push(el('p', {}, `${Object.values(importer.conflictChoices).filter(Boolean).length} of ${allConflicts.length} individual decisions selected.`));
    content.push(renderPreview(plan.preview));
    const checks = (plan.preview?.requiredAcknowledgments || []).map(key => {
      const check = { key, ...checkbox(acknowledgmentText[key] || `I reviewed ${key}.`, Boolean(importer.ackChoices[key] || importer.acknowledgments[key])) };
      check.input.addEventListener('change', () => { importer.ackChoices[key] = check.input.checked; });
      return check;
    });
    content.push(checks.map(check => check.node));
    content.push(el('div', { className: 'actions' }, button('Review final result', () => act(async () => {
      if (allConflicts.some(conflict => !importer.conflictChoices[conflict.id] && !importer.decisions.some(decision => decision.conflictId === conflict.id))) throw new Error('Resolve each conflict individually, including other pages.');
      if (checks.some(check => !check.input.checked)) throw new Error('Acknowledge each listed change before continuing.');
      await importer.resolve(allConflicts.map(conflict => ({ conflictId: conflict.id, choice: importer.conflictChoices[conflict.id] || importer.decisions.find(decision => decision.conflictId === conflict.id)?.choice })), Object.fromEntries(checks.map(check => [check.key, check.input.checked])));
    }), { disabled: busy || model.locked }), button('Change mode or mappings', () => act(() => importer.inspect(importer.text, importer.mode)), { disabled: busy }), button('Cancel import', cancel)));
  } else {
    content.push(heading('Final preview · ready to apply'), renderPreview(importer.plan.preview), notice('Nothing changes until you apply this complete configuration.'));
    content.push(el('div', { className: 'actions' }, button('Apply configuration', () => {
      const apply = () => act(() => importer.apply().then(() => { inventory.clear(); selectedCookies.clear(); importVisible = false; renderImport(); replace($('messages'), notice('Imported configuration saved.')); }));
      if (model.dirty || inventory.dirty) discardThen(apply); else apply();
    }, { className: 'primary', disabled: busy || model.locked }), button('Change mode or mappings', () => act(() => importer.inspect(importer.text, importer.mode)), { disabled: busy }), button('Cancel import', cancel)));
  }
  replace(host, content);
}
function pagedReview(title, values, describe) {
  let page = 0;
  const details = el('details');
  const list = el('div', { className: 'scroll-list' });
  const controls = el('div', { className: 'actions' });
  const draw = () => {
    replace(list, values.slice(page * 50, (page + 1) * 50).map(value => el('p', {}, describe(value))));
    replace(controls, el('small', {}, `Page ${page + 1} of ${Math.max(1, Math.ceil(values.length / 50))}`), button('Previous', () => { page--; draw(); }, { disabled: page === 0 }), button('Next', () => { page++; draw(); }, { disabled: (page + 1) * 50 >= values.length }));
  };
  details.append(el('summary', {}, `${title} (${values.length})`), list, controls);
  details.addEventListener('toggle', () => { if (details.open && !list.childNodes.length) draw(); });
  return details;
}
function renderPreview(preview = {}) {
  const count = value => Array.isArray(value) ? value.length : typeof value === 'number' ? value : value ? Object.keys(value).length : 0;
  const descriptions = [];
  for (const key of ['added', 'changed', 'removed', 'duplicates', 'excluded', 'inactive']) {
    const values = preview[key];
    descriptions.push(el('p', {}, `${key.charAt(0).toUpperCase() + key.slice(1)}: ${count(values)}`));
    if (Array.isArray(values) && values.length) descriptions.push(pagedReview(`Review ${key}`, values, describeImported));
  }
  const rules = preview.rules || [];
  descriptions.push(pagedReview('Resulting allow rules', rules, describeRule));
  if (preview.manyToOne?.length) descriptions.push(pagedReview('Combined container mappings', preview.manyToOne, describeImported));
  descriptions.push(el('p', {}, `Resulting whole-container protection: ${(preview.protectedContainerRefs || []).map(labelRef).join(', ') || 'None'}`));
  if (preview.decisions?.length) descriptions.push(pagedReview('Conflict decisions', preview.decisions, decision => choiceText[decision.choice] || 'Reviewed decision'));
  if (preview.recoveryWarning) descriptions.push(notice(preview.recoveryWarning));
  if (preview.allStoresNotice) descriptions.push(notice(preview.allStoresNotice));
  return el('div', { className: 'transfer-stage' }, el('h3', {}, 'Proposed configuration changes'), descriptions);
}
$('start-import').addEventListener('click', () => { importer.reset(); importVisible = true; renderImport(); $('import-workflow').scrollIntoView({ block: 'start' }); });
model.subscribe();
act(() => model.refresh());
