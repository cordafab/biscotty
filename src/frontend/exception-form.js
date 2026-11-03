import { element as el, checkbox, field } from './dom.js';
import { storeLabel } from './models.js';

export function editableException(fields) {
  if (fields.scope === 'selected' && !fields.storeRefs.length) throw new Error('Select at least one store.');
  return { cookieDomain: fields.cookieDomain, cookieIncludeSubdomains: fields.cookieIncludeSubdomains, topLevelDomain: fields.topLevelDomain, topLevelIncludeSubdomains: fields.topLevelIncludeSubdomains, scheme: fields.scheme, name: fields.anyName ? null : fields.name, path: fields.anyPath ? null : fields.path, scope: fields.scope === 'all' ? { type: 'all' } : { type: 'selected', storeRefs: fields.storeRefs }, enabled: fields.enabled };
}
// This form only collects a draft. The backend validates the complete policy.
export function createExceptionFields(exception, stores) {
  const cookieDomain = el('input', { value: exception.cookieDomain, required: true, autocomplete: 'off' });
  const cookieSubdomains = checkbox('Include cookie subdomains', exception.cookieIncludeSubdomains);
  const topLevelDomain = el('input', { value: exception.topLevelDomain, required: true, autocomplete: 'off' });
  const topLevelSubdomains = checkbox('Include main site subdomains', exception.topLevelIncludeSubdomains);
  const scheme = el('select', {}, el('option', { value: 'all' }, 'HTTP and HTTPS'), el('option', { value: 'http' }, 'HTTP only'), el('option', { value: 'https' }, 'HTTPS only'));
  scheme.value = exception.scheme;
  const anyName = checkbox('Every cookie name', exception.name === null);
  const name = el('input', { value: exception.name ?? '', disabled: exception.name === null });
  const anyPath = checkbox('Every cookie path', exception.path === null);
  const path = el('input', { value: exception.path ?? '', disabled: exception.path === null });
  const scope = el('select', {}, el('option', { value: 'all' }, 'All stores'), el('option', { value: 'selected' }, 'Selected stores'));
  scope.value = exception.scope.type;
  const checks = stores.map((store, index) => checkbox(`${storeLabel(store)} · ${store.kind === 'normal' ? 'Normal browsing' : `container ${index + 1}`}${store.availability === 'inactive' ? ' · inactive' : ''}`, exception.scope.storeRefs?.includes(store.ref), { value: store.ref }));
  const selected = el('fieldset', { hidden: scope.value !== 'selected' }, el('legend', {}, 'Stores covered by this exception'), checks.map(check => check.node));
  const enabled = checkbox('Enabled', exception.enabled);
  const node = el('fieldset', {}, el('legend', {}, 'Partition exception'), field('Cookie domain', cookieDomain), cookieSubdomains.node, field('Main site domain', topLevelDomain), topLevelSubdomains.node, field('Main site scheme', scheme), anyName.node, field('Exact cookie name', name), anyPath.node, field('Exact cookie path', path), field('Store scope', scope), selected, enabled.node);
  const update = () => { name.disabled = anyName.input.checked; path.disabled = anyPath.input.checked; selected.hidden = scope.value !== 'selected'; };
  node.addEventListener('input', update); node.addEventListener('change', update);
  return { node, read() {
    const storeRefs = checks.filter(check => check.input.checked).map(check => check.input.value);
    return editableException({ cookieDomain: cookieDomain.value, cookieIncludeSubdomains: cookieSubdomains.input.checked, topLevelDomain: topLevelDomain.value, topLevelIncludeSubdomains: topLevelSubdomains.input.checked, scheme: scheme.value, anyName: anyName.input.checked, name: name.value, anyPath: anyPath.input.checked, path: path.value, scope: scope.value, storeRefs, enabled: enabled.input.checked });
  } };
}
