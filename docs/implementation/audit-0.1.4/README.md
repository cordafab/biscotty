# Biscotty 0.1.4: clean publication and security audit

Checked on 25 October 2026 against commit `8468b1c0d24d2f111970787607f22a01894972da`.
The working tree was clean when the audit started. Production source was not changed.
Earlier audit conclusions and saved test results were not used as passing evidence.

This historical verdict applies to version 0.1.4.
Both findings are corrected in [version 0.1.5](../publication-fixes-0.1.5.md), with separate verification evidence.

**Verdict: the archive passes Mozilla's current local validator, but I do not recommend publishing this version unchanged.**
Two new, reproducible P2 defects remain. Signed-install verification and submission preparation are also incomplete.
Local validation cannot establish that Mozilla will approve a submission.

## Standards and security

**Zero material security findings in the reviewed authorization, core validation, transfer, and frontend boundaries.**
This is a review result, not a proof that vulnerabilities are absent.

The extension uses readable local modules and has no third-party runtime dependencies, remote code, content scripts, or web-accessible resources.
Its restrictive extension CSP prohibits connections and dynamic execution.
Each requested API permission has an implemented use; HTTP/HTTPS cookie access supports the advertised profile-wide burner.
The background gateway requires the extension ID and an exact packaged popup or options URL.
Tokens bind to their issuing document and action type. Mutation admission and deduplication precede side effects.
Imported and website-derived strings use text nodes. Portable exports omit cookie values and native container identifiers.

New independent probes passed **9/9**, including **72,576** selector/protection comparisons.
They exercised hostile input, size limits, prototype-shaped references, conflict choices, sender isolation, handle ownership, capacity rejection, and draft preservation.
See [probe source](standards-probes.mjs) and [results](standards-results.json).

## Spec and lifecycle findings

**Two P2 findings. Both reproduce with new controlled fixtures through production modules.**
Neither reproduction showed protected-cookie deletion, remote execution, or data exfiltration.

### F1: stale prior-page observations can return as fully observed

Location: `src/backend/firefox/observations.js:69`, restoration at lines 247–262, and the current-page comparison at line 274.

1. Save a fully observed document A and its third-party hostnames in session storage.
2. Navigate to document B on the same hostname, scheme, and store.
3. Make both the observation write and cleanup fail.
4. End that background execution, restore storage availability, and create the next background instance.
5. Read B's current-page observation.

The replacement instance returns A's generation, document identity, and third-party hosts with `coverage.state="observed"`.
The failure flag exists only in the old process; restoration cannot distinguish the old document using hostname, scheme, and store alone.
This misattributes previous-page activity to the current page and defeats the partial-coverage warning.
It is a local privacy and data-integrity concern under this failure sequence.

Relevant requirements: OBS-12, OBS-16, SITE-13, and the current-document separation contract.
Validate restored state against the native current document, or discard/downgrade restored state whose document identity cannot be confirmed.
Keep coverage unavailable after persistence failure until a fresh observed navigation establishes it.

### F2: cancellation during terminal persistence leaves an undismissible running-looking result

Location: `src/backend/burner/service.js:129–146`; dismissal rejection at line 151.

1. Complete the final deletion and pause the write of the `completed` operation view.
2. Submit `cancelBurn` for that operation.
3. Release the pending write and let cleanup finish.

Cancellation succeeds because `live` is still true. It changes the operation back to `cancel_requested` after terminal-state calculation.
Cleanup clears the marker and unlocks the backend, but does not restore a terminal operation state.
The backend reports `canBurn=true`; dismissal rejects `OPERATION_ACTIVE`.
Frontend models treat the result as active, so protection editing remains disabled in that execution.
A background restart/reload can turn the saved state into an interruption that can then be acknowledged.

Relevant requirements: the cancellation/terminal-state table and BURN-24's confirmed lifecycle cleanup.
Reject cancellation once execution has reached a terminal state, or serialize terminal transition and cancellation so the saved result remains terminal.

The new backend probes passed **19/21**; the two failures above are intentional regression evidence against unchanged production code.
They also covered invalid/missing settings, marker failures, closed containers, overlapping selectors, partitions, failed removals, locks, cancellation, permission/catalog loss, and externally changed settings.
Reproduce with `node docs/implementation/audit-0.1.4/spec-probes.mjs`.
See [probe source](spec-probes.mjs) and [raw evidence](spec-results.json).

## Fresh verification results

| Check | Observed result |
| --- | --- |
| Existing repository tests, executed again | 166 passed, zero failed or skipped. |
| New independent controlled probes | 28 passed, two failed, across both review axes. |
| New native Firefox assertions | 23 passed across three separate disposable Firefox 158.0.1 profiles. |
| Production static check | Passed. |
| Repeated packaging | Identical archive SHA-256. |
| Independent ZIP integrity and source comparison | All 27 entries passed; extracted production bytes match source. |
| Mozilla `addons-linter` 10.14.0 | Zero errors, warnings, or notices; warnings treated as errors. |

Environment: macOS 27.0.1, arm64; Node.js 26.12.1; npm 11.20.0; Python 3.9.
The npm registry independently confirmed `addons-linter` 10.14.0 as the current release during this audit.
The validator ran against the generated ZIP, with no rules or permissions checks disabled.

Archive: `dist/biscotty-0.1.4.zip`, **62,304 bytes**.
SHA-256: `044ae0d5028cac8daf03fe63dddc5eeeb51b9fa732e69e12d42697b7ef0ca120`.
Only `manifest.json`, production source, and the icon are packaged.
Tests, audit files, development tooling, profile data, and environment files are excluded.

