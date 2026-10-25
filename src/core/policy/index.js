import { clone } from '../errors.js';
import { normalizeDomain, matcherKey } from '../configuration/index.js';

const applies = (rule, storeRef) => rule.scope.type === 'all' || rule.scope.storeRefs.includes(storeRef);
const domainMatch = (host, domain, subdomains) => host === domain || (subdomains && !host.startsWith('[') && host.endsWith(`.${domain}`));
const reason = (rule, index) => ({ type: 'rule', ruleIndex: index, domain: rule.domain, scope: clone(rule.scope), name: rule.name, path: rule.path });
const containerReason = () => ({ type: 'container' });
export function matchCookie(cookie, configuration, storeRef) {
  const reasons = [];
  if (configuration.protectedContainerRefs.includes(storeRef)) reasons.push(containerReason());
  let host;
  try { host = normalizeDomain(cookie.domain); } catch { return { protected: true, reasons: [{ type: 'unknown-domain' }] }; }
  configuration.rules.forEach((rule, index) => {
    if (applies(rule, storeRef) && domainMatch(host, rule.domain, rule.includeSubdomains) && (rule.name === null || rule.name === cookie.name) && (rule.path === null || rule.path === cookie.path)) reasons.push(reason(rule, index));
  });
  return { protected: reasons.length > 0, reasons };
}
function pathMatches(requestPath, cookiePath) {
  return requestPath === cookiePath || (requestPath.startsWith(cookiePath) && (cookiePath.endsWith('/') || requestPath[cookiePath.length] === '/'));
}
export function assessSelector(selector, configuration, storeRef) {
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
  configuration.rules.forEach((rule, index) => {
    if (!applies(rule, storeRef) || (rule.name !== null && rule.name !== selector.name)) return;
    // Every ancestor cookie domain can be selected, even if no such cookie exists yet.
    // An exact parent-domain rule therefore intersects a child-host URL selector.
    const domainCanMatch = host === rule.domain || (!host.startsWith('[') && host.endsWith(`.${rule.domain}`));
    if (domainCanMatch && (rule.path === null || pathMatches(url.pathname, rule.path))) reasons.push(reason(rule, index));
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
export function getSiteProtection(target, configuration, storeRef) {
  if (configuration.protectedContainerRefs.includes(storeRef)) return { status: 'full', reasons: [containerReason()] };
  const reasons = [];
  let full = false;
  configuration.rules.forEach((rule, index) => {
    if (!applies(rule, storeRef) || !ruleIntersectsTarget(rule, target)) return;
    reasons.push(reason(rule, index));
    if (ruleCoversTarget(rule, target)) full = true;
  });
  return { status: full ? 'full' : reasons.length ? 'partial' : 'none', reasons };
}
export function planQuickProtection(configuration, target, storeRef, enabled) {
  const candidate = clone(configuration);
  const status = getSiteProtection(target, configuration, storeRef);
  const desired = { domain: target.domain, includeSubdomains: target.includeSubdomains, name: null, path: null, scope: { type: 'selected', storeRefs: [storeRef] } };
  const key = matcherKey(desired);
  const index = candidate.rules.findIndex(rule => matcherKey(rule) === key);
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
