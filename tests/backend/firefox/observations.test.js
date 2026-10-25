import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservations, OBSERVATION_LIMITS } from '../../../src/backend/firefox/observations.js';
import { createTestAdapter } from '../../harness/adapter.js';

function fixture(limits) {
  const adapter = createTestAdapter();
  let listener;
  let stored = {};
  let writes = 0;
  adapter.onSiteActivity = fn => { listener = fn; };
  adapter.readSiteObservations = async () => structuredClone(stored);
  adapter.writeSiteObservations = async value => { writes++; stored = structuredClone(value); };
  adapter.clearSiteObservation = async id => { if (id === undefined) stored = {}; else delete stored[id]; };
  const invalidations = [];
  const observations = createObservations({ adapter, onInvalidate: id => invalidations.push(id), limits });
  const tab = { id: 1, url: 'https://shop.example.com/path?secret=yes', cookieStoreId: 'firefox-container-4', incognito: false };
  const emit = event => listener({ tabId: 1, host: 'shop.example.com', scheme: 'https:', storeId: tab.cookieStoreId, frameId: 0, parentFrameId: -1, ...event });
  const current = () => observations.get(tab);
  async function load(documentId = 'doc-1') {
    emit({ kind: 'beforeNavigate' });
    emit({ kind: 'request', requestType: 'main_frame', requestId: documentId });
    emit({ kind: 'committed', documentId });
    return current();
  }
  return { adapter, observations, tab, emit, current, load, invalidations, get stored() { return stored; }, get writes() { return writes; } };
}

for (const limits of [{ ...OBSERVATION_LIMITS, tabs: 1 }, { ...OBSERVATION_LIMITS, bytes: 600 }]) test(`OBS-A09 fresh navigation after eviction recovers only its own coverage (${limits.tabs === 1 ? 'tabs' : 'bytes'})`, async () => {
  const f = fixture(limits);
  const first = await f.load('old');
  f.emit({ kind: 'beforeNavigate', tabId: 2 });
  f.emit({ kind: 'committed', tabId: 2, documentId: 'other' });
  await f.observations.get({ ...f.tab, id: 2 });
  assert.equal(f.stored[1], undefined);
  f.emit({ kind: 'committed', documentId: 'start-was-missed' });
  assert.equal((await f.current()).coverage.state, 'partial');
  const newDocument = await f.load('new');
  assert.equal(newDocument.coverage.state, 'observed');
  assert.notEqual(newDocument.generation, first.generation);
  assert.deepEqual(newDocument.hosts, ['shop.example.com']);
  f.emit({ kind: 'closed' });
  f.emit({ kind: 'beforeNavigate' });
  f.emit({ kind: 'committed', documentId: 'after-closure' });
  assert.equal((await f.current()).coverage.state, 'observed');
});

test('OBS-A09 the first fresh navigation after eviction recovers without an intervening popup read', async () => {
  const f = fixture({ ...OBSERVATION_LIMITS, tabs: 1 });
  await f.load();
  f.emit({ kind: 'beforeNavigate', tabId: 2 });
  f.emit({ kind: 'committed', tabId: 2, documentId: 'other' });
  await f.observations.get({ ...f.tab, id: 2 });
  f.emit({ kind: 'beforeNavigate' });
  f.emit({ kind: 'committed', documentId: 'fresh-after-eviction' });
  assert.equal((await f.current()).coverage.state, 'observed');
});

test('OBS-A09 fresh coverage recovery never upgrades another tab or masks a failed storage write', async () => {
  const f = fixture({ ...OBSERVATION_LIMITS, tabs: 2 });
  await f.load();
  await f.observations.get({ ...f.tab, id: 2 });
  f.emit({ kind: 'beforeNavigate', tabId: 3 });
  f.emit({ kind: 'committed', tabId: 3, documentId: 'third' });
  await f.observations.get({ ...f.tab, id: 3 });
  assert.equal(f.stored[1], undefined);
  f.emit({ kind: 'committed', tabId: 2, documentId: 'missing-start' });
  assert.equal((await f.observations.get({ ...f.tab, id: 2 })).coverage.state, 'partial');
  assert.equal((await f.load('fresh')).coverage.state, 'observed');
  assert.equal(f.stored[2].coverage.state, 'partial');
  f.adapter.writeSiteObservations = async () => { throw new Error('session unavailable'); };
  assert.equal((await f.load('storage-failed')).coverage.state, 'partial');
});

