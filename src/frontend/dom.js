export function element(tag, attributes = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'className') node.className = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'hidden') node[key] = Boolean(value);
    else if (key === 'value') node.value = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) node.append(typeof child === 'object' ? child : document.createTextNode(String(child)));
  return node;
}
export function button(label, click, attributes = {}) { return element('button', { type: 'button', onclick: click, ...attributes }, label); }
export function field(label, control, hint) { return element('label', { className: 'field' }, element('span', {}, label), control, hint ? element('small', {}, hint) : null); }
export function checkbox(label, checked = false, attributes = {}) { const input = element('input', { type: 'checkbox', checked, ...attributes }); return { input, node: element('label', { className: 'check' }, input, element('span', {}, label)) }; }
export const replace = (node, ...children) => node.replaceChildren(...children.flat(Infinity).filter(Boolean));
export function notice(text, kind = 'info') { return element('p', { className: `notice ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, text); }
export function showError(error, target = document.getElementById('messages')) {
  const suffix = ['REVISION_CONFLICT', 'STALE_SITE_CONTEXT', 'STALE_PREVIEW', 'STALE_IMPORT'].includes(error?.code) ? ' Refresh the saved state and review again.' : '';
  replace(target, notice((error?.message || 'The action could not finish.') + suffix, 'error'));
  target.focus?.();
}
export function valueDescription(value) { return typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
export function helpControl(label, explanation) {
  const dialog = element('dialog', { className: 'help-dialog', 'aria-label': label }, element('h2', {}, label), element('p', {}, explanation));
  const close = button('Close', () => dialog.close());
  dialog.append(close);
  return element('span', { className: 'help-control' }, button('i', () => dialog.showModal(), { className: 'info', 'aria-label': `About ${label}`, 'aria-haspopup': 'dialog' }), dialog);
}
