# PRD: Firefox backend and cookie burner

Current Site cookie-domain list: Approved, implementation pending.
Owner: Track B.
Depends on the [module interfaces](01-module-interfaces.md) and [protection rules](02-protection-and-settings.md).
All native Firefox access belongs to this backend implementation or the backend client.

## Native platform

- **NATIVE-01.** The manifest MUST use version 3 with Firefox minimum version `153.0`.
- **NATIVE-02.** Background execution MUST use supported Firefox event-page scripts, not a service worker assumption.
- **NATIVE-03.** The manifest MUST request `cookies`, `storage`, `contextualIdentities`, `publicSuffix`, `webRequest`, and `webNavigation`.
- **NATIVE-04.** Host permissions MUST cover `http://*/*` and `https://*/*`.
- **NATIVE-05.** Private access MUST be excluded with `incognito: "not_allowed"`.
- **NATIVE-06.** The extension MUST NOT require `tabs`, `webRequestBlocking`, `browsingData`, or `downloads` permissions.
- **NATIVE-07.** Packaged resources MUST supply every script, stylesheet, font, and image.
- **NATIVE-08.** The extension MUST use no content scripts, inline scripts, dynamic evaluation, or remote executable resources.

Firefox supports MV3 event pages and unloads popup documents when they close.
See [background support](SOURCES.md#s07-background-execution) and [popup lifetime](SOURCES.md#s09-popup-lifetime).
An event-page suspension is a real interruption if it ends an active execution.
It must not be treated as permission to resume deletion.

Use native extension communication only behind the backend client.
Apply a restrictive extension-page content security policy.
The policy must allow packaged scripts and styles while blocking outbound connections.
The extension must make no network requests through another API or hidden page.

The Current Site amendment revises NATIVE-03 and NATIVE-06 to permit passive page observation.
The previous prohibition on `webRequest` is superseded for this purpose.
Observation must not block, redirect, or modify requests.
See [approved amendments](08-decisions.md#current-site-amendment) and [request observation](SOURCES.md#s20-passive-request-observation).

## Store catalog and access

- **NATIVE-09.** The catalog MUST contain Normal browsing and every available named container.
- **NATIVE-10.** Named-container discovery MUST use `contextualIdentities.query()`.
- **NATIVE-11.** Discovery MUST include containers without open tabs.
- **NATIVE-12.** `getAllCookieStores()` MUST NOT be the sole source of named containers.
- **NATIVE-13.** Native store identifiers MUST remain local and MUST be resolved from extension references before each operation.
- **NATIVE-14.** A disabled or unreadable container feature MUST block a burn when the required catalog cannot be established.
- **NATIVE-15.** Complete required host access MUST be checked before and after enumeration.
- **NATIVE-16.** Permission removal MUST disable new burns and stop further deletion calls in an active burn.

Normal browsing uses Firefox's documented default store identity through the adapter.
The frontend must never construct native store identifiers.
The current Firefox source discovers cookie stores through tabs.
This makes separate named-container discovery necessary; verify it on supported releases.
See [store discovery](SOURCES.md#s05-store-discovery).

Firefox's reserved-domain and native access restrictions remain in force.
Required host grants do not bypass those restrictions.
The interface must describe deletion within accessible supported scope, not claim unrestricted access to every browser cookie.

## Cookie enumeration

- **BURN-01.** Enumeration MUST select each supported store explicitly.
- **BURN-02.** Enumeration MUST include unpartitioned cookies and cookies from all supported partitions.
- **BURN-03.** Enumeration MUST include every supported first-party-isolation context.
- **BURN-04.** The adapter MUST preserve the complete native partition identity for deletion.
- **BURN-05.** The adapter MUST discard cookie values immediately after receiving native cookie objects.
- **BURN-06.** Session, persistent, Secure, and HttpOnly cookies MUST receive the same policy evaluation.
- **BURN-07.** An enumeration failure MUST prevent preview confirmation instead of producing incomplete coverage.

For the documented API, enumeration uses `partitionKey: {}` and `firstPartyDomain: null` with an explicit `storeId`.
Omitting partition selection would miss partitioned cookies.
See [enumeration details](SOURCES.md#s02-cookie-enumeration).
Preserve supported partition fields beyond `topLevelSite` when Firefox provides them.
Do not remove fields to fit an older example.

Protected containers can be skipped before enumeration.
Preview counts must distinguish protected stores from individually counted protected cookies.
The cookie-list action may enumerate a protected store when the user views its metadata.

## Current-page cookie domains

This section defines the approved Current Site additions, whose implementation is pending.
The existing burner still enumerates its complete eligible store scope.
The domain snapshot applies the narrower page and store selection defined here.
Shared operations and payload fields belong in the [action contracts](01-module-interfaces.md#current-site-action-contracts).

### Page observation

- **SITE-01.** Page observation MUST use passive HTTP/HTTPS request events without requesting headers or bodies.
- **SITE-02.** The adapter MUST register request and navigation listeners synchronously during event-page initialization.
- **SITE-03.** Page observation MUST continue independently of popup lifetime.
- **SITE-04.** A new top-level navigation MUST replace the previous page observation, including navigation within the same website.
- **SITE-05.** Server redirects within one navigation MUST retain that navigation's contacted hosts.
- **SITE-06.** Page observation MUST attribute embedded-frame and later requests to the current top-level document.
- **SITE-07.** Page observation MUST reject late request events from previous documents.
- **SITE-08.** Fragment and same-document history changes MUST preserve the current page observation.
- **SITE-09.** Tab closure, unsupported navigation, or permission loss MUST clear the affected page observations.
- **SITE-10.** The backend MUST retain page observations only in session memory.
- **SITE-11.** Retained observations MUST contain only the metadata permitted by the shared observation contract.
- **SITE-12.** Event-page suspension MUST preserve successfully saved current-page observations.
- **SITE-13.** A missing navigation start or known observation gap MUST produce partial observation coverage.

The backend uses document ancestry and a navigation generation to separate current and previous pages.
Request identifiers associate server redirects with one navigation.
Completed-request correlation entries are removed when no longer needed for navigation attribution.
Unavailable document correlation produces partial coverage instead of guessing an association.
Back/forward restoration without retained observation also produces partial coverage.
A canceled navigation cannot restore observed coverage without evidence for the remaining document.

Only current-page records belong in `storage.session`.
Permitted metadata includes hostnames, schemes, top-level site identity, native context identifiers, navigation generation, and observation coverage.
Top-level site identity contains a scheme and base domain, with an exact-host fallback for IP and local hosts.
It contains no path, query, fragment, port, or credentials.
The backend retains no request sequence, headers, bodies, cookie values, or complete browsing URLs.
Browser restart, extension reload, or extension disablement discards these observations.

Session read, write, or capacity failure must not produce observed coverage from uncertain records.
Missing records can be replaced by partial observations seeded with the current host.
These records permit useful first-party results before the user reloads the page.
No previous-page observations are retained for restoration or history.

See [navigation identity](SOURCES.md#s21-navigation-and-document-identity) and [session storage](SOURCES.md#s14-session-storage).
Association through contacted hosts is a product design inference, not proof of individual cookie use.

### Domain snapshot selection

- **SITE-14.** Domain enumeration MUST select only the captured current cookie store.
- **SITE-15.** A host-only cookie MUST require an exact match with a current or observed host.
- **SITE-16.** A domain cookie MUST require equality or a complete-label ancestor match with a current or observed host.
- **SITE-17.** Domain enumeration MUST exclude partition and first-party-isolation contexts belonging to unrelated top-level sites.
- **SITE-18.** Domain grouping MUST use the existing canonical cookie-domain normalization.
- **SITE-19.** Each matching native cookie MUST contribute once to its domain count, regardless of repeated host observations.
- **SITE-20.** An enumeration failure MUST fail the snapshot request instead of returning truncated counts.
- **SITE-21.** Domain rows MUST report saved policy for their exact domain independently of existing cookie counts.
- **SITE-22.** Page observation MUST NOT reload a website automatically.

The captured top-level host is always a candidate, including when observation coverage is partial.
Additional candidates come from that page observation, including redirects, embedded frames, and later requests.
Uncontacted sibling domains are not candidates merely because they share a base domain.
Domains without matching stored cookies have no row.

Unpartitioned cookies remain candidates when their first-party-isolation context permits the current site.
Partitioned cookies require the current schemeful top-level site.
First-party-isolated cookies require the current first-party domain.
Unknown partition associations are excluded and explained as partial coverage.
Distinct matching partition identities count separately; each native cookie still counts once.

Cookie paths and Secure, HttpOnly, session, and persistent flags do not restrict these domain-level counts.
Counts describe associated stored cookies, not requests, transmissions, or JavaScript reads.
Name, path, and partition metadata remain within the backend when constructing domain counts.
The backend exposes only grouped views and sanitized protection reasons.

## Deletion safety

Firefox deletion selects by URL, name, store, and partition context.
It does not accept a complete domain-and-path cookie identity.
Same-name selection depends on path length and creation order.
See [deletion selection](SOURCES.md#s03-cookie-deletion).

- **SAFE-01.** The burner MUST evaluate effective protection before proposing a deletion.
- **SAFE-02.** The burner MUST also evaluate the complete possible match set of its native deletion selector.
- **SAFE-03.** A selector that can match any protected cookie MUST be skipped.
- **SAFE-04.** The safety check MUST include protected identities that are absent from the current cookie snapshot.
- **SAFE-05.** The check MUST cover parent domains, host-only cookies, path overlap, cookie names, and store scope.
- **SAFE-06.** The check MUST preserve first-party and partition separation.
- **SAFE-07.** Unknown native selection behavior MUST cause a skip or a blocked operation, not a guessed deletion.
- **SAFE-08.** The backend MUST repeat safety and access checks immediately before each deletion call.
- **SAFE-09.** The burner MUST NOT delete and recreate protected cookies as a workaround.
- **SAFE-10.** An alternative deletion method MUST pass the same browser safety tests before use.

For each proposed URL, consider every cookie domain and path that Firefox could select.
Intersect those possibilities with applicable allow rules for that store.
Use protection rules, not only existing protected cookie objects, for that intersection.
This protects against a conflicting cookie created after preview.
Conservative extra skips are acceptable when the interface explains them.

The native API has no atomic compare-and-delete operation.
A safe eligible replacement can appear after enumeration and before deletion.
The operation bounds its requests; it cannot prove the exact removed identity from `remove()` alone.
Results must count successful native deletion calls without claiming exact identity confirmation.
Firefox, websites, and other extensions can independently expire or delete protected cookies.
The protection requirement governs actions initiated by Biscotty.

## Preview and execution

- **BURN-08.** A preview MUST capture the active configuration revision, store scope, and bounded cookie metadata snapshot.
- **BURN-09.** A preview MUST identify affected stores, proposed attempts, protected cookies, ambiguous skips, and the sign-out risk.
- **BURN-10.** The confirmation MUST consume one valid preview token.
- **BURN-11.** A revision, required-permission, or relevant catalog change MUST invalidate the preview.
- **BURN-12.** Execution MUST acquire the operation lock and save the interruption marker before the first deletion call.
- **BURN-13.** A failed marker write MUST prevent all deletion calls.
- **BURN-14.** Execution MUST make at most one deletion call for each approved snapshot candidate.
- **BURN-15.** Execution MUST NOT add targets because websites create new cookies.
- **BURN-16.** Execution MUST use explicit native store and partition identity for every deletion.
- **BURN-17.** Execution MUST process deletion calls serially to support cancellation and clear result counts.
- **BURN-18.** An individual deletion error MUST permit remaining safe attempts unless required access or scope is lost.
- **BURN-19.** Lost required access or unknown store scope MUST stop further calls and produce an incomplete result.
- **BURN-20.** Execution MUST continue independently of popup closure.
- **BURN-21.** Execution MUST NOT close tabs, reload sites, or change website content.

Repeated selectors can represent several eligible snapshot cookies.
Group those selectors with their approved candidate count instead of discarding their required attempts.
The group must never exceed that bounded count and must repeat the safety check before each call.
If native behavior makes the group unsafe or uncertain, skip its remaining candidates and explain the result.

Constructed URLs must preserve native cookie-path matching for encoded paths and special characters.
An unrepresentable or uncertain selector must be skipped instead of being guessed.
The native deletion result `null` means no matching cookie was removed.
It must not increase the removed count.
There are no automatic deletion retries in version 1.

## Cancellation and operation state

| State | Required behavior |
| --- | --- |
| `idle` | No burn is active. A new preview can be created. |
| `running` | One confirmed plan is executing. Protection mutations are blocked. |
| `cancel_requested` | The pending call can finish; no further deletion call can start. |
| `completed` | Every planned safe attempt finished without a deletion error. Skips remain visible. |
| `partial` | A deletion error or lost coverage prevented complete execution. |
| `canceled` | The user stopped further execution. Prior deletions remain effective. |
| `interrupted` | Execution ended without a confirmed normal terminal transition. |

A terminal result contains planned attempts, attempted calls, removed calls, not-found calls, errors, and unattempted calls.
It also contains safety-skip counts and a safe reason code.
Known counts must reconcile with completed native responses.
Unknown counts after interruption must appear as unknown, not zero.
The interface can describe `completed` with skips as “Completed with skipped cookies.”

- **BURN-22.** Cancellation MUST block new calls as soon as the backend receives the request.
- **BURN-23.** Cancellation MUST NOT claim to reverse completed deletion.
- **BURN-24.** A completed operation MUST release its lock after state and marker cleanup are confirmed.
- **BURN-25.** An active burn MUST NOT resume after browser restart, extension reload, or lost background execution.
- **BURN-26.** A retained marker without live execution MUST produce an interruption notice on the next initialization.
- **BURN-27.** Acknowledgment MUST clear the interruption marker before another burn starts.

## Temporary state without history

Persistent settings belong in `storage.local`.
The only additional persistent operation data is `biscotty.inProgress` with an opaque operation identifier.
It contains no counts, timestamps, cookie metadata, or completed-run records.
Remove it after a confirmed terminal transition or interruption acknowledgment.

Use process memory or `storage.session` for previews and the single current operation view.
Current-page observations also use session memory under the separate lifetime rules above.
Session storage is memory-only and can preserve the current result across event-page unloading.
See [session storage](SOURCES.md#s14-session-storage).

Dismissal clears that result.
Browser shutdown clears session data.
Starting another operation replaces the previous current result.

The current result is not a history list.
Detailed failure metadata may exist only within the current operation view.
It must disappear with that view and must never contain cookie values.
Production logs must not contain cookie metadata or browsing URLs.

## Acceptance criteria

| Case | Expected result |
| --- | --- |
| BURN-A01 | Normal browsing and inactive-tab containers are included; private browsing is excluded. |
| BURN-A02 | Unpartitioned, partitioned, first-party-isolated, Secure, HttpOnly, session, and persistent cookies are evaluated. |
| BURN-A03 | Protected containers and allow-rule matches receive no deletion call. |
| BURN-A04 | Same-name parent-domain and path collisions cannot cause protected deletion. |
| BURN-A05 | A protected conflicting cookie created after preview still prevents an unsafe selector call. |
| BURN-A06 | Changing settings, permissions, or relevant container scope invalidates an old preview. |
| BURN-A07 | Popup closure does not stop a live burn; reopening shows its current state. |
| BURN-A08 | Cancel during a pending deletion permits no subsequent deletion call. |
| BURN-A09 | Individual deletion errors produce accurate partial results and permit other safe attempts. |
| BURN-A10 | Restart or event-page execution loss never resumes a burn. |
| BURN-A11 | Marker-write failure causes zero deletions; cleanup failure blocks unsafe new execution. |
| BURN-A12 | `null` deletion results do not increase removed counts. |
| BURN-A13 | Cookies created during a burn do not extend its planned request count. |
| BURN-A14 | Dismissal and shutdown remove current results; local storage contains no operation history. |
| BURN-A15 | Simultaneous starts from two windows produce one active burn. |
| BURN-A16 | Permission loss during execution stops further calls and reports incomplete coverage. |
| BURN-A17 | Repeated safe selectors retain bounded coverage; encoded paths, IDNs, and IPv6 never bypass selector safety. |

### Current Site acceptance criteria

These cases describe required future implementation evidence.

| Case | Expected result |
| --- | --- |
| SITE-A01 | First-party and contacted third-party domains with stored cookies appear; uncontacted sibling domains do not. |
| SITE-A02 | Repeated requests and leading-dot variants produce one canonical domain row with each matching cookie counted once. |
| SITE-A03 | Host-only cookies require exact hosts; domain cookies match only complete domain labels. |
| SITE-A04 | Work, Personal, Normal browsing, and unrelated partition or first-party-isolation contexts remain separate. |
| SITE-A05 | One redirect chain retains its hosts; nested-frame and later requests belong to the current document. |
| SITE-A06 | New documents, including same-host reloads, clear previous observations and reject late previous-document requests. |
| SITE-A07 | Fragment and same-document history changes preserve the observation; unsupported navigation and tab closure clear it. |
| SITE-A08 | Already-open tabs, uncertain correlation, and back/forward restoration without retained observations report partial coverage. |
| SITE-A09 | Popup closure and event-page suspension preserve observation; restart, extension reload, and permission loss discard it. |
| SITE-A10 | Session failures cannot produce observed coverage; cookie enumeration failure cannot produce a truncated successful snapshot. |
| SITE-A11 | Retained metadata contains no request history, headers, bodies, values, or complete browsing URLs; observation changes no requests. |
| SITE-A12 | Domain status uses saved policy; counts include associated stored cookies without claiming transmission or individual use. |
