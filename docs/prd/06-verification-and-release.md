# PRD: Verification and release

Current Site acceptance additions: Approved; implementation present; release verification incomplete.
Owner: Integration agent after the four implementation tracks.
Each track supplies its own acceptance evidence before integration.

## Verification method

- **QA-01.** Tests MUST use native platform features and standard runtime modules without external libraries.
- **QA-02.** Pure logic tests MUST execute without Firefox or a DOM.
- **QA-03.** Backend tests MUST exercise the public action interface with controlled native adapters.
- **QA-04.** Frontend tests MUST use the same public backend client interface as production.
- **QA-05.** Browser tests MUST verify real Firefox behavior that test adapters cannot prove.
- **QA-06.** Tests MUST verify outcomes rather than private function arrangement.
- **QA-07.** Test failures MUST include safe expected and actual results without real cookie values.

A small native JavaScript assertion harness is sufficient.
Node.js standard modules can run pure tests without package installation.
Native browser test pages can test DOM behavior.
A loopback fixture server can use a standard operating system runtime.
Fixture pages may make local test requests; the production extension still initiates no network requests.

Use dedicated disposable Firefox profiles for destructive cookie tests.
Use synthetic domains and test cookies.
Record the Firefox version, operating system, scenario, and observed result.
Do not use a person's ordinary browsing profile as the test fixture.

## Required test matrix

| Area | Required evidence |
| --- | --- |
| Rule scope | RULE-A01 through RULE-A06. Work, Personal, and Normal browsing must be distinct. |
| Settings | CFG-A01 through CFG-A08, including failed storage, recovery, and concurrent saves. |
| Module separation | ARCH-A01 through ARCH-A11 and a source dependency check. |
| Native deletion | BURN-A01 through BURN-A17 using real cookie stores where applicable. |
| Current Site | SITE-A01 through SITE-A12, including observation, grouped counts, navigation, and privacy. |
| GUI | UI-A01 through UI-A25 using both a backend test adapter and Firefox. |
| Transfer | XFER-A01 through XFER-A14 across two separate Firefox profiles. |
| Privacy | No outbound requests, cookie-value leakage, history, or unexpected persistent operation data. |
| Packaging | An unpacked build and a signed install show the same required behavior. |

Each acceptance case in a module PRD is mandatory.
A track cannot replace several cases with one general smoke-test statement.

## Browser coverage

- **QA-08.** Browser checks MUST cover Firefox 153.0 as the minimum supported version.
- **QA-09.** Browser checks MUST cover the current supported ESR patch and current stable desktop release at verification time.
- **QA-10.** Browser checks MUST include Windows, macOS, and Linux before the release claims support for all three.
- **QA-11.** The result record MUST identify versions instead of using “latest” as its only version description.

