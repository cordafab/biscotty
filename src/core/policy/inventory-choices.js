import { clone, fail } from '../errors.js';
import { normalizeDomain, normalizeRule, normalizeException, matcherKey, exceptionKey } from '../configuration/index.js';
import { matchCookie } from './index.js';

function usableFacts(cookie, domain, facts) {
  const key = cookie.partitionKey;
  let site;
  try { site = new URL(key?.topLevelSite); } catch { return false; }
  if (!['http:', 'https:'].includes(site.protocol) || ![site.origin, `${site.origin}/`].includes(key.topLevelSite) || Object.keys(key).some(name => !['topLevelSite', 'hasCrossSiteAncestor'].includes(name)) || (Object.hasOwn(key, 'hasCrossSiteAncestor') && typeof key.hasCrossSiteAncestor !== 'boolean')) return false;
  try { if (typeof cookie.firstPartyDomain !== 'string' || (cookie.firstPartyDomain !== '' && normalizeDomain(cookie.firstPartyDomain) !== site.hostname)) return false; } catch { return false; }
  const valid = (fact, host) => {
    if (!fact || fact.host !== host || !['dns', 'ipv4', 'ipv6'].includes(fact.kind) || fact.knownSuffix !== false) return false;
    if (fact.baseDomain === null) return fact.kind !== 'dns' || !host.includes('.');
    try { const base = normalizeDomain(fact.baseDomain); return base === fact.baseDomain && (host === base || host.endsWith(`.${base}`)); } catch { return false; }
  };
  return valid(facts?.cookieDomain, domain) && valid(facts?.topLevelSite, site.hostname);
}

