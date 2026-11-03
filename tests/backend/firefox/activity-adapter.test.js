import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirefoxAdapter } from '../../../src/backend/firefox/adapter.js';

function event() {
  let handler;
  return {
    arguments: null,
    addListener(...args) { this.arguments = args; handler = args[0]; },
    removeListener(fn) { if (handler === fn) handler = null; },
    emit(value) { return handler?.(value); }
  };
}

test('OBS-A10 native document verification returns only the current top-level document identity', async () => {
  const requests = [];
  let frame = { documentId: 'current', errorOccurred: false, url: 'https://user:password@example.net/private?secret#fragment' };
  const adapter = createFirefoxAdapter({ webNavigation: { async getFrame(details) { requests.push(details); return frame; } } });
  assert.equal(await adapter.getDocumentId(7), 'current');
  assert.deepEqual(requests, [{ tabId: 7, frameId: 0 }]);
  for (const invalid of [null, {}, { documentId: '' }, { documentId: 'x'.repeat(257) }, { documentId: 'failed', errorOccurred: true }]) {
    frame = invalid;
    assert.equal(await adapter.getDocumentId(7), null);
  }
});

test('CSI-A07 listeners collect only top-level navigation identity, never requests', () => {
  const api = {
    webRequest: { onBeforeRequest: event(), onCompleted: event(), onErrorOccurred: event() },
    webNavigation: { onBeforeNavigate: event(), onCommitted: event(), onErrorOccurred: event() },
    tabs: { onRemoved: event() }
  };
  const events = [];
  const unsubscribe = createFirefoxAdapter(api).onSiteActivity(value => events.push(value));
  assert.equal(api.webRequest.onBeforeRequest.arguments, null);
  assert.equal(api.webRequest.onCompleted.arguments, null);
  assert.equal(api.webRequest.onErrorOccurred.arguments, null);
  api.webNavigation.onBeforeNavigate.emit({ url: 'https://private.example/secret', tabId: 7, frameId: 1 });
  api.webNavigation.onBeforeNavigate.emit({ url: 'https://private.example/secret', tabId: 7, frameId: 0 });
  api.tabs.onRemoved.emit(7);
  assert.deepEqual(events, [{ kind: 'beforeNavigate', tabId: 7, frameId: 0 }, { kind: 'closed', tabId: 7 }]);
  unsubscribe();
  api.tabs.onRemoved.emit(7);
  assert.equal(events.length, 2);
});