Temporary installs support development checks.
They do not prove signed-install permission behavior or restart persistence.
See [temporary installation](SOURCES.md#s16-temporary-installation).

## Native safety cases

Create separate cookies that differ in domain, path, host-only status, and partition context.
Use the same cookie name where native selection can overlap.
Protect at least one overlapping scope.
Verify that no unsafe deletion selector is sent and the protected cookie remains present.

Repeat with protected cookies created after the preview.
Repeat with a changed expiry, a removed cookie, and an eligible replacement.
Verify request-count bounds rather than assuming atomic identity deletion.
Record safe skips and unknown identity limitations.

Create a named container with cookies, then close every tab in that container.
Verify that the next burn still includes its eligible cookies.
Verify that a protected closed-tab container remains untouched.

Exercise default privacy behavior and first-party isolation where the supported Firefox release permits them.
Verify full supported partition identity instead of only one visible domain field.
If a native behavior is uncertain, keep its deletion path disabled until the case passes.

## Failure and lifecycle cases

Inject configuration read failures, write failures, missing records, and invalid records.
Verify that protection is never replaced silently with an empty configuration.
Inject marker-write and marker-clear failures.
Verify zero deletion before a confirmed marker and safe recovery after cleanup failure.

Close the popup during execution and reopen it.
Request cancellation during a pending deletion.
Revoke host permission during execution.
Disable containers and remove a container during execution.
Verify accurate incomplete states and no later unsafe calls.

Restart Firefox during a burn.
Also force event-page execution loss and reload the extension.
Verify interruption reporting without automatic continuation.
Inspect local and session storage after completion, dismissal, and restart.
Only configuration and a necessary temporary interruption marker can persist on disk.

## Current Site verification

These cases extend the required matrix; they are not recorded test results.
Use controlled adapters for deterministic lifecycle and storage-failure cases.
Use Firefox fixtures for native request attribution, partition behavior, popup lifetime, and permission prompts.

- **QA-14.** Native tests MUST verify third-party domain association using page requests and controlled cookie stores.
- **QA-15.** Lifecycle tests MUST verify current-document separation across redirects, nested frames, reloads, and background suspension.
- **QA-16.** Privacy tests MUST inspect retained observation metadata and public responses for prohibited request and cookie data.

Load a synthetic top-level page with first-party resources, nested third-party frames, redirects, and delayed requests.
Create cookies with overlapping domains, host-only flags, paths, and partition identities.
Verify grouped counts and exclusion of unrelated stores and top-level contexts.
Include more than 200 domain groups to verify continuation and complete access through bounded pages.

Open a tab before observation starts and verify partial coverage with manual reload guidance.
Refresh its list without reloading and verify that past activity remains unobserved.
Reload, navigate within the same host, and inject late events from the old document.
Verify new observation generations and rejection of stale rule saves.
Check fragment changes, same-document history, and back/forward restoration without retained observations.

Suspend the event page while the popup is closed, then load another resource before reopening.
Verify that successfully saved observation state remains usable.
Exercise session read, write, and capacity failures without claiming observed coverage.
Close tabs, revoke permissions, reload the extension, and restart Firefox.
Verify the required observation cleanup and incomplete-coverage behavior.

Exercise zero, one, and multiple applicable rules, including narrower and All stores rules.
Verify whole-container explanations and visible wider scope before an existing rule is saved.
Test immediate Save, Cancel, closure before Save, and closure after an accepted request.
Change the revision or page while a modal is open, and start a burn from another window.
Verify preserved drafts, refreshed target review, mutation deduplication, and backend lock enforcement.

Check accessible pencils, modal focus, paging, long domains, and loading or failed states.
Verify that cookie changes do not rearrange a displayed snapshot.
Inspect local storage, session storage, exported files, responses, and logs for prohibited metadata.
Record these results separately from baseline implementation evidence.

## Import and interface cases

Export from profile A and import into profile B with different native identifiers.
Include duplicate container names, missing containers, and inactive references.
Test many-to-one mapping and explicit exclusion.
Verify that All stores retains its meaning after exclusions.

Test every conflict choice in Merge and Replace.
Verify each change in the final preview against the committed configuration.
Cancel at every stage before commit.
Change the saved revision from another window before applying the plan.
Verify no partial update.

Test script-like cookie names and imported container labels as inert text.
Use keyboard-only operation, screen-reader inspection, text zoom, and system contrast modes.
Verify that long strings leave confirmation and cancellation controls accessible.

## Responsiveness

- **QA-12.** Inventory display MUST use bounded pages and avoid rendering the full inventory in one DOM update.
- **QA-13.** Large valid configurations MUST permit progress display and cancellation without exhausting the browser event loop.

Test the declared rule and file-size limits.
Measure inventory load and preview preparation with small and large synthetic profiles.
Record the measurements and hardware used.
No unmeasured fixed-duration completion promise is part of version 1.

## Release requirements

- **REL-01.** Packaging MUST work directly from native source files without a bundler or dependency installation.
- **REL-02.** The package MUST exclude test fixtures, development-only pages, secrets, and operation data.
- **REL-03.** The signed package MUST include its source version and required Firefox extension identity.
- **REL-04.** The release MUST declare no data collection through Mozilla's current manifest mechanism.
- **REL-05.** The release description MUST explain broad website access, manual deletion, protection scopes, and private-browsing exclusion.
- **REL-06.** Release documentation MUST explain possible sign-out, safe skips, and recreation of cookies by active websites.
- **REL-07.** A signed installation MUST pass permissions, restart, import/export, and protected-cookie safety checks.
- **REL-08.** Release approval MUST require zero unresolved protection defects and completed acceptance evidence.
- **REL-09.** The release owner MUST review current Mozilla submission requirements before submission.
- **REL-10.** Release documentation MUST explain passive page observation, its permissions, temporary metadata, and cookie-association limits.

Use [Mozilla manifest guidance](SOURCES.md#s17-mozilla-manifest-declarations) and [add-on policies](SOURCES.md#s18-mozilla-release-policies).
Preparing release files does not itself publish the extension.
Public submission requires the release owner's account and publication decision.

## Completion evidence

The implementation handoff contains a requirement-to-test map and test results.
It contains reproduction steps for native safety cases.
It contains the exact packaging procedure and signed-install results.
It identifies any platform-limited skips without calling them complete deletion.
An unresolved mandatory case prevents version 1 completion.
Current Site evidence must include signed-install and update permission checks for the amended manifest.
