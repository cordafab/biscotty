import test from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../../../src/backend/gateway/application.js';
import { createTestAdapter, cookie } from '../../harness/adapter.js';
import { envelope, sender } from '../../harness/fixtures.js';
async function setup() {
  const adapter = createTestAdapter({ cookies: { 'firefox-default': [cookie()] } });
  const app = createApplication(adapter, { extensionId: sender.id, baseURL: 'moz-extension://test/' });
  await app.ready();
  const request = (action, payload = {}, revision = app.configuration.view().revision) => app.dispatch(envelope(action, payload, revision), sender);
  const inventory = await request('getCookies', { storeRefs: ['normal'] });
  const state = app.configuration.view();
  const draft = { ...state.configuration, inactiveDecisions: [] };
  return { adapter, app, request, draft, rowToken: inventory.data.cookies[0].rowToken };
}
test('inventory policy evaluation returns sanitized saved policy and expires after a commit', async () => {
  const s = await setup();
  const policy = await s.request('evaluateCookiePolicy', { rowToken: s.rowToken });
  assert.equal(policy.ok, true);
  assert.equal(policy.data.protected, false);
  assert.equal(JSON.stringify(policy.data).includes('value'), false);
  const plan = await s.request('planInventoryChoices', { draft: s.draft, choices: [{ rowToken: s.rowToken, choice: 'keep', scopeAcknowledged: true }] });
  assert.equal((await s.request('commitInventoryChoices', { planToken: plan.data.planToken })).ok, true);
  assert.equal((await s.request('evaluateCookiePolicy', { rowToken: s.rowToken })).error.code, 'STALE_IMPORT');
});
test('INV-A08 reviewed inventory choice commits atomically and preserves unrelated policy', async () => {
  const s = await setup();
  const choice = { rowToken: s.rowToken, choice: 'keep', scopeAcknowledged: false };
  const review = await s.request('planInventoryChoices', { draft: s.draft, choices: [choice] });
  assert.equal(review.ok, true, JSON.stringify(review));
  assert.equal(review.data.planToken, null);
  assert.equal(review.data.conflicts[0].code, 'SCOPE_REVIEW_REQUIRED');
  assert.equal(s.adapter.storedRecord.rules.length, 0);
  choice.scopeAcknowledged = true;
  const plan = await s.request('planInventoryChoices', { draft: s.draft, choices: [choice] });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  assert.deepEqual(plan.data.conflicts, []);
  const saved = await s.request('commitInventoryChoices', { planToken: plan.data.planToken });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(s.adapter.storedRecord.rules.length, 1);
  assert.equal(s.adapter.storedRecord.rules[0].name, 'session');
});
test('INV-A09 disappearing cookie rejects a reviewed plan with no write', async () => {
  const s = await setup();
  const plan = await s.request('planInventoryChoices', { draft: s.draft, choices: [{ rowToken: s.rowToken, choice: 'keep', scopeAcknowledged: true }] });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  s.adapter.cookies['firefox-default'] = [];
  const result = await s.request('commitInventoryChoices', { planToken: plan.data.planToken });
  assert.equal(result.error.code, 'CONTEXT_UNAVAILABLE');
  assert.equal(s.adapter.storedRecord.rules.length, 0);
});

