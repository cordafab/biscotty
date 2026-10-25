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
  if (view.status === 'unavailable') actions.push(actionButton('Refresh current site', () => model.refresh()));
  if (locked) children.push(notice('Protection changes are paused while a burn runs.'));
  children.push(el('div', { className: 'actions' }, actions), el('small', {}, 'This target may not include third-party cookies. Protection does not guarantee a login session.'));
  replace(site, children);
}
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
function render() { renderSite(); renderBurner(); }
function restoreAccess() {
  const request = client.requestHostAccess();
  act(async () => { const result = await request; if (!result.granted) replace(messages, notice(result.guidance)); await model.refresh(); });
}
document.getElementById('settings').addEventListener('click', () => act(() => client.openOptions()));
model.subscribe();
act(() => model.refresh());
