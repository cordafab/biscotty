import { editableRule } from './rule-form.js';
import { client } from '../backend/client/native.js';
import { createEditorModel, createImportModel, operationActive, operationTitle, storeLabel, reviewInactiveDecision } from './models.js';
import { element as el, button, field, checkbox, replace, notice, showError } from './dom.js';
const $ = id => document.getElementById(id);
let busy = false;
let rulePage = 0;
let ruleIndex = null;
let formDirty = false;
let nextPageToken;
let importVisible = false;
let discardAction;
const model = createEditorModel(client, render);
const importer = createImportModel(client, model, renderImport);
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
async function act(action) {
  if (busy) return;
  busy = true; replace($('messages')); render();
  try { await action(); }
  catch (error) { showError(error); }
  finally { busy = false; render(); }
}
function discardThen(action) {
  if (!model.dirty && !formDirty) return action();
  discardAction = action;
  $('discard-dialog').showModal();
}
function render() {
  const focusedId = document.activeElement?.id;
  const state = model.state;
  if (!state) return;
  $('draft-status').textContent = model.saving ? 'Saving complete configuration…' : model.stale ? 'Saved settings changed elsewhere. Your draft is preserved; refresh to review.' : model.dirty ? 'Unsaved draft · saved protection is still active' : 'All changes saved';
  $('save').disabled = busy || !model.canEdit || !model.dirty || model.saving;
  $('cancel').disabled = busy || !model.dirty;
  $('add-rule').disabled = busy || !model.canEdit;
  $('export').disabled = busy || !state.configuration || state.exportStatus?.canExport === false;
  $('start-import').disabled = busy || model.locked || (!model.canEdit && !state.capabilities.canRecoverConfiguration);
  $('load-cookies').disabled = busy || !state.capabilities.canReadCookies;
  $('next-cookies').disabled = busy;
  for (const control of document.querySelectorAll('.create-cookie-rule')) control.disabled = busy || !model.canEdit;
  renderAvailability(); renderRules(); renderContainers(); updateStoreFilter(); renderImport();
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
  for (const store of stores) {
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
        container.append(notice(`${decision.action === 'map' ? `After Save, this reference maps to ${labelRef(decision.targetRef)}.` : 'Remove this reference from every affected rule before Save. Empty selected scopes must be removed or edited.'} ${protection}`), pagedReview('Affected rules and resulting scope', impact.affectedRules, item => `${describeRule(item.rule)} → ${item.emptyScope ? 'No stores remain: remove this rule or select an available store.' : `Resulting selected stores: ${item.resultingStoreRefs.map(labelRef).join(', ')}`}${item.requiresEdit && !item.emptyScope ? ' Edit this rule to remove the inactive reference before Save.' : ''}`));
      }
    }
    nodes.push(container);
  }
  replace($('containers'), nodes.length ? nodes : el('p', { className: 'empty' }, 'No named containers are available.'));
}
function updateStoreFilter() {
  const select = $('cookie-store');
  const selected = select.value;
  replace(select, el('option', { value: '' }, 'All available stores'), (model.state.stores || []).filter(store => store.availability === 'available').map(store => el('option', { value: store.ref }, storeOptionLabel(store))));
  select.value = selected;
}
function openRule(index = null, seed) {
  ruleIndex = index;
  const rule = seed || (index === null ? { domain: '', includeSubdomains: false, name: null, path: null, scope: { type: 'all' } } : model.draft.rules[index]);
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
  model.edit(draft => { if (ruleIndex === null) draft.rules.push(rule); else draft.rules[ruleIndex] = rule; });
  formDirty = false; $('rule-dialog').close();
});
$('rule-any-name').addEventListener('change', event => { $('rule-name').disabled = event.target.checked; });
$('rule-any-path').addEventListener('change', event => { $('rule-path').disabled = event.target.checked; });
$('rule-scope').addEventListener('change', event => { $('rule-stores').hidden = event.target.value !== 'selected'; });
$('close-rule').addEventListener('click', () => { formDirty = false; $('rule-dialog').close(); });
$('rule-dialog').addEventListener('cancel', () => { formDirty = false; });
$('add-rule').addEventListener('click', () => openRule());
$('rule-search').addEventListener('input', () => { rulePage = 0; renderRules(); });
$('save').addEventListener('click', () => act(() => model.save()));
$('cancel').addEventListener('click', () => discardThen(() => act(() => model.cancel(true))));
$('refresh').addEventListener('click', () => discardThen(() => act(() => model.refresh({ discard: true }))));
$('confirm-discard').addEventListener('click', () => { $('discard-dialog').close(); formDirty = false; const action = discardAction; discardAction = null; action?.(); });
$('keep-draft').addEventListener('click', () => { discardAction = null; $('discard-dialog').close(); });
window.addEventListener('beforeunload', event => { if (model.dirty || formDirty) { event.preventDefault(); event.returnValue = ''; } });
$('request-access').addEventListener('click', () => {
  const request = client.requestHostAccess();
  act(async () => { const result = await request; if (!result.granted) replace($('messages'), notice(result.guidance)); await model.refresh(); });
});
async function loadCookies(pageToken) {
  const result = await client.getCookies({ ...( $('cookie-store').value ? { storeRefs: [$('cookie-store').value] } : {}), search: $('cookie-search').value, pageSize: 100, ...(pageToken ? { pageToken } : {}) });
  nextPageToken = result.nextPageToken; $('next-cookies').hidden = !nextPageToken;
  const rows = result.cookies.map(cookie => el('div', { className: 'row' }, el('div', {}, el('p', {}, el('strong', {}, cookie.domain)), el('p', {}, `Name: “${cookie.name}” · Path: “${cookie.path}”`), el('p', { className: 'muted' }, `${labelRef(cookie.storeRef)} · ${cookie.partitionLabel || 'Unpartitioned'} · ${cookie.protected ? 'Protected' : 'Unprotected'}`), el('small', {}, [cookie.secure ? 'Secure' : '', cookie.httpOnly ? 'HttpOnly' : '', cookie.session ? 'Session' : 'Persistent'].filter(Boolean).join(' · '))), button('Create rule', () => openRule(null, { domain: cookie.domain.replace(/^\./, ''), includeSubdomains: false, name: cookie.name, path: cookie.path, scope: { type: 'selected', storeRefs: [cookie.storeRef] } }), { className: 'create-cookie-rule', disabled: !model.canEdit, 'aria-label': `Create draft rule for ${cookie.name} on ${cookie.domain}` })));
  replace($('cookie-results'), rows.length ? rows : el('p', { className: 'empty' }, 'No matching cookie metadata.'));
}
$('cookie-search-form').addEventListener('submit', event => { event.preventDefault(); act(() => loadCookies()); });
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
  if (model.dirty) content.push(notice('An import applies saved settings. Applying it discards your current unsaved draft after a separate confirmation.'));
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
      const apply = () => act(() => importer.apply().then(() => { importVisible = false; renderImport(); replace($('messages'), notice('Imported configuration saved.')); }));
      if (model.dirty) discardThen(apply); else apply();
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
