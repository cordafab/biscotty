# Biscotty 0.2.1 submission readiness

Date: 3 November 2026. Status: unsigned candidate prepared; public release acceptance remains incomplete.
No upload, signing, or publication was performed. No new exploitable security or protection defect was confirmed in this review.
The remaining release gates below prevent a claim that every required acceptance case has passed.

## Exact candidate

- Upload package: `dist/biscotty-0.2.1.zip`, 83,145 bytes, 32 files.
- SHA-256: `5ebb38e7f26d8cc2bbb7c51076487b3ddbed70c9a945ee8070f82cfe5678bdf2`.
- Checksum: `dist/biscotty-0.2.1.zip.sha256`.
- Extension identity: `biscotty@cordafab.com`; Firefox minimum: `153.0`; private browsing disabled.
- [File inventory](submission-0.2.1/source-sha256.json), [archive inspection](submission-0.2.1/package-inspection.json), [environment](submission-0.2.1/environment.json).

The archive includes the repository MIT notice, manifest, original production source, and icon. Development scripts, tests, browser profiles, logs, documentation, and user data are excluded. Every archive entry was compared byte-for-byte with the checkout. Independent CRC inspection and a repeat build passed. Reproducibility is established for the recorded Node/zlib environment, not every compression runtime.

The [earlier security audit](publication-security-audit-0.2.1.md) applies to its recorded snapshot. Its archive digest and unresolved export wording do not describe this corrected candidate. Version remains 0.2.1 because this is preparation of the existing unsigned candidate; no prior AMO version availability was checked.

## Changes made during preparation

1. Added a visible, accessible notice beside Export explaining identifying settings and unencrypted JSON files.
2. Added a [public privacy notice](../../PRIVACY.md), [AMO listing and reviewer materials](mozilla-submission.md), and the user-supplied support address `me@fabriziocorda.com`.
3. Included `LICENSE` in the production archive; earlier packaging omitted its copyright and permission notice.
4. Updated current coverage contracts, glossary meanings, release guidance, implementation interfaces, and verification records. Request-observation requirements remain explicitly historical.
5. Extended the native runner to test files from the exact ZIP and to smoke-test the unmodified archive. Fixed its terminal-state wait so scenarios begin after burn-marker cleanup releases the lock.

No runtime dependencies, new permissions, network capabilities, automatic deletion, or cookie-value output were introduced.

## Security and privacy checks

| Area | Result and scope |
| --- | --- |
| Mozilla policy review | Current policies, FAQ, submission, source-code and packaging guidance checked. Local-only behavior supports the existing `none` declaration; Mozilla determines acceptance. |
| Supply chain | No declared runtime, development, optional, or bundled external libraries. No dependency installation is needed for build or project tests. Mozilla's validator runs separately outside the project. A package-manager vulnerability audit has no application dependency tree to inspect. |
| Permissions | Cookie, storage, contextual identity, public suffix, navigation, and HTTP/HTTPS host permissions map to documented behavior. Private browsing is excluded. No native messaging, content scripts, externally connectable declarations, or web-accessible resources are declared. |
| Remote code and transmission | Readable local modules; no network API, telemetry, remote code, dynamic evaluation, or remote endpoint found in production inspection. CSP restricts scripts to self and blocks connections, objects and form submission. |
| Runtime HTTP observation | Zero extension-attributed HTTP requests during unmodified installation and Settings/popup smoke checks. Observation uses Firefox channel principals. It covers that workflow; it is not a complete packet capture or a claim about browser/OS traffic. |
| Gateway and authorization | Exact own-extension sender and page checks, private-tab rejection, owner-bound expiring handles, revision checks, deduplication, and request-capacity tests pass. Native identifiers remain backend-local. |
| Injection and imports | DOM rendering uses text nodes; imported script-like strings remain inert in native checks. Import byte limits, strict fields, explicit container mapping, prototype-named references, conflict review, and final complete-record validation are exercised. |
| Cookie protection | Selector tests cover future protected collisions, domain/path ambiguity, encoded paths, containers, partitions, and first-party isolation. Unsafe or unknown selectors are conservatively skipped. Native calls do not promise exact identity deletion. |
| Secrets and archive hygiene | All entries match allowed production paths. No absolute user-directory paths or credential-pattern matches found. This scan supplements source review; it is not a proof that arbitrary identifying metadata can never exist. |
| Local retention | Adapter removes values from returned cookie metadata. Settings persist locally; current result uses session storage; opaque interruption marker uses local storage. Tests inspect cleanup and export exclusions. Settings and exports can contain identifying text, now disclosed. |
| Failure and concurrency | Controlled tests exercise storage failures, marker recovery, cancellation, stale revisions, navigation, cache limits, import limits, and single-operation locks. Native suites exercise real cookie stores and protection outcomes. |

The review inspected the gateway, handles, initialization, Firefox adapter, inventory and navigation service, configuration and transfer paths, policy and selector logic, and DOM/rendering and export paths. No independent penetration test, exhaustive formal proof, or Mozilla approval is claimed.

