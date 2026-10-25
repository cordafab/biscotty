# Implementation verification

Date: 25 October 2026. Source version: 0.1.1.
M0 and the four M1 implementation tracks are integrated. M2 native coverage is partial. M3 signing remains open.
The release is not approved until every mandatory case in the PRDs has the required evidence.

## Completed checks

- Native Node.js tests exercise pure policy, validation, configuration commits, transfer, GUI controllers, and public gateway requests.
- Static source checks validate ES modules, local imports, packaged resources, frontend/backend separation, permissions, and prohibited network/dynamic execution.
- Firefox 158.0.1 on macOS 27.0.1 arm64 passed disposable-profile tests with first-party isolation disabled and enabled.
- Two separate Firefox profiles exported and imported synthetic protection using different native container identifiers.
- Native checks covered closed-tab containers, whole-container protection, future parent-domain/path collisions, partitions, Secure and HttpOnly metadata, first-party separation, encoded-path skips, and null deletion responses.
- Native DOM tests confirmed inert imported text, native form semantics, and the settings dialog's actual Save and Cancel behavior.
  The settings screen was visually inspected.
- Native package ZIP structure and CRCs were independently checked with the operating-system ZIP utility.

Run `npm test` for the current exact test count and observed results.
The baseline integrated Node.js check passed 99 tests; see the amendment evidence below for the current suite.
The default native run passed 13 scenarios; the isolated cross-profile run passed 14 scenarios.
Tests use Node.js v26.12.1 and Python 3.9 standard modules, with no third-party packages.

## Requirement-to-test map

The names in the automated tests contain the corresponding acceptance identifiers.
“Controlled” means the real public action contract with injected native adapters; it does not claim Firefox's native behavior.

| Acceptance cases | Automated evidence | Native evidence or remaining work |
| --- | --- | --- |
| ARCH-A01, ARCH-A02 | `scripts/check.mjs`; pure tests under `tests/core/`. | Source imports and privileged calls checked. |
| ARCH-A03 | `tests/frontend/models.test.js` uses the public client interface. | Native options and DOM harness run. Full interactive GUI checks remain. |
| ARCH-A04 | `tests/harness/gateway.test.js`. | Website and foreign-extension senders rejected by the gateway. |
| ARCH-A05 | `tests/backend/configuration/service.test.js`. | Concurrent saves tested through controlled gateway. |
| ARCH-A06 | Burner and frontend controller tests recover current operation state. | Real popup closure and reopening still require interactive evidence. |
| ARCH-A07 | `tests/backend/burner/service.test.js`. | Concurrent and repeated starts permit one operation. |
| ARCH-A08 | `tests/backend/firefox/views.test.js`; native sanitization. | Native inventory excludes synthetic cookie values. |
| RULE-A01, RULE-A02, RULE-A03, RULE-A04, RULE-A05, RULE-A06 | `tests/core/policy/policy.test.js`. | Native container skip and partition coverage also exercised. |
| CFG-A01, CFG-A02, CFG-A03, CFG-A04 | `tests/backend/configuration/service.test.js`. | Native first installation passed; injected failure paths use controlled adapters. |
| CFG-A05, CFG-A06, CFG-A07, CFG-A08 | Configuration backend and validation tests. | Native rename/recreation, signed update, and storage-failure injection remain in release matrix. |
| BURN-A01, BURN-A02, BURN-A03, BURN-A04, BURN-A05 | Burner service tests and native runner. | Native default/closed-tab stores, partitions/FPI and overlapping protection passed. |
| BURN-A06 | Burner and transfer invalidation tests. | Real permission revocation and container removal during execution remain. |
| BURN-A07, BURN-A08 | Controlled pending-call and frontend reconnect tests. | Real popup closure and interactive cancellation remain. |
| BURN-A09 | Controlled errors preserve safe remaining attempts and reconciled counts. | Individual native failures use injected adapters. |
| BURN-A10 | Controlled initialization with retained marker and stale session state. | Signed browser restart and actual event-page execution loss remain. |
| BURN-A11 | Marker/cleanup failure and simultaneous start/dismiss tests. | Failure injection uses controlled adapters. |
| BURN-A12, BURN-A13, BURN-A14 | Burner result, snapshot-bound and dismissal tests. | Native null result, bounded attempts, and local/session cleanup passed. |
| BURN-A15, BURN-A16 | Controlled simultaneous start and permission-loss tests. | Native multi-window and live permission revocation remain. |
| BURN-A17 | Selector and burner tests. | Encoded paths conservatively skip; native IDN/IPv6 construction and partition identity checked. |
| UI-A01, UI-A02, UI-A03, UI-A04, UI-A05, UI-A06, UI-A07, UI-A08 | Frontend controllers, pure policy, and backend site-view tests. | Native full interactive toolbar and navigation matrix remain. |
| UI-A09, UI-A10 | Draft preservation, concurrent revision, cancellation and active-operation controller tests. | Native two-window editing remains. |
| UI-A11 | `tests/frontend/browser.js` in native Firefox. | Imported HTML remains inert text. |
| UI-A12 | Native labels and form semantics; individual conflict controller tests. | Full keyboard, screen-reader, zoom and contrast inspection remain. |
| UI-A13 | Burner dismissal and frontend result tests. | Native current result dismisses without local history. |
| XFER-A01, XFER-A02, XFER-A03, XFER-A04 | Core and backend transfer tests. | Native two-profile transfer passed; duplicate names/inactive choices covered by controlled tests. |
| XFER-A05, XFER-A06, XFER-A07, XFER-A08 | Every conflict choice, mode change, explicit acknowledgment, and concurrent plan generation tested. | Native Replace commit passed. |
| XFER-A09, XFER-A10, XFER-A11 | Strict validation, prototype input, locks, stale catalog/access/revision, failed writes and recovery tests. | Controlled fault injection. |
| XFER-A12, XFER-A13, XFER-A14 | Export privacy, All stores exclusion, and supplied example tests. | Native export and explicit mappings passed. |

