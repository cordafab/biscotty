import { clone } from '../../src/core/errors.js';
import { emptyRecord } from './fixtures.js';
export function createTestAdapter(options = {}) {
  let record = options.record === undefined ? emptyRecord() : clone(options.record);
  let marker = options.marker ?? null;
  let operation = options.operation ?? null;
  const observations = clone(options.observations || {});
  const siteListeners = [];
  let catalog = options.catalog || { normalStoreId: 'firefox-default', containers: [{ cookieStoreId: 'firefox-container-4', name: 'Work', color: 'blue', icon: 'briefcase' }, { cookieStoreId: 'firefox-container-9', name: 'Personal', color: 'green', icon: 'fingerprint' }] };
  let access = { granted: true, available: true, reason: '' };
  let tab = { id: 1, url: 'https://shop.example.com/path', cookieStoreId: 'firefox-container-4', incognito: false };
  const calls = [], events = [], listeners = [];
  const cookies = options.cookies || {};
  const faults = {};
  const adapter = {
    faults, calls, events, cookies,
    get storedRecord() { return clone(record); },
    get marker() { return marker; },
    get operation() { return clone(operation); },
    setRecord(value) { record = clone(value); },
    setCatalog(value) { catalog = clone(value); },
    setAccess(value) { access = { ...access, ...value }; listeners.forEach(fn => fn()); },
    setTab(value) { tab = { ...tab, ...value }; },
    emitSiteActivity(event) { siteListeners.forEach(fn => fn(clone(event))); },
    onSiteActivity(fn) { siteListeners.push(fn); return () => { const index = siteListeners.indexOf(fn); if (index >= 0) siteListeners.splice(index, 1); }; },
    async readSiteObservations() { if (faults.observationRead) throw new Error('observation read'); return clone(observations); },
    async writeSiteObservation(tabId, value) { if (faults.observationWrite) throw new Error('observation write'); observations[tabId] = clone(value); },
    async clearSiteObservation(tabId) { if (faults.observationWrite) throw new Error('observation clear'); if (tabId === undefined) { for (const key of Object.keys(observations)) delete observations[key]; } else delete observations[tabId]; },
    async readConfigurationRecord() { if (faults.read) throw new Error('read'); return clone(record); },
    async writeConfigurationRecord(value) { if (faults.write) throw new Error('write'); record = clone(value); },
    async readMarker() { return marker; },
    async writeMarker(id) { if (faults.marker) throw new Error('marker'); marker = id; },
    async clearMarker() { if (faults.cleanup) throw new Error('cleanup'); marker = null; },
    async readCurrentOperation() { return clone(operation); },
    async writeCurrentOperation(value) { if (faults.session) throw new Error('session'); operation = clone(value); },
    async clearCurrentOperation() { operation = null; },
    async getCatalog() { if (faults.catalog) throw new Error('catalog'); return clone(catalog); },
    async getAccess() { return clone(access); },
    async getActiveTab() { return clone(tab); },
    async classifyHost(host) {
      return { host, kind: host.startsWith('[') ? 'ipv6' : /^\d+\.\d+\.\d+\.\d+$/.test(host) ? 'ipv4' : 'dns', knownSuffix: ['com','net','co.uk','github.io'].includes(host), baseDomain: host.endsWith('.com') || host.endsWith('.net') ? host.split('.').slice(-2).join('.') : null };
    },
    async listCookies(storeId) { if (faults.enumerate) throw new Error('enumerate'); calls.push({ type: 'list', storeId }); return clone(cookies[storeId] || []); },
    async removeCookie(selector) { calls.push({ type: 'remove', ...clone(selector) }); return options.remove ? options.remove(selector, calls.filter(call => call.type === 'remove').length) : { removed: true }; },
    async openOptions() {},
    onEnvironmentChange(fn) { listeners.push(fn); },
    broadcast(event) { events.push(clone(event)); }
  };
  return adapter;
}
export function cookie(overrides = {}) { return { domain: 'example.com', name: 'session', path: '/', hostOnly: true, secure: true, httpOnly: true, session: true, firstPartyDomain: '', partitionKey: null, ...overrides }; }
