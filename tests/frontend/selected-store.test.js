import test from 'node:test';
import assert from 'node:assert/strict';
import { createPopupModel } from '../../src/frontend/models.js';

function fixture() {
  const calls = [];
  const stores = ['work', 'personal'].map(ref => ({ ref, label: ref, availability: 'available' }));
  const client = {
    getState: async () => ({ revision: 1, stores, configuration: { rules: [] }, capabilities: { canBurn: true, canChangeProtection: true } }),
    windowContext: async () => ({ windowId: 1 }),
    getSiteContext: async payload => { calls.push(payload); return { contextToken: payload.storeRef || 'work', store: stores.find(store => store.ref === (payload.storeRef || 'work')), target: { domain: 'example.com' }, controls: {} }; },
    getSiteCookieDomains: async () => ({ domains: [], revision: 1, coverage: { state: 'stored' }, nextPageToken: null }),
    getCookies: async payload => ({ cookies: [{ name: payload.contextToken }], nextPageToken: null })
  };
  return { client, calls, model: createPopupModel(client) };
}

test('UX-A01/A02 popup starts with the tab store, persists explicit selection and scopes metadata through its token', async () => {
  const f = fixture();
  await f.model.refresh();
  assert.deepEqual(f.calls[0], { windowId: 1 });
  await f.model.selectStore('personal');
  await f.model.loadSiteCookies();
  assert.deepEqual(f.calls.at(-1), { windowId: 1, storeRef: 'personal' });
  assert.equal(f.model.cookies[0].name, 'personal');
  await f.model.refresh();
  assert.equal(f.model.site.store.ref, 'personal');
  assert.deepEqual(f.model.cookies, []);
});

test('UX-A04 late metadata from a previous container cannot replace the selected-container inventory', async () => {
  const f = fixture(); await f.model.refresh();
  let resolve;
  f.client.getCookies = () => new Promise(done => { resolve = done; });
  const pending = f.model.loadSiteCookies();
  let contextReply, contextEntered;
  const entered = new Promise(done => { contextEntered = done; });
  const capture = f.client.getSiteContext;
  f.client.getSiteContext = payload => new Promise(done => { contextReply = () => done(capture(payload)); contextEntered(); });
  const selecting = f.model.selectStore('personal'); await entered;
  resolve({ cookies: [{ name: 'wrong-store' }] }); await pending;
  assert.deepEqual(f.model.cookies, []);
  contextReply(); await selecting;
  assert.equal(f.model.site.store.ref, 'personal');
  assert.deepEqual(f.model.cookies, []);
});

test('UX-A04 out-of-order context replies cannot restore an earlier container selection', async () => {
  const f = fixture(); await f.model.refresh();
  let resolve, entered;
  const gate = new Promise(done => { entered = done; });
  const original = f.client.getSiteContext;
  f.client.getSiteContext = payload => payload.storeRef === 'personal' ? new Promise(done => { resolve = done; entered(); }) : original(payload);
  const pending = f.model.selectStore('personal'); await gate;
  await f.model.selectStore('work');
  resolve({ contextToken: 'personal', store: { ref: 'personal' } }); await pending;
  assert.equal(f.model.site.store.ref, 'work');
});
