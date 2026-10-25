# Implementation contracts

M0 establishes these contracts before parallel edits. Public actions retain the PRD envelopes.

All JavaScript uses native ES modules. Errors use `BiscottyError` from `src/core/errors.js`.
Pure functions throw that error on invalid input. Tests use `node:test` and `node:assert/strict`.

## Configuration service (Track A)

Export `createConfiguration({ adapter, emit, isLocked })` from `src/backend/configuration/service.js`.

- `initialize({ firstInstall = false } = {})`: read settings and reconcile catalog; initialize empty only on confirmed install.
- `readConfiguration()`: return `{ record, catalogGeneration, status, recoveryToken }`; `record` is null when unavailable.
- `view()`: return `{ configuration, revision, stores, configurationStatus, recoveryToken, catalogGeneration }`.
- `verifyConfiguration()`: asynchronously compare native storage with the confirmed record; reject changed or unavailable settings without entering the queue.
- `assertRevision(expectedRevision, recoveryToken)`: reject unavailable or stale settings; recovery token only permits missing/invalid state.
- `runExclusive(task)`: serialize a callback with all commits and reconciliations.
- `commitConfiguration({ expectedRevision, expectedCatalogGeneration, candidate, recoveryToken, beforeWrite? })`: validate and write complete record, check lock and current revision inside queue. Return `{ record, catalogGeneration }`. Optional `beforeWrite` performs final captured-site validation inside the queue.
- `reconcileCatalog(catalog)`: same queue, metadata-only write, retain revision; do not run while locked.
- `handlers.saveConfiguration(payload, request)`: editable `{ rules, protectedContainerRefs, inactiveDecisions }`, with request expectedRevision.

`record.containerBindings` uses PRD fields. Public store view: `{ ref, label, name, color, icon, kind: 'normal'|'container', availability: 'available'|'inactive', state, protected }`.
`configuration` is `{ rules, protectedContainerRefs }`. No native identifiers in views.
`inactiveDecisions` array entries: `{ ref, action: 'keep'|'remove'|'map', targetRef? }`.

Pure exports from `src/core/configuration/index.js`: `normalizeRule(raw, facts)`, `validateConfiguration(record, facts)`, `matcherKey(rule)`, `normalizeDomain(value)`.
`facts` is an object keyed by canonical domain. Each value: `{ host, kind: 'dns'|'ipv4'|'ipv6', knownSuffix, baseDomain }`.
Validation returns canonical record; throws field errors. No native calls in pure modules.
Pure exports from `src/core/policy/index.js`: `matchCookie(cookie, configuration, storeRef)`, `assessSelector(selector, configuration, storeRef)`, `getSiteProtection(target, configuration, storeRef)`, `planQuickProtection(configuration, target, storeRef, enabled)`.
Policy result: `{ protected, reasons }`; safety result `{ status: 'safe'|'unsafe'|'unknown', reasons }`; site result `{ status: 'full'|'partial'|'none', reasons }`; quick result `{ candidate, editorRequired, reasons }`.
Selector fields: `{ model: 'firefox-url-v1', url, name, storeRef, firstPartyDomain, partitionKey }`. Missing partitionKey or firstPartyDomain means unknown; unpartitioned partitionKey is null.

## Native adapter and burner (Integration / Track B)

Native adapter methods follow the PRD. `getCatalog()` returns `{ normalStoreId, containers: [{ cookieStoreId, name, color, icon }] }`.
`getAccess()` returns `{ granted, available, reason }`. `classifyHost(host)` returns facts above.
`readConfigurationRecord()` returns record or null; failures throw. Marker methods use opaque strings; current operation methods use plain data.
`listCookies(storeId)` returns value-free metadata including storeId, domain, name, path, hostOnly, secure, httpOnly, session, firstPartyDomain and complete partitionKey (null if unpartitioned).
`getActiveTab({ windowId })` returns `{ id, url, cookieStoreId, incognito }`.
`removeCookie(selector)` accepts Firefox details `{ url, name, storeId, firstPartyDomain, partitionKey? }`.

## Transfer service (Track D)

