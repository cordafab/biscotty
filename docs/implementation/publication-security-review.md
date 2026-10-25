# Publication and security review

Reviewed: 25 October 2026.
Source: `1ad8c1b87babc2b14dfdfc793fe6829f444bc955`, branch `dev`, version `0.1.1`.
The working tree was clean when the review began.

This document preserves the version `0.1.1` review.
Version `0.1.2` addresses PUB-01, SEC-01, and SEC-02; see [current verification](verification.md#version-012-publishing-preparation).
REL-01 remains a release verification gap.

## Assessment

The packaged extension passes Mozilla's local validator, but publication readiness is not established.
Correct the publishing disclosures, bound the observation workload, fix the gateway capacity behavior, and finish the outstanding release checks before public release.
No high-severity cookie-theft, remote-code-execution, or website-to-privileged-action vulnerability was identified in this review.
This is a source review and targeted verification, not a guarantee of security or Mozilla approval.

No production files were changed, and nothing was uploaded, signed, or published.
The unsigned release archive was regenerated using the existing packaging script.

## Findings

### PUB-01: Publishing notes omit background observation and contradict the manifest

Priority: fix before submission. Confidence: confirmed.

Locations: `docs/implementation/release.md:30`, `docs/implementation/release.md:46`, `docs/implementation/release.md:55`, `manifest.json:13`, `src/backend/firefox/adapter.js:48`.

The proposed listing describes manual cookie management but does not explain the associated-domain feature's passive page observation.
The permission table omits `webRequest` and `webNavigation`, and line 55 explicitly says that `webRequest` is not requested.
Both permissions are present in the manifest and actively used.
The storage description also omits current-page observations retained in `storage.session`.

The observer runs independently of opening the popup.
It reduces request/navigation events to hostnames, schemes, store identifiers, document/frame correlation, and current navigation state.
It does not request headers or bodies, and the retained record does not include URL paths, query strings, or cookie values.

Update the listing and reviewer notes to explain the feature, both permissions, temporary metadata, cleanup behavior, and cookie-association limits.
This is a disclosure risk if the draft is submitted unchanged; it is not evidence of an existing AMO rejection.
Mozilla requires listings to describe functionality clearly under its [No Surprises policy](https://extensionworkshop.com/documentation/publish/add-on-policies/#1-no-surprises).

### SEC-01: Website activity can grow observation state and queued work without a bound

Severity: medium availability concern. Confidence: confirmed missing bounds; browser-scale impact unmeasured.

Locations: `src/backend/firefox/observations.js:12`, `src/backend/firefox/observations.js:47`, `src/backend/firefox/observations.js:124`, `src/backend/firefox/observations.js:127`, `src/backend/firefox/adapter.js:36`.

Every native activity event appends work to a single promise queue.
Unique resource hostnames accumulate in an array without a per-page limit.
Frames also have no explicit size bound.
Handled requests and completion events save the record even when retained data does not change.
The production adapter reads and rewrites the aggregate observation object, then reads it again to verify the write.

A page can generate many resource requests, including requests to distinct subdomains.
This gives web content an input into extension memory growth, serialization costs, and delays to observation-dependent actions.
Storage failure marks coverage partial but does not bound the in-memory hostname list or pending queue.

A controlled probe using the real observation module submitted 4,000 distinct resource-host events.
It retained 4,001 hosts and performed 4,003 observation writes after initial navigation and a final read.
The final synthetic record was 79,262 bytes.
This proves accumulation and write amplification, not a demonstrated Firefox crash or a measured denial-of-service threshold.

Bound pending work, hostnames, frames, and aggregate retained bytes.
Coalesce activity by tab and document generation, persist only changed state at a bounded frequency, and explicitly mark coverage partial when limits are reached.
Keep navigation invalidation and tab-close cleanup reliable under saturation.
Then measure adversarial request volume in disposable Firefox profiles.
Mozilla's [development practices](https://extensionworkshop.com/documentation/publish/add-on-policies/#4-development-practices) include performance and stability requirements.

### SEC-02: The gateway can execute a mutation after reporting rejection at cache capacity

Severity: medium correctness concern at an unusual boundary. Confidence: reproduced.

Location: `src/backend/gateway/gateway.js:35`.

The handler promise is scheduled before the 10,000-entry cache-capacity check.
When the cache is full, dispatch returns `INVALID_REQUEST`, but the already-scheduled handler still runs.
An action can therefore change protection or start a burn while the caller sees a rejection, provided its normal action checks pass.

A controlled probe registered a counting `saveConfiguration` handler and sent 10,001 distinct authorized requests.
The final response said to close and reopen Biscotty, while the handler invocation count reached 10,001.
The cache belongs to the background gateway, so merely closing and reopening the popup does not directly clear it.

The cache also retains full mutation-request fingerprints and result promises without time-based or document-lifetime cleanup.
Repeated large configuration saves can retain substantial memory before reaching the numerical limit.

This requires authorized extension-page requests; no website or foreign-extension authorization bypass was found.
Check capacity before scheduling any handler.
Bound cache memory and lifetime while preserving deduplication of accepted in-flight requests and appropriate retry behavior.

### REL-01: Native and signed release evidence remains incomplete

Category: release verification gap, not a confirmed implementation defect.

Locations: `docs/implementation/verification.md:102`, `docs/implementation/verification.md:123`, `docs/prd/06-verification-and-release.md`.

The repository still lacks signed installation/update and restart evidence, actual event-page suspension evidence, and several interactive permission/popup checks.
The declared Firefox 153.0 minimum, current ESR, Windows, and Linux have not been verified in this review.
Interactive keyboard, screen-reader, zoom, and contrast checks also remain open.

The repeated native tests below cover Firefox 158.0.1 on macOS only.
They use temporary installations with host access pre-granted by the disposable profile, so they do not verify the real signed-install permission experience.

Complete the repository's safety and release gates before claiming release readiness.
Its exact operating-system and browser matrix is a project requirement, not a claim that Mozilla mandates that particular matrix.
Mozilla nevertheless performs functional review and can request testing information under its [submission guidelines](https://extensionworkshop.com/documentation/publish/add-on-policies/#3-submission-guidelines).

## Mozilla requirement assessment

| Area | Result and qualification |
| --- | --- |
| Manifest and automated validation | Pass locally: Mozilla `addons-linter` 10.14.0 reports zero errors, warnings, and notices for the release ZIP. AMO performs its own validation and review. |
| Identity and version | A Gecko ID and matching package/manifest version are present. ID availability on AMO is unverified. |
| Desktop compatibility | Firefox 153.0 minimum is consistent with use of the `publicSuffix` API. No Android support is declared. Only Firefox 158.0.1 was exercised here. |
| Necessary permissions | Every declared API permission and HTTP/HTTPS host scope has a corresponding implemented use. Broad access fits whole-profile cookie management. Publishing explanations need PUB-01. |
| Reviewable, self-contained source | Native readable JavaScript/HTML/CSS, local imports, no external libraries, no remote execution or obfuscation found. Packaging does not transform the production sources. |
| Content security | Strict packaged-page CSP; no remote script sources, dynamic execution, dangerous HTML insertion, or website security-header modification found. |
| Data declaration | `data_collection_permissions.required: ["none"]` is consistent with the observed local-only design. No extension-initiated network or telemetry path was found. Local observation does not alone require declaring off-device transmission. |
| Private browsing | Manifest excludes private browsing; backend and observation checks also reject private contexts. |
| Privileged-action authorization | Gateway checks extension ID and exact packaged page URL. Owner-bound handles, revisions, operation locks, and complete configuration validation are present. SEC-02 remains. |
| Cookie safety | Native tests passed protected-selector collision, partitions, first-party isolation, and conservative path handling. These tests do not prove every supported environment. |
| Performance and stability | Unresolved concern SEC-01 and cache retention in SEC-02. |
| Packaging | ZIP root, entries, compression integrity, and CRCs pass. The 27 entries are the manifest, production source, and icon; no test fixtures or development scripts are shipped. |
| Listing and submission | Draft needs PUB-01. Final support/contact information, license selection, listing details, and useful reviewer instructions still need completion in AMO; account state was not inspected. |
| Signing and review | Not performed. A clean local validator result does not establish manual approval or signed-install behavior. |

Mozilla's [data-consent documentation](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/#no-data-collection) supports declaring `none` for extensions without data collection/transmission.
Its [source-submission guidance](https://extensionworkshop.com/documentation/publish/source-code-submission/) distinguishes readable packaged sources from transformed code requiring additional source material.
The remaining account/listing fields are described in [Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/).
The API minimum was checked against Mozilla's [Firefox 153 API update](https://blog.mozilla.org/addons/2026/07/23/firefox-153-webextensions-api-updates/).

## Verification performed in this review

| Check | Observed result |
| --- | --- |
| `npm test` | 132 passed; zero failed or skipped. |
| `npm run check` | Passed: 25 native source files, local imports, module boundaries, privacy restrictions, manifest resources and expected permissions. This custom check is not a substitute for Mozilla's validator. |
| `npm run package` | Passed: `dist/biscotty-0.1.1.zip`, 27 entries. |
| `unzip -t dist/biscotty-0.1.1.zip` | All entries passed. |
| Mozilla `addons-linter` 10.14.0 | Zero errors, zero warnings, zero notices; no unknown minified files or third-party libraries reported. |
| Native Firefox, isolation disabled | 14 scenarios passed in a disposable profile. |
| Native Firefox, isolation enabled | 15 scenarios passed in a second disposable profile, including cross-profile Replace import. |
| Targeted observation probe | 4,000 resource events retained 4,001 hosts and caused 4,003 observation writes. |
| Targeted gateway probe | The 10,001st mutation handler ran despite its rejection response. |

Native environment: Firefox 158.0.1, macOS 27.0.1 arm64.
Node environment: v26.12.1.
The validator was downloaded into temporary storage; no project dependency was added.

Package SHA-256:

```text
c6ca0f848392cdf638300c30632abef7ea6ec6f33ec51a3a0a486ebe00af2b25
```

Native commands used:

```sh
python3 tests/native/firefox.py --export-file /private/tmp/biscotty-mozilla-review-profile-a.json
python3 tests/native/firefox.py --fpi --import-file /private/tmp/biscotty-mozilla-review-profile-a.json
```

Validator command used after downloading Mozilla's tool:

```sh
npm exec --offline --cache /private/tmp/biscotty-mozilla-review/npm-cache --yes --package=addons-linter -- addons-linter --output json --pretty dist/biscotty-0.1.1.zip
```

## Recommended release order

1. Correct the listing, permission explanations, and temporary-observation disclosures.
2. Fix SEC-01 and SEC-02 and verify the identified boundaries.
3. Finish the native lifecycle, permission, supported-platform, and accessibility checks relevant to the intended release claims.
4. Prepare final AMO listing/license/support fields and reviewer instructions, then rerun the local validator on the final archive.
5. Obtain and test the signed package through the release owner's chosen distribution workflow before public rollout.
