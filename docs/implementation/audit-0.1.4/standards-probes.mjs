// Independent publication-audit probes. No existing test fixtures or results are used.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { normalizeDomain, normalizeRule, validateConfiguration } from '../../../src/core/configuration/index.js';
import { matchCookie, assessSelector } from '../../../src/core/policy/index.js';
import { parsePortableText, validatePortable, createImportPlan, resolveImportPlan, serializePortable } from '../../../src/core/transfer/index.js';
import { createGateway } from '../../../src/backend/gateway/gateway.js';
import { createHandles } from '../../../src/backend/gateway/handles.js';
import { createEditorModel, createImportModel } from '../../../src/frontend/models.js';
import { element } from '../../../src/frontend/dom.js';

const results = [];
async function probe(name, run) {
  const started = performance.now();
  try { const details = await run(); results.push({ name, passed: true, ms: performance.now() - started, ...details }); }
  catch (error) { results.push({ name, passed: false, error: { name: error.name, message: error.message, stack: error.stack } }); }
}
const base = () => ({ schemaVersion: 1, revision: 1, containerBindings: [], protectedContainerRefs: [], rules: [] });
const fact = host => ({ host, knownSuffix: false, kind: host.startsWith('[') ? 'ipv6' : /^\d+(\.\d+){3}$/.test(host) ? 'ipv4' : 'dns' });
const rule = (changes = {}) => ({ domain: 'example.test', includeSubdomains: false, name: null, path: null, scope: { type: 'all' }, ...changes });
const sender = { id: 'audit@example.test', url: 'moz-extension://audit/src/frontend/options.html', documentId: 'document-a', frameId: 0, tab: { id: 1, incognito: false } };
const request = (action = 'getState', payload = {}, changes = {}) => ({ protocolVersion: 1, requestId: crypto.randomUUID(), action, payload, expectedRevision: 1, ...changes });

await probe('domain and rule validation reject ambiguous or executable inputs', () => {
  for (const input of ['https://example.test', 'example.test:80', 'a@example.test', 'example.test/a', 'example.test?x', 'example.test#x', '*.example.test', 'example%2etest', 'example.test\\evil', 'a..test', '<script>']) assert.throws(() => normalizeDomain(input));
  assert.equal(normalizeDomain('.EXAMPLE.TEST.'), 'example.test');
  assert.equal(normalizeDomain('bücher.test'), 'xn--bcher-kva.test');
  assert.throws(() => normalizeRule(rule(), { 'example.test': { ...fact('example.test'), knownSuffix: true } }));
  assert.throws(() => normalizeRule(rule({ domain: '[::1]', includeSubdomains: true }), { '[::1]': fact('[::1]') }));
  assert.throws(() => normalizeRule(rule({ name: 'a'.repeat(4097) }), { 'example.test': fact('example.test') }));
  assert.throws(() => validateConfiguration({ ...base(), rules: [rule(), rule()] }, { 'example.test': fact('example.test') }));
  assert.throws(() => validateConfiguration({ ...base(), rules: [rule({ scope: { type: 'selected', storeRefs: ['missing'] } })] }, { 'example.test': fact('example.test') }));
  assert.throws(() => validateConfiguration({ ...base(), rules: [rule({ scope: { type: 'selected', storeRefs: [] } })] }, { 'example.test': fact('example.test') }));
});

