import { clone } from '../../core/errors.js';
import { normalizeDomain } from '../../core/configuration/index.js';

const partial = reason => ({ state: 'partial', reason });
const gap = 'Observation did not begin with this page load. Reload the page to observe subsequent activity.';

// One current record per tab; no previous pages or request history are retained.
export function createObservations({ adapter, onInvalidate = () => {} }) {
  const records = new Map();
  let queue = Promise.resolve();
  let restored = false;
  const enqueue = work => { const result = queue.then(work); queue = result.catch(() => {}); return result; };
  function changed(tabId) { onInvalidate(tabId); }
  async function save(tabId, record) {
    try {
      await adapter.writeSiteObservation?.(tabId, record);
      if (adapter.readSiteObservations && adapter.writeSiteObservation) restored = true;
    }
    catch {
      record.coverage = partial('Page observation could not be saved. Reload after session storage is available.');
      // Remove an older successfully saved version rather than resurrecting its
      // observed claim after suspension when a newer update could not be saved.
      try { await adapter.clearSiteObservation?.(tabId); } catch { restored = false; }
    }
  }
  async function clear(tabId) {
    records.delete(tabId);
    try { await adapter.clearSiteObservation?.(tabId); } catch { restored = false; }
    changed(tabId);
  }
  async function site(host, scheme) {
    const facts = await adapter.classifyHost(host);
    return { scheme, domain: facts.baseDomain || facts.host };
  }
  async function start(event, observed) {
    const record = {
      generation: crypto.randomUUID(), storeId: event.storeId || null,
      host: event.host, scheme: event.scheme,
      topLevelSite: await site(event.host, event.scheme), hosts: [event.host],
      frames: {}, mainRequest: null, phase: 'loading', navigationStarted: false,
      coverage: observed && restored ? { state: 'observed', reason: null } : partial(gap)
    };
    records.set(event.tabId, record);
    changed(event.tabId);
    return record;
  }
  function addHost(record, host) { if (host && !record.hosts.includes(host)) record.hosts.push(host); }
  function removeFrames(record, frameId) {
    const descendants = new Set([frameId]);
    let added;
    do {
      added = false;
      for (const [id, frame] of Object.entries(record.frames)) {
        if (!descendants.has(Number(id)) && descendants.has(frame.parentFrameId)) {
          descendants.add(Number(id)); added = true;
        }
      }
    } while (added);
    for (const id of descendants) delete record.frames[id];
  }
  function correlated(record, event) {
    const frame = record.frames[event.frameId];
    return Boolean(event.documentId && frame?.documentId === event.documentId);
  }
  async function activity(event) {
    if (!Number.isInteger(event.tabId) || event.tabId < 0) return;
    if (event.kind === 'closed' || event.kind === 'unsupported') return clear(event.tabId);
    if (event.incognito || !event.host || !['http:', 'https:'].includes(event.scheme)) return;
    const access = await adapter.getAccess();
    if (!access.granted || !access.available) return clear(event.tabId);
    let record = records.get(event.tabId);
    if (event.kind === 'beforeNavigate' && event.frameId === 0) {
      if (record?.phase === 'loading' && !record.navigationStarted && record.mainRequest) {
        record.navigationStarted = true;
        addHost(record, event.host);
      } else {
        record = await start(event, true);
        record.navigationStarted = true;
      }
    } else if (event.kind === 'beforeNavigate' && record) {
      removeFrames(record, event.frameId);
    } else if (event.kind === 'request' && event.requestType === 'main_frame') {
      if (!record || record.phase !== 'loading' || (record.mainRequest && record.mainRequest !== event.requestId)) record = await start(event, true);
      if (record.storeId && event.storeId && record.storeId !== event.storeId) record = await start(event, false);
      record.storeId ||= event.storeId;
      record.mainRequest = event.requestId;
      record.host = event.host; record.scheme = event.scheme;
      record.topLevelSite = await site(event.host, event.scheme);
      addHost(record, event.host);
    } else if (event.kind === 'committed' && event.frameId === 0) {
      if (!record || record.phase !== 'loading') record = await start(event, false);
      record.host = event.host; record.scheme = event.scheme;
      record.topLevelSite = await site(event.host, event.scheme);
      record.storeId ||= event.storeId;
      record.phase = 'committed';
      record.frames = { 0: { documentId: event.documentId || null, parentFrameId: -1 } };
      if (event.restored) record.coverage = partial('This page was restored without its prior observation. Reload to observe a new page load.');
      if (!event.documentId) record.coverage = partial('Firefox did not supply document correlation for this page. Reload to retry observation.');
      addHost(record, event.host);
    } else if (event.kind === 'committed' && record) {
      const parent = record.frames[event.parentFrameId];
      if (!parent || !event.parentDocumentId || parent.documentId !== event.parentDocumentId) {
        record.coverage = partial('Some embedded document activity could not be attributed to this page.');
      } else {
        removeFrames(record, event.frameId);
        record.frames[event.frameId] = { documentId: event.documentId || null, parentFrameId: event.parentFrameId };
        addHost(record, event.host);
      }
    } else if (event.kind === 'request' && record) {
      if (event.storeId && record.storeId && event.storeId !== record.storeId) return;
      if (correlated(record, event)) addHost(record, event.host);
      else if (event.requestType === 'sub_frame' && event.parentDocumentId && record.frames[event.parentFrameId]?.documentId === event.parentDocumentId) addHost(record, event.host);
      else {
        // A known old document must not contaminate the current page. An unknown
        // document also cannot safely be guessed from a reused frame identifier.
        record.coverage = partial('Some request activity could not be attributed to the current document.');
      }
    } else if (event.kind === 'requestFinished' && record) {
      if (record.mainRequest === event.requestId) record.mainRequest = null;
    } else if (event.kind === 'navigationError' && record && event.frameId === 0) {
      record = await start(event, false);
      record.phase = 'uncertain';
    } else return;
    if (record) await save(event.tabId, record);
  }
  // Native listeners are installed before the first asynchronous session read.
  adapter.onSiteActivity?.(event => { enqueue(() => activity(event)).catch(() => {}); });
  const ready = enqueue(async () => {
    try {
      const stored = await adapter.readSiteObservations?.();
      if (stored && typeof stored === 'object') for (const [tabId, record] of Object.entries(stored)) {
        if (record && typeof record.generation === 'string' && Array.isArray(record.hosts) && record.topLevelSite && record.frames) records.set(Number(tabId), clone(record));
      }
      restored = Boolean(adapter.readSiteObservations && adapter.writeSiteObservation);
    } catch { restored = false; }
  });
  async function get(tab) {
    return enqueue(async () => {
      let url;
      try { url = new URL(tab.url); } catch { return null; }
      if (tab.incognito || !['http:', 'https:'].includes(url.protocol)) { await clear(tab.id); return null; }
      const host = normalizeDomain(url.hostname);
      let record = records.get(tab.id);
      if (!record || record.host !== host || record.scheme !== url.protocol || (record.storeId && record.storeId !== tab.cookieStoreId)) {
        record = await start({ tabId: tab.id, host, scheme: url.protocol, storeId: tab.cookieStoreId }, false);
        record.phase = 'uncertain';
      }
      record.storeId ||= tab.cookieStoreId;
      addHost(record, host);
      await save(tab.id, record);
      return clone(record);
    });
  }
  async function invalidate() {
    return enqueue(async () => {
      const tabIds = [...records.keys()]; records.clear();
      try { await adapter.clearSiteObservation?.(); } catch { restored = false; }
      tabIds.forEach(changed);
    });
  }
  return { ready, get, invalidate };
}
