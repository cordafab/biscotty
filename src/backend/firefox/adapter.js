import { BiscottyError, clone } from '../../core/errors.js';
const CONFIG = 'biscotty.configuration';
const MARKER = 'biscotty.inProgress';
const CURRENT = 'biscotty.currentOperation';
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
        const granted = await api.permissions.contains({ permissions: ['cookies', 'storage', 'contextualIdentities', 'publicSuffix'], origins });
        const available = Boolean(api.cookies && api.publicSuffix && api.contextualIdentities);
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