await probe('selector protection property across domain, path, name and store scopes', () => {
  let comparisons = 0;
  const domains = ['example.test', 'sub.example.test', 'deep.sub.example.test', 'other.test'];
  const paths = ['/', '/a', '/a/', '/a/b', '/ab'];
  const scopes = [{ type: 'all' }, { type: 'selected', storeRefs: ['normal'] }, { type: 'selected', storeRefs: ['work'] }];
  for (const domain of domains) for (const includeSubdomains of [false, true]) for (const name of [null, 'sid', 'other']) for (const path of [null, ...paths]) for (const scope of scopes) {
    const config = { ...base(), rules: [rule({ domain, includeSubdomains, name, path, scope })] };
    for (const host of domains) for (const requestPath of paths) for (const storeRef of ['normal', 'work']) {
      const selector = { model: 'firefox-url-v1', url: `https://${host}${requestPath}`, name: 'sid', storeRef, firstPartyDomain: '', partitionKey: null };
      const assessment = assessSelector(selector, config, storeRef);
      for (const cookieDomain of domains) for (const cookiePath of paths) {
        const selectedDomain = host === cookieDomain || host.endsWith(`.${cookieDomain}`);
        const selectedPath = requestPath === cookiePath || (requestPath.startsWith(cookiePath) && (cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/'));
        if (!selectedDomain || !selectedPath) continue;
        const protectedCookie = matchCookie({ domain: cookieDomain, name: 'sid', path: cookiePath }, config, storeRef).protected;
        if (protectedCookie) assert.notEqual(assessment.status, 'safe', JSON.stringify({ selector, rule: config.rules[0], cookieDomain, cookiePath }));
        comparisons++;
      }
    }
  }
  assert.equal(assessSelector({ model: 'unknown' }, base(), 'normal').status, 'unknown');
  assert.equal(matchCookie({ domain: 'bad/host', name: 'sid', path: '/' }, base(), 'normal').protected, true);
  return { comparisons };
});

await probe('import rejects oversized, undeclared and prototype-shaped fields', () => {
  const portable = { format: 'biscotty-config', schemaVersion: 1, containers: [], protectedContainerRefs: [], rules: [] };
  assert.throws(() => parsePortableText(' '.repeat(2097153)));
  assert.throws(() => parsePortableText('{'));
  assert.throws(() => validatePortable(JSON.parse(JSON.stringify(portable).replace('"rules":[]', '"rules":[],"__proto__":{"polluted":true}')), {}));
  assert.equal(Object.prototype.polluted, undefined);
  assert.throws(() => validatePortable({ ...portable, rules: [rule({ scope: { type: 'selected', storeRefs: ['ghost'] } })] }, { 'example.test': fact('example.test') }));
  assert.throws(() => validatePortable({ ...portable, containers: [{ ref: 'normal', name: 'x', color: '', icon: '', state: 'inactive' }] }, {}));
});

await probe('all import conflict choices preserve exact reviewed store scopes', () => {
  const existing = { ...base(), containerBindings: [{ ref: 'work', cookieStoreId: 'firefox-container-1', name: 'Work', color: 'blue', icon: 'briefcase', state: 'active' }], rules: [rule({ scope: { type: 'selected', storeRefs: ['normal'] } })] };
  const source = { format: 'biscotty-config', schemaVersion: 1, containers: [{ ref: '__proto__', name: '<img src=x onerror=alert(1)>', color: 'blue', icon: 'briefcase', state: 'active' }], protectedContainerRefs: [], rules: [rule({ scope: { type: 'selected', storeRefs: ['__proto__'] } })] };
  for (const mode of ['merge', 'replace']) for (const choice of ['existing', 'imported', 'combine']) {
    const plan = createImportPlan({ existing, source, mode, mappings: [{ sourceRef: '__proto__', action: 'map', targetRef: 'work' }] });
    const unresolved = resolveImportPlan(plan);
    assert.equal(unresolved.canCommit, false);
    const final = resolveImportPlan(plan, [{ conflictId: plan.conflicts[0].id, choice }], { replace: true });
    assert.equal(final.canCommit, true);
    const expected = choice === 'existing' ? ['normal'] : choice === 'imported' ? ['work'] : ['normal', 'work'];
    assert.deepEqual(final.candidate.rules[0].scope.storeRefs, expected);
    validateConfiguration(final.candidate, { 'example.test': fact('example.test') });
    assert.ok(serializePortable(final.candidate).includes('biscotty-config'));
  }
  const retained = resolveImportPlan(createImportPlan({ existing: base(), source, mode: 'merge', mappings: [{ sourceRef: '__proto__', action: 'retain' }] }));
  assert.equal(retained.candidate.containerBindings[0].state, 'inactive');
  assert.equal(retained.candidate.containerBindings[0].cookieStoreId, null);
  assert.equal(Object.prototype.polluted, undefined);
});

await probe('gateway rejects webpages, other extensions, private pages, query and fragment variants', async () => {
  let calls = 0;
  const dispatch = createGateway({ extensionId: sender.id, baseURL: 'moz-extension://audit/', handlers: { getState: () => { calls++; return {}; } } });
  for (const variant of [undefined, {}, { ...sender, id: 'other' }, { ...sender, url: 'https://example.test' }, { ...sender, url: sender.url + '?q=1' }, { ...sender, url: sender.url + '#x' }, { ...sender, url: sender.url + '/x' }, { ...sender, tab: { id: 1, incognito: true } }]) {
    const result = await dispatch(request(), variant);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'INVALID_REQUEST');
  }
  assert.equal(calls, 0);
  assert.equal((await dispatch(request(), sender)).ok, true);
  assert.equal(calls, 1);
});

await probe('gateway deduplication, ownership and capacity precede mutation effects', async () => {
  let calls = 0;
  let resolve;
  const pending = new Promise(done => { resolve = done; });
  const dispatch = createGateway({ extensionId: sender.id, baseURL: 'moz-extension://audit/', limits: { entries: 1, bytes: 10000, ttl: 60000 }, handlers: { saveSiteRule: async () => { calls++; await pending; return { committed: true }; } } });
  const payload = request('saveSiteRule');
  const first = dispatch(payload, sender);
  await new Promise(done => setTimeout(done, 10));
  const duplicate = dispatch(payload, sender);
  const altered = await dispatch({ ...payload, payload: { rule: 'different' } }, sender);
  assert.equal(altered.error.code, 'INVALID_REQUEST');
  const otherOwner = await dispatch(payload, { ...sender, documentId: 'document-b' });
  assert.equal(otherOwner.error.code, 'REQUEST_CAPACITY');
  const atCapacity = await dispatch(request('saveSiteRule'), sender);
  assert.equal(atCapacity.error.code, 'REQUEST_CAPACITY');
  resolve();
  const [one, two] = await Promise.all([first, duplicate]);
  assert.deepEqual(one, two);
  assert.equal(calls, 1);
});

await probe('opaque handles bind kind and document owner', () => {
  const handles = createHandles();
  const token = handles.issue('import', 'document-a', { safe: true });
  assert.deepEqual(handles.get(token, 'import', 'document-a'), { safe: true });
  assert.throws(() => handles.get(token, 'burn', 'document-a'));
  assert.throws(() => handles.get(token, 'import', 'document-b'));
  handles.invalidate();
  assert.throws(() => handles.get(token, 'import', 'document-a'));
});

await probe('DOM helper appends hostile labels as text, without HTML parsing', () => {
  const previous = globalThis.document;
  let textCreations = 0;
  const nodes = [];
  globalThis.document = {
    createElement(tag) { const node = { tag, children: [], attributes: {}, append(child) { this.children.push(child); }, setAttribute(name, value) { this.attributes[name] = value; }, addEventListener() {} }; nodes.push(node); return node; },
    createTextNode(text) { textCreations++; return { text }; }
  };
  try {
    const hostile = '<svg onload=alert(document.cookie)><script>alert(1)</script>';
    const result = element('p', {}, hostile);
    assert.deepEqual(result.children, [{ text: hostile }]);
    assert.equal(textCreations, 1);
    assert.deepEqual(nodes.map(node => node.tag), ['p']);
  } finally { globalThis.document = previous; }
});

await probe('frontend dirty editor preserves drafts and import requires every mapping', async () => {
  const state = { revision: 1, configuration: { rules: [], protectedContainerRefs: [] }, stores: [{ ref: 'work', kind: 'container', availability: 'available' }], capabilities: { canChangeProtection: true }, operation: null };
  const client = { getState: async () => structuredClone(state), saveConfiguration: async () => { throw Object.assign(new Error('changed'), { code: 'REVISION_CONFLICT' }); } };
  const editor = createEditorModel(client);
  await editor.refresh();
  editor.edit(draft => draft.rules.push(rule()));
  state.revision = 2;
  await editor.refresh();
  assert.equal(editor.stale, true);
  assert.equal(editor.draft.rules.length, 1);
  await assert.rejects(editor.save(), { code: 'REVISION_CONFLICT' });
  assert.equal(editor.draft.rules.length, 1);
  const importer = createImportModel(client, editor);
  importer.inspection = { containers: [{ ref: '__proto__' }, { ref: 'second' }] };
  importer.mappingChoices.set('__proto__', 'map:work');
  assert.throws(() => importer.mappingDecisions());
  importer.mappingChoices.set('second', 'retain');
  assert.deepEqual(importer.mappingDecisions(), [{ sourceRef: '__proto__', action: 'map', targetRef: 'work' }, { sourceRef: 'second', action: 'retain' }]);
});

const output = { generatedAt: new Date().toISOString(), node: process.version, platform: process.platform, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, results };
await writeFile(process.argv[2] || new URL('standards-results.json', import.meta.url), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
if (output.failed) process.exitCode = 1;
