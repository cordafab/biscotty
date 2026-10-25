import { element, checkbox, field } from '../../src/frontend/dom.js';
const hostile = '<img src=x onerror="globalThis.attacked=true"><script>globalThis.attacked=true</script>';
const fixture = document.getElementById('fixture');
const text = element('p', {}, hostile);
fixture.append(text);
const control = checkbox(hostile);
fixture.append(field('Test field', control.node));
const results = [];
function check(name, condition) { results.push(`${condition ? 'PASS' : 'FAIL'} ${name}`); if (!condition) throw new Error(name); }
check('UI-A11 imported and cookie-derived HTML renders as inert text', text.textContent === hostile && !text.querySelector('img, script') && !globalThis.attacked);
check('UI-A12 checkbox is natively keyboard-accessible and labeled', control.input.closest('label').textContent === hostile && control.input.type === 'checkbox');
check('UI-A35 controls use native accessible form semantics', fixture.querySelectorAll('label').length >= 2);
document.getElementById('results').textContent = results.join('\n');
fixture.remove();