// Plans are deliberately all-or-nothing. Scope acknowledgments describe the
// persistent selector, not a promise that a particular cookie can be removed.
export function planInventoryChoices({ record, choices }) {
  if (!record || record.schemaVersion !== 2 || !Array.isArray(record.exceptions) || !Array.isArray(choices) || choices.length > 200) fail('VALIDATION_FAILED', 'The inventory draft or choices are invalid.');
  const candidate = clone(record);
  const conflicts = [];
  const seen = new Map();
  const references = new Set(['normal', ...record.containerBindings.map(binding => binding.ref)]);
  const conflict = (index, code, message, affectedScope = null) => conflicts.push({ index, code, message, scope: affectedScope });
  // Jar representatives need not be the same cookie as an individual choice.
  // Detect opposing choices by their entire schemeful jar, independent of order.
  const jarGroups = new Map();
  for (const [index, item] of choices.entries()) {
    try {
      const site = new URL(item.cookie.partitionKey.topLevelSite);
      const key = JSON.stringify([item.storeRef, normalizeDomain(item.cookie.domain), site.origin]);
      const group = jarGroups.get(key) ?? [];
      group.push({ index, choice: item.choice, jar: item.jarChoice === true });
      jarGroups.set(key, group);
    } catch { /* The main validation reports unsupported choices. */ }
  }
  for (const group of jarGroups.values()) {
    for (const current of group) if (group.some(other => other.index !== current.index && (current.jar || other.jar) && current.choice !== other.choice)) {
      conflict(current.index, 'CONTRADICTORY_CHOICE', 'The jar and an individual cookie have conflicting choices.');
    }
  }
  for (let index = 0; index < choices.length; index++) {
    const item = choices[index];
    const cookie = item?.cookie;
    if (!item || !['keep', 'burnable'].includes(item.choice) || typeof item.scopeAcknowledged !== 'boolean' || !references.has(item.storeRef) || !cookie || typeof cookie.name !== 'string' || typeof cookie.path !== 'string' || !cookie.path.startsWith('/')) {
      conflict(index, 'INVALID_CHOICE', 'The selected cookie or store is invalid.'); continue;
    }
    let domain;
    try { domain = normalizeDomain(cookie.domain); } catch { conflict(index, 'INVALID_CHOICE', 'The cookie domain is invalid.'); continue; }
    if (cookie.partitionKey && candidate.exceptions.some(entry => entry.enabled) && !usableFacts(cookie, domain, item.facts)) {
      conflict(index, 'DOMAIN_UNAVAILABLE', 'The partition policy cannot be evaluated without verified domain facts.'); continue;
    }
    const key = JSON.stringify([domain, cookie.name, cookie.path, cookie.partitionKey, cookie.firstPartyDomain, item.storeRef]);
    if (seen.has(key) && seen.get(key) !== item.choice) { conflict(index, 'CONTRADICTORY_CHOICE', 'The same cookie has conflicting choices.'); continue; }
    seen.set(key, item.choice);
    const policy = matchCookie(cookie, candidate, item.storeRef, item.facts);
    if (item.jarChoice === true) {
      let site;
      try { site = new URL(cookie.partitionKey.topLevelSite); } catch { conflict(index, 'UNREPRESENTABLE', 'The jar partition is unavailable.'); continue; }
      if (!usableFacts(cookie, domain, item.facts)) { conflict(index, 'UNREPRESENTABLE', 'The jar partition cannot be verified safely.'); continue; }
      const scope = { type: 'selected', storeRefs: [item.storeRef] };
      const affected = { domain, topLevelDomain: site.hostname, scheme: site.protocol.slice(0, -1), name: null, path: null, scope, partitions: item.choice === 'keep' ? 'all' : 'matching site' };
      if (!item.scopeAcknowledged) { conflict(index, 'SCOPE_REVIEW_REQUIRED', 'This persistent jar choice includes future cookie names and paths and may affect additional partitions.', affected); continue; }
      if (item.choice === 'burnable' && candidate.protectedContainerRefs.includes(item.storeRef)) { conflict(index, 'CONTAINER_PROTECTED', 'Change whole-container protection before making this jar burnable.', affected); continue; }
      try {
        const facts = new Map([[domain, item.facts.cookieDomain], [site.hostname, item.facts.topLevelSite]]);
        const broadRule = normalizeRule({ domain, includeSubdomains: false, name: null, path: null, scope }, facts);
        if (item.choice === 'keep') {
          // A narrower enabled exception could defeat a wildcard keep for a
          // future cookie; require explicit exception review instead.
          const matchesDomain = (host, selector, subdomains) => host === selector || (subdomains && !host.startsWith('[') && host.endsWith(`.${selector}`));
          if (candidate.exceptions.some(entry => entry.enabled && (entry.scope.type === 'all' || entry.scope.storeRefs.includes(item.storeRef)) && matchesDomain(domain, entry.cookieDomain, entry.cookieIncludeSubdomains) && matchesDomain(site.hostname, entry.topLevelDomain, entry.topLevelIncludeSubdomains) && (entry.scheme === 'all' || entry.scheme === affected.scheme))) { conflict(index, 'EXCEPTION_CONFLICT', 'Review enabled exceptions that affect this jar before protecting it.', affected); continue; }
          const existing = candidate.rules.find(entry => matcherKey(entry) === matcherKey(broadRule));
          if (existing) {
            if (existing.scope.type === 'selected') existing.scope.storeRefs = [...new Set([...existing.scope.storeRefs, item.storeRef])].sort();
          } else candidate.rules.push(broadRule);
        } else {
          const entry = normalizeException({ cookieDomain: domain, cookieIncludeSubdomains: false, topLevelDomain: site.hostname, topLevelIncludeSubdomains: false, scheme: affected.scheme, name: null, path: null, scope, enabled: true }, facts);
          // Demonstrate this is a known third-party partition even when the
          // current cookie has no allow rule and thus needs no override yet.
          const trial = { ...candidate, rules: [broadRule], protectedContainerRefs: [], exceptions: [entry] };
          if (matchCookie(cookie, trial, item.storeRef, item.facts).protected) { conflict(index, 'UNREPRESENTABLE', 'The jar is not a verified third-party partition.', affected); continue; }
          const existing = candidate.exceptions.find(value => exceptionKey(value) === exceptionKey(entry));
          if (existing && !existing.enabled) { conflict(index, 'EXCEPTION_CONFLICT', 'Review the disabled exception before changing it.', affected); continue; }
          if (existing) {
            if (existing.scope.type === 'selected') existing.scope.storeRefs = [...new Set([...existing.scope.storeRefs, item.storeRef])].sort();
          } else candidate.exceptions.push(entry);
        }
      } catch { conflict(index, 'UNREPRESENTABLE', 'The complete jar cannot be validated safely.', affected); }
      continue;
    }
    if ((item.choice === 'keep') === policy.protected) continue;
    if (item.choice === 'burnable' && candidate.protectedContainerRefs.includes(item.storeRef)) {
      conflict(index, 'CONTAINER_PROTECTED', 'Change whole-container protection before making this cookie burnable.'); continue;
    }
    const scope = { type: 'selected', storeRefs: [item.storeRef] };
    if (item.choice === 'keep') {
      if (policy.matchingExceptionIndexes?.length) { conflict(index, 'EXCEPTION_OVERRIDE', 'An existing exception overrides matching allow rules; review it explicitly.'); continue; }
      const affected = { domain, name: cookie.name, path: cookie.path, scope, partitions: 'all' };
      if (!item.scopeAcknowledged) { conflict(index, 'SCOPE_REVIEW_REQUIRED', 'This persistent rule also applies to recreated cookies and all partitions for this store.', affected); continue; }
      try {
        const facts = new Map([[domain, item.facts?.cookieDomain]]);
        const rule = normalizeRule({ domain, includeSubdomains: false, name: cookie.name, path: cookie.path, scope }, facts);
        const existing = candidate.rules.find(entry => matcherKey(entry) === matcherKey(rule));
        if (existing) {
          if (existing.scope.type !== 'selected') { conflict(index, 'RULE_CONFLICT', 'Review the existing rule before changing this choice.', affected); continue; }
          existing.scope.storeRefs = [...new Set([...existing.scope.storeRefs, item.storeRef])].sort();
        } else candidate.rules.push(rule);
        if (!matchCookie(cookie, candidate, item.storeRef, item.facts).protected) conflict(index, 'EXCEPTION_OVERRIDE', 'An existing exception would override the proposed allow rule.', affected);
      } catch { conflict(index, 'DOMAIN_UNAVAILABLE', 'The cookie domain cannot be validated safely.', affected); }
      continue;
    }
    let site;
    try { site = new URL(cookie.partitionKey.topLevelSite); } catch { conflict(index, 'UNREPRESENTABLE', 'An unpartitioned or unknown cookie requires an explicit allow-rule change.'); continue; }
    const affected = { domain, topLevelDomain: site.hostname, scheme: site.protocol.slice(0, -1), name: cookie.name, path: cookie.path, scope };
    if (!item.scopeAcknowledged) { conflict(index, 'SCOPE_REVIEW_REQUIRED', 'This persistent exception can affect recreated cookies and matching partition identities for this site and store.', affected); continue; }
    try {
      const facts = new Map([[domain, item.facts?.cookieDomain], [site.hostname, item.facts?.topLevelSite]]);
      const entry = normalizeException({ cookieDomain: domain, cookieIncludeSubdomains: false, topLevelDomain: site.hostname, topLevelIncludeSubdomains: false, scheme: affected.scheme, name: cookie.name, path: cookie.path, scope, enabled: true }, facts);
      const existing = candidate.exceptions.find(value => exceptionKey(value) === exceptionKey(entry));
      if (existing && !existing.enabled) { conflict(index, 'EXCEPTION_CONFLICT', 'Review the disabled exception before enabling or changing it.', affected); continue; }
      const trial = clone(candidate);
      const target = trial.exceptions.find(value => exceptionKey(value) === exceptionKey(entry));
      if (target) {
        if (target.scope.type === 'selected') target.scope.storeRefs = [...new Set([...target.scope.storeRefs, item.storeRef])].sort();
      } else trial.exceptions.push(entry);
      const after = matchCookie(cookie, trial, item.storeRef, item.facts);
      if (after.protected || !after.matchingExceptionIndexes?.length) { conflict(index, 'UNREPRESENTABLE', 'The partition identity or site relationship cannot be verified safely.', affected); continue; }
      candidate.exceptions = trial.exceptions;
    } catch { conflict(index, 'UNREPRESENTABLE', 'The partition identity or site relationship cannot be validated safely.', affected); }
  }
  // Later choices can change the effect of an earlier choice. Never offer a
  // candidate that fails any selected outcome, even when each step succeeded.
  if (!conflicts.length) choices.forEach((item, index) => {
    let domain;
    try { domain = normalizeDomain(item.cookie.domain); } catch { conflict(index, 'INVALID_CHOICE', 'The cookie domain is invalid.'); return; }
    if (item.cookie.partitionKey && candidate.exceptions.some(entry => entry.enabled) && !usableFacts(item.cookie, domain, item.facts)) {
      conflict(index, 'DOMAIN_UNAVAILABLE', 'The final partition policy cannot be evaluated safely.'); return;
    }
    if (matchCookie(item.cookie, candidate, item.storeRef, item.facts).protected !== (item.choice === 'keep')) conflict(index, 'CHOICE_CONFLICT', 'Another choice changes this result; review the batch.');
  });
  return { candidate: conflicts.length ? clone(record) : candidate, conflicts };
}
