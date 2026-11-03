import { createRuleFields } from './rule-form.js';
import { createExceptionFields } from './exception-form.js';
import { client } from '../backend/client/native.js';
import { createPopupModel, operationActive, operationTitle, siteStatus, reasonText, storeLabel } from './models.js';
import { element as el, button, replace, notice, showError, helpControl } from './dom.js';
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
const cookieDialog = document.getElementById('cookies-dialog');
const cookieContent = document.getElementById('cookies-content');
const cookieHelp = 'A third-party jar groups cookies from another domain for one main site and container. Stored association does not prove transmission or use. Cookie values are never shown.';
const sharedHelp = 'Unpartitioned cookies are not isolated for one main site. They may be shared between sites in the same container. Firefox cannot reliably identify every site using them. Changing protection can affect other sites.';
function renderSite() {
  const view = model.site;
  if (!view) return;
  const locked = operationActive(model.state?.operation), controls = view.controls || {};
  const selector = el('select', { id: 'site-store', 'aria-label': 'Container for protection and cookies', disabled: busy || Boolean(model.ruleEditor || model.exceptionEditor) }, (model.state?.stores || []).filter(store => store.availability === 'available').map(store => el('option', { value: store.ref, selected: store.ref === model.selectedStoreRef }, storeLabel(store))));
  if (model.selectedStoreRef && ![...selector.options].some(option => option.value === model.selectedStoreRef)) selector.append(el('option', { value: model.selectedStoreRef, selected: true }, 'Unavailable store'));
  selector.addEventListener('change', () => act(() => model.selectStore(selector.value)));
  const target = view.target;
  const children = [el('div', { className: 'site-heading' }, el('h2', { className: 'site-target' }, target?.domain || 'Site unavailable'), target ? el('small', {}, target.includeSubdomains ? 'Includes subdomains ' : 'Exact host only ', helpControl('Domain scope', `Quick protection covers ${target.domain}${target.includeSubdomains ? ' and its subdomains' : ' only'} in the selected container. It includes every cookie name and path.`)) : null), el('label', { className: 'field' }, el('span', {}, 'Container'), selector), el('div', { className: `protection-state state-${view.status}` }, el('span', { className: 'state-symbol', 'aria-hidden': 'true' }, view.status === 'full' ? '✓' : view.status === 'partial' ? '◐' : '◇'), el('div', {}, el('strong', {}, siteStatus(view.status)), el('small', {}, storeLabel(view.store))), helpControl('Saved protection', reasonText(view.reasons) || 'No saved protection applies. Site status describes the current domain, not every third-party jar. Preserved cookies are skipped by Biscotty; Firefox and websites can still change them.'))];
  if (!target) children.push(notice(reasonText(view.reasons) || 'Site protection is unavailable on this page.'));
  if (model.domainStale) children.push(notice('Site or protection changed. Refresh before making changes.'));
  const actions = [];
  if (controls.canProtect) actions.push(actionButton('Preserve domain', () => model.protect(true), { className: 'primary', disabled: busy || locked || model.domainStale }));
  if (controls.canRemove) actions.push(actionButton('Remove domain protection', () => model.protect(false), { disabled: busy || locked || model.domainStale }));
  if (controls.editorRequired || view.status === 'partial' || view.status === 'full') actions.push(actionButton('Manage protection', () => client.openOptions({ ...(view.store?.ref ? { storeRef: view.store.ref } : {}) })));
  actions.push(button('View cookies →', () => {
    document.getElementById('cookies-heading').textContent = target?.domain || 'Site cookies';
    cookieDialog.showModal(); renderCookieDialog(); act(() => model.loadSiteCookies());
  }, { id: 'view-cookies', disabled: busy || !view.contextToken || model.domainStale, className: 'view-cookies', 'aria-haspopup': 'dialog' }));
  if (locked) children.push(notice('Protection changes are paused during the burn.'));
  children.push(el('div', { className: 'quick-actions' }, actions));
  replace(site, children);
}
function cookieDetails(cookie, index) {
  return el('details', { id: `cookie-detail-${index}`, className: 'cookie-metadata' }, el('summary', {}, cookie.name || '(empty name)', el('span', { className: 'pill' }, cookie.protected ? 'Preserved' : 'Burnable')), el('dl', {}, el('dt', {}, 'Domain'), el('dd', {}, cookie.domain), el('dt', {}, 'Path'), el('dd', {}, cookie.path), el('dt', {}, 'Partition'), el('dd', {}, cookie.partitionLabel), el('dt', {}, 'Flags'), el('dd', {}, [cookie.secure ? 'Secure' : '', cookie.httpOnly ? 'HttpOnly' : '', cookie.session ? 'Session' : 'Persistent'].filter(Boolean).join(' · '))), cookie.reasons?.length ? el('small', {}, reasonText(cookie.reasons)) : null);
}
function renderDomains() {
  const content = [];
  if (model.coverage?.state === 'partial') content.push(notice(model.coverage.reason || 'Some stored-cookie associations are unavailable.'));
  if (model.domainStale) content.push(notice('This snapshot is stale. Refresh and review before editing.'));
  if (model.domainStatus === 'loading') content.push(el('p', { role: 'status' }, 'Loading cookie groups…'));
  if (model.domainStatus === 'empty') content.push(el('p', { className: 'empty' }, 'No associated stored cookies found. This does not establish that third-party cookies are absent.'));
  if (['unavailable', 'error'].includes(model.domainStatus)) content.push(notice(model.domainError?.message || 'Cookie groups are unavailable. Refresh to try again.'));
  for (const [group, title] of [['own', 'Main-site cookies'], ['unpartitioned', 'Unpartitioned cookies'], ['third-party', 'Third-party jars']]) {
    const rows = model.domains.filter(row => row.group === group || (!row.group && group === 'own'));
    if (!rows.length) continue;
    content.push(el('h3', { className: 'cookie-group-title' }, title, helpControl(title, group === 'unpartitioned' ? sharedHelp : cookieHelp)));
    content.push(rows.map(row => {
      const index = model.domains.indexOf(row);
      const metadata = model.cookies.filter(cookie => cookie.domain.replace(/^\./, '') === row.domain && (group === 'unpartitioned' ? cookie.association?.kind === 'unpartitioned' : cookie.association?.kind === 'partitioned' && (group === 'third-party' ? cookie.association.relationship === 'third-party' : cookie.association.relationship === 'own')));
      return el('details', { id: `domain-group-${index}`, className: 'cookie-domain-group' }, el('summary', {}, el('strong', {}, row.domain), el('small', {}, `${row.cookieCount} ${row.cookieCount === 1 ? 'cookie' : 'cookies'} · ${siteStatus(row.status)}`)), el('div', { className: 'actions' }, button('Edit protection', () => model.openSiteRule(row), { id: `domain-pencil-${index}`, 'aria-label': `Edit protection for ${row.domain}`, disabled: busy || model.domainStale || operationActive(model.state?.operation) }), group === 'third-party' && typeof client.saveSiteException === 'function' ? button('Add exception', () => model.openSiteException(row), { disabled: busy || model.domainStale || operationActive(model.state?.operation) }) : null), metadata.map(cookie => cookieDetails(cookie, model.cookies.indexOf(cookie))), !metadata.length ? el('small', {}, model.cookieStatus === 'loading' ? 'Loading metadata…' : 'No metadata on the loaded pages.') : null);
    }));
  }
  if (model.nextPageToken) content.push(actionButton('Load more groups', () => model.loadMoreDomains(), { disabled: busy || model.domainStale }));
  if (model.cookieStatus === 'loading') content.push(el('p', { role: 'status' }, 'Loading cookie metadata…'));
  if (model.cookieError) content.push(notice(model.cookieError.message, 'error'));
  if (model.cookieStatus === 'idle' || model.cookieStatus === 'error') content.push(actionButton('Load cookie details', () => model.loadSiteCookies(), { disabled: busy || model.domainStale }));
  if (model.nextCookiePageToken) content.push(actionButton('Load more cookies', () => model.loadSiteCookies(true), { disabled: busy || model.domainStale }));
  return content;
}
function renderCookieDialog() {
  if (!cookieDialog.open) return;
  const expanded = new Set([...cookieContent.querySelectorAll('details[open]')].map(node => node.id));
  const focusedId = document.activeElement?.id;
  document.getElementById('cookies-heading').textContent = model.site?.target?.domain || 'Site unavailable';
  document.getElementById('cookies-store').textContent = `Site cookies · ${storeLabel(model.site?.store)}`;
  replace(cookieContent, renderDomains());
  for (const node of cookieContent.querySelectorAll('details')) if (expanded.has(node.id)) node.open = true;
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
}
document.getElementById('close-cookies').addEventListener('click', () => cookieDialog.close());
document.getElementById('refresh-cookies').addEventListener('click', () => act(async () => { await model.refresh(); await model.loadSiteCookies(); }));
const dialog = document.getElementById('site-rule-dialog');
const exceptionDialog = el('dialog', { 'aria-label': 'Partition exception' });
const exceptionArea = el('div'), exceptionNotice = el('div'), exceptionError = el('div', { role: 'alert', tabindex: '-1' });
const exceptionSave = el('button', { type: 'submit', className: 'primary' }, 'Save exception');
const exceptionCancel = button('Cancel', () => model.cancelSiteException());
const exceptionForm = el('form', {}, el('h2', {}, 'Partition exception'), el('p', {}, 'This persistent exception can make matching third-party cookies burnable during a manual burn. Whole-container protection and safety checks still apply.'), exceptionArea, exceptionNotice, exceptionError, el('div', { className: 'actions' }, exceptionSave, exceptionCancel));
exceptionDialog.append(exceptionForm); document.body.append(exceptionDialog);
let shownException = null, exceptionFields;
exceptionForm.addEventListener('submit', async event => { event.preventDefault(); try { await model.saveSiteException(exceptionFields.read()); } catch (error) { showError(error, exceptionError); } });
exceptionDialog.addEventListener('cancel', event => { event.preventDefault(); model.cancelSiteException(); });
function renderExceptionDialog() {
  const editor = model.exceptionEditor;
  if (!editor) { if (exceptionDialog.open) exceptionDialog.close(); shownException = null; return; }
  if (editor !== shownException) { shownException = editor; exceptionFields = createExceptionFields(editor.exception, model.state.stores); replace(exceptionArea, exceptionFields.node); if (!exceptionDialog.open) exceptionDialog.showModal(); }
  replace(exceptionNotice, editor.reviewRequired ? notice('The page or saved settings changed. Your draft is preserved. Cancel, refresh Current site, and review before saving.') : null);
  if (editor.error) showError(editor.error, exceptionError); else replace(exceptionError);
  exceptionFields.node.disabled = editor.saving; exceptionSave.disabled = editor.saving || editor.reviewRequired || model.domainStale || !model.state.capabilities.canChangeProtection || operationActive(model.state.operation); exceptionCancel.disabled = editor.saving;
}
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
  const children = [el('div', { className: 'burner-heading' }, el('h2', {}, operation ? operationTitle(operation) : preview ? 'Review this burn' : 'Cookie burner'), helpControl('Cookie burner', 'A manual burn covers Normal browsing and every eligible named container. The selected container does not limit the burner. Protected cookies and containers are skipped; safety checks still apply.'))];
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
    if (preview.skippedStores?.length) children.push(el('p', {}, `Whole-container protection skipped: ${preview.skippedStores.map(store => typeof store === 'string' ? store : storeLabel(store)).join(', ')}.`));
    if (Number.isInteger(preview.exceptionEligible)) children.push(el('p', {}, `${preview.exceptionEligible} estimated attempts match partition exceptions. ${preview.exceptionSafetySkips || 0} matching cookies were skipped because deletion could affect protected cookies.`));
    if (preview.exceptionExamples?.length) children.push(el('p', {}, 'Examples of exception overrides (up to five):'), el('ul', {}, preview.exceptionExamples.map(example => el('li', {}, `${example.domain}: exception ${example.matchingExceptionIndexes.map(index => index + 1).join(', ')} overrides allow rule ${example.overriddenRuleIndexes.map(index => index + 1).join(', ')}.`))));
    if (preview.eligibleAttempts === 0) children.push(notice('No eligible deletion is available.'));
    children.push(el('div', { className: 'actions' }, actionButton('Burn cookies', () => model.start(), { className: 'danger', disabled: busy || !preview.eligibleAttempts }), button('Cancel', () => model.cancelPreview(), { disabled: busy })));
  } else {
    children.push(actionButton('Preview burn ↗', () => model.makePreview(), { className: 'burn-preview', disabled: busy || !state.capabilities.canBurn }), el('p', { className: 'scope-caption' }, 'All eligible containers'));
    if (!state.capabilities.canBurn) children.push(notice(state.capabilities.reason || 'Burning is unavailable. Review availability in Settings.'));
    if (!state.capabilities.canBurn && /permission|access/i.test(state.capabilities.reason || '')) children.push(button('Restore website access', restoreAccess));
  }
  replace(burner, children);
}
function render() { const focusedId = document.activeElement?.id; renderSite(); renderBurner(); renderCookieDialog(); renderRuleDialog(); renderExceptionDialog(); if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true }); }
function restoreAccess() {
  const request = client.requestHostAccess();
  act(async () => { const result = await request; if (!result.granted) replace(messages, notice(result.guidance)); await model.refresh(); });
}
document.getElementById('refresh-site').addEventListener('click', () => act(() => model.refresh()));
document.getElementById('settings').addEventListener('click', () => act(() => client.openOptions()));
document.getElementById('settings-icon').addEventListener('click', () => act(() => client.openOptions()));
model.subscribe();
act(() => model.refresh());
