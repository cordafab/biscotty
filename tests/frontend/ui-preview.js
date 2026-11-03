// Runs the actual frontend and gateway against disposable, in-memory fixtures.
import { createApplication } from '../../src/backend/gateway/application.js';
import { createTestAdapter, cookie } from '../harness/adapter.js';
import { sender } from '../harness/fixtures.js';
const view = new URL(import.meta.url).searchParams.get('view');
const adapter = createTestAdapter({ cookies: {
  'firefox-container-4': [cookie({ name: 'session_id' }), cookie({ name: 'preferences' }), cookie({ domain: 'login.example.net', name: 'auth_session', partitionKey: { topLevelSite: 'https://example.com' } }), cookie({ domain: 'metrics.example.net', name: 'visitor_id', partitionKey: { topLevelSite: 'https://example.com' } })],
  'firefox-container-9': [cookie({ name: 'personal_session' })],
  'firefox-default': [cookie({ name: 'normal_session' })]
} });
adapter.setTab({ url: 'https://example.com/' });
const listeners = new Set();
adapter.broadcast = event => queueMicrotask(() => listeners.forEach(listener => listener(event)));
const app = createApplication(adapter, { extensionId: sender.id, baseURL: 'moz-extension://test/' });
await app.ready();
globalThis.browser = {
  runtime: { sendMessage: request => app.dispatch(request, { ...sender, url: `moz-extension://test/src/frontend/${view}.html` }), onMessage: { addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener) } },
  windows: { getCurrent: async () => ({ id: 1 }) }, permissions: { request: async () => true }
};
adapter.openOptions = async () => { parent.location.href = '/tests/frontend/ui-preview.html?view=options'; };
await import(`../../src/frontend/${view}.js`);
