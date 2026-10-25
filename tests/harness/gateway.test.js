import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../../src/backend/gateway/gateway.js';
import { createClient } from '../../src/backend/client/client.js';
import { envelope, sender } from './fixtures.js';
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
