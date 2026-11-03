# Implementation contracts

M0 establishes these contracts before parallel edits. Public actions retain the PRD envelopes.

All JavaScript uses native ES modules. Errors use `BiscottyError` from `src/core/errors.js`.
Pure functions throw that error on invalid input. Tests use `node:test` and `node:assert/strict`.

## Configuration service (Track A)

Export `createConfiguration({ adapter, emit, isLocked })` from `src/backend/configuration/service.js`.

- `initialize({ firstInstall = false } = {})`: read settings and reconcile catalog; initialize empty only on confirmed install.
- `readConfiguration()`: return `{ record, catalogGeneration, status, recoveryToken }`; `record` is null when unavailable.
- `view()`: return `{ configuration, exportStatus, revision, stores, configurationStatus, recoveryToken, catalogGeneration }`.
- `verifyConfiguration()`: asynchronously compare native storage with the confirmed record; reject changed or unavailable settings without entering the queue.
- `assertRevision(expectedRevision, recoveryToken)`: reject unavailable or stale settings; recovery token only permits missing/invalid state.
- `runExclusive(task)`: serialize a callback with all commits and reconciliations.
- `commitConfiguration({ expectedRevision, expectedCatalogGeneration, candidate, recoveryToken, beforeWrite? })`: validate and write complete record, check lock and current revision inside queue. Return `{ record, catalogGeneration }`. Optional `beforeWrite` performs final captured-site validation inside the queue.
- `reconcileCatalog(catalog)`: same queue, metadata-only write, retain revision; do not run while locked.
- `handlers.saveConfiguration(payload, request)`: editable `{ rules, protectedContainerRefs, inactiveDecisions }`, with request expectedRevision.

`record.containerBindings` uses PRD fields. Public store view: `{ ref, label, name, color, icon, kind: 'normal'|'container', availability: 'available'|'inactive', state, protected }`.
`configuration` is `{ rules, protectedContainerRefs }`. No native identifiers in views.
`exportStatus` is null without a valid record; otherwise `{ bytes, limitBytes, canExport }` measures the complete compact portable file.
User commits enforce that file's 2 MiB UTF-8 limit, including its newline. Reads and native catalog reconciliation preserve existing oversized protection.
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
`getDocumentId(tabId)` returns the current top-level document ID through `webNavigation.getFrame({ tabId, frameId: 0 })`.
It returns null for missing, invalid, or failed-navigation identities; native API failures throw.
The adapter discards the returned URL and other frame metadata.
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
`portableExportStatus(record)` and `serializePortable(record)` share one compact portable encoder in `src/core/transfer/index.js`.
Import plans check the complete resolved candidate before reporting it as committable. The configuration service repeats this check at commit.

## Frontend (Track C)

Import `client` from `../backend/client/native.js`. It offers every public action as `(payload = {}, expectedRevision)` and `subscribe(listener)`.
`windowContext()` resolves `{ windowId }`; call it for site capture. `requestHostAccess()` runs immediately in click event.
`getState` returns configuration view plus `{ capabilities, operation }`.
Capabilities include `canBurn`, `canChangeProtection`, `canReadCookies`, `canRecoverConfiguration`, `reason`.
Portable size excess is disclosed through `exportStatus`; it does not itself revoke editing or cookie protection.
Import model mapping choices use `Map`; `mappingDecisions()` validates all source decisions before sending plain mapping data through the client.
Site response `{ contextToken, target: { domain, includeSubdomains }, store, status, reasons, controls: { canProtect, canRemove, editorRequired } }`.
Cookie response `{ cookies, nextPageToken }`, cookie rows carry domain/name/path/storeRef/partitionLabel/protected/reasons and flags.
Cookie query `{ storeRefs?, search?, pageSize?, pageToken? }`.
Burn preview `{ previewToken, revision, stores, eligibleAttempts, ruleProtected, ambiguous, skippedStores, scope, warning }`.
Operation `{ id, state, plannedAttempts, attemptedCalls, removedCalls, notFoundCalls, errors, unattemptedCalls, safetySkips, reason }`.
`startBurn` returns `{ operationId }`. `cancelBurn`/`dismissOperation` payload `{ operationId }`.
Cancellation requires live execution in `running` or `cancel_requested`; terminal persistence cannot change the result back to an active state.
Public labels must not show transport/native identifiers.

## Current Site domains

`getSiteCookieDomains({ contextToken, pageSize?, pageToken? })` returns `{ domains, storeRef, revision, coverage, nextPageToken }`.
Each domain row contains `{ domain, cookieCount, status, reasons, matchingRuleIndexes, domainToken }`.
Page sizes range from 1 through 200; continuation retains the original size and context.
Snapshots remain fixed during subsequent page activity and cookie changes.

`saveSiteRule({ domainToken, ruleIndex, rule }, expectedRevision)` commits one offered rule or appends a rule when its index is null.
It returns `{ revision }` and preserves unrelated configuration.
Navigation, permission, catalog, owner, revision, operation-lock, and complete-record validation checks apply before writing.

`createObservations({ adapter, onInvalidate })` registers navigation listeners synchronously and exposes `{ ready, get, invalidate }`.
`get(tab)` confirms legacy session cleanup and returns the current in-memory navigation generation.
The service retains at most 128 tab generations and never observes requests or retains contacted hosts.
Failed legacy cleanup keeps site views unavailable; later reads retry cleanup without restoring old observations.
Top-level navigation and tab closure invalidate site contexts.
The adapter uses `webNavigation` without request listeners.
The [Current Site inventory amendment](../prd/partition-exceptions/02-current-site-inventory.md) controls the replacement behavior.

## Version 0.1.2 mutation admission

The gateway reserves entry and response-byte capacity before scheduling mutation handlers.
`REQUEST_CAPACITY` means no handler was scheduled; callers can wait for pending work and retry.
Identical in-flight requests share one execution; changed content under a retained identifier is rejected.
Request fingerprints are SHA-256 digests, not retained payload strings.
Completed responses expire after 15 minutes or are evicted for capacity.
Retries after eviction still require current revisions and valid, unconsumed tokens.
The private gateway constructor accepts `limits` and `now` for controlled tests.
The production limits are defined in [the request PRD](../prd/11-bounded-requests.md).

## Frontend refresh contracts

`getSiteContext({ windowId, storeRef? })` returns the selected `store` and captured `tabStore`.
Omitting the reference selects the active tab's store.
Tokens bind the original tab store separately from the selected cookie store.
`getCookies({ contextToken, pageSize?, pageToken? })` returns metadata for the captured site in that selected store.
Continuation tokens cannot move between contexts or into general Settings queries.
Unpartitioned third-party cookies cannot be attributed to a main site and are excluded from site-bound rows.
General inventory retains its existing association labels and scope filters.
