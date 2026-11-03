import { opaqueId } from '../../core/errors.js';

// Only navigation generations are kept: no URLs, contacted hosts or request history.
export const OBSERVATION_LIMITS = Object.freeze({ tabs: 128 });
export function createObservations({ adapter, onInvalidate = () => {}, limits = OBSERVATION_LIMITS }) {
  const generations = new Map();
  function resetTab(tabId) {
    generations.delete(tabId);
    generations.set(tabId, opaqueId());
    while (generations.size > limits.tabs) generations.delete(generations.keys().next().value);
  }
  adapter.onSiteActivity?.(event => {
    if (!Number.isInteger(event.tabId) || event.tabId < 0 || (event.frameId != null && event.frameId !== 0)) return;
    if (!['beforeNavigate', 'committed', 'navigationError', 'closed'].includes(event.kind)) return;
    if (event.kind === 'closed') generations.delete(event.tabId);
    else resetTab(event.tabId);
    onInvalidate(event.tabId);
  });
  // This key belongs to the retired request-observation implementation. It is
  // never restored or rewritten, including when cleanup fails.
  let cleared = false;
  let cleanup;
  function clearLegacy() {
    if (cleared) return Promise.resolve();
    if (!cleanup) cleanup = Promise.resolve().then(() => adapter.clearSiteObservation?.()).then(() => { cleared = true; }).finally(() => { cleanup = null; });
    return cleanup;
  }
  // Startup must not prevent unrelated burner recovery when session storage fails.
  // Site views retry cleanup and remain unavailable until it is confirmed.
  const ready = clearLegacy().catch(() => {});
  return {
    ready,
    async get(tab) {
      await clearLegacy();
      if (!generations.has(tab.id)) resetTab(tab.id);
      return { generation: generations.get(tab.id) };
    },
    async invalidate() { generations.clear(); onInvalidate(); }
  };
}
