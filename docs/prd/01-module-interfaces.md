# Shared module interfaces

Status: Required contract for all implementation tracks.
Current Site additions: Approved; implementation present; release verification incomplete.
Owner: Integration agent.
Read with the [product PRD](00-product.md) and [data contract](02-protection-and-settings.md#configuration-data).

## Module responsibilities

| Module | Required responsibility | Excluded responsibility |
| --- | --- | --- |
| Backend | Firefox access, action execution, operation state, configuration commits, and communication. | DOM access, GUI layout, form state, and dialogs. |
| Frontend | HTML, CSS, input collection, draft form state, confirmation screens, and result display. | Direct Firefox API calls, cookie deletion, and authoritative protection decisions. |
| Pure logic | Matching, schema checks, canonical forms, conflict calculations, and result calculations. | Firefox APIs, DOM access, storage access, and network access. |

- **ARCH-01.** All Firefox API calls MUST remain within backend modules.
- **ARCH-02.** The frontend MUST call the public backend client for every Firefox-dependent action.
- **ARCH-03.** The backend client MUST own the native communication transport.
- **ARCH-04.** Backend action handlers MUST enforce permission, validation, revision, and operation-lock checks.
- **ARCH-05.** Frontend checks MUST supplement backend checks, not replace them.
- **ARCH-06.** Pure logic MUST accept data and return data without external effects.
- **ARCH-07.** Production and test adapters MUST satisfy the same backend-facing interface.
- **ARCH-08.** Frontend responses MUST contain plain data without native Firefox objects or cookie values.
- **ARCH-09.** The frontend MUST use DOM text operations for imported or website-derived text.
- **ARCH-10.** The backend MUST accept requests only from its own packaged extension pages.

Standard frontend browser features include forms, DOM events, File input, Blob, and download links.
These features are not privileged Firefox extension APIs.
Frontend file handling transfers text; the backend validates and prepares the configuration content.

## Planned source locations

| Future path | Responsibility |
| --- | --- |
| `src/backend/client/` | Public client, communication transport, and user-gesture native calls. |
| `src/backend/gateway/` | Sender checks, action dispatch, response envelopes, and event delivery. |
| `src/backend/firefox/` | Native cookie, container, permission, storage, tab, and domain adapters. |
| `src/backend/configuration/` | Configuration actions and serialized commits. |
| `src/backend/burner/` | Preview, execution, cancellation, and interruption handling. |
| `src/backend/transfer/` | Import and export action execution. |
| `src/core/policy/` | Pure rule matching and deletion-selector safety. |
| `src/core/configuration/` | Pure data checks and canonical forms. |
| `src/core/transfer/` | Pure mapping and conflict calculations. |
| `src/frontend/` | Toolbar menu and configuration editor. |

The backend can use pure logic modules internally.
The frontend does not need those modules to decide protection or execute actions.

## Internal interfaces for parallel tracks

These interfaces are private backend implementation contracts.
They are not additional frontend actions.
The integration agent freezes their data fixtures during M0.

| Pure logic function | Inputs | Result |
| --- | --- | --- |
| `normalizeRule` | Raw matcher fields and native domain facts. | Canonical rule or field errors. |
| `validateConfiguration` | Complete candidate configuration and native domain facts. | Validated record or field errors. |
| `matchCookie` | Sanitized cookie metadata, configuration, and store reference. | Protected flag and matching protection reasons. |
| `assessSelector` | Selector model, configuration, and store reference. | Safe, unsafe, or unknown with reasons. |
| `getSiteProtection` | Site target, configuration, and store reference. | Full, partial, or no protection with reasons. |
| `planQuickProtection` | Configuration, site target, current store, and enabled state. | Candidate configuration or editor-required result. |

A selector model contains URL, name, store reference, first-party domain, and complete partition identity.
It identifies the supported Firefox matching model.
Missing matching facts must produce an unknown safety result.
A site target contains its canonical domain and whether subdomains are included.

| Native adapter operation | Input | Result |
| --- | --- | --- |
| `readConfigurationRecord` | None. | Stored private configuration or explicit missing/read failure. |
| `writeConfigurationRecord` | Complete private record. | Confirmed write or failure. |
| `readMarker`, `writeMarker`, `clearMarker` | None or opaque operation identifier, as applicable. | Current marker or confirmed change. |
| `readCurrentOperation`, `writeCurrentOperation`, `clearCurrentOperation` | None or current operation view, as applicable. | Session-memory view or confirmed change. |
| `getCatalog` | None. | Normal store and native named-container metadata. |
| `getAccess` | None. | Required grant state and native availability reasons. |
| `getActiveTab` | Backend-client window context. | Native tab identifier, URL, store identifier, and private flag. |
| `classifyHost` | Hostname. | Canonical host, host kind, known-suffix flag, and base domain or null. |
| `listCookies` | Native store identifier. | Sanitized metadata with complete native partition identity. |
| `removeCookie` | Complete native deletion selector. | Native success, no-match result, or failure. |
| `onSiteActivity` | Backend listener, registered synchronously. | Unsubscribe function for reduced request, navigation, and tab-lifetime events. |
| `readSiteObservations` | None. | Current session-memory observations or an explicit read failure. |
| `writeSiteObservation` | Native tab identifier and current observation record. | Confirmed session-memory write or failure. |
| `clearSiteObservation` | Native tab identifier, or all observations. | Confirmed removal or failure. |

Native adapter operations can return promises where Firefox access requires them.
Track B owns their production implementations and native tests.
Track A owns configuration reconciliation and uses those operations through injection.
Its reconciliation assigns extension references to native catalog entries.
Native identifiers stay private to backend implementations.

Reduced activity events contain only event kind, host, scheme, store identity, and necessary tab, frame, document, and request identifiers.
The adapter discards paths, queries, fragments, credentials, headers, and bodies before forwarding events.
An observation record contains its navigation generation, current document ancestry, contacted hosts, top-level site, store identity, and observation coverage.
Native identifiers and observation records remain private to the backend.
The backend serializes observation updates separately from configuration commits.

| Configuration operation | Input | Result |
| --- | --- | --- |
| `readConfiguration` | None. | Last confirmed private record and catalog generation. |
| `commitConfiguration` | Expected revision or recovery token, expected catalog generation, and complete candidate record. | Confirmed record or a defined error. |
| `reconcileCatalog` | Current native catalog. | Updated bindings and catalog generation without a user revision change. |

Track D and the burner use these operations instead of writing configuration storage directly.
All commits and reconciliations use the same backend mutation queue.
The backend maps public editable drafts to private candidate records before calling the configuration operation.

## Request and response envelopes

| Field | Contract |
| --- | --- |
| `protocolVersion` | Integer `1`. |
| `requestId` | Nonempty opaque identifier for one request. |
| `action` | One action from the table below. |
| `payload` | The defined plain-data input for that action. |
| `expectedRevision` | Required for each action that plans or changes configuration-dependent work. |

Normal configuration-dependent requests require an integer expected revision.
The import recovery path alone permits `expectedRevision: null` with a backend-issued `recoveryToken`.
See [configuration recovery](05-configuration-transfer.md#configuration-recovery) for its restricted use.

A response repeats `protocolVersion` and `requestId`.
A successful response contains `ok: true` and `data`.
A failed response contains `ok: false` and `error`.
An error contains `code`, a safe `message`, and optional field details.
Field details must contain no cookie values, complete browsing URLs, or native stack traces.

## Public actions

Inputs below omit the common envelope fields.
`expectedRevision` is an envelope field where the table requires a revision.

| Action | Input | Result | Revision required |
| --- | --- | --- | --- |
| `getState` | None. | Configuration, revision, store catalog, capabilities, and current operation view. | No. |
| `getCookies` | Store references, search text, page size, and optional page token. | Sanitized metadata page and optional next token. | No. |
| `getSiteContext` | Backend-client window context. | Opaque context token, site target, store, status, reasons, and permitted controls. | No. |
| `getSiteCookieDomains` | Context token, optional page size, and optional page token. | Domain snapshot page, observation coverage, revision, store reference, and next page token. | No. |
| `setSiteProtection` | Context token and enabled state. | New revision and effective site status. | Yes. |
| `saveSiteRule` | Domain token, rule index or null, and complete editable rule. | Committed revision. | Yes. |
| `saveConfiguration` | Editable rules, protected references, and inactive-reference decisions. | Committed editable configuration and new revision. | Yes. |
| `previewBurn` | None. | Preview token, captured revision, affected stores, and estimated counts. | Yes. |
| `startBurn` | Preview token. | Accepted operation identifier. | Yes. |
| `cancelBurn` | Operation identifier. | Cancellation-request state. | No. |
| `dismissOperation` | Operation identifier. | Cleared terminal result or interruption state. | No. |
| `prepareExport` | None. | Suggested filename and configuration text. | Yes. |
| `inspectImport` | Configuration text and proposed mode. | Import handle and source-container descriptions. | Yes. |
| `planImport` | Import handle, mode, and complete container-mapping decisions. | Plan token, entry changes, and individual conflicts. | Yes. |
| `resolveImport` | Plan token and conflict decisions. | Updated plan token, unresolved conflicts, and final change preview. | Yes. |
| `commitImport` | Fully resolved plan token. | Committed configuration and new revision. | Yes. |
| `openOptions` | Optional rule or store reference for focus. | Opened configuration page. | No. |
| `requestHostAccess` | None; direct user gesture required. | Permission result and refreshed capabilities. | No. |

The public client may expose methods instead of a generic request function.
The wire action names and behavior remain the same.
`requestHostAccess` belongs to the backend client when Firefox requires a live user gesture.
The frontend calls that method directly from its user event.
The client must not defer the native permission request beyond the permitted gesture.
If Firefox cannot restore access that way, return instructions for its permission interface.

## Current Site action contracts

These additions retain protocol version `1` and the existing configuration schema.
They do not describe actions already supplied by the baseline implementation.

### Domain snapshot pages

`getSiteCookieDomains` accepts `{ contextToken, pageSize?, pageToken? }`.
The default page size is 100 domains; the permitted range is 1 through 200.
Without `pageToken`, the backend captures a fresh domain snapshot for the context token.
With `pageToken`, it returns the next page of that snapshot.
Subsequent calls retain the original context token and page size.

| Result field | Contract |
| --- | --- |
| `domains` | Array of domain rows in ascending canonical-domain order. |
| `storeRef` | Captured current store reference. |
| `revision` | Configuration revision captured with the snapshot. |
| `coverage` | `{ state, reason }`; state is `observed` or `partial`; reason is safe text or null. |
| `nextPageToken` | Opaque continuation token, or null after the last domain. |

Each row contains the following fields.

| Row field | Contract |
| --- | --- |
| `domain` | Canonical cookie domain, using the existing domain normalization. |
| `cookieCount` | Positive integer counting associated stored cookies in this group. |
| `status` | `full`, `partial`, or `none`, from saved policy for this exact domain and store. |
| `reasons` | Sanitized protection reasons, including applicable rules and whole-container protection. |
| `matchingRuleIndexes` | Ascending indexes of all saved rules applicable to this domain and store. |
| `domainToken` | Opaque authorization context for adding or editing a rule from this row. |

Name and path restrictions remain visible on applicable rules, even when no current cookie satisfies those restrictions.
Whole-container protection does not hide the applicable rule indexes.
The row status describes policy coverage, independently of its cookie count.
An empty snapshot returns an empty `domains` array and a null continuation token.

`observed` means observation began with the current navigation and has no known gap within supported access.
It does not guarantee that every browser request was observable or every listed cookie was used.
`partial` requires a reason, including an unobserved load or lost observation state.
The [backend PRD](03-firefox-backend-and-burner.md#current-page-cookie-domains) defines selection and lifecycle behavior.

Page tokens bind to their snapshot, owner, site context, revision, catalog, and page size.
Later activity or cookie changes do not change captured counts or page order.
Navigation, permission, configuration, or relevant catalog changes invalidate dependent snapshot and domain tokens.
Ordinary observation updates do not invalidate an existing snapshot.

### Popup rule saves

`saveSiteRule` accepts `{ domainToken, ruleIndex, rule }` with the envelope's `expectedRevision`.
`rule` uses the existing editable allow-rule fields.
`ruleIndex: null` adds a rule; an integer selects an index offered by the domain row.
The backend validates the selected index against the token before constructing the candidate configuration.
The user can edit every rule field, including domain and store scope.

The backend changes only the selected rule, or appends the new rule.
It preserves other rules, native bindings, and protected-container references.
Existing complete-configuration validation rejects duplicate matchers and invalid scopes.
A successful commit consumes the domain token and returns `{ revision }`.
The frontend then requests current state, a new site context, and a fresh domain snapshot.

Domain tokens bind to the owner, tab, navigation generation, store, original domain, offered rule indexes, revision, and catalog.
The backend revalidates the active tab and navigation immediately before the queued configuration write.
A same-host reload changes the navigation generation and invalidates the old token.
Both a token check and an expected-revision check are required.

| Failure | Required result |
| --- | --- |
| Invalid payload, page size, page-size change, or unoffered rule index | `INVALID_REQUEST`; no write. |
| Missing, expired, or changed page context | `STALE_SITE_CONTEXT`; refresh before another save. |
| Changed configuration revision | `REVISION_CONFLICT`; preserve the frontend draft for review. |
| Missing required access | `PERMISSION_REQUIRED`; no enumeration or write. |
| Unavailable page, cookie enumeration, or store | `CONTEXT_UNAVAILABLE`; do not return a truncated snapshot. |
| Invalid complete candidate | `VALIDATION_FAILED`; retain field errors and the unsaved form. |
| Active burn | `OPERATION_ACTIVE`; no protection mutation. |
| Failed configuration write | Existing `STORAGE_FAILED` recovery behavior. |

Existing sender checks, request deduplication, mutation ordering, and storage verification apply to `saveSiteRule`.
Read-only domain snapshots remain available during a burn when cookie access remains available.

## Views and handles

A capability view contains `canBurn`, `canChangeProtection`, `canReadCookies`, and an explicit unavailable reason.
A store view contains its reference, current label, kind, availability, and whole-container protection state.

State also identifies a valid, missing, invalid, or unreadable configuration.
Only a confirmed missing or invalid record can enable `canRecoverConfiguration` with a temporary recovery token.
An unreadable native storage area cannot enable recovery writes.

Configuration views contain rules and protected references, not the internal native bindings.
Editable drafts cannot supply `cookieStoreId`, schema version, local revision, or native catalog metadata.
Inactive-reference decisions select Keep, Remove, or Map to an existing available reference.
The backend validates these decisions and constructs the complete stored record.

A cookie view contains domain, name, path, store reference, partition label, and effective protection reasons.
Additional cookie flags can describe Secure, HttpOnly, session, and persistent cookies.
Cookie values must be removed before view construction.

A site view contains the captured tab, normalized host, proposed site matcher, and current store reference.
It also contains `full`, `partial`, `none`, or `unavailable` protection status.
It contains a context token, not an authorization to change any arbitrary tab or store.
The context token also captures the current navigation generation.

A preview contains the eligible-attempt count, rule-protected count, ambiguous count, and affected-store list.
Protected containers can be reported as skipped stores without enumerating their cookies.
Counts must state their scope when some stores were not enumerated.

A handle is opaque, single-purpose, and bound to its creator context and configuration revision.
Mutation tokens are single-use after successful application.
A missing or expired handle requires a fresh context, snapshot, preview, or import plan for its purpose.

## Ordering and concurrency

- **ARCH-11.** Configuration commits MUST pass through one backend mutation queue.
- **ARCH-12.** A revision mismatch MUST reject the action without a configuration change.
- **ARCH-13.** A live burn MUST reject all protection mutations and import commits.
- **ARCH-14.** Burn acceptance MUST acquire the operation lock before the first deletion call.
- **ARCH-15.** Starting a burn MUST invalidate other burn preview tokens.
- **ARCH-16.** A changed configuration, permission set, or relevant store catalog MUST invalidate dependent previews and plans.
- **ARCH-17.** A repeated `startBurn` request MUST NOT start another operation.
- **ARCH-18.** A repeated configuration mutation MUST NOT apply twice.
- **ARCH-19.** Domain tokens MUST bind to their captured page, store, rule choices, revision, catalog, and owner.
- **ARCH-20.** Domain pagination MUST preserve one captured snapshot until its final page or invalidation.
- **ARCH-21.** `saveSiteRule` MUST preserve configuration outside the explicitly selected rule change.
- **ARCH-22.** The backend MUST revalidate the captured navigation immediately before a popup rule commit.

The backend may retain request deduplication data in session memory.
Configuration mutation replies include their committed revision.
After a lost reply, the frontend refreshes state before another mutation attempt.

## State events

The backend client provides a state-change subscription.
Events identify configuration revision changes, capability changes, store changes, and current operation changes.
They also identify active-site context invalidation without exposing contacted hosts or browsing URLs.
New observed hosts alone do not request a frontend inventory refresh.

Each event carries a monotonic session sequence number.
After reconnecting or detecting a sequence gap, the frontend calls `getState`.
Subscription delivery must not determine whether a burn can continue.

## Error codes

| Code | Meaning |
| --- | --- |
| `INVALID_REQUEST` | The request or protocol version is invalid. |
| `VALIDATION_FAILED` | Configuration fields are invalid. |
| `PERMISSION_REQUIRED` | Required website access is incomplete. |
| `PRIVATE_UNSUPPORTED` | The context is private browsing. |
| `CONTEXT_UNAVAILABLE` | The active page or store cannot be evaluated. |
| `STALE_SITE_CONTEXT` | The captured page, navigation, store, or site token is no longer valid. |
| `REVISION_CONFLICT` | A different configuration revision is active. |
| `STALE_PREVIEW` | The burn preview is no longer valid. |
| `STALE_IMPORT` | The import plan is no longer valid. |
| `OPERATION_ACTIVE` | A burn prevents this mutation or another burn. |
| `UNRESOLVED_CONFLICTS` | Import decisions remain incomplete. |
| `CONFIGURATION_UNAVAILABLE` | Settings are missing unexpectedly, invalid, or unreadable. |
| `STORE_CATALOG_UNAVAILABLE` | The complete required container scope is unknown. |
| `STORAGE_FAILED` | The backend could not confirm the required storage change. |
| `UNSUPPORTED_FORMAT` | The import format or schema version is unsupported. |
| `INTERNAL_FAILURE` | An unexpected failure prevented the action. |

## Acceptance criteria

- **ARCH-A01.** A source check finds Firefox extension API access only under `src/backend/`.
- **ARCH-A02.** Pure logic tests execute without Firefox or a DOM.
- **ARCH-A03.** The frontend operates against a backend test adapter through the public client interface.
- **ARCH-A04.** A website sender cannot invoke any backend action.
- **ARCH-A05.** Two concurrent saves cannot overwrite each other without a revision error.
- **ARCH-A06.** Closing and reopening a frontend view recovers current state without restarting the burn.
- **ARCH-A07.** Duplicate start requests cause at most one accepted operation.
- **ARCH-A08.** Cookie values never cross the backend response or event interface.
- **ARCH-A09.** Domain pages retain one snapshot; later activity does not change counts, ordering, or continuation results.
- **ARCH-A10.** Same-host navigation, expired tokens, and unoffered rule indexes cannot authorize a popup rule change.
- **ARCH-A11.** Popup saves preserve unrelated configuration; stale revisions and active burns prevent writes; repeated requests commit at most once.