## Run native tests

Use disposable synthetic data only. The runner creates and removes a temporary profile.
It installs a test copy with a development-only script; production packaging excludes that script.
The runner connects only to Firefox's loopback Marionette automation endpoint.

```sh
python3 tests/native/firefox.py --export-file /tmp/biscotty-profile-a.json
python3 tests/native/firefox.py --fpi --import-file /tmp/biscotty-profile-a.json
```

Set `FIREFOX_BINARY` to test another Firefox executable.
Add `--screenshot /tmp/biscotty-options.png` to capture the settings page.
The two runs use separate profiles; the import run creates an additional container to change native identifier assignments.

The local permission profile may require approval to launch Firefox and bind a loopback port.
The runner never opens or deletes cookies in an existing personal profile.
It removes its temporary Firefox profile on exit.

## Safety reproductions

1. Create a domain cookie for `example.com` and a same-name host-only cookie for `shop.example.com`.
2. Give them overlapping `/account` and `/account/deep` paths.
3. Protect only the parent-domain `/account` identity.
4. Preview before the protected cookie exists, then create it before confirmation.
5. Confirm that the child selector is counted as ambiguous and both cookies remain.
6. Repeat in separate containers, partitions, and first-party contexts.
7. Repeat with encoded paths; uncertain URL serialization must skip the candidate.

For cancellation, delay one synthetic removal response and request cancellation while it is pending.
The response can finish; the next deletion call must never start.
For interruption, retain only an opaque marker and initialize a new backend instance.
It must show unknown counts and require dismissal before another burn.

## Responsiveness sample

On macOS arm64, Apple M5, Node.js v26.12.1, one synthetic 10,000-rule file contained 1,058,990 UTF-8 bytes.
A single pure-logic sample measured 9 ms for validation and 40 ms for planning/resolution.
These are observations, not duration guarantees. Native end-to-end large-profile measurements remain open.
Inventory renders at most 200 rows per backend page; the GUI requests 100.
Rules, mappings, conflicts, and result details use bounded GUI pages.
Preview/import preparation exposes progress and cancellation; late canceled responses cannot restore the discarded plan.

## Release limits

Firefox 153.0, current supported ESR, Windows, Linux, signed installation, signed update and restart are not yet verified.
No screen-reader conformance claim is made. Manual keyboard, zoom, contrast and popup lifecycle checks remain.
No signed package or public release was created.
These missing checks prevent a version 1 release-complete claim.

## Current Site amendment evidence

The implementation now includes domain snapshots, passive observation, and popup rule saves.
The final integrated Node.js suite passes 132 tests.
Controlled tests cover ARCH-A09 through ARCH-A11 and Current Site backend/frontend behavior.
The observation tests cover redirect ordering, nested-frame replacement, stale documents, same-host reloads, session restoration, failed storage, and back/forward coverage.
Domain tests cover host matching, current-store selection, FPI/partition filtering, policy reasons, 205-domain paging, narrow commits, deduplication, and failed writes.
Frontend tests cover paging, rule defaults, full existing-rule fields, immediate Save, draft preservation, stale contexts, and operation locks.

Firefox 158.0.1 on macOS 27.0.1 arm64 passed 14 native scenarios with first-party isolation disabled and enabled.
A loopback fixture now tests redirects, nested frames, third-party domain association, and same-host reload token rejection.
The final native runs also exercised the real popup document's pencil, Cancel, immediate Save, and modal closure inside a bounded iframe.
These checks use a disposable profile and standard-library loopback HTTP server.

Actual toolbar geometry, screen-reader behavior, zoom, popup closure during submission, permission revocation, and event-page suspension still require release evidence.
Signed installation, signed update, minimum-version Firefox, and other operating-system checks remain open.
