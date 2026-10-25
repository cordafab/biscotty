import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservations } from '../../../src/backend/firefox/observations.js';
import { createTestAdapter } from '../../harness/adapter.js';

function fixture() {
  const adapter = createTestAdapter();
  let listener;
  let stored = {};
  adapter.onSiteActivity = fn => { listener = fn; };
  adapter.readSiteObservations = async () => structuredClone(stored);
  adapter.writeSiteObservation = async (id, value) => { stored[id] = structuredClone(value); };
  adapter.clearSiteObservation = async id => { if (id === undefined) stored = {}; else delete stored[id]; };
  const invalidations = [];
  const observations = createObservations({ adapter, onInvalidate: id => invalidations.push(id) });
  const tab = { id: 1, url: 'https://shop.example.com/path?secret=yes', cookieStoreId: 'firefox-container-4', incognito: false };
  const emit = event => listener({ tabId: 1, host: 'shop.example.com', scheme: 'https:', storeId: tab.cookieStoreId, frameId: 0, parentFrameId: -1, ...event });
  const current = () => observations.get(tab);
  async function load(documentId = 'doc-1') {
    emit({ kind: 'beforeNavigate' });
    emit({ kind: 'request', requestType: 'main_frame', requestId: documentId });
    emit({ kind: 'committed', documentId });
    return current();
  }
  return { adapter, observations, tab, emit, current, load, invalidations, get stored() { return stored; } };
}

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
  f.adapter.writeSiteObservation = async () => { throw new Error('capacity'); };
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
  f.adapter.writeSiteObservation = async () => { throw new Error('full'); };
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
