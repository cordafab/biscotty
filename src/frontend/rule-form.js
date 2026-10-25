import { element as el, checkbox, field } from './dom.js';
import { storeLabel } from './models.js';

// Both editors use this conversion, including null versus exact empty strings.
export function editableRule(fields) {
  if (fields.scope === 'selected' && !fields.storeRefs.length) throw new Error('Select at least one store.');
  return { domain: fields.domain, includeSubdomains: fields.includeSubdomains, name: fields.anyName ? null : fields.name, path: fields.anyPath ? null : fields.path, scope: fields.scope === 'all' ? { type: 'all' } : { type: 'selected', storeRefs: fields.storeRefs } };
}
export function createRuleFields(rule, stores, changed = () => {}) {
  const domain = el('input', { value: rule.domain, required: true, autocomplete: 'off' });
  const subdomains = checkbox('Include subdomains', rule.includeSubdomains);
  const anyName = checkbox('Every cookie name', rule.name === null);
  const name = el('input', { value: rule.name ?? '', disabled: rule.name === null });
  const anyPath = checkbox('Every cookie path', rule.path === null);
  const path = el('input', { value: rule.path ?? '', disabled: rule.path === null });
  const scope = el('select', {}, el('option', { value: 'all' }, 'All stores'), el('option', { value: 'selected' }, 'Selected stores'));
  scope.value = rule.scope.type;
  const counts = new Map();
  for (const store of stores) counts.set(storeLabel(store), (counts.get(storeLabel(store)) || 0) + 1);
  const checks = stores.map((store, index) => checkbox(`${storeLabel(store)}${counts.get(storeLabel(store)) > 1 ? ` · ${store.color || 'default color'} · ${store.icon || 'container'} · store ${index + 1}` : ''}${store.availability === 'inactive' ? ' · inactive' : ''}`, rule.scope.storeRefs?.includes(store.ref), { value: store.ref }));
  const selected = el('fieldset', { hidden: scope.value !== 'selected' }, el('legend', {}, 'Stores protected by this rule'), checks.map(check => check.node));
  const node = el('fieldset', {}, el('legend', {}, 'Protection rule'), field('Cookie domain', domain, 'Exact cookie domain unless Include subdomains is selected.'), subdomains.node, anyName.node, field('Exact cookie name', name), anyPath.node, field('Exact cookie path', path), field('Store scope', scope), selected);
  function read() { return editableRule({ domain: domain.value, includeSubdomains: subdomains.input.checked, anyName: anyName.input.checked, name: name.value, anyPath: anyPath.input.checked, path: path.value, scope: scope.value, storeRefs: checks.filter(check => check.input.checked).map(check => check.input.value) }); }
  node.addEventListener('input', () => { name.disabled = anyName.input.checked; path.disabled = anyPath.input.checked; selected.hidden = scope.value !== 'selected'; changed(); });
  node.addEventListener('change', () => { name.disabled = anyName.input.checked; path.disabled = anyPath.input.checked; selected.hidden = scope.value !== 'selected'; changed(); });
  return { node, read };
}
