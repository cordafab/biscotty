import { clone } from '../errors.js';
import { normalizeDomain, matcherKey } from '../configuration/index.js';

const applies = (rule, storeRef) => rule.scope.type === 'all' || rule.scope.storeRefs.includes(storeRef);
const domainMatch = (host, domain, subdomains) => host === domain || (subdomains && !host.startsWith('[') && host.endsWith(`.${domain}`));
const reason = (rule, index) => ({ type: 'rule', ruleIndex: index, domain: rule.domain, scope: clone(rule.scope), name: rule.name, path: rule.path });
const containerReason = () => ({ type: 'container' });
// Facts are trusted results from the native domain adapter for the two hosts.
// Missing or uncertain facts retain allow-rule protection.
function exceptionContext(cookie, facts) {
  const key = cookie.partitionKey;
  if (!key || typeof key !== 'object' || Array.isArray(key) || Object.keys(key).some(name => !['topLevelSite', 'hasCrossSiteAncestor'].includes(name)) || typeof key.topLevelSite !== 'string' || (Object.hasOwn(key, 'hasCrossSiteAncestor') && typeof key.hasCrossSiteAncestor !== 'boolean')) return null;
  let site, host;
  try {
    site = new URL(key.topLevelSite);
    host = normalizeDomain(cookie.domain);
    if (!['http:', 'https:'].includes(site.protocol) || site.username || site.password || site.port || site.pathname !== '/' || site.search || site.hash || ![site.origin, `${site.origin}/`].includes(key.topLevelSite) || normalizeDomain(site.hostname) !== site.hostname) return null;
    if (typeof cookie.firstPartyDomain !== 'string' || (cookie.firstPartyDomain !== '' && normalizeDomain(cookie.firstPartyDomain) !== site.hostname)) return null;
  } catch { return null; }
  const domainFact = facts?.cookieDomain;
  const siteFact = facts?.topLevelSite;
  function base(fact, expected) {
    if (!fact || fact.host !== expected || !['dns', 'ipv4', 'ipv6'].includes(fact.kind) || typeof fact.knownSuffix !== 'boolean' || fact.knownSuffix) return null;
    if (typeof fact.baseDomain === 'string' && fact.baseDomain) {
      try {
        const canonical = normalizeDomain(fact.baseDomain);
        if (canonical !== fact.baseDomain || !domainMatch(expected, canonical, true)) return null;
        return canonical;
      } catch { return null; }
    }
    // Only IP literals and single-label local hosts have an unambiguous exact fallback.
    if (fact.baseDomain !== null || (fact.kind === 'dns' && expected.includes('.'))) return null;
    return expected;
  }
  const domainBase = base(domainFact, host);
  const siteBase = base(siteFact, site.hostname);
  if (!domainBase || !siteBase || domainBase === siteBase) return null;
  return { host, site: site.hostname, scheme: site.protocol.slice(0, -1) };
}
export function matchCookie(cookie, configuration, storeRef, facts) {
  const reasons = [];
  if (configuration.protectedContainerRefs.includes(storeRef)) reasons.push(containerReason());
  let host;
  try { host = normalizeDomain(cookie.domain); } catch { return { protected: true, reasons: [{ type: 'unknown-domain' }] }; }
  configuration.rules.forEach((rule, index) => {
    if (applies(rule, storeRef) && domainMatch(host, rule.domain, rule.includeSubdomains) && (rule.name === null || rule.name === cookie.name) && (rule.path === null || rule.path === cookie.path)) reasons.push(reason(rule, index));
  });
  if (reasons.some(item => item.type === 'container') || !reasons.length) return { protected: reasons.length > 0, reasons };
  const context = exceptionContext(cookie, facts);
  const matches = [];
  if (context) (configuration.exceptions ?? []).forEach((entry, index) => {
    if (entry.enabled && applies(entry, storeRef) && domainMatch(context.host, entry.cookieDomain, entry.cookieIncludeSubdomains) && domainMatch(context.site, entry.topLevelDomain, entry.topLevelIncludeSubdomains) && (entry.scheme === 'all' || entry.scheme === context.scheme) && (entry.name === null || entry.name === cookie.name) && (entry.path === null || entry.path === cookie.path)) matches.push(index);
  });
  return matches.length ? { protected: false, reasons: [], overriddenRules: reasons, matchingExceptionIndexes: matches } : { protected: true, reasons };
}
function pathMatches(requestPath, cookiePath) {
  return requestPath === cookiePath || (requestPath.startsWith(cookiePath) && (cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/'));
}
// Every selectable cookie domain is the request host or one of its ancestors.
// Returning no hosts for an invalid selector keeps the caller fail-closed.
export function selectorCandidateHosts(selector) {
  try {
    const url = new URL(selector.url);
    const host = url.hostname;
    if (normalizeDomain(host) !== host) return [];
    if (host.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/u.test(host)) return [host];
    const labels = host.split('.');
    return labels.map((_, index) => labels.slice(index).join('.'));
  } catch { return []; }
}
export function assessSelector(selector, configuration, storeRef, facts) {
  const unknown = () => ({ status: 'unknown', reasons: [{ type: 'selector-uncertain' }] });
  if (!selector || selector.model !== 'firefox-url-v1' || selector.storeRef !== storeRef || typeof selector.name !== 'string' || typeof selector.firstPartyDomain !== 'string' || !Object.hasOwn(selector, 'partitionKey')) return unknown();
  if (selector.partitionKey !== null && (typeof selector.partitionKey !== 'object' || Array.isArray(selector.partitionKey) || Object.keys(selector.partitionKey).some(key => !['topLevelSite', 'hasCrossSiteAncestor'].includes(key)) || typeof selector.partitionKey.topLevelSite !== 'string' || (Object.hasOwn(selector.partitionKey, 'hasCrossSiteAncestor') && typeof selector.partitionKey.hasCrossSiteAncestor !== 'boolean'))) return unknown();
  let url;
  try { url = new URL(selector.url); } catch { return unknown(); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[%\\]/u.test(url.pathname)) return unknown();
  const host = url.hostname.toLowerCase();
  try { if (normalizeDomain(host) !== host) return unknown(); } catch { return unknown(); }
  if (configuration.protectedContainerRefs.includes(storeRef)) return { status: 'unsafe', reasons: [containerReason()] };
  const reasons = [];
  let exceptionBudget = 20000;
  configuration.rules.forEach((rule, index) => {
    if (!applies(rule, storeRef) || (rule.name !== null && rule.name !== selector.name)) return;
    // Every ancestor cookie domain can be selected, even if no such cookie exists yet.
    // An exact parent-domain rule therefore intersects a child-host URL selector.
    const domainCanMatch = host === rule.domain || (!host.startsWith('[') && host.endsWith(`.${rule.domain}`));
    if (!domainCanMatch || (rule.path !== null && !pathMatches(url.pathname, rule.path))) return;
    // Prove every possibly selected matching cookie is excepted. A rule with
    // unrestricted paths needs an unrestricted exception; a single exact-path
    // exception cannot cover all cookies that Firefox may remove.
    const candidates = selectorCandidateHosts(selector).filter(candidate => domainMatch(candidate, rule.domain, rule.includeSubdomains));
    const cost = candidates.length * (configuration.exceptions?.length ?? 0);
    if (cost > exceptionBudget) { reasons.push(reason(rule, index)); return; }
    exceptionBudget -= cost;
    const exceptions = (configuration.exceptions ?? []).filter(entry => rule.path !== null || entry.path === null);
    const covered = candidates.length > 0 && candidates.every(candidate => {
      const cookie = { domain: candidate, name: selector.name, path: rule.path ?? '/', partitionKey: selector.partitionKey, firstPartyDomain: selector.firstPartyDomain };
      const domainFact = facts?.cookieDomains instanceof Map ? facts.cookieDomains.get(candidate) : undefined;
      const result = matchCookie(cookie, { ...configuration, rules: [rule], exceptions }, storeRef, { cookieDomain: domainFact, topLevelSite: facts?.topLevelSite });
      return result.protected === false && result.matchingExceptionIndexes?.length > 0;
    });
    if (!covered) reasons.push(reason(rule, index));
  });
  return { status: reasons.length ? 'unsafe' : 'safe', reasons };
}
function ruleIntersectsTarget(rule, target) {
  return domainMatch(target.domain, rule.domain, rule.includeSubdomains) || (target.includeSubdomains && domainMatch(rule.domain, target.domain, true));
}
function ruleCoversTarget(rule, target) {
  if (rule.name !== null || rule.path !== null) return false;
  if (!domainMatch(target.domain, rule.domain, rule.includeSubdomains)) return false;
  return !target.includeSubdomains || rule.includeSubdomains;
}
function exceptionIntersectsTarget(entry, target, storeRef) {
  return entry.enabled && applies(entry, storeRef) && (domainMatch(target.domain, entry.cookieDomain, entry.cookieIncludeSubdomains) || (target.includeSubdomains && domainMatch(entry.cookieDomain, target.domain, true)));
}
export function getSiteProtection(target, configuration, storeRef) {
  if (configuration.protectedContainerRefs.includes(storeRef)) return { status: 'full', reasons: [containerReason()] };
  const reasons = [];
  let full = false;
  configuration.rules.forEach((rule, index) => {
    if (!applies(rule, storeRef) || !ruleIntersectsTarget(rule, target)) return;
    reasons.push(reason(rule, index));
    if (ruleCoversTarget(rule, target)) full = true;
  });
  if (reasons.length) for (const [index, entry] of (configuration.exceptions ?? []).entries()) {
    if (exceptionIntersectsTarget(entry, target, storeRef)) {
      full = false;
      reasons.push({ type: 'exception', exceptionIndex: index, domain: entry.cookieDomain });
    }
  }
  return { status: full ? 'full' : reasons.length ? 'partial' : 'none', reasons };
}
export function getDomainProtection(domain, configuration, storeRef, partition = null) {
  const target = { domain, includeSubdomains: false };
  const reasons = [];
  const containerProtected = configuration.protectedContainerRefs.includes(storeRef);
  let full = containerProtected;
  if (full) reasons.push(containerReason());
  configuration.rules.forEach((rule, index) => {
    if (!applies(rule, storeRef) || !domainMatch(domain, rule.domain, rule.includeSubdomains)) return;
    reasons.push(reason(rule, index));
    if (ruleCoversTarget(rule, target)) full = true;
  });
  if (!containerProtected) for (const [index, entry] of (configuration.exceptions ?? []).entries()) {
    if (!entry.enabled || !applies(entry, storeRef) || !domainMatch(domain, entry.cookieDomain, entry.cookieIncludeSubdomains)) continue;
    if (partition) {
      if (partition.group !== 'third-party' || typeof partition.topLevelSite !== 'string') continue;
      let site;
      try { site = new URL(partition.topLevelSite); } catch { continue; }
      if (!domainMatch(site.hostname, entry.topLevelDomain, entry.topLevelIncludeSubdomains) || (entry.scheme !== 'all' && entry.scheme !== site.protocol.slice(0, -1))) continue;
    }
    if (reasons.some(item => item.type === 'rule')) {
      full = false;
      reasons.push({ type: 'exception', exceptionIndex: index, domain: entry.cookieDomain });
    }
  }
  return { status: full ? 'full' : reasons.length ? 'partial' : 'none', reasons, matchingRuleIndexes: reasons.filter(item => item.type === 'rule').map(item => item.ruleIndex) };
}
export function planQuickProtection(configuration, target, storeRef, enabled) {
  const candidate = clone(configuration);
  const status = getSiteProtection(target, configuration, storeRef);
  const desired = { domain: target.domain, includeSubdomains: target.includeSubdomains, name: null, path: null, scope: { type: 'selected', storeRefs: [storeRef] } };
  const key = matcherKey(desired);
  const index = candidate.rules.findIndex(rule => matcherKey(rule) === key);
  if (enabled && (configuration.exceptions ?? []).some(entry => exceptionIntersectsTarget(entry, target, storeRef))) return { candidate, editorRequired: true, reasons: status.reasons };
  const inherited = configuration.protectedContainerRefs.includes(storeRef) || configuration.rules.some(rule => applies(rule, storeRef) && ruleCoversTarget(rule, target) && (matcherKey(rule) !== key || rule.scope.type === 'all'));
  if (inherited) return { candidate, editorRequired: true, reasons: status.reasons };
  if (enabled) {
    if (index < 0) candidate.rules.push(desired);
    else if (candidate.rules[index].scope.type === 'selected') candidate.rules[index].scope.storeRefs = [...new Set([...candidate.rules[index].scope.storeRefs, storeRef])].sort();
  } else if (index >= 0 && candidate.rules[index].scope.type === 'selected') {
    const refs = candidate.rules[index].scope.storeRefs.filter(ref => ref !== storeRef);
    if (refs.length) candidate.rules[index].scope.storeRefs = refs;
    else candidate.rules.splice(index, 1);
  }
  return { candidate, editorRequired: false, reasons: getSiteProtection(target, candidate, storeRef).reasons };
}
