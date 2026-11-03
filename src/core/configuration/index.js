import { fail } from '../errors.js';

export const LIMITS = Object.freeze({ bytes: 2 * 1024 * 1024, rules: 10000, exceptions: 10000, containers: 1000, string: 4096, hostname: 253 });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function invalid(field, message) { fail('VALIDATION_FAILED', message, [{ field, message }]); }
export function checkFields(value, fields, field = 'configuration') {
  if (!object(value)) invalid(field, 'Use an object with the declared fields.');
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) invalid(field, 'Unknown or missing fields are not allowed.');
}
export function checkString(value, field, { empty = true, max = LIMITS.string } = {}) {
  if (typeof value !== 'string' || (!empty && !value) || [...value].length > max) invalid(field, `Use ${empty ? 'a' : 'a nonempty'} string within the size limit.`);
  return value;
}
export function checkSize(value, field = 'configuration') {
  let serialized;
  try { serialized = JSON.stringify(value); } catch { invalid(field, 'The configuration must contain plain JSON data.'); }
  if (new TextEncoder().encode(serialized).length > LIMITS.bytes) invalid(field, 'The configuration exceeds the 2 MiB size limit.');
}
export function normalizeDomain(value) {
  checkString(value, 'domain', { empty: false });
  let input = value;
  if (input.startsWith('.')) input = input.slice(1);
  if (input.endsWith('.')) input = input.slice(0, -1);
  if (!input || /[\s/@?#\\%*]/u.test(input) || input.includes('://')) invalid('domain', 'Enter a hostname without a scheme, port, path, wildcard, or user information.');
  // Brackets are required around IPv6 literals, as in standard URL hostnames.
  if (input.includes(':') && !(input.startsWith('[') && input.endsWith(']'))) invalid('domain', 'Ports are not allowed. Enclose an IPv6 address in brackets.');
  let parsed;
  try { parsed = new URL(`http://${input}/`); } catch { invalid('domain', 'Enter a valid hostname or IP address.'); }
  const host = parsed.hostname.toLowerCase();
  if (!host || parsed.port || parsed.username || parsed.password || parsed.pathname !== '/') invalid('domain', 'Enter a hostname without a port or path.');
  if (!host.startsWith('[')) {
    if (host.length > LIMITS.hostname || host.split('.').some(label => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label))) invalid('domain', 'Enter valid hostname labels within the size limit.');
  }
  return host;
}
export function matcherKey(rule) { return JSON.stringify([rule.domain, rule.includeSubdomains, rule.name, rule.path]); }
export function exceptionKey(value) { return JSON.stringify([value.cookieDomain, value.cookieIncludeSubdomains, value.topLevelDomain, value.topLevelIncludeSubdomains, value.scheme, value.name, value.path]); }
export function normalizeScope(raw, references) {
  if (!object(raw)) invalid('scope', 'Select All stores or a nonempty set of stores.');
  if (raw.type === 'all') { checkFields(raw, ['type'], 'scope'); return { type: 'all' }; }
  checkFields(raw, ['type', 'storeRefs'], 'scope');
  if (raw.type !== 'selected' || !Array.isArray(raw.storeRefs) || raw.storeRefs.length === 0 || raw.storeRefs.length > LIMITS.containers + 1) invalid('scope', 'Select at least one store.');
  const refs = raw.storeRefs.map(ref => checkString(ref, 'scope.storeRefs', { empty: false }));
  if (new Set(refs).size !== refs.length) invalid('scope.storeRefs', 'Store references must be unique.');
  if (references && refs.some(ref => !references.has(ref))) invalid('scope.storeRefs', 'The rule refers to an undefined store.');
  return { type: 'selected', storeRefs: [...refs].sort() };
}
export function normalizeRule(raw, facts = {}) {
  checkFields(raw, ['domain', 'includeSubdomains', 'name', 'path', 'scope'], 'rule');
  const domain = normalizeDomain(raw.domain);
  const fact = facts instanceof Map ? facts.get(domain) : Object.hasOwn(facts, domain) ? facts[domain] : undefined;
  if (!fact || fact.host !== domain || typeof fact.knownSuffix !== 'boolean' || !['dns', 'ipv4', 'ipv6'].includes(fact.kind)) invalid('domain', 'Native domain validation is unavailable.');
  if (fact.knownSuffix) invalid('domain', 'A public suffix cannot be used as an allow-rule domain.');
  if (typeof raw.includeSubdomains !== 'boolean') invalid('includeSubdomains', 'Choose exact host or include subdomains.');
  if (fact.kind !== 'dns' && raw.includeSubdomains) invalid('includeSubdomains', 'IP addresses require exact-host matching.');
  if (raw.name !== null) checkString(raw.name, 'name');
  if (raw.path !== null) { checkString(raw.path, 'path', { empty: false }); if (!raw.path.startsWith('/')) invalid('path', 'An exact cookie path must start with /.'); }
  return { domain, includeSubdomains: raw.includeSubdomains, name: raw.name, path: raw.path, scope: normalizeScope(raw.scope) };
}
export function normalizeException(raw, facts = {}) {
  checkFields(raw, ['cookieDomain', 'cookieIncludeSubdomains', 'topLevelDomain', 'topLevelIncludeSubdomains', 'scheme', 'name', 'path', 'scope', 'enabled'], 'exception');
  // Reuse rule validation for domain facts, exact fields and scope semantics.
  const cookie = normalizeRule({ domain: raw.cookieDomain, includeSubdomains: raw.cookieIncludeSubdomains, name: raw.name, path: raw.path, scope: raw.scope }, facts);
  const site = normalizeRule({ domain: raw.topLevelDomain, includeSubdomains: raw.topLevelIncludeSubdomains, name: null, path: null, scope: raw.scope }, facts);
  if (!['all', 'http', 'https'].includes(raw.scheme)) invalid('scheme', 'Choose both schemes, HTTP, or HTTPS.');
  if (typeof raw.enabled !== 'boolean') invalid('enabled', 'Choose whether the exception is enabled.');
  return { cookieDomain: cookie.domain, cookieIncludeSubdomains: cookie.includeSubdomains, topLevelDomain: site.domain, topLevelIncludeSubdomains: site.includeSubdomains, scheme: raw.scheme, name: cookie.name, path: cookie.path, scope: cookie.scope, enabled: raw.enabled };
}
export function validateConfiguration(raw, facts = {}) {
  const version = raw?.schemaVersion;
  checkFields(raw, version === 2 ? ['schemaVersion', 'revision', 'containerBindings', 'protectedContainerRefs', 'rules', 'exceptions'] : ['schemaVersion', 'revision', 'containerBindings', 'protectedContainerRefs', 'rules']);
  if (![1, 2].includes(version) || !Number.isSafeInteger(raw.revision) || raw.revision < 0) invalid('schemaVersion', 'The configuration version or revision is invalid.');
  if (!Array.isArray(raw.containerBindings) || raw.containerBindings.length > LIMITS.containers) invalid('containerBindings', 'The container limit is 1,000.');
  if (!Array.isArray(raw.rules) || raw.rules.length > LIMITS.rules) invalid('rules', 'The allow-rule limit is 10,000.');
  if (version === 2 && (!Array.isArray(raw.exceptions) || raw.exceptions.length > LIMITS.exceptions)) invalid('exceptions', 'The exception limit is 10,000.');
  if (!Array.isArray(raw.protectedContainerRefs)) invalid('protectedContainerRefs', 'Protected references must be an array.');
  checkSize(version === 2 ? { rules: raw.rules, protectedContainerRefs: raw.protectedContainerRefs, exceptions: raw.exceptions } : { rules: raw.rules, protectedContainerRefs: raw.protectedContainerRefs });
  const references = new Set(['normal']);
  const nativeIds = new Set();
  const containerBindings = raw.containerBindings.map(binding => {
    checkFields(binding, ['ref', 'cookieStoreId', 'name', 'color', 'icon', 'state'], 'containerBindings');
    const ref = checkString(binding.ref, 'containerBindings.ref', { empty: false });
    if (references.has(ref)) invalid('containerBindings.ref', 'Container references must be unique and cannot use normal.');
    references.add(ref);
    for (const key of ['name', 'color', 'icon']) checkString(binding[key], `containerBindings.${key}`);
    if (binding.state !== 'active' && binding.state !== 'inactive') invalid('containerBindings.state', 'Container state must be active or inactive.');
    if (binding.state === 'inactive' && binding.cookieStoreId !== null) invalid('containerBindings.cookieStoreId', 'An inactive container must have no native binding.');
    if (binding.state === 'active') {
      checkString(binding.cookieStoreId, 'containerBindings.cookieStoreId', { empty: false });
      if (nativeIds.has(binding.cookieStoreId)) invalid('containerBindings.cookieStoreId', 'Native container bindings must be unique.');
      nativeIds.add(binding.cookieStoreId);
    }
    return { ref, cookieStoreId: binding.cookieStoreId, name: binding.name, color: binding.color, icon: binding.icon, state: binding.state };
  });
  const protectedContainerRefs = raw.protectedContainerRefs.map(ref => checkString(ref, 'protectedContainerRefs', { empty: false }));
  if (new Set(protectedContainerRefs).size !== protectedContainerRefs.length || protectedContainerRefs.some(ref => ref === 'normal' || !references.has(ref))) invalid('protectedContainerRefs', 'Protected containers must be unique defined named-container references.');
  const keys = new Set();
  const rules = raw.rules.map(rawRule => {
    const rule = normalizeRule(rawRule, facts);
    rule.scope = normalizeScope(rule.scope, references);
    const key = matcherKey(rule);
    if (keys.has(key)) invalid('rules', 'Identical canonical matchers require one consolidated scope.');
    keys.add(key);
    return rule;
  });
  const result = { schemaVersion: version, revision: raw.revision, containerBindings, protectedContainerRefs: protectedContainerRefs.sort(), rules };
  if (version === 2) {
    const exceptionKeys = new Set();
    result.exceptions = raw.exceptions.map(entry => {
      const exception = normalizeException(entry, facts);
      exception.scope = normalizeScope(exception.scope, references);
      const key = exceptionKey(exception);
      if (exceptionKeys.has(key)) invalid('exceptions', 'Identical canonical exception matchers require one consolidated scope.');
      exceptionKeys.add(key);
      return exception;
    });
  }
  return result;
}
