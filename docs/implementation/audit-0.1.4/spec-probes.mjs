import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createApplication } from '../../../src/backend/gateway/application.js';
import { createObservations } from '../../../src/backend/firefox/observations.js';

// Fresh audit fixtures; no imports from the repository's existing test harness.
const copy = value => structuredClone(value);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const empty = () => ({ schemaVersion: 1, revision: 0, containerBindings: [], protectedContainerRefs: [], rules: [] });
const cookie = (changes = {}) => ({ domain: 'eligible.example', name: 'sid', path: '/', hostOnly: true, secure: true, httpOnly: true, session: true, firstPartyDomain: '', partitionKey: null, ...changes });
const rule = (changes = {}) => ({ domain: 'protected.example', includeSubdomains: false, name: null, path: null, scope: { type: 'all' }, ...changes });
const sender = { id: 'fresh-audit@example', url: 'moz-extension://fresh-audit/src/frontend/options.html', documentId: 'settings-document', tab: { id: 99 }, frameId: 0 };
function fixture(options = {}) {
  const state = { configuration: options.configuration === undefined ? empty() : copy(options.configuration), marker: options.marker ?? null, current: null, observations: {}, access: { granted: true, available: true }, catalog: { normalStoreId: 'firefox-default', containers: copy(options.containers ?? []) }, cookies: copy(options.cookies ?? { 'firefox-default': [cookie()] }), deletes: [], writes: [], listeners: [], activity: null };
  const adapter = {
    async readConfigurationRecord() { return copy(state.configuration); },
    async writeConfigurationRecord(record) { state.configuration = copy(record); state.writes.push('configuration'); },
    async readMarker() { return state.marker; },
    async writeMarker(id) { if (options.failMarker) throw Error('synthetic marker failure'); state.marker = id; },
    async clearMarker() { state.marker = null; },
    async readCurrentOperation() { return copy(state.current); },
    async writeCurrentOperation(value) { if (options.onOperationWrite) await options.onOperationWrite(copy(value)); state.current = copy(value); },
    async clearCurrentOperation() { state.current = null; },
    async readSiteObservations() { return copy(state.observations); },
    async writeSiteObservations(records) { state.observations = copy(records); },
    async clearSiteObservation() { state.observations = {}; },
    async getAccess() { return copy(state.access); },
    async getCatalog() { return copy(state.catalog); },
    async getActiveTab() { return { id: 1, url: 'https://eligible.example/private/path?secret=never-retain', cookieStoreId: 'firefox-default', incognito: false }; },
    async classifyHost(host) { return { host, kind: 'dns', knownSuffix: ['com', 'example'].includes(host), baseDomain: host.split('.').slice(-2).join('.') }; },
    async listCookies(storeId) { return copy(state.cookies[storeId] ?? []); },
    async removeCookie(selector) { state.deletes.push(copy(selector)); return options.remove ? options.remove(selector, state) : { removed: true }; },
    onEnvironmentChange(fn) { state.listeners.push(fn); },
    onSiteActivity(fn) { state.activity = fn; },
    broadcast() {},
    async openOptions() {}
  };
  const app = createApplication(adapter, { extensionId: sender.id, baseURL: 'moz-extension://fresh-audit/' });
  const call = async (action, payload = {}, revision = state.configuration?.revision ?? 0, requestId = crypto.randomUUID()) => app.dispatch({ protocolVersion: 1, action, payload, expectedRevision: revision, requestId }, sender);
  const preview = async () => { await app.ready(); const reply = await call('previewBurn'); assert.equal(reply.ok, true, JSON.stringify(reply)); return reply.data; };
  const start = async view => { const reply = await call('startBurn', { previewToken: view.previewToken }); assert.equal(reply.ok, true, JSON.stringify(reply)); return reply.data; };
  return { app, adapter, state, call, preview, start };
}
const results = [];
async function probe(name, test) {
  const start = performance.now();
  try { const evidence = await test(); results.push({ name, status: 'passed', ms: Math.round(performance.now() - start), ...(evidence ? { evidence } : {}) }); }
  catch (error) { results.push({ name, status: 'failed', ms: Math.round(performance.now() - start), error: String(error) }); }
}

