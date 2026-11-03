# Implementation verification

## Version 0.2.1 metadata increment

Date: 3 November 2026. Current source version: 0.2.1.
The user requested a patch increment after the frontend refresh.
Manifest and package metadata agree; static source checks, package generation, ZIP integrity, and SHA-256 verification passed.
The frontend's 196 automated tests, 19 native scenarios, and seven browser DOM checks preceded this metadata increment.
The earlier `0.2.0` evidence below remains historical.


This file records current and historical implementation checks. Signed release verification remains incomplete.

## Version 0.2.0 working-tree verification

Date: 3 November 2026. Current source version: 0.2.0.
The 190 controlled Node.js tests pass with no failures or skips.
The static check passes for 28 native source files, imports, module boundaries, privacy restrictions, and the manifest.
The 30-file `biscotty-0.2.0.zip` archive passes ZIP integrity checks and contains manifest version `0.2.0`.
Firefox 159.0 on macOS 27.2 arm64 passes 18 disposable-profile scenarios without first-party isolation.
A separate profile passes 19 scenarios with first-party isolation and cross-profile import.
These runs include partition and store isolation, stale Current Site edits, and popup and Settings form behavior.
The code review corrected Current Site policy status to use saved policy coverage instead of only captured cookie outcomes.
Signed install, update, supported-platform, accessibility, and complete acceptance checks remain open.

M0 and the four M1 implementation tracks are integrated. M2 native coverage is partial. M3 signing remains open.
The release is not approved until every mandatory case in the PRDs has the required evidence.

## Version 0.1.5 lifecycle corrections

OBS-17 and OBS-A10 require restoration to verify the saved top-level document against Firefox's current document.
Matching committed records retain their generation and coverage; changed, loading, missing, and failed document lookups are discarded.
BURN-28 and BURN-A18 require late cancellation rejection during terminal result persistence and marker cleanup.
The controlled tests first reproduced both failures against unchanged production code.

The final suite passes 175 tests with zero failures or skips.
The independent audit probes pass 30 checks, including the original failure scenarios.
Firefox 158.0.1 on macOS 27.0.1 arm64 passes 17 default and 18 first-party-isolated native scenarios.
Those runs use separate disposable profiles and include reviewed cross-profile import.
The native regression verifies actual frame document IDs and rejects an old saved snapshot after same-host navigation.
Native observation listeners remain owned by the production background; restoration uses isolated saved-state fixtures.

Version `0.1.5` packaging, ZIP integrity, source identity, and Mozilla validator 10.14.0 pass.
Historical audit artifacts were removed during the approved documentation cleanup.
Signed installation, signed update, minimum-version, ESR, Windows, Linux, and complete accessibility/lifecycle acceptance remain open.

## Completed checks

- Native Node.js tests exercise pure policy, validation, configuration commits, transfer, GUI controllers, and public gateway requests.
- Static source checks validate ES modules, local imports, packaged resources, frontend/backend separation, permissions, and prohibited network/dynamic execution.
- Firefox 159.0 on macOS 27.2 arm64 passed disposable-profile tests with first-party isolation disabled and enabled.
- Two separate Firefox profiles exported and imported synthetic protection using different native container identifiers.
- Native checks covered closed-tab containers, whole-container protection, future parent-domain/path collisions, partitions, Secure and HttpOnly metadata, first-party separation, encoded-path skips, and null deletion responses.
- Native DOM tests confirmed inert imported text, native form semantics, and the settings dialog's actual Save and Cancel behavior.
  The settings screen was visually inspected.
- Native package ZIP structure and CRCs were independently checked with the operating-system ZIP utility.

Run `npm test` for the current exact test count and observed results.
The baseline integrated Node.js check passed 99 tests; see the amendment evidence below for the current suite.
The default native run passed 18 scenarios; the first-party-isolated cross-profile run passed 19 scenarios.
The 0.2.0 runs used Node.js v24.22.1 and Python 3.12.14 standard modules, with no third-party packages.

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

## Version 0.1.2 publishing preparation

Date: 25 October 2026. Status: implementation and local preparation checks passed; public release remains unapproved.
The [publishing PRD](../prd/09-publishing-0.1.md) defines this amendment.
The historical 0.1.1 security report was removed during the approved documentation cleanup.

### Implemented changes

- Manifest and package metadata identify `0.1.2`; the configuration and portable formats remain version `1`.
- Page observation coalesces equivalent resource requests and ignores non-navigation completion events.
- Explicit tab, host, frame, pending-event, record-byte, and aggregate-byte limits bound retained observation work.
- Automatic aggregate session snapshots batch changed state; unchanged reads do not rewrite saved observations.
- Overflow and eviction invalidate old navigation generations and produce partial coverage instead of inventing complete observation.
- Restored state is projected to permitted fields and checked against current resource limits.
- Mutation capacity is reserved before handler scheduling; rejected requests cause no handler invocation.
- Request digests replace retained payload fingerprints; completed responses expire or are evicted within a bounded cache.
- Existing revision and token checks reject replay after response eviction.
- The proposed listing now explains passive observation, all requested permissions, temporary metadata, resource limits, and association limits.
- Release material includes reviewer instructions and explicit owner-only submission fields.

### Acceptance evidence