## Executed checks

Environment: macOS 27.2 arm64, Node.js 26.13.0, npm 11.20.0, Python 3.9.6. Browser installers came from Mozilla's release archive; their SHA-256 values were verified against Mozilla's corresponding `SHA256SUMS` files.

| Check | Observed result | Evidence |
| --- | --- | --- |
| Automated project tests | 196 passed; zero failures, skips, or cancellations | [Results](submission-0.2.1/tests.tap) |
| Native source/manifest check | 29 source files passed | [Results](submission-0.2.1/source-check.txt) |
| Packaging and repeat build | 32 entries; matching archive digest | [Build](submission-0.2.1/package.txt), [repeat](submission-0.2.1/package-repeat.txt), [inspection](submission-0.2.1/package-inspection.json) |
| Mozilla addons-linter 10.15.0 | Zero errors, warnings, and notices; warnings treated as errors | [Results](submission-0.2.1/mozilla-validator.json) |
| Firefox 159.0.1, default isolation | 19 scenarios passed | [Results](submission-0.2.1/native-default.json) |
| Firefox 159.0.1, first-party isolation | 20 scenarios passed, including separate-profile import | [Results](submission-0.2.1/native-fpi.json) |
| Firefox ESR 153.6.0, default isolation | 19 scenarios passed | [Results](submission-0.2.1/native-esr-default.json) |
| Firefox ESR 153.6.0, first-party isolation | 20 scenarios passed, including separate-profile import | [Results](submission-0.2.1/native-esr-fpi.json) |
| Unmodified ZIP installation/UI | Six checks passed, including rule save/reload, popup reconnection, disclosure, and HTTP observation | [Results](submission-0.2.1/package-smoke.json), [Settings screenshot](submission-0.2.1/settings.png) |
| Firefox 153.0 minimum | No scenarios executed; automation unavailable on this host | [Launch diagnostics](submission-0.2.1/native-minimum-default.stderr) |
| Documentation | Local targets/anchors, JSON examples, identifier uniqueness, changed prose screening and text hygiene checked | [Results](submission-0.2.1/documentation-check.json) |

Every final successful native result records the candidate digest. Scenario runs add test scripts only to disposable extracted copies; smoke mode installs the exact unmodified archive as a temporary add-on. Host access was pre-granted in synthetic profiles. These runs do not establish the signed permission prompt.

The validator's informational `unknownMinifiedFiles` metadata includes `src/frontend/options.js`, with no emitted warning. The packaged file is original readable source without any transformation.

## Failed attempts and corrections

The initial ESR run returned three scenario failures because the test helper proceeded after terminal view persistence but before marker cleanup. The helper now waits for the operation lock to release; the corrected default and first-party-isolated suites pass. [Initial results](submission-0.2.1/initial-esr-harness-race.json) remain available.

Firefox 153.0 was attempted from the verified mounted image, a temporary copy, and an application-directory copy. Automation never became usable; final diagnostics include `sandbox_extension_issue_file_to_process ... Operation not permitted`. No browser sandbox was disabled to force a passing result. One ESR first-party-isolated attempt also timed out while creating its automation session; a subsequent separate-profile run passed. These are host/test-launch limitations, not passing application evidence.

## Remaining release gates

| Gate | Required completion |
| --- | --- |
| Minimum version | Run Firefox 153.0 fixtures successfully on a suitable host. ESR 153.6.0 does not replace the exact-minimum check. |
| Signed lifecycle | Test Mozilla's signed candidate: install prompts, website permissions, update/migration, restart during execution, event-page loss, interruption acknowledgment, and storage cleanup. |
| Native failure/lifetime matrix | Complete real permission revocation, container removal/disablement during execution, multiple windows, popup closure during a burn, and larger native profiles. Controlled tests do not replace those native obligations. |
| Supported platforms | Execute Windows and Linux coverage before claiming verified support for those platforms. |
| Accessibility and full acceptance | Complete keyboard-only destructive/import flows, screen-reader, zoom/contrast, toolbar geometry, and remaining current PRD cases. Automated DOM semantics are partial evidence. |
| AMO account and listing | Review account identity, identifier availability, final category/assets, privacy field, license and support fields. Accept the agreement and obtain signing through the owner's Mozilla account. |
| Publication decision | Review the above evidence and the returned signed candidate before making the listing public. |

These are existing project release requirements, not additional requests for approval. No release requirement was waived. Submission preparation is reviewable; full public-release acceptance is not complete.

## Submission handoff

Upload only `dist/biscotty-0.2.1.zip` as the extension. Use [Mozilla submission materials](mozilla-submission.md) for listing text, permission explanations, privacy wording and reviewer notes. The package is unsigned and must not be presented as a generally installable signed release. The support contact is **me@fabriziocorda.com**.

The policy assessment uses [Mozilla's current Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/), [FAQ](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/), [submission procedure](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/), and [source requirements](https://extensionworkshop.com/documentation/publish/source-code-submission/). Recheck policy if submission takes place on or after the announced 1 December 2026 change.