await probe('missing settings never initialize empty protection during ordinary startup', async () => {
  const f = fixture({ configuration: null }); await f.app.ready();
  const state = await f.call('getState'); assert.equal(state.data.capabilities.canBurn, false);
  assert.equal((await f.call('previewBurn')).ok, false); assert.equal(f.state.deletes.length, 0); assert.equal(f.state.configuration, null);
});
await probe('invalid settings block burning', async () => {
  const f = fixture({ configuration: { ...empty(), rules: [{ arbitrary: true }] } }); await f.app.ready();
  assert.equal((await f.call('getState')).data.configurationStatus, 'invalid'); assert.equal((await f.call('previewBurn')).ok, false); assert.equal(f.state.deletes.length, 0);
});
await probe('persistent interruption marker blocks a new burn without resuming', async () => {
  const f = fixture({ marker: 'old-operation' }); await f.app.ready();
  const state = (await f.call('getState')).data; assert.equal(state.operation.state, 'interrupted'); assert.equal(state.capabilities.canBurn, false); assert.equal(f.state.deletes.length, 0);
});
await probe('marker write failure prevents all deletion calls', async () => {
  const f = fixture({ failMarker: true }); const preview = await f.preview();
  const start = await f.call('startBurn', { previewToken: preview.previewToken }); assert.equal(start.error.code, 'STORAGE_FAILED'); assert.equal(f.state.deletes.length, 0);
});
await probe('allow rule scope keeps Work protected while Normal remains eligible', async () => {
  const configuration = { ...empty(), containerBindings: [{ ref: 'work', cookieStoreId: 'firefox-container-11', name: 'Work', color: 'blue', icon: 'briefcase', state: 'active' }], rules: [rule({ domain: 'eligible.example', scope: { type: 'selected', storeRefs: ['work'] } })] };
  const f = fixture({ configuration, containers: [{ cookieStoreId: 'firefox-container-11', name: 'Work', color: 'blue', icon: 'briefcase' }], cookies: { 'firefox-default': [cookie()], 'firefox-container-11': [cookie()] } });
  const p = await f.preview(); assert.equal(p.eligibleAttempts, 1); assert.equal(p.ruleProtected, 1); await f.start(p); await f.app.burner.waitForIdle(); assert.deepEqual(f.state.deletes.map(item => item.storeId), ['firefox-default']);
});
await probe('closed-tab protected named container is skipped through catalog discovery', async () => {
  const configuration = { ...empty(), containerBindings: [{ ref: 'work', cookieStoreId: 'firefox-container-11', name: 'Work', color: 'blue', icon: 'briefcase', state: 'active' }], protectedContainerRefs: ['work'] };
  const f = fixture({ configuration, containers: [{ cookieStoreId: 'firefox-container-11', name: 'Work', color: 'blue', icon: 'briefcase' }], cookies: { 'firefox-default': [cookie()], 'firefox-container-11': [cookie()] } });
  const p = await f.preview(); assert.equal(p.eligibleAttempts, 1); assert.equal(p.skippedStores.length, 1); await f.start(p); await f.app.burner.waitForIdle(); assert.equal(f.state.deletes.length, 1);
});
await probe('absent protected parent-domain cookie blocks overlapping selector', async () => {
  const f = fixture({ configuration: { ...empty(), rules: [rule({ domain: 'example.com', name: 'sid', path: '/private' })] }, cookies: { 'firefox-default': [cookie({ domain: 'sub.example.com', path: '/private/child' })] } });
  const p = await f.preview(); assert.equal(p.eligibleAttempts, 0); assert.equal(p.ambiguous, 1); assert.equal(f.state.deletes.length, 0);
});
await probe('uncertain encoded or delimiter paths are conservatively skipped', async () => {
  const f = fixture({ cookies: { 'firefox-default': ['/a%2fb', '/query?x', '/fragment#x', '/a/../b', '/space here', '/back\\slash'].map(path => cookie({ path })) } });
  const p = await f.preview(); assert.equal(p.eligibleAttempts, 0); assert.equal(p.ambiguous, 6);
});
await probe('deletion forwards full partition and first-party identity', async () => {
  const partitionKey = { topLevelSite: 'https://site.example', hasCrossSiteAncestor: true };
  const f = fixture({ cookies: { 'firefox-default': [cookie({ partitionKey, firstPartyDomain: 'site.example' })] } });
  await f.start(await f.preview()); await f.app.burner.waitForIdle(); assert.deepEqual(f.state.deletes[0].partitionKey, partitionKey); assert.equal(f.state.deletes[0].firstPartyDomain, 'site.example');
});
await probe('null deletion results remain not-found rather than removed', async () => {
  const f = fixture({ remove: () => null }); await f.start(await f.preview()); await f.app.burner.waitForIdle();
  assert.equal(f.state.current.removedCalls, 0); assert.equal(f.state.current.notFoundCalls, 1);
});
await probe('individual native failure permits remaining safe bounded attempts', async () => {
  const f = fixture({ cookies: { 'firefox-default': [cookie(), cookie({ name: 'second' })] }, remove: (_s, state) => { if (state.deletes.length === 1) throw Error('synthetic removal failure'); return { removed: true }; } });
  await f.start(await f.preview()); await f.app.burner.waitForIdle(); assert.equal(f.state.deletes.length, 2); assert.equal(f.state.current.state, 'partial'); assert.equal(f.state.current.errors, 1); assert.equal(f.state.current.removedCalls, 1);
});
await probe('cancel during an in-flight native deletion prevents subsequent calls', async () => {
  const entered = deferred(), pending = deferred();
  const f = fixture({ cookies: { 'firefox-default': [cookie(), cookie({ name: 'second' })] }, remove: async () => { entered.resolve(); await pending.promise; return { removed: true }; } });
  const running = await f.start(await f.preview()); await entered.promise;
  assert.equal((await f.call('cancelBurn', { operationId: running.operationId })).ok, true); pending.resolve(); await f.app.burner.waitForIdle(); assert.equal(f.state.deletes.length, 1); assert.equal(f.state.current.state, 'canceled');
});
await probe('protection mutation during burn is rejected', async () => {
  const entered = deferred(), pending = deferred();
  const f = fixture({ remove: async () => { entered.resolve(); await pending.promise; return { removed: true }; } });
  await f.start(await f.preview()); await entered.promise;
  const save = await f.call('saveConfiguration', { rules: [rule()], protectedContainerRefs: [], inactiveDecisions: [] }); assert.equal(save.error.code, 'OPERATION_ACTIVE'); pending.resolve(); await f.app.burner.waitForIdle(); assert.equal(f.state.configuration.rules.length, 0);
});
await probe('permission loss between calls stops remaining deletion', async () => {
  const f = fixture({ cookies: { 'firefox-default': [cookie(), cookie({ name: 'second' })] }, remove: (_s, state) => { state.access.granted = false; state.listeners.forEach(fn => fn()); return { removed: true }; } });
  await f.start(await f.preview()); await f.app.burner.waitForIdle(); assert.equal(f.state.deletes.length, 1); assert.equal(f.state.current.state, 'partial');
});
await probe('externally changed protection stops an active burn before next call', async () => {
  const f = fixture({ cookies: { 'firefox-default': [cookie(), cookie({ name: 'second' })] }, remove: (_s, state) => { state.configuration.rules = [rule({ domain: 'eligible.example' })]; return { removed: true }; } });
  await f.start(await f.preview()); await f.app.burner.waitForIdle(); assert.equal(f.state.deletes.length, 1); assert.equal(f.state.current.state, 'partial');
});
await probe('catalog loss between calls stops remaining deletion', async () => {
  const f = fixture({ cookies: { 'firefox-default': [cookie(), cookie({ name: 'second' })] }, remove: (_s, state) => { state.catalog.containers = [{ cookieStoreId: 'new', name: 'Added', color: 'blue', icon: 'briefcase' }]; state.listeners.forEach(fn => fn()); return { removed: true }; } });
  await f.start(await f.preview()); await f.app.burner.waitForIdle(); assert.equal(f.state.deletes.length, 1); assert.equal(f.state.current.state, 'partial');
});
await probe('duplicate concurrent start request executes only one burn', async () => {
  const f = fixture(); const preview = await f.preview(); const requestId = crypto.randomUUID();
  const [a,b] = await Promise.all([f.call('startBurn', { previewToken: preview.previewToken }, 0, requestId), f.call('startBurn', { previewToken: preview.previewToken }, 0, requestId)]);
  assert.deepEqual(a,b); assert.equal(a.ok,true); await f.app.burner.waitForIdle(); assert.equal(f.state.deletes.length,1);
});
await probe('late cancellation during terminal persistence preserves a terminal dismissible state', async () => {
  const entered = deferred(), pending = deferred(); let terminal = false;
  const f = fixture({ onOperationWrite: async operation => { if (operation.state === 'completed' && !terminal) { terminal = true; entered.resolve(); await pending.promise; } } });
  const running = await f.start(await f.preview()); await entered.promise;
  const canceled = f.call('cancelBurn', { operationId: running.operationId });
  pending.resolve(); const response = await canceled; await f.app.burner.waitForIdle();
  const view = (await f.call('getState')).data;
  const dismiss = await f.call('dismissOperation', { operationId: running.operationId });
  const evidence = { cancellationReply: response, operationState: view.operation.state, canBurn: view.capabilities.canBurn, marker: f.state.marker, dismissReply: dismiss };
  results.push({ name: 'late cancellation race raw evidence', status: 'evidence', evidence });
  assert.ok(['completed','canceled','partial'].includes(view.operation.state), JSON.stringify(evidence)); assert.equal(dismiss.ok,true);
});
await probe('observation rejects prior-document hosts and stores only reduced session data', async () => {
  const f = fixture(); await f.app.ready();
  const base = { tabId: 1, frameId: 0, storeId: 'firefox-default', scheme: 'https:', host: 'eligible.example', incognito: false };
  f.state.activity({ ...base, kind: 'beforeNavigate' });
  f.state.activity({ ...base, kind: 'request', requestType: 'main_frame', requestId: 'r1' });
  f.state.activity({ ...base, kind: 'committed', documentId: 'current' });
  f.state.activity({ ...base, kind: 'request', requestType: 'xmlhttprequest', documentId: 'old', host: 'prior.example' });
  f.state.activity({ ...base, kind: 'request', requestType: 'xmlhttprequest', documentId: 'current', host: 'resource.example' });
  const context = await f.call('getSiteContext', { windowId: 1 }); assert.equal(context.ok,true);
  const record = f.state.observations[1]; assert.ok(record.hosts.includes('resource.example')); assert.ok(!record.hosts.includes('prior.example')); assert.equal(record.coverage.state,'partial');
  const text = JSON.stringify(f.state.observations); for (const forbidden of ['secret=never-retain','private/path','cookieValue','requestHeaders','requestBody']) assert.ok(!text.includes(forbidden));
});
await probe('observation host exhaustion is bounded and partial', async () => {
  let activity; let stored = {}; const adapter = { onSiteActivity(fn) { activity=fn; }, async readSiteObservations() { return {}; }, async writeSiteObservations(value) { stored=copy(value); }, async clearSiteObservation() { stored={}; }, async getAccess() { return { granted:true,available:true }; }, async classifyHost(host) { return { host, baseDomain: host }; } };
  const observations = createObservations({ adapter, limits: { tabs:2, hosts:3, frames:2, pendingEvents:20, recordBytes:10000, bytes:20000, flushInterval:250 } }); await observations.ready;
  const base = { tabId:1,frameId:0,storeId:'firefox-default',scheme:'https:',host:'page.example' };
  activity({ ...base,kind:'beforeNavigate' }); activity({ ...base,kind:'committed',documentId:'d' });
  for (let i=0;i<10;i++) activity({ ...base,kind:'request',requestType:'image',documentId:'d',host:`host${i}.example` });
  const record = await observations.get({ id:1,url:'https://page.example/',cookieStoreId:'firefox-default' }); assert.equal(record.hosts.length,3); assert.equal(record.coverage.state,'partial'); assert.equal(stored[1].hosts.length,3);
});
await probe('failed observation write and cleanup cannot resurrect prior-document coverage after worker restart', async () => {
  let activity; let stored = {}; let storageUnavailable=false; let currentDocumentId=null;
  const adapter = { onSiteActivity(fn) { activity=event=>{ if(event.kind==='committed' && event.frameId===0) currentDocumentId=event.documentId; fn(event); }; }, async getDocumentId() { return currentDocumentId; }, async readSiteObservations() { return copy(stored); }, async writeSiteObservations(value) { if(storageUnavailable) throw Error('synthetic transient session failure'); stored=copy(value); }, async clearSiteObservation() { if(storageUnavailable) throw Error('synthetic transient cleanup failure'); stored={}; }, async getAccess() { return { granted:true,available:true }; }, async classifyHost(host) { return { host, baseDomain:host }; } };
  const original = createObservations({ adapter }); await original.ready;
  const base={ tabId:1,frameId:0,storeId:'firefox-default',scheme:'https:',host:'page.example' };
  const tab={ id:1,url:'https://page.example/',cookieStoreId:'firefox-default' };
  activity({ ...base,kind:'beforeNavigate' }); activity({ ...base,kind:'committed',documentId:'old-page' }); activity({ ...base,kind:'request',requestType:'image',documentId:'old-page',host:'old-document-resource.example' });
  const before=await original.get(tab); assert.equal(before.coverage.state,'observed');
  storageUnavailable=true;
  activity({ ...base,kind:'beforeNavigate' }); activity({ ...base,kind:'committed',documentId:'new-page' }); activity({ ...base,kind:'request',requestType:'image',documentId:'new-page',host:'new-document-resource.example' });
  const failed=await original.get(tab); assert.equal(failed.coverage.state,'partial'); assert.ok(stored[1].hosts.includes('old-document-resource.example'));
  // A new event-page execution has no prior process-local restored flag.
  storageUnavailable=false;
  const restarted=createObservations({adapter}); await restarted.ready;
  const after=await restarted.get(tab);
  const evidence={ before, failed, after };
  results.push({name:'stale session observation restoration raw evidence',status:'evidence',evidence});
  assert.equal(after.coverage.state,'partial',JSON.stringify(evidence));
  assert.ok(!after.hosts.includes('old-document-resource.example'));
});

const version = JSON.parse(await readFile(new URL('../../../manifest.json', import.meta.url), 'utf8')).version;
const report = { baselineCommit: '8468b1c', version, node: process.version, freshFixtures: true, passed: results.filter(row=>row.status==='passed').length, failed: results.filter(row=>row.status==='failed').length, results };
await writeFile(process.argv[2] || new URL('./spec-results.json', import.meta.url), JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({passed:report.passed,failed:report.failed,failures:results.filter(row=>row.status==='failed')},null,2)+'\n');
process.exitCode = report.failed ? 1 : 0;
