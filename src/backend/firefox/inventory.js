import { normalizeDomain } from '../../core/configuration/index.js';

// A snapshot is rejected rather than silently truncated at either bound.
export const INVENTORY_LIMITS = Object.freeze({ cookies: 10000, bytes: 2 * 1024 * 1024 });
export function createInventoryClassifier(adapter) {
  const cache = new Map();
  async function classify(host) {
    if (!cache.has(host)) cache.set(host, Promise.resolve().then(() => adapter.classifyHost(host)).catch(() => null));
    return cache.get(host);
  }
  return async cookie => {
    let domain;
    try { domain = normalizeDomain(cookie.domain); } catch { return { association: { kind: 'unknown', topLevelSite: null, relationship: null }, facts: null }; }
    const cookieDomain = await classify(domain);
    const key = cookie.partitionKey;
    if (key === null && cookie.firstPartyDomain === '') return { association: { kind: 'unpartitioned', topLevelSite: null, relationship: null }, facts: { cookieDomain } };
    if (!key || typeof key !== 'object' || Array.isArray(key) || Object.keys(key).some(field => !['topLevelSite', 'hasCrossSiteAncestor'].includes(field)) || typeof key.topLevelSite !== 'string' || (Object.hasOwn(key, 'hasCrossSiteAncestor') && typeof key.hasCrossSiteAncestor !== 'boolean')) return { association: { kind: 'unknown', topLevelSite: null, relationship: null }, facts: null };
    let site;
    try {
      site = new URL(key.topLevelSite);
      if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password || site.port || site.search || site.hash || site.pathname !== '/' || normalizeDomain(site.hostname) !== site.hostname) throw new Error();
      if (typeof cookie.firstPartyDomain !== 'string' || (cookie.firstPartyDomain && normalizeDomain(cookie.firstPartyDomain) !== site.hostname)) throw new Error();
    } catch { return { association: { kind: 'unknown', topLevelSite: null, relationship: null }, facts: null }; }
    const topLevelSite = await classify(site.hostname);
    function base(fact, expected) {
      if (!fact || fact.host !== expected || fact.knownSuffix || !['dns', 'ipv4', 'ipv6'].includes(fact.kind)) return null;
      if (typeof fact.baseDomain === 'string' && fact.baseDomain && (expected === fact.baseDomain || expected.endsWith(`.${fact.baseDomain}`))) return fact.baseDomain;
      return fact.baseDomain === null && (fact.kind !== 'dns' || !expected.includes('.')) ? expected : null;
    }
    const cookieBase = base(cookieDomain, domain), siteBase = base(topLevelSite, site.hostname);
    if (!cookieBase || !siteBase) return { association: { kind: 'unknown', topLevelSite: null, relationship: null }, facts: null };
    return { association: { kind: 'partitioned', topLevelSite: `${site.protocol}//${site.hostname}`, relationship: cookieBase === siteBase ? 'own' : 'third-party' }, facts: { cookieDomain, topLevelSite } };
  };
}
