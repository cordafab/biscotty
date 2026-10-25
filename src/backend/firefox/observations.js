import { clone } from '../../core/errors.js';
import { normalizeDomain } from '../../core/configuration/index.js';

const partial = reason => ({ state: 'partial', reason });
const gap = 'Observation did not begin with this page load. Reload the page to observe subsequent activity.';
const limited = 'Page observation reached a resource limit. Some activity was omitted. Reload to start a new observation.';
export const OBSERVATION_LIMITS = Object.freeze({ tabs: 128, hosts: 1024, frames: 256, pendingEvents: 512, recordBytes: 256 * 1024, bytes: 4 * 1024 * 1024, flushInterval: 250 });
const size = value => new TextEncoder().encode(JSON.stringify(value)).length;

// One current record per tab; no previous pages or request history are retained.
export function createObservations({ adapter, onInvalidate = () => {}, limits = OBSERVATION_LIMITS }) {
  const records = new Map();
  const recordSizes = new Map();
  const pending = new Map();
  let retainedBytes = 2;
  let queue = Promise.resolve();
  let restored = false;
  let dirty = false;
  let draining = false;
  let resetPending = false;
  let epoch = 0;
  let eventSequence = 0;
  let lostCoverage = false;
  let persistTimer = null;
  const enqueue = work => { const result = queue.then(work); queue = result.catch(() => {}); return result; };
  function changed(tabId) { onInvalidate(tabId); }
  function clear(tabId) {
    if (!records.delete(tabId)) return;
    retainedBytes -= recordSizes.get(tabId) || 0;
    recordSizes.delete(tabId);
    dirty = true;
    changed(tabId);
  }
  function reset() {
    for (const tabId of [...records.keys()]) clear(tabId);
    lostCoverage = true;
    resetPending = false;
    dirty = true;
  }
  function retain(tabId, record) {
    const bytes = size(record) + size(String(tabId)) + 2;
    if (bytes > limits.recordBytes) { lostCoverage = true; clear(tabId); return; }
    retainedBytes += bytes - (recordSizes.get(tabId) || 0);
    recordSizes.set(tabId, bytes);
    records.delete(tabId);
    records.set(tabId, record);
    dirty = true;
    while (records.size > limits.tabs || retainedBytes > limits.bytes) { lostCoverage = true; clear(records.keys().next().value); }
  }
  function schedulePersistence() {
    if (!dirty || persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      enqueue(async () => { await drain(); await persist(); }).catch(() => {});
    }, limits.flushInterval);
    persistTimer.unref?.();
  }
  async function persist() {
    if (persistTimer !== null) { clearTimeout(persistTimer); persistTimer = null; }
    if (!dirty) return;
    dirty = false;
    try {
      await adapter.writeSiteObservations(Object.fromEntries(records));
      restored = true;
    } catch {
      for (const [tabId, record] of [...records]) {
        record.coverage = partial('Page observation could not be saved. Reload after session storage is available.');
        retain(tabId, record);
      }
      dirty = false;
      try { await adapter.clearSiteObservation(); } catch { restored = false; }
    }
  }
  async function drain() {
    if (resetPending) reset();
    const count = pending.size;
    for (let index = 0; index < count && pending.size; index++) {
      const key = pending.keys().next().value;
      const event = pending.get(key);
      pending.delete(key);
      const currentEpoch = epoch;
      if (event.epoch === currentEpoch) {
        const before = records.has(event.tabId) ? JSON.stringify(records.get(event.tabId)) : null;
        try {
          await activity(event);
          const record = records.get(event.tabId);
          if (record && JSON.stringify(record) !== before) retain(event.tabId, record);
        } catch { clear(event.tabId); }
      }
      if (currentEpoch !== epoch || resetPending) reset();
    }
    schedulePersistence();
  }
  function scheduleDrain() {
    if (draining) return;
    draining = true;
    enqueue(drain).catch(() => {}).finally(() => {
      draining = false;
      if (pending.size || resetPending) scheduleDrain();
    });
  }
  function accept(event) {
    if (!Number.isInteger(event.tabId) || event.tabId < 0) return;
    if (event.incognito) return;
    if (event.kind === 'requestFinished' && event.requestType !== 'main_frame') return;
    const textFields = ['documentId', 'parentDocumentId', 'storeId', 'requestId', 'requestType'];
    if ((event.host && (event.host.length > 253 || typeof event.host !== 'string')) || textFields.some(field => event[field] != null && (typeof event[field] !== 'string' || event[field].length > 256))) {
      pending.clear(); resetPending = true; epoch++;
      changed(); scheduleDrain(); return;
    }
    if (event.kind === 'closed' || event.kind === 'unsupported') {
      for (const [key, prior] of pending) if (prior.tabId === event.tabId) pending.delete(key);
    }
    // Equivalent resource requests contribute the same host, not request history.
    const coalescible = event.kind === 'request' && event.requestType !== 'main_frame';
    const key = coalescible ? JSON.stringify([event.kind, event.tabId, event.frameId, event.documentId, event.parentDocumentId, event.host, event.scheme, event.storeId, event.requestType]) : ++eventSequence;
    if (pending.has(key)) return;
    if (pending.size >= limits.pendingEvents) {
      pending.clear(); resetPending = true; epoch++;
      changed();
    }
    pending.set(key, { ...event, epoch });
    scheduleDrain();
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
      coverage: observed && restored && (!lostCoverage || records.has(event.tabId)) ? { state: 'observed', reason: null } : partial(gap)
    };
    records.set(event.tabId, record);
    changed(event.tabId);
    return record;
  }
  function addHost(record, host) {
    if (!host || record.hosts.includes(host)) return;
    if (record.hosts.length >= limits.hosts) record.coverage = partial(limited);
    else record.hosts.push(host);
  }
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
        if (Object.keys(record.frames).length >= limits.frames) record.coverage = partial(limited);
        else record.frames[event.frameId] = { documentId: event.documentId || null, parentFrameId: event.parentFrameId };
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

  }
  function restoreRecord(raw) {
    if (!raw || !Array.isArray(raw.hosts) || raw.hosts.length > limits.hosts || !raw.frames || typeof raw.frames !== 'object' || Array.isArray(raw.frames)) return null;
    const frames = Object.entries(raw.frames);
    if (frames.length > limits.frames) return null;
    const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 256;
    const host = value => typeof value === 'string' && value.length <= 253 && normalizeDomain(value) === value;
    try {
      if (!identifier(raw.generation) || !host(raw.host) || !['http:', 'https:'].includes(raw.scheme) || !raw.hosts.every(host) || (raw.storeId !== null && !identifier(raw.storeId))) return null;
      if (!raw.topLevelSite || raw.topLevelSite.scheme !== raw.scheme || !host(raw.topLevelSite.domain) || !['loading', 'committed', 'uncertain'].includes(raw.phase)) return null;
      if (typeof raw.navigationStarted !== 'boolean' || (raw.mainRequest !== null && !identifier(raw.mainRequest))) return null;
      if (!raw.coverage || !['observed', 'partial'].includes(raw.coverage.state) || (raw.coverage.reason !== null && (typeof raw.coverage.reason !== 'string' || raw.coverage.reason.length > 4096))) return null;
      if (raw.coverage.state === 'observed' ? raw.coverage.reason !== null : !raw.coverage.reason) return null;
      const ancestry = {};
      for (const [id, frame] of frames) {
        if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || !frame || !Number.isSafeInteger(frame.parentFrameId) || frame.parentFrameId < -1 || (frame.documentId !== null && !identifier(frame.documentId))) return null;
        ancestry[id] = { documentId: frame.documentId, parentFrameId: frame.parentFrameId };
      }
      return { generation: raw.generation, storeId: raw.storeId, host: raw.host, scheme: raw.scheme, topLevelSite: { scheme: raw.scheme, domain: raw.topLevelSite.domain }, hosts: [...new Set(raw.hosts)], frames: ancestry, mainRequest: raw.mainRequest, phase: raw.phase, navigationStarted: raw.navigationStarted, coverage: { state: raw.coverage.state, reason: raw.coverage.reason } };
    } catch { return null; }
  }
  // Native listeners are installed before the first asynchronous session read.
  adapter.onSiteActivity?.(accept);
  const ready = enqueue(async () => {
    try {
      const stored = await adapter.readSiteObservations();
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        let examined = 0;
        for (const tabId in stored) {
          if (examined++ >= limits.tabs) break;
          if (!Object.hasOwn(stored, tabId) || !/^\d+$/.test(tabId)) continue;
          const record = restoreRecord(stored[tabId]);
          if (record) retain(Number(tabId), record);
        }
      }
      restored = true;
      // Replace legacy state with the validated, bounded snapshot.
      dirty = true;
      await persist();
    } catch { restored = false; }
  });
  async function get(tab) {
    return enqueue(async () => {
      await drain();
      let url;
      try { url = new URL(tab.url); } catch { return null; }
      if (tab.incognito || !['http:', 'https:'].includes(url.protocol)) { clear(tab.id); await persist(); return null; }
      const host = normalizeDomain(url.hostname);
      let record = records.get(tab.id);
      const before = record ? JSON.stringify(record) : null;
      if (!record || record.host !== host || record.scheme !== url.protocol || (record.storeId && record.storeId !== tab.cookieStoreId)) {
        record = await start({ tabId: tab.id, host, scheme: url.protocol, storeId: tab.cookieStoreId }, false);
        record.phase = 'uncertain';
      }
      record.storeId ||= tab.cookieStoreId;
      addHost(record, host);
      if (JSON.stringify(record) !== before) retain(tab.id, record);
      if (!records.has(tab.id)) record.coverage = partial(limited);
      await persist();
      return clone(record);
    });
  }
  async function invalidate() {
    pending.clear(); resetPending = true; epoch++;
    return enqueue(async () => { reset(); await persist(); });
  }
  return { ready, get, invalidate };
}