test('INV-A01/A08 jar choice covers filtered and paged identities and rejects jar changes', async () => {
  const adapter = createTestAdapter({ cookies: { 'firefox-default': ['one', 'two', 'three'].map(name => cookie({ domain: 'tracker.other.com', name, partitionKey: { topLevelSite: 'https://example.com' } })) } });
  const app = createApplication(adapter, { extensionId: sender.id, baseURL: 'moz-extension://test/' });
  await app.ready();
  const request = (action, payload = {}) => app.dispatch(envelope(action, payload, app.configuration.view().revision), sender);
  const page = await request('getCookies', { storeRefs: ['normal'], search: 'one', pageSize: 1 });
  assert.equal(page.data.cookies.length, 1);
  assert.equal(page.data.cookies[0].jarSize, 3);
  const draft = { ...app.configuration.view().configuration, inactiveDecisions: [] };
  const plan = await request('planInventoryChoices', { draft, choices: [{ jarToken: page.data.cookies[0].jarToken, choice: 'keep', scopeAcknowledged: true }] });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  assert.equal(plan.data.configuration.rules.length, 1);
  assert.equal(plan.data.configuration.rules[0].name, null);
  assert.equal(plan.data.configuration.rules[0].path, null);
  adapter.cookies['firefox-default'].push(cookie({ domain: 'tracker.other.com', name: 'new', partitionKey: { topLevelSite: 'https://example.com' } }));
  const saved = await request('commitInventoryChoices', { planToken: plan.data.planToken });
  assert.equal(saved.error.code, 'CONTEXT_UNAVAILABLE');
  assert.equal(adapter.storedRecord.rules.length, 0);
});

test('INV-A09 native same-revision replacement invalidates a reviewed plan', async () => {
  const s = await setup();
  const plan = await s.request('planInventoryChoices', { draft: s.draft, choices: [{ rowToken: s.rowToken, choice: 'keep', scopeAcknowledged: true }] });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  const replacement = s.adapter.storedRecord;
  replacement.rules = [{ domain: 'other.com', includeSubdomains: false, name: null, path: null, scope: { type: 'all' } }];
  s.adapter.setRecord(replacement);
  await s.request('getState');
  const result = await s.request('commitInventoryChoices', { planToken: plan.data.planToken });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'STALE_IMPORT');
  assert.deepEqual(s.adapter.storedRecord.rules, replacement.rules);
});

test('INV-A09 a replacement during planning cannot issue a stale plan', async () => {
  const s = await setup();
  let entered, release;
  const pendingClassification = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const classify = s.adapter.classifyHost;
  let blocked = false;
  s.adapter.classifyHost = async host => {
    if (!blocked) { blocked = true; entered(); await gate; }
    return classify(host);
  };
  const pending = s.request('planInventoryChoices', { draft: s.draft, choices: [{ rowToken: s.rowToken, choice: 'keep', scopeAcknowledged: true }] });
  await pendingClassification;
  const replacement = s.adapter.storedRecord;
  replacement.rules = [{ domain: 'other.com', includeSubdomains: false, name: null, path: null, scope: { type: 'all' } }];
  s.adapter.setRecord(replacement);
  await s.request('getState');
  release();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'STALE_IMPORT');
  assert.deepEqual(s.adapter.storedRecord.rules, replacement.rules);
});

test('INV-A18 complete jar choices support more than 200 captured cookies', async () => {
  const adapter = createTestAdapter({ cookies: { 'firefox-default': Array.from({ length: 250 }, (_, index) => cookie({ domain: 'tracker.other.com', name: `cookie-${index}`, partitionKey: { topLevelSite: 'https://example.com' } })) } });
  const app = createApplication(adapter, { extensionId: sender.id, baseURL: 'moz-extension://test/' });
  await app.ready();
  const request = (action, payload = {}) => app.dispatch(envelope(action, payload, app.configuration.view().revision), sender);
  const page = await request('getCookies', { storeRefs: ['normal'], pageSize: 1 });
  assert.equal(page.data.cookies[0].jarSize, 250);
  const draft = { ...app.configuration.view().configuration, inactiveDecisions: [] };
  const plan = await request('planInventoryChoices', { draft, choices: [{ jarToken: page.data.cookies[0].jarToken, choice: 'keep', scopeAcknowledged: true }] });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  assert.equal(plan.data.configuration.rules.length, 1);
  const saved = await request('commitInventoryChoices', { planToken: plan.data.planToken });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  assert.equal(adapter.storedRecord.rules[0].name, null);
});
