import { assessSelector, matchCookie } from '../../../src/core/policy/index.js';
import { selectorFor } from '../../../src/backend/burner/selectors.js';
import { createObservations, OBSERVATION_LIMITS } from '../../../src/backend/firefox/observations.js';

const domains = ['example.com', 'a.example.com', 'b.a.example.com', 'other.test', 'localhost', '127.0.0.1', '[::1]'];
const paths = ['/', '/a', '/a/', '/a/b', '/ab', '/b'];
const names = ['', 'sid', 'session'];
let checked = 0;
let unsafe = 0;
function pathMatches(request, cookie) {
  return request === cookie || request.startsWith(cookie) && (cookie.endsWith('/') || request[cookie.length] === '/');
}
for (const host of domains) for (const path of paths) for (const name of names) {
  const cookie = { domain: host, path, name, secure: true, hostOnly: true, firstPartyDomain: '', partitionKey: null };
  const selector = selectorFor(cookie, 'normal');
  if (!selector) throw new Error('Unexpected selector skip');
  for (const domain of domains) for (const rulePath of [null, ...paths]) for (const ruleName of [null, ...names]) for (const includeSubdomains of [false, true]) {
    const configuration = { protectedContainerRefs: [], rules: [{ domain, path: rulePath, name: ruleName, includeSubdomains, scope: { type: 'all' } }] };
    const safe = assessSelector(selector, configuration, 'normal').status === 'safe';
    for (const possibleDomain of domains) for (const possiblePath of paths) {
      if (!(host === possibleDomain || !host.startsWith('[') && host.endsWith('.' + possibleDomain)) || !pathMatches(path, possiblePath)) continue;
      const protectedCookie = matchCookie({ domain: possibleDomain, path: possiblePath, name }, configuration, 'normal').protected;
      checked++;
      if (safe && protectedCookie) unsafe++;
    }
  }
}

let send;
const adapter = {
  onSiteActivity(listener) { send = listener; },
  async readSiteObservations() { return {}; },
  async writeSiteObservations() {},
  async clearSiteObservation() {},
  async getAccess() { return { granted: true, available: true }; },
  async classifyHost(host) { return { host, baseDomain: host }; }
};
const observations = createObservations({ adapter, limits: { ...OBSERVATION_LIMITS, tabs: 128 } });
await observations.ready;
async function navigate(tabId, documentId) {
  const host = `tab${tabId}.example`;
  const event = { tabId, frameId: 0, host, scheme: 'https:', storeId: 'firefox-default', documentId, parentDocumentId: null };
  send({ ...event, kind: 'beforeNavigate' });
  send({ ...event, kind: 'committed' });
  return observations.get({ id: tabId, url: `https://${host}/`, cookieStoreId: 'firefox-default' });
}
const first = (await navigate(1, 'a')).coverage;
for (let id = 2; id <= 128; id++) await navigate(id, `doc-${id}`);
const eviction = (await navigate(129, 'evict')).coverage;
const recovery = (await navigate(1, 'c')).coverage;
const output = {
  selectorSafety: { checked, unsafe, passed: unsafe === 0 },
  observationEviction: {
    tabsLimit: 128,
    initialNavigation: first,
    navigationEvictingFirstTab: eviction,
    freshNavigationAfterEviction: recovery,
    expectedFreshNavigationState: 'observed',
    passed: recovery.state === 'observed'
  }
};
console.log(JSON.stringify(output, null, 2));
if (unsafe) process.exitCode = 1;
