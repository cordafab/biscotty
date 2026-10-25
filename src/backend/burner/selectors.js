import { normalizeDomain } from '../../core/configuration/index.js';
export function selectorFor(cookie, storeRef) {
  try {
    if (typeof cookie.name !== 'string' || typeof cookie.path !== 'string' || !cookie.path.startsWith('/') || cookie.firstPartyDomain === undefined || cookie.partitionKey === undefined) return null;
    // Native URL serialization must not reinterpret the cookie path.
    if (/[?#\\\s%]/u.test(cookie.path) || /[^\x21-\x7e]/u.test(cookie.path)) return null;
    const domain = normalizeDomain(cookie.domain);
    const url = new URL(`${cookie.secure ? 'https' : 'http'}://${domain}${cookie.path}`);
    if (url.pathname !== cookie.path || url.hostname !== domain || url.search || url.hash) return null;
    if (cookie.partitionKey !== null && (typeof cookie.partitionKey.topLevelSite !== 'string' || Object.keys(cookie.partitionKey).some(key => !['topLevelSite','hasCrossSiteAncestor'].includes(key)))) return null;
    return { model: 'firefox-url-v1', url: url.href, name: cookie.name, storeRef, firstPartyDomain: cookie.firstPartyDomain, partitionKey: cookie.partitionKey };
  } catch { return null; }
}
export function nativeSelector(selector, storeId) {
  return {
    url: selector.url, name: selector.name, storeId,
    firstPartyDomain: selector.firstPartyDomain,
    // Empty topLevelSite selects unpartitioned storage explicitly.
    partitionKey: selector.partitionKey ?? { topLevelSite: '' }
  };
}
