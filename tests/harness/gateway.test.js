import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway, REQUEST_LIMITS } from '../../src/backend/gateway/gateway.js';
import { createClient } from '../../src/backend/client/client.js';
import { createConfiguration } from '../../src/backend/configuration/service.js';
import { createTestAdapter } from './adapter.js';
import { envelope, sender, rule } from './fixtures.js';
test('ARCH-A04 website senders are rejected; client validates envelopes', async () => {
  const dispatch = createGateway({ extensionId: sender.id, baseURL: 'moz-extension://test/', handlers: { getState: () => ({ revision: 0 }) } });
  assert.equal((await dispatch(envelope('getState'), { ...sender, url: 'https://example.com/' })).ok, false);
  const client = createClient({ send: request => dispatch(request, sender) });
  assert.deepEqual(await client.getState(), { revision: 0 });
  await assert.rejects(createClient({ send: () => ({ ok: true }) }).getState(), { code: 'INVALID_REQUEST' });
});
test('ARCH-A18 successful mutation requests are deduplicated', async () => {
  let calls = 0;
  const dispatch = createGateway({ extensionId: sender.id, baseURL: 'moz-extension://test/', handlers: { saveConfiguration: () => ({ revision: ++calls }) } });
  const request = envelope('saveConfiguration');
  assert.deepEqual(await dispatch(request, sender), await dispatch(request, sender));
  assert.equal(calls, 1);
});

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function gateway(handlers, limits = REQUEST_LIMITS, now) { return createGateway({ extensionId: sender.id, baseURL: 'moz-extension://test/', handlers, limits, now }); }

test('DEDUP-A01/A03 pending entry saturation rejects before execution and retains duplicate identity', async () => {
  const gate = deferred(), entered = deferred();
  let calls = 0;
  const dispatch = gateway({ startBurn: async () => { calls++; entered.resolve(); await gate.promise; return { operationId: 'synthetic-operation' }; } }, { ...REQUEST_LIMITS, entries: 1 });
  const request = envelope('startBurn', { previewToken: 'synthetic-preview' });
  const first = dispatch(request, sender);
  await entered.promise;
  const duplicate = dispatch(request, sender);
  const changed = await dispatch({ ...request, payload: { previewToken: 'changed-preview' } }, sender);
  assert.equal(changed.error.code, 'INVALID_REQUEST');
  const rejected = await dispatch(envelope('startBurn', { previewToken: 'another-preview' }), sender);
  assert.equal(rejected.error.code, 'REQUEST_CAPACITY');
  assert.match(rejected.error.message, /Wait/);
  assert.equal(calls, 1);
  gate.resolve();
  assert.deepEqual(await first, await duplicate);
  assert.equal(calls, 1);
});

test('DEDUP-A02 response reservations bound pending bytes before any new mutation is scheduled', async () => {
  const gate = deferred(), entered = deferred();
  let calls = 0;
  const dispatch = gateway({ setSiteProtection: async () => { calls++; entered.resolve(); await gate.promise; return { revision: calls }; } }, { ...REQUEST_LIMITS, bytes: 5000 });
  const first = dispatch(envelope('setSiteProtection'), sender);
  await entered.promise;
  const rejected = await dispatch(envelope('setSiteProtection'), sender);
  assert.equal(rejected.error.code, 'REQUEST_CAPACITY');
  assert.equal(calls, 1);
  gate.resolve();
  assert.equal((await first).ok, true);
  assert.equal((await dispatch(envelope('setSiteProtection'), sender)).ok, true);
});

test('DEDUP-A04 completed entries expire or are evicted without evicting pending requests', async () => {
  let clock = 0, calls = 0;
  const gate = deferred(), entered = deferred();
  const dispatch = gateway({
    setSiteProtection: () => ({ revision: ++calls }),
    startBurn: async () => { calls++; entered.resolve(); await gate.promise; return { operationId: 'operation' }; }
  }, { ...REQUEST_LIMITS, entries: 2, ttl: 1000 }, () => clock);
  const pending = envelope('startBurn');
  const first = dispatch(pending, sender);
  await entered.promise;
  const completed = envelope('setSiteProtection');
  await dispatch(completed, sender);
  await dispatch(envelope('setSiteProtection'), sender);
  clock = 1001;
  const duplicate = dispatch(pending, sender);
  assert.equal(calls, 3);
  gate.resolve();
  assert.deepEqual(await first, await duplicate);
  await dispatch(completed, sender);
  assert.equal(calls, 4);
});

test('DEDUP-A05 handler errors have safe cached responses and release unused reservation bytes', async () => {
  let failures = 0;
  const dispatch = gateway({
    startBurn: () => { failures++; throw new Error('Synthetic native stack with cookie-value'); },
    setSiteProtection: () => ({ revision: 1 })
  }, { ...REQUEST_LIMITS, bytes: 5000 });
  const request = envelope('startBurn');
  const response = await dispatch(request, sender);
  assert.equal(response.error.code, 'INTERNAL_FAILURE');
  assert.doesNotMatch(JSON.stringify(response), /cookie-value/);
  assert.deepEqual(await dispatch(request, sender), response);
  assert.equal(failures, 1);
  assert.equal((await dispatch(envelope('setSiteProtection'), sender)).ok, true);
});

test('DEDUP-A06 real configuration revisions prevent replay after completed response eviction', async () => {
  const adapter = createTestAdapter();
  const configuration = createConfiguration({ adapter });
  await configuration.initialize();
  const dispatch = gateway(configuration.handlers, { ...REQUEST_LIMITS, entries: 1 });
  const request = envelope('saveConfiguration', { rules: [rule()], protectedContainerRefs: [], inactiveDecisions: [] }, 0);
  assert.equal((await dispatch(request, sender)).data.revision, 1);
  const next = envelope('saveConfiguration', { rules: [rule({ domain: 'other.example.com' })], protectedContainerRefs: [], inactiveDecisions: [] }, 1);
  assert.equal((await dispatch(next, sender)).data.revision, 2);
  const replay = await dispatch(request, sender);
  assert.equal(replay.error.code, 'REVISION_CONFLICT');
  assert.equal(adapter.storedRecord.revision, 2);
  assert.equal(adapter.storedRecord.rules[0].domain, 'other.example.com');
});

test('DEDUP-A07 a large request does not consume retained cache capacity as a payload fingerprint', async () => {
  let calls = 0;
  const dispatch = gateway({ setSiteProtection: () => ({ revision: ++calls }) }, { ...REQUEST_LIMITS, bytes: 5000 });
  const request = envelope('setSiteProtection', { syntheticPadding: 'x'.repeat(1024 * 1024) });
  const first = await dispatch(request, sender);
  assert.equal(first.ok, true);
  assert.deepEqual(await dispatch(request, sender), first);
  assert.equal(calls, 1);
  assert.equal((await dispatch(envelope('setSiteProtection'), sender)).ok, true);
});
