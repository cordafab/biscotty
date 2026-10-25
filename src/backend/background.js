import { createFirefoxAdapter } from './firefox/adapter.js';
import { createApplication } from './gateway/application.js';
const app = createApplication(createFirefoxAdapter(), { extensionId: browser.runtime.id, baseURL: browser.runtime.getURL('') });
browser.runtime.onMessage.addListener((request, sender) => {
  if (request?.type === 'stateChanged') return undefined;
  return app.dispatch(request, sender);
});
browser.runtime.onInstalled.addListener(details => app.installed(details.reason));
