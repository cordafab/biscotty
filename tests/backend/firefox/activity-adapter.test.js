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

test('SITE-01/SITE-02/SITE-11: native listeners synchronously reduce metadata without requesting headers, bodies or blocking', () => {
  const api = {
    webRequest: { onBeforeRequest: event(), onCompleted: event(), onErrorOccurred: event() },
    webNavigation: { onBeforeNavigate: event(), onCommitted: event(), onErrorOccurred: event() },
    tabs: { onRemoved: event() }
  };
  const adapter = createFirefoxAdapter(api);
  const events = [];
  const unsubscribe = adapter.onSiteActivity(value => events.push(value));
  assert.equal(api.webRequest.onBeforeRequest.arguments.length, 2);
  assert.deepEqual(api.webRequest.onBeforeRequest.arguments[1], { urls: ['http://*/*','https://*/*'] });
  assert.equal(api.webNavigation.onCommitted.arguments.length, 1);
  assert.equal(api.webRequest.onBeforeRequest.emit({
    url: 'https://user:password@TRACK.example.net:8080/private?secret#fragment',
    tabId: 7, frameId: 2, parentFrameId: 0,
    documentId: 'child', parentDocumentId: 'parent',
    cookieStoreId: 'firefox-container-4', requestId: 'request', type: 'script',
    requestBody: { raw: 'secret' }, requestHeaders: [{ name: 'Cookie', value: 'secret' }]
  }), undefined);
  assert.deepEqual(events[0], {
    kind: 'request', tabId: 7, frameId: 2, parentFrameId: 0,
    documentId: 'child', parentDocumentId: 'parent', host: 'track.example.net',
    scheme: 'https:', storeId: 'firefox-container-4', requestId: 'request', requestType: 'script', incognito: false, restored: false
  });
  assert.doesNotMatch(JSON.stringify(events), /password|private|secret|8080|fragment/);
  api.webNavigation.onBeforeNavigate.emit({ url: 'about:blank', tabId: 7, frameId: 0 });
  assert.equal(events[1].kind, 'unsupported');
  api.tabs.onRemoved.emit(7);
  assert.deepEqual(events[2], { kind: 'closed', tabId: 7 });
  unsubscribe();
  api.tabs.onRemoved.emit(7);
  assert.equal(events.length, 3);
});