The new native runner extracts this archive into disposable profiles.
For test setup only, it adds an audit module to the copied options page; no packaged JavaScript is replaced.
Native fixture setup uses privileged APIs, while tested product actions use the production backend client/gateway.
Host access is initially granted through a test preference; this does not test the signed-install permission prompt.

The native checks cover default privacy and first-party isolation, cross-profile import, permission revocation, protected normal/container cookies, closed containers, partition identity, nonempty first-party identity, a protected parent cookie created after preview, stale preview rejection, export privacy, redirects/nested frames, current-page replacement, tab cleanup, and inert DOM text.
The native GUI check confirms basic options rendering; it is not a complete keyboard, screen-reader, toolbar-popup, or visual accessibility review.

Evidence: [native results](native-stable-results.json), [native assertions](native-checks.js), [driver](native-driver.py), [repository test output](repository-tests.tap), [run summary](run-summary.json), [package results](package-results.json), and [Mozilla validator output](mozilla-validator.json).

The first new native harness run had fixture errors: omitted `firstPartyDomain` under FPI, an already-protected child used as an ambiguous candidate, and checking cleanup before its documented batching interval.
Those assertions were corrected and rerun; [initial harness output](native-initial-harness-results.json) is retained for transparency.
The final result file reflects the strengthened assertions, including actual partition deletion and future protected-parent survival.

## Mozilla requirements checked

| Requirement area | Assessment |
| --- | --- |
| Valid manifest, ID, version, local package | Passes current local validation. MV3 ID and minimum Firefox 153.0 are declared. |
| Minimum necessary permissions | Every declared permission has a product use; no unused extra permission identified. Broad host access needs the prepared explanation. |
| Self-contained, readable code | Pass. The ZIP contains untransformed original source and no third-party library. A separate transformed-source archive is not indicated for this build. |
| Remote code, unsafe HTML, page-security changes | No such behavior found. CSP, sender checks, and inert text handling were reviewed. |
| Data collection/transmission declaration | `required: ["none"]` is consistent with the reviewed local-only behavior. |
| Private browsing | Manifest excludes it; native incognito availability check and gateway sender rejection passed. |
| Clear feature and permission disclosure | Prepared listing explains manual deletion, sign-out risk, scopes, passive observation, session metadata, and cookie-association limits. Actual AMO listing has not been inspected. |
| Functionality and secure state handling | Not fully satisfied as release evidence: F1/F2 remain, and the checks below remain open. |
| Licensing, support, account, signing | License choice and support contact remain unset in release preparation; account, ID availability, rights, and final AMO fields are unverified. No upload or signing was performed. |

Mozilla's current [add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) require necessary permissions, self-contained safe code, accurate behavior, privacy disclosures, and acceptable performance.
The [manifest documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings) defines the data-collection declaration and signing ID.
Mozilla's definition concerns handling outside the add-on/local browser; passive local observation does not by itself require declaring transmitted browsing activity.
This conclusion depends on the reviewed absence of outbound transmission.

The [submission guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) covers final listing fields and validation.
The [source-submission guide](https://extensionworkshop.com/documentation/publish/source-code-submission/) explains when separate readable sources and reproducible build instructions are required.
The [distribution agreement](https://extensionworkshop.com/documentation/publish/firefox-add-on-distribution-agreement/) requires signing, distribution rights, and appropriate support contact information.
These sources were checked during this audit; acceptance remains Mozilla's decision.

## Checks that remain incomplete

- **Firefox 153.0 and current ESR 153.5.1:** official macOS builds were downloaded and attempted both from mounted images and copied temporary apps. Their automation endpoint never became available; extension assertions did not run. This is an environment/startup limitation, not evidence of an extension compatibility defect. See [attempt record](compatibility-attempts.json).
- **Windows and Linux:** no native runs in those operating systems were performed.
- **Signed installation and update:** real permission prompts, persistent installation, browser restart during execution, and signed-update behavior remain unverified.
- **Complete GUI/lifecycle acceptance:** full keyboard/screen-reader/contrast/zoom coverage, actual toolbar-popup closure during execution, native event-page suspension, resource-exhaustion measurements, and the full PRD acceptance matrix have not all been established by this audit. Controlled tests cover several corresponding failure paths, but are not substitutes for native evidence.
- **Submission ownership:** choose the license and support contact; confirm account/ID availability, distribution rights, final categories/listing, disclosures, and reviewer notes before submitting.

The repository's own release criteria require these applicable checks and completed acceptance evidence.
They should not be represented as passed, nor as requirements that every other add-on must implement identically.

## Reproduce

```sh
node --test --test-reporter=tap
npm run check
npm run package
node docs/implementation/audit-0.1.4/standards-probes.mjs
node docs/implementation/audit-0.1.4/spec-probes.mjs
python3 docs/implementation/audit-0.1.4/native-driver.py --output docs/implementation/audit-0.1.4/native-stable-results.json
addons-linter --output=json --pretty --warnings-as-errors dist/biscotty-0.1.4.zip
```

The spec probe exits with status 1 while the two findings remain present.
Use disposable browser profiles only; the native driver creates and removes its own synthetic fixtures.

Standards axis: **0 material findings**. Spec axis: **2 P2 findings**, with stale observation restoration the privacy/integrity concern.