| Cases | Observed evidence |
| --- | --- |
| PUB-A01, PUB-A02 | Version metadata and active release paths identify `0.1.2`; the 27-entry package passes ZIP integrity checks. |
| PUB-A03 | Listing, permission table, and privacy explanation include `webRequest`, `webNavigation`, and bounded session observations. |
| PUB-A04, PUB-A05 | Current results and outstanding signed, platform, and owner-only actions are recorded separately below. |
| PUB-A06 | Existing configuration, transfer, sender, selector, operation, and native fixtures continue to pass. |
| OBS-A01, OBS-A05 | A 4,000-request duplicate burst adds one host with one subsequent snapshot write; completion bursts and unchanged reads add none. |
| OBS-A02 | Small injected host and frame budgets retain bounded state with partial coverage. |
| OBS-A03, OBS-A04 | Overflow, in-flight work, closure, unsupported pages, tab eviction, and byte exhaustion reject stale generations and prevent resurrection. |
| OBS-A06 | Oversized hosts, malformed ancestry, aggregate restoration, and extra stored fields cannot restore an unsafe observed claim. |
| OBS-A07 | Existing storage failure tests and public permission-loss tests clear old saved observations and preserve protection. |
| OBS-A08, DEDUP-A08 | Existing native redirects, frames, reloads, popup saves, partitions, protected-cookie safety, and transfer cases pass. |
| DEDUP-A01, DEDUP-A02 | Entry and byte saturation reject pending work before a new handler call. |
| DEDUP-A03, DEDUP-A04 | Identical pending requests execute once; changed payloads fail; completed eviction and expiry retain pending identity. |
| DEDUP-A05 | Handler failure returns one safe cached error and releases unused response reservation. |
| DEDUP-A06 | A real configuration replay after eviction returns `REVISION_CONFLICT` without advancing the saved revision. |
| DEDUP-A07 | A 1 MiB request remains deduplicated within a 5,000-byte cache budget while subsequent work remains available. |

### Executed checks

| Check | Result |
| --- | --- |
| `npm test` | 148 passed; zero failures, skips, or cancellations. |
| `npm run package` | Static source check passed; native-source ZIP contains 27 production entries. |
| Independent ZIP integrity | All compressed entries and CRCs passed with `unzip -t`. |
| Mozilla `addons-linter` 10.14.0 | Zero errors, warnings, or notices for `biscotty-0.1.2.zip`. |
| Native Firefox, isolation disabled | 14 scenarios passed in a disposable profile. |
| Native Firefox, isolation enabled | 15 scenarios passed in a second profile, including cross-profile Replace import. |
| Document checks | See the [publishing document review](../prd/REVIEW.md#version-012-publishing-review). |

Environment: Firefox 158.0.1, macOS 27.0.1 arm64, Node.js v26.12.1, Python 3.9 standard modules.
The external Mozilla validator remained in temporary storage; no project library dependency was added.
Native tests use temporary installations with host access pre-granted by the fixture profile.
They do not establish signed-install permission behavior or adversarial browser stress limits.

Archive: `dist/biscotty-0.1.2.zip`.
SHA-256: `23b24d9cf0eb2a42636c7d29470ab8524aff86bc3ab481b82a9d5ba376e2c1bf`.

### Outstanding release gates

Signed installation, signed update, restart, actual event-page suspension, interactive toolbar lifetime, and live permission revocation still require evidence.
Firefox 153.0, the supported ESR patch, Windows, and Linux remain outside this run.
Keyboard, screen-reader, zoom, and contrast verification remain incomplete.
The release owner must select the license, provide support information, and complete account/listing fields.
No AMO upload, signing, or public publication was performed.
These open gates prevent a release-complete claim under REL-08.

## Version 0.1.3 startup recovery correction

Date: 25 October 2026. Status: correction and local preparation checks passed; signed release verification remains incomplete.
The patch follows the [publishing requirements](../prd/09-publishing-0.1.md) and [patch decision](../prd/08-decisions.md#version-013-patch).
The historical security report was removed; the correction and observed checks are summarized below.

Initialization now marks failed startup as interrupted without claiming a live executor.
Dismissal retains the operation lock until marker and session cleanup succeed.
Three public-gateway cases cover startup marker reads, current-operation reads, and interrupted-state writes.
They also check both cleanup failures, restored capabilities after dismissal, and zero automatic deletions.
All three cases failed before the production correction and passed afterward.

| Check | Result |
| --- | --- |
| `npm test` | 151 passed; zero failures, skips, or cancellations. |
| `npm run package` | Static checks passed for 25 source files; the archive contains 27 production entries. |
| ZIP integrity | All compressed entries and CRCs passed with `unzip -t`. |
| Mozilla `addons-linter` 10.14.0 | Zero errors, warnings, or notices for `biscotty-0.1.3.zip`. |

Environment: macOS 27.0.1 arm64, Node.js v26.12.1.
Native Firefox checks were not rerun for this patch; earlier results remain attached to their tested versions.
Signed, platform, accessibility, and lifecycle release gates remain pending.
No submission, signing, or public publication occurred.

Archive: `dist/biscotty-0.1.3.zip`.
SHA-256: `8e4f16db94b3266e3cbf686d25c9abb27ed4cc1be080d98fad613a4eb6055db2`.