test('SITE-A05: redirects, nested frames and later requests retain current ancestry', async () => {
  const f = fixture();
  f.emit({ kind: 'beforeNavigate', host: 'login.example.com' });
  f.emit({ kind: 'request', requestType: 'main_frame', requestId: 'redirect', host: 'login.example.com' });
  f.emit({ kind: 'request', requestType: 'main_frame', requestId: 'redirect' });
  f.emit({ kind: 'committed', documentId: 'top' });
  f.emit({ kind: 'request', requestType: 'script', documentId: 'top', host: 'cdn.example.net' });
  f.emit({ kind: 'request', requestType: 'sub_frame', frameId: 2, parentFrameId: 0, parentDocumentId: 'top', host: 'frame.example.net' });
  f.emit({ kind: 'committed', frameId: 2, parentFrameId: 0, parentDocumentId: 'top', documentId: 'nested', host: 'frame.example.net' });
  f.emit({ kind: 'request', requestType: 'script', frameId: 2, documentId: 'nested', host: 'late.example.net' });
  const record = await f.current();
  assert.deepEqual(new Set(record.hosts), new Set(['login.example.com','shop.example.com','cdn.example.net','frame.example.net','late.example.net']));
  assert.equal(record.coverage.state, 'observed');
  assert.deepEqual(record.topLevelSite, { scheme: 'https:', domain: 'example.com' });
  assert.equal(f.invalidations.length, 1);
});

test('SITE-A06: same-host reload changes generation and excludes previous-document requests', async () => {
  const f = fixture();
  const first = await f.load('old');
  f.emit({ kind: 'request', requestType: 'script', documentId: 'old', host: 'previous.example.net' });
  const second = await f.load('new');
  f.emit({ kind: 'request', requestType: 'script', documentId: 'old', host: 'late-old.example.net' });
  const current = await f.current();
  assert.notEqual(first.generation, second.generation);
  assert.deepEqual(current.hosts, ['shop.example.com']);
  assert.equal(current.coverage.state, 'partial');
});

test('SITE-A07/A08: unobserved pages are partial, repeated reads and fragments preserve generation', async () => {
  const f = fixture();
  const first = await f.current();
  assert.equal(first.coverage.state, 'partial');
  f.tab.url += '#section';
  assert.equal((await f.current()).generation, first.generation);
  f.emit({ kind: 'unsupported' });
  assert.notEqual((await f.current()).generation, first.generation);
  f.emit({ kind: 'closed' });
  await f.observations.ready;
  // Flush the activity queue without creating another record for this tab.
  await f.observations.get({ ...f.tab, id: 2 });
  assert.equal(f.stored[1], undefined);
});