Export `createTransfer({ adapter, configuration, handles, emit, isLocked })` from `src/backend/transfer/service.js`. Return `{ handlers }` with all five transfer actions.
Handles use `handles.issue(kind, request.owner, data)`, `handles.get(token, kind, request.owner, errorCode)`, and `handles.remove(token)`.
Payloads: inspect `{ text, mode, recoveryToken? }`; plan `{ importHandle, mode, mappings, acknowledgeManyToOne?, recoveryToken? }`; resolve `{ planToken, decisions, acknowledgments?, recoveryToken? }`; commit `{ planToken, recoveryToken? }`.
Mappings: `[{ sourceRef, action: 'map'|'retain'|'exclude', targetRef? }]`.
Decisions: `[{ conflictId, choice: 'existing'|'imported'|'combine'|'protected'|'unprotected' }]`.
Acknowledgments: `{ replace: true, exclusions: true, manyToOne: true, recovery: true }` as required.
Inspect returns `{ importHandle, containers, mode }`. Plan/resolve return `{ planToken, conflicts, unresolvedConflicts, preview, canCommit }`.
Conflict view `{ id, type, existing, imported, choices }`; preview includes actual resulting rules and protected references plus added/changed/removed/duplicates/excluded/inactive details.
Export returns `{ filename, text }`; commit returns `{ configuration, revision }`.

## Frontend (Track C)

Import `client` from `../backend/client/native.js`. It offers every public action as `(payload = {}, expectedRevision)` and `subscribe(listener)`.
`windowContext()` resolves `{ windowId }`; call it for site capture. `requestHostAccess()` runs immediately in click event.
`getState` returns configuration view plus `{ capabilities, operation }`.
Capabilities include `canBurn`, `canChangeProtection`, `canReadCookies`, `canRecoverConfiguration`, `reason`.
Site response `{ contextToken, target: { domain, includeSubdomains }, store, status, reasons, controls: { canProtect, canRemove, editorRequired } }`.
Cookie response `{ cookies, nextPageToken }`, cookie rows carry domain/name/path/storeRef/partitionLabel/protected/reasons and flags.
Cookie query `{ storeRefs?, search?, pageSize?, pageToken? }`.
Burn preview `{ previewToken, revision, stores, eligibleAttempts, ruleProtected, ambiguous, skippedStores, scope, warning }`.
Operation `{ id, state, plannedAttempts, attemptedCalls, removedCalls, notFoundCalls, errors, unattemptedCalls, safetySkips, reason }`.
`startBurn` returns `{ operationId }`. `cancelBurn`/`dismissOperation` payload `{ operationId }`.
Public labels must not show transport/native identifiers.

## Current Site domains

`getSiteCookieDomains({ contextToken, pageSize?, pageToken? })` returns `{ domains, storeRef, revision, coverage, nextPageToken }`.
Each domain row contains `{ domain, cookieCount, status, reasons, matchingRuleIndexes, domainToken }`.
Page sizes range from 1 through 200; continuation retains the original size and context.
Snapshots remain fixed during subsequent page activity and cookie changes.

`saveSiteRule({ domainToken, ruleIndex, rule }, expectedRevision)` commits one offered rule or appends a rule when its index is null.
It returns `{ revision }` and preserves unrelated configuration.
Navigation, permission, catalog, owner, revision, operation-lock, and complete-record validation checks apply before writing.

`createObservations({ adapter, onInvalidate })` registers reduced activity listeners synchronously and exposes `{ ready, get, invalidate }`.
`ready` is a promise; `get(tab)` returns the current private observation with its navigation generation and coverage.
Observation work uses a bounded native-event queue and session storage only.
`writeSiteObservations(records)` confirms one complete bounded aggregate snapshot; `clearSiteObservation()` removes saved state after a failed write.
Limits, eviction, automatic batching, and partial coverage follow [the observation PRD](../prd/10-bounded-observation.md).
`createObservations` accepts an optional private `limits` object for controlled tests.
`siteContext` events invalidate the displayed page context; ordinary observed-host additions send no inventory-refresh event.
The adapter requires passive `webRequest` and `webNavigation` permissions without headers, bodies, blocking, or content scripts.

## Version 0.1.2 mutation admission

The gateway reserves entry and response-byte capacity before scheduling mutation handlers.
`REQUEST_CAPACITY` means no handler was scheduled; callers can wait for pending work and retry.
Identical in-flight requests share one execution; changed content under a retained identifier is rejected.
Request fingerprints are SHA-256 digests, not retained payload strings.
Completed responses expire after 15 minutes or are evicted for capacity.
Retries after eviction still require current revisions and valid, unconsumed tokens.
The private gateway constructor accepts `limits` and `now` for controlled tests.
The production limits are defined in [the request PRD](../prd/11-bounded-requests.md).
