import { BiscottyError, clone } from '../../core/errors.js';
const CONFIG = 'biscotty.configuration';
const MARKER = 'biscotty.inProgress';
const CURRENT = 'biscotty.currentOperation';
const OBSERVATIONS = 'biscotty.siteObservations';
const origins = ['http://*/*', 'https://*/*'];
export function sanitizeCookie(cookie) {
  return {
    domain: cookie.domain, name: cookie.name, path: cookie.path, storeId: cookie.storeId,
    hostOnly: cookie.hostOnly, secure: cookie.secure, httpOnly: cookie.httpOnly,
    session: cookie.session,
    firstPartyDomain: Object.hasOwn(cookie, 'firstPartyDomain') ? cookie.firstPartyDomain : undefined,
    partitionKey: cookie.partitionKey ? clone(cookie.partitionKey) : null
  };
}
export function createFirefoxAdapter(api = browser) {
  async function read(area, key) { return (await area.get(key))[key] ?? null; }
  async function write(area, key, value) {
    await area.set({ [key]: clone(value) });
    if (JSON.stringify(await read(area, key)) !== JSON.stringify(value)) throw new BiscottyError('STORAGE_FAILED', 'Firefox could not confirm saved settings.');
  }
  async function clear(area, key) {
    await area.remove(key);
    if (await read(area, key) !== null) throw new BiscottyError('STORAGE_FAILED', 'Firefox could not confirm cleanup.');
  }
  return {
    readConfigurationRecord: () => read(api.storage.local, CONFIG),
    writeConfigurationRecord: record => write(api.storage.local, CONFIG, record),
    readMarker: () => read(api.storage.local, MARKER),
    writeMarker: id => write(api.storage.local, MARKER, id),
    clearMarker: () => clear(api.storage.local, MARKER),
    readCurrentOperation: () => read(api.storage.session, CURRENT),
    writeCurrentOperation: operation => write(api.storage.session, CURRENT, operation),
    clearCurrentOperation: () => clear(api.storage.session, CURRENT),
    readSiteObservations: async () => (await read(api.storage.session, OBSERVATIONS)) || {},
    writeSiteObservations: records => write(api.storage.session, OBSERVATIONS, records),
    async clearSiteObservation(tabId) {
      if (tabId === undefined) return clear(api.storage.session, OBSERVATIONS);
      const records = (await read(api.storage.session, OBSERVATIONS)) || {};
      delete records[tabId];
      if (Object.keys(records).length) await write(api.storage.session, OBSERVATIONS, records);
      else await clear(api.storage.session, OBSERVATIONS);
    },
    onSiteActivity(listener) {
      const subscriptions = [];
      function subscribe(source, handler, filter) {
        if (!source) return;
        if (filter) source.addListener(handler, filter);
        else source.addListener(handler);
        subscriptions.push(() => source.removeListener(handler));
      }
      function navigation(kind, details) {
        if (details.frameId !== 0 || !Number.isInteger(details.tabId)) return;
        listener({ kind, tabId: details.tabId, frameId: 0 });
      }
      subscribe(api.webNavigation?.onBeforeNavigate, details => navigation('beforeNavigate', details));
      subscribe(api.webNavigation?.onCommitted, details => navigation('committed', details));
      subscribe(api.webNavigation?.onErrorOccurred, details => navigation('navigationError', details));
      subscribe(api.tabs.onRemoved, tabId => listener({ kind: 'closed', tabId }));
      return () => subscriptions.forEach(unsubscribe => unsubscribe());
    },
    async getCatalog() {
      try {
        const containers = await api.contextualIdentities.query({});
        return { normalStoreId: 'firefox-default', containers: containers.map(({ cookieStoreId, name, color, icon }) => ({ cookieStoreId, name, color, icon })) };
      } catch {
        throw new BiscottyError('STORE_CATALOG_UNAVAILABLE', 'Enable Firefox containers before using the cookie burner.');
      }
    },
    async getAccess() {
      try {
        const granted = await api.permissions.contains({ permissions: ['cookies', 'storage', 'contextualIdentities', 'publicSuffix', 'webNavigation'], origins });
        const available = Boolean(api.cookies && api.publicSuffix && api.contextualIdentities && api.webNavigation);
        return { granted, available, reason: !granted ? 'Restore website access in Firefox Add-ons → Biscotty → Permissions.' : !available ? 'Required Firefox features are unavailable.' : '' };
      } catch { return { granted: false, available: false, reason: 'Firefox permissions could not be checked.' }; }
    },
    async classifyHost(host) {
      try {
        const canonical = new URL(`http://${host}/`).hostname.toLowerCase();
        const kind = canonical.startsWith('[') ? 'ipv6' : /^\d+\.\d+\.\d+\.\d+$/.test(canonical) ? 'ipv4' : 'dns';
        return { host: canonical, kind, knownSuffix: api.publicSuffix.isKnownSuffix(canonical), baseDomain: api.publicSuffix.getDomain(canonical) };
      } catch { throw new BiscottyError('CONTEXT_UNAVAILABLE', 'Firefox could not classify this hostname.'); }
    },
    async getActiveTab({ windowId } = {}) {
      if (!Number.isInteger(windowId)) throw new BiscottyError('CONTEXT_UNAVAILABLE', 'The current window is unavailable.');
      const [tab] = await api.tabs.query({ active: true, windowId });
      if (!tab) throw new BiscottyError('CONTEXT_UNAVAILABLE', 'The active page is unavailable.');
      return { id: tab.id, url: tab.url, cookieStoreId: tab.cookieStoreId, incognito: tab.incognito };
    },
    async getDocumentId(tabId) {
      const frame = await api.webNavigation.getFrame({ tabId, frameId: 0 });
      const id = frame?.documentId;
      return !frame?.errorOccurred && typeof id === 'string' && id.length > 0 && id.length <= 256 ? id : null;
    },
    async listCookies(storeId) {
      const cookies = await api.cookies.getAll({ storeId, partitionKey: {}, firstPartyDomain: null });
      return cookies.map(sanitizeCookie);
    },
    async removeCookie(details) {
      const result = await api.cookies.remove(details);
      return result === null ? null : { removed: true };
    },
    openOptions: () => api.runtime.openOptionsPage(),
    onEnvironmentChange(listener) {
      const events = [api.permissions.onAdded, api.permissions.onRemoved, api.contextualIdentities.onCreated, api.contextualIdentities.onUpdated, api.contextualIdentities.onRemoved];
      const notify = () => listener();
      events.forEach(event => event?.addListener(notify));
      return () => events.forEach(event => event?.removeListener(notify));
    },
    broadcast: event => api.runtime.sendMessage(event).catch(() => {})
  };
}
