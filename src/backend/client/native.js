import { createClient } from './client.js';
export function createNativeClient(api = browser) {
  return createClient({
    send: request => api.runtime.sendMessage(request),
    subscribe(listener) {
      api.runtime.onMessage.addListener(listener);
      return () => api.runtime.onMessage.removeListener(listener);
    },
    windowContext: () => api.windows.getCurrent().then(window => ({ windowId: window.id })),
    async requestHostAccess() {
      const granted = await api.permissions.request({ origins: ['http://*/*', 'https://*/*'] });
      return { granted, guidance: granted ? '' : 'Restore website access in Firefox Add-ons → Biscotty → Permissions.' };
    }
  });
}
export const client = typeof browser === 'undefined' ? null : createNativeClient();