test('SITE-A09/A11: session restart retains only current metadata and permission clearing discards it', async () => {
  const f = fixture();
  const first = await f.load();
  const restored = createObservations({ adapter: f.adapter });
  assert.equal((await restored.get(f.tab)).generation, first.generation);
  assert.equal((await restored.get(f.tab)).coverage.state, 'observed');
  assert.doesNotMatch(JSON.stringify(f.stored), /secret|\/path|https:\/\//);
  await restored.invalidate();
  assert.deepEqual(f.stored, {});
  assert.equal((await restored.get(f.tab)).coverage.state, 'partial');
});

test('SITE-A10: session read or write failure never claims observed coverage', async () => {
  const f = fixture();
  await f.observations.ready;
  f.adapter.writeSiteObservations = async () => { throw new Error('capacity'); };
  assert.equal((await f.load()).coverage.state, 'partial');
  f.adapter.readSiteObservations = async () => { throw new Error('read'); };
  const restored = createObservations({ adapter: f.adapter });
  await restored.ready;
  assert.equal((await restored.get(f.tab)).coverage.state, 'partial');
});

test('SITE-A05/A06: request-first redirects survive navigation start and replaced iframe descendants cannot contribute', async () => {
  const f = fixture();
  f.emit({ kind: 'request', requestType: 'main_frame', requestId: 'redirect', host: 'login.example.com' });
  f.emit({ kind: 'beforeNavigate', host: 'login.example.com' });
  f.emit({ kind: 'request', requestType: 'main_frame', requestId: 'redirect' });
  f.emit({ kind: 'committed', documentId: 'top' });
  f.emit({ kind: 'committed', frameId: 2, parentFrameId: 0, parentDocumentId: 'top', documentId: 'outer', host: 'outer.example.net' });
  f.emit({ kind: 'committed', frameId: 3, parentFrameId: 2, parentDocumentId: 'outer', documentId: 'inner', host: 'inner.example.net' });
  f.emit({ kind: 'beforeNavigate', frameId: 2, parentFrameId: 0, host: 'new.example.net' });
  f.emit({ kind: 'request', requestType: 'script', frameId: 3, documentId: 'inner', host: 'stale.example.net' });
  const record = await f.current();
  assert.ok(record.hosts.includes('login.example.com'));
  assert.ok(!record.hosts.includes('stale.example.net'));
  assert.equal(record.frames[3], undefined);
});

test('SITE-A06: same-host scheme changes invalidate navigation generation', async () => {
  const f = fixture();
  const first = await f.load();
  f.tab.url = 'http://shop.example.com/';
  const second = await f.current();
  assert.notEqual(second.generation, first.generation);
  assert.deepEqual(second.topLevelSite, { scheme: 'http:', domain: 'example.com' });
});

test('SITE-A10: failed session update removes an older observed record', async () => {
  const f = fixture();
  await f.load();
  assert.equal(f.stored[1].coverage.state, 'observed');
  f.adapter.writeSiteObservations = async () => { throw new Error('full'); };
  f.emit({ kind: 'request', requestType: 'script', documentId: 'doc-1', host: 'new.example.net' });
  await f.current();
  assert.equal(f.stored[1], undefined);
});

test('SITE-A08: history restoration without retained page observations reports partial coverage', async () => {
  const f = fixture();
  await f.load();
  f.emit({ kind: 'beforeNavigate' });
  f.emit({ kind: 'committed', documentId: 'restored-document', restored: true });
  const record = await f.current();
  assert.equal(record.coverage.state, 'partial');
  assert.match(record.coverage.reason, /restored/);
});

test('OBS-A01/A05 repeated resource bursts coalesce; completions and unchanged reads cause no writes', async () => {
  const f = fixture();
  await f.load();
  const before = f.writes;
  for (let i = 0; i < 4000; i++) f.emit({ kind: 'request', requestType: 'image', documentId: 'doc-1', host: 'cdn.example.net', requestId: `request-${i}` });
  const record = await f.current();
  assert.deepEqual(record.hosts, ['shop.example.com', 'cdn.example.net']);
  assert.equal(f.writes, before + 1);
  for (let i = 0; i < 4000; i++) f.emit({ kind: 'requestFinished', requestType: 'image', documentId: 'doc-1', requestId: `request-${i}` });
  await f.current();
  await f.current();
  assert.equal(f.writes, before + 1);
});

test('OBS-A02 host and frame exhaustion retain bounded state with partial coverage', async () => {
  const f = fixture({ ...OBSERVATION_LIMITS, hosts: 3, frames: 2 });
  await f.load();
  for (let i = 0; i < 10; i++) f.emit({ kind: 'request', requestType: 'image', documentId: 'doc-1', host: `r${i}.example.net` });
  let record = await f.current();
  assert.equal(record.hosts.length, 3);
  assert.equal(record.coverage.state, 'partial');
  assert.match(record.coverage.reason, /resource limit/);
  await f.load('new-document');
  for (let i = 1; i < 5; i++) f.emit({ kind: 'committed', frameId: i, parentFrameId: 0, parentDocumentId: 'new-document', documentId: `child-${i}` });
  record = await f.current();
  assert.equal(Object.keys(record.frames).length, 2);
  assert.equal(record.coverage.state, 'partial');
});

test('OBS-A03 queue saturation invalidates generations and a later navigation recovers observed coverage', async () => {
  const f = fixture({ ...OBSERVATION_LIMITS, pendingEvents: 4 });
  const before = await f.load();
  for (let i = 0; i < 100; i++) f.emit({ kind: 'request', requestType: 'image', documentId: 'doc-1', host: `r${i}.example.net` });
  const after = await f.current();
  assert.notEqual(after.generation, before.generation);
  assert.equal(after.coverage.state, 'partial');
  assert.equal((await f.load('reloaded-document')).coverage.state, 'observed');
});

test('OBS-A04 tab and aggregate byte limits evict old observations without retaining their generations', async () => {
  const f = fixture({ ...OBSERVATION_LIMITS, tabs: 2 });
  const first = await f.load();
  await f.observations.get({ ...f.tab, id: 2 });
  await f.observations.get({ ...f.tab, id: 3 });
  assert.equal(Object.keys(f.stored).length, 2);
  assert.equal(f.stored[1], undefined);
  assert.notEqual((await f.current()).generation, first.generation);
  const small = fixture({ ...OBSERVATION_LIMITS, bytes: 900 });
  await small.load();
  for (let id = 2; id < 10; id++) await small.observations.get({ ...small.tab, id });
  assert.ok(new TextEncoder().encode(JSON.stringify(small.stored)).length <= 900);
  assert.ok(Object.keys(small.stored).length <= 2);
  const tiny = fixture({ ...OBSERVATION_LIMITS, recordBytes: 100 });
  assert.equal((await tiny.load()).coverage.state, 'partial');
  assert.deepEqual(tiny.stored, {});
});

test('OBS-A04 closure and unsupported navigation survive saturation and do not resurrect saved state', async () => {
  for (const kind of ['closed', 'unsupported']) {
    const f = fixture({ ...OBSERVATION_LIMITS, pendingEvents: 4 });
    await f.load();
    for (let i = 0; i < 100; i++) f.emit({ kind: 'request', requestType: 'image', documentId: 'doc-1', host: `r${i}.example.net` });
    f.emit({ kind });
    await f.observations.get({ ...f.tab, id: 2 });
    assert.equal(f.stored[1], undefined);
  }
});

test('OBS-A05 changed activity automatically saves one batch without requiring a popup read', async () => {
  const f = fixture({ ...OBSERVATION_LIMITS, flushInterval: 20 });
  await f.load();
  const before = f.writes;
  for (let i = 0; i < 20; i++) f.emit({ kind: 'request', requestType: 'image', documentId: 'doc-1', host: `r${i}.example.net` });
  for (let i = 0; i < 50 && f.writes === before; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(f.writes, before + 1);
  assert.equal(f.stored[1].hosts.length, 21);
  await f.current();
  assert.equal(f.writes, before + 1);
});

test('OBS-A06 restored state rejects oversized records and projects permitted metadata only', async () => {
  const f = fixture();
  const old = await f.load();
  f.stored[1].hosts = Array(OBSERVATION_LIMITS.hosts + 1).fill('shop.example.com');
  const restored = createObservations({ adapter: f.adapter });
  await restored.ready;
  assert.deepEqual(f.stored, {});
  const fresh = await restored.get(f.tab);
  assert.notEqual(fresh.generation, old.generation);
  assert.equal(fresh.coverage.state, 'partial');
  f.stored[1].secretURL = 'https://example.net/private?secret';
  f.stored[1].coverage.secret = 'cookie-value';
  const projected = createObservations({ adapter: f.adapter });
  await projected.ready;
  assert.doesNotMatch(JSON.stringify(f.stored), /secret|cookie-value|private/);
});

test('OBS-A03/A04 in-flight native work cannot resurrect a tab after overflow and closure', async () => {
  const f = fixture({ ...OBSERVATION_LIMITS, pendingEvents: 4 });
  await f.load();
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const active = new Promise(resolve => { entered = resolve; });
  f.adapter.getAccess = async () => { entered(); await gate; return { granted: true, available: true }; };
  f.emit({ kind: 'request', requestType: 'image', documentId: 'doc-1', host: 'pending.example.net' });
  await active;
  for (let i = 0; i < 100; i++) f.emit({ kind: 'request', requestType: 'image', documentId: 'doc-1', host: `r${i}.example.net` });
  f.emit({ kind: 'closed' });
  const read = f.observations.get({ ...f.tab, id: 2 });
  release();
  await read;
  assert.equal(f.stored[1], undefined);
});

test('OBS-A06 malformed ancestry and oversized aggregate restoration never retain an observed claim', async () => {
  const f = fixture();
  const record = await f.load();
  f.stored[1].frames[0].parentFrameId = 'invalid';
  const restored = createObservations({ adapter: f.adapter });
  assert.equal((await restored.get(f.tab)).coverage.state, 'partial');
  assert.notEqual(f.stored[1].generation, record.generation);
  for (let id = 2; id < 20; id++) f.stored[id] = structuredClone(record);
  const bounded = createObservations({ adapter: f.adapter, limits: { ...OBSERVATION_LIMITS, tabs: 2, bytes: 900 } });
  await bounded.ready;
  assert.ok(Object.keys(f.stored).length <= 2);
  assert.ok(new TextEncoder().encode(JSON.stringify(f.stored)).length <= 900);
});
