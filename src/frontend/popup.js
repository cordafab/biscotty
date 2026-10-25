import { createRuleFields } from './rule-form.js';
import { client } from '../backend/client/native.js';
import { createPopupModel, operationActive, operationTitle, siteStatus, reasonText, storeLabel } from './models.js';
import { element as el, button, replace, notice, showError } from './dom.js';
const site = document.getElementById('site');
const burner = document.getElementById('burner');
const messages = document.getElementById('messages');
let busy = false;
const model = createPopupModel(client, render);
async function act(action) {
  if (busy) return;
  busy = true; replace(messages); render();
  try { await action(); }
  catch (error) {
    showError(error);
    if (['STALE_SITE_CONTEXT', 'REVISION_CONFLICT', 'STALE_PREVIEW'].includes(error.code)) {
      model.preview = null;
      await model.refresh().catch(() => {});
    }
  } finally { busy = false; render(); }
}
const actionButton = (label, action, attrs = {}) => button(label, () => act(action), { disabled: busy, ...attrs });
function renderSite() {
  const view = model.site;
  if (!view) return;
  const locked = operationActive(model.state?.operation);
  const controls = view.controls || {};
  const children = [el('h2', {}, 'Current site'), el('span', { className: 'pill' }, siteStatus(view.status))];
  if (view.target) {
    children.push(el('p', { className: 'site-target' }, view.target.domain), el('p', { className: 'muted' }, `${view.target.includeSubdomains ? 'Including subdomains' : 'Exact host only'} · ${storeLabel(view.store)}`));
  }
  children.push(el('p', {}, reasonText(view.reasons) || 'Protection uses your saved settings.'));
  const actions = [];
  if (controls.canProtect) actions.push(actionButton(`Protect ${view.target.domain}${view.target.includeSubdomains ? ' and subdomains' : ' (exact host)'} in ${storeLabel(view.store)}`, () => model.protect(true), { disabled: busy || locked }));
  if (controls.canRemove) actions.push(actionButton(`Remove site-wide protection in ${storeLabel(view.store)}`, () => model.protect(false), { disabled: busy || locked }));
  if (controls.editorRequired || view.status === 'partial' || view.status === 'full') actions.push(actionButton('Review protection in Settings', () => client.openOptions({ ...(view.store?.ref ? { storeRef: view.store.ref } : {}) })));
  actions.push(actionButton('Refresh current site', () => model.refresh()));
  if (locked) children.push(notice('Protection changes are paused while a burn runs.'));
  children.push(el('div', { className: 'actions' }, actions), el('small', {}, 'This target may not include third-party cookies. Protection does not guarantee a login session.'));
  children.push(renderDomains());
  replace(site, children);
}
function renderDomains() {
  const content = [el('h3', {}, 'Associated cookie domains'), el('p', { className: 'muted' }, 'Counts describe associated stored cookies in this store. They do not prove transmission or use.')];
  if (model.coverage?.state === 'partial') content.push(notice(`${model.coverage.reason || 'Page observation is incomplete.'} Reload the page to observe its activity from the start. Refresh cannot recover earlier activity.`));
  if (model.domainStale) content.push(notice('This snapshot is stale. Refresh and review the current page and saved rules before editing.'));
  if (model.domainStatus === 'loading') content.push(el('p', { role: 'status' }, 'Loading associated cookie domains…'));
  if (model.domainStatus === 'empty') content.push(el('p', { className: 'empty' }, 'No associated stored cookies were found.'));
  if (model.domainStatus === 'unavailable') content.push(notice(model.domainError?.message || 'Cookie domains are unavailable. Refresh to review the current page.'));
  if (model.domainStatus === 'error') content.push(notice(model.domainError?.message || 'Cookie domains could not be loaded. Refresh to try again.', 'error'));
  const rows = model.domains.map((row, index) => el('div', { className: 'domain-row' }, el('div', {}, el('p', { className: 'domain-name' }, row.domain), el('small', {}, `${row.cookieCount} stored ${row.cookieCount === 1 ? 'cookie' : 'cookies'} · ${siteStatus(row.status)}`)), button('✎', () => model.openSiteRule(row), { id: `domain-pencil-${index}`, className: 'domain-pencil', 'aria-label': `Edit protection for ${row.domain}`, disabled: busy || model.domainStale })));
  content.push(el('div', { className: 'domain-list', tabindex: '0', role: 'region', 'aria-label': 'Associated stored cookie domains' }, rows));
  if (model.nextPageToken) content.push(actionButton(model.domainStatus === 'loadingMore' ? 'Loading more…' : 'Load more', () => model.loadMoreDomains(), { disabled: busy || model.domainStale || model.domainStatus === 'loadingMore' }));
  return el('div', { className: 'domain-section' }, content);
}
const dialog = document.getElementById('site-rule-dialog');
let shownEditor = null;
let openerId = null;
let shownRule = null;
let ruleFields;
function ruleDescription(rule) {
  const label = ref => storeLabel(model.state.stores.find(store => store.ref === ref));
  return `${rule.domain}${rule.includeSubdomains ? ' and subdomains' : ' (exact domain)'} · ${rule.name === null ? 'Every name' : `Exact name: “${rule.name}”`} · ${rule.path === null ? 'Every path' : `Exact path: “${rule.path}”`} · ${rule.scope.type === 'all' ? 'All stores' : rule.scope.storeRefs.map(label).join(', ')}`;
}
function renderRuleDialog() {
  const editor = model.ruleEditor;
  if (!editor) { if (dialog.open) { dialog.close(); document.getElementById(openerId)?.focus(); } shownEditor = null; shownRule = null; return; }
  if (editor !== shownEditor) {
    openerId = document.activeElement?.id || openerId;
    shownEditor = editor; shownRule = null;
    const choices = editor.row.matchingRuleIndexes.map(index => {
      const rule = model.state.configuration.rules[index];
      return button(ruleDescription(rule), () => model.selectSiteRule(index), { className: 'source-rule', 'aria-label': `Edit saved rule: ${ruleDescription(rule)}` });
    });
    replace(document.getElementById('site-rule-sources'), el('p', {}, `Protection sources for ${editor.row.domain}`), el('p', {}, reasonText(editor.row.reasons) || 'No saved protection applies.'), choices, button('Add rule', () => model.selectSiteRule(null), { className: 'source-rule' }), button('Review protection in Settings', () => act(() => client.openOptions({ storeRef: model.site.store.ref }))));
    if (!dialog.open) dialog.showModal();
  }
  if (editor.rule !== shownRule) {
    shownRule = editor.rule;
    ruleFields = editor.rule ? createRuleFields(editor.rule, model.state.stores, () => {
      try { document.getElementById('site-rule-notices').firstElementChild.textContent = `Save immediately updates this entire rule: ${ruleDescription(ruleFields.read())}. Changes may affect other domains and stores. Whole-container protection remains in effect.`; } catch { /* An empty selected scope is validated on submit. */ }
    }) : null;
    replace(document.getElementById('site-rule-fields'), ruleFields?.node);
  }
  const notices = [];
  if (editor.rule) notices.push(notice(`Save immediately updates this entire rule: ${ruleDescription(editor.rule)}. Changes may affect other domains and stores. Whole-container protection remains in effect.`));
  if (editor.reviewRequired) notices.push(notice('The page or saved settings changed. Your draft is preserved. Cancel, refresh Current site, and select a current domain and rule to review before saving.'));
  if (operationActive(model.state?.operation)) notices.push(notice('Save protection is paused while a burn runs.'));
  replace(document.getElementById('site-rule-notices'), notices);
  document.getElementById('save-site-rule').disabled = !model.canSaveRule;
  document.getElementById('cancel-site-rule').disabled = editor.saving;
  if (ruleFields) ruleFields.node.disabled = editor.saving;
  for (const choice of document.querySelectorAll('.source-rule')) choice.disabled = editor.saving || editor.reviewRequired;
  if (editor.error) showError(editor.error, document.getElementById('site-rule-errors'));
  else replace(document.getElementById('site-rule-errors'));
}
document.getElementById('site-rule-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!model.canSaveRule) return;
  try { await model.saveSiteRule(ruleFields.read()); }
  catch (error) { showError(error, document.getElementById('site-rule-errors')); }
});
document.getElementById('cancel-site-rule').addEventListener('click', () => model.cancelSiteRule());
dialog.addEventListener('cancel', event => { event.preventDefault(); model.cancelSiteRule(); });
function renderBurner() {
  const state = model.state;
  if (!state) return;
  const operation = state.operation;
  const preview = model.preview;
  const children = [el('h2', {}, operation ? operationTitle(operation) : preview ? 'Review this burn' : 'Cookie burner')];
  if (operation) {
    if (operationActive(operation)) {
      children.push(el('progress', { max: operation.plannedAttempts || 1, value: operation.attemptedCalls || 0, 'aria-label': 'Deletion attempts completed' }), el('p', { role: 'status' }, `${operation.attemptedCalls ?? 'Unknown'} of ${operation.plannedAttempts ?? 'unknown'} planned attempts`), el('p', { className: 'muted' }, 'You can close this menu. The burn will continue.'));
      children.push(actionButton('Cancel burn', () => model.cancelBurn(), { disabled: busy || operation.state === 'cancel_requested' }));
    } else {
      children.push(el('p', {}, `${operation.removedCalls ?? 'Unknown'} successful deletion calls · ${operation.notFoundCalls ?? 'unknown'} no longer found`), el('p', {}, `${operation.errors ?? 'Unknown'} errors · ${operation.unattemptedCalls ?? 'unknown'} unattempted · ${operation.safetySkips ?? 'unknown'} safety skips`));
      if (operation.state === 'canceled' || operation.state === 'interrupted') children.push(notice('Some deletions may already have occurred. Nothing will resume automatically.'));
      if (operation.state === 'partial') children.push(notice('The burn stopped with incomplete coverage or deletion errors.'));
      children.push(actionButton('Dismiss result', () => model.dismiss()));
    }
    children.push(el('small', {}, 'Counts describe native deletion calls. Websites can recreate cookies.'));
  } else if (model.preparing) {
    children.push(notice('Preparing a bounded snapshot and checking every deletion selector…'), el('progress', { 'aria-label': 'Preparing burn preview' }), button('Cancel preview preparation', () => model.cancelPreview()));
  } else if (preview) {
    children.push(el('p', {}, `${preview.eligibleAttempts} estimated deletion attempts`), el('p', {}, `${preview.ruleProtected} rule-protected cookies · ${preview.ambiguous} ambiguous skips`), el('ul', {}, (preview.stores || []).map(store => el('li', {}, typeof store === 'string' ? store : storeLabel(store)))), el('p', { className: 'muted' }, `${preview.skippedStores?.length ?? 0} protected stores skipped. Counts cover enumerated, accessible cookies.`), notice(preview.warning || 'Burning cookies can sign you out. Websites may immediately create new cookies. These counts are estimates.'));
    if (preview.eligibleAttempts === 0) children.push(notice('No eligible deletion is available.'));
    children.push(el('div', { className: 'actions' }, actionButton('Burn cookies', () => model.start(), { className: 'danger', disabled: busy || !preview.eligibleAttempts }), button('Cancel', () => model.cancelPreview(), { disabled: busy })));
  } else {
    children.push(el('p', {}, 'Remove eligible cookies from Normal browsing and your named containers. Protected cookies stay out of the burn.'), actionButton('Preview cookie burn', () => model.makePreview(), { className: 'primary', disabled: busy || !state.capabilities.canBurn }));
    if (!state.capabilities.canBurn) children.push(notice(state.capabilities.reason || 'Burning is unavailable. Review availability in Settings.'));
    if (!state.capabilities.canBurn && /permission|access/i.test(state.capabilities.reason || '')) children.push(button('Restore website access', restoreAccess));
  }
  replace(burner, children);
}
function render() { renderSite(); renderBurner(); renderRuleDialog(); }
function restoreAccess() {
  const request = client.requestHostAccess();
  act(async () => { const result = await request; if (!result.granted) replace(messages, notice(result.guidance)); await model.refresh(); });
}
document.getElementById('settings').addEventListener('click', () => act(() => client.openOptions()));
model.subscribe();
act(() => model.refresh());
