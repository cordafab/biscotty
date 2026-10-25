# Publication and security review: 0.1.2

Reviewed: 25 October 2026.
Source: `df7fd98557f9c7cfd3f3ec285de620c619af0981`, version `0.1.2`.
The working tree was clean at the start of this review.
This report supplements the preserved [0.1.1 review](publication-security-review.md).
The startup recovery finding is corrected for version 0.1.3; see the [correction evidence](#startup-recovery-correction).
The original audit results below describe the recorded commit and its pre-correction archive.

## Assessment

The reviewed archive passes Mozilla's local validator and the available automated safety checks.
No confirmed Mozilla technical-policy violation was identified in the reviewed production code or updated listing draft.
An assurance that it meets every publication requirement is not justified yet.
Submission details, signed-install behavior, and several lifecycle and compatibility checks remain unverified.

No high-severity cookie-theft, remote-code-execution, or website-to-privileged-action vulnerability was found.
One low-severity availability defect was reproduced at the reviewed commit and subsequently corrected for version 0.1.3.
The remaining release checks still require completion before public rollout.
Mozilla can also perform manual review after automated validation or publication; a clean local scan does not establish approval.
See Mozilla's [review and signing overview](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/#post-submission-review).

This was a source review with automated tests and targeted fault injection, not an exhaustive security assessment.
Production code was not changed during the original audit. The later correction is documented below.
Nothing was uploaded, signed, or published.

## Confirmed finding: startup storage recovery cannot unlock the burner

Severity: low availability/reliability defect. Confidence: reproduced.

Locations: [burner initialization](../../src/backend/burner/service.js#L20), especially line 32, and [dismissal](../../src/backend/burner/service.js#L149).

At the reviewed commit, if `readMarker`, `readCurrentOperation`, or the interrupted-state session write throws during initialization, the catch block sets `live = true`.
It simultaneously reports an `interrupted` operation with reason `STORAGE_FAILED`.
No deletion execution is running in this path.
Nevertheless, `dismissOperation` rejects while `live` is true, even after storage becomes available.
Refreshing the frontend does not reinitialize the burner.
Burning and protection mutations remain blocked for that background instance.

A controlled probe used the real application and public gateway with the repository's synthetic adapter:

1. Make `readMarker` throw once before application initialization.
2. Wait for initialization, then restore successful storage reads.
3. Call `getState` and capture the interrupted operation ID.
4. Call `dismissOperation` with that ID, then call `getState` again.

Observed result:

```json
{
  "initialOperation": "interrupted",
  "initialReason": "STORAGE_FAILED",
  "dismissError": "OPERATION_ACTIVE",
  "lockedAfterRecoveredStorage": true,
  "canBurnAfterRecoveredStorage": false
}
```

This is not a demonstrated remote attack or a protected-cookie deletion bypass.
Its practical impact is loss of functionality after a storage fault.
Recreating the background context with working storage permits normal initialization again.

Recommended correction: distinguish a real active executor from an initialization failure.
Permit acknowledgment only after authoritative marker/session cleanup succeeds, and verify recovery with a transient-failure regression case.

## Status of earlier findings

| Earlier finding | Current result |
| --- | --- |
| PUB-01: missing observation disclosures | Addressed in the current [listing, permission explanations, and reviewer instructions](release.md#proposed-mozilla-listing). Both observation permissions and temporary metadata are described. |
| SEC-01: unbounded observation state and writes | Addressed by explicit tab, host, frame, queue, and byte limits, coalescing, batched writes, and partial coverage. The corresponding tests pass. Adversarial browser-scale performance remains unmeasured. |
| SEC-02: mutation executes after capacity rejection | Addressed: cache capacity is reserved before scheduling the handler. Requests use digests; retained responses have bounded capacity and expiry. Saturation and replay tests pass. |
| REL-01: incomplete release evidence | Still open. Fresh temporary-install tests do not establish signed installation, restart, update, or actual event-page suspension behavior. |

## Mozilla requirements checked

The policy comparison uses Mozilla's current [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/).
The table reports source and local-test evidence; it does not predict an individual reviewer's decision.

| Area | Current assessment |
| --- | --- |
| Manifest, version, and identity | Valid locally. Manifest and package metadata agree on 0.1.2. A Gecko ID is present; availability and ownership on AMO were not checked. |
| Permissions | Each API permission has an implemented purpose. Broad HTTP/HTTPS access corresponds to manual cookie management across stores. No unused permission was identified. |
| Source reviewability | Packaged sources are readable and local, without obfuscation, bundling, minification, remote execution, or third-party libraries. |
| Content security | Strict extension-page CSP, no remote resources, no dynamic execution or unsafe HTML insertion found. No website security-header modification occurs. |
| Privileged actions | Sender identity and exact packaged-page URLs are checked. Backend handles are owner-bound; revision, context, and operation-lock checks protect mutations. |
| Cookie safety | Cookie values are removed at the native adapter boundary. Deletion selectors are conservatively assessed for protection collisions and unknown identity details. Native safety fixtures pass. |
| Privacy | No extension-initiated network or telemetry path was found. Observations retain reduced current-page metadata in session storage. Local export contains configuration, not cookie values or observation records. |
| Private browsing | Excluded by the manifest and rejected by backend context checks. |
| User expectations | The updated listing explains passive observation, deletion consequences, temporary metadata, and incomplete association coverage. Use that full disclosure when preparing the AMO listing. |
| Performance and stability | Earlier unbounded observation and mutation-cache issues are addressed. The startup recovery defect was corrected after this audit; browser-scale stress evidence is still absent. |
| Packaging | 27 production entries with the manifest at the archive root; no tests, developer scripts, documentation, or profile data. ZIP integrity passes. |
| Submission and distribution | Final account/listing fields and signing remain pending. Review testing instructions are available in the release document. |

The manifest's `data_collection_permissions.required: ["none"]` is consistent with the observed local-only design.
Mozilla defines the relevant transmission as handling outside the add-on or local browser and documents the `none` declaration in its [built-in consent guidance](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/#no-data-collection).
Do not infer off-device collection merely from the ability to inspect local cookies or observe hosts.

Firefox 153.0 is a justified minimum: Mozilla introduced the required `publicSuffix` API and broader document-ID support in [Firefox 153](https://blog.mozilla.org/addons/2026/07/23/firefox-153-webextensions-api-updates/).
Do not lower it without compatibility work. Any ESR claim must also respect this minimum.

The ZIP contains untransformed production source.
Mozilla's [source submission rules](https://extensionworkshop.com/documentation/publish/source-code-submission/) require additional original sources and reproducible build instructions when build transformations obscure the uploaded code; no such transformation was found here.

## Work remaining before public rollout

- Select the AMO license, finish the listing and category choices, provide support information, and verify account and add-on identity details. A missing repository `LICENSE` file alone does not establish an AMO rejection: the submission requires a license selection. See [Mozilla's submission form guidance](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/#listing-on-amo).
- Verify the signed installation and update, actual permission prompts, browser restart during a burn, and real event-page execution loss. Temporary profiles pre-grant host access and cannot prove those experiences.
- Exercise real popup closure/reopening and live permission revocation during execution. Controlled adapters cover these safety decisions, but native interactive evidence remains incomplete.
- Test Firefox 153.0 and the operating systems for which support will be claimed. This run covers Firefox 158.0.1 on macOS only.
- Complete the project's keyboard, screen-reader, zoom, contrast, and large-profile performance checks, or narrow the release claims accordingly.

The broader project matrix is documented in [outstanding release gates](verification.md#outstanding-release-gates).
That exact matrix is a repository requirement, not a claim that Mozilla mandates every listed test or operating system.
Ordinary release/beta Firefox installation requires Mozilla signing, as documented in its [signing requirements](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/#signing-your-add-ons).

## Fresh verification

| Check | Observed result |
| --- | --- |
| `npm test` | 148 passed; zero failures, skips, or cancellations. |
| `npm run package` | Static check passed for 25 source files; ZIP generated with 27 production entries. |
| `unzip -t dist/biscotty-0.1.2.zip` | All entries and CRC checks passed. |
| Mozilla `addons-linter` 10.14.0 | Zero errors, warnings, or notices; no third-party libraries or unknown minified files reported. |
| Native Firefox, first-party isolation disabled | 14 scenarios passed in a disposable profile. |
| Native Firefox, first-party isolation enabled | 15 scenarios passed in a separate profile, including cross-profile Replace import. |
| Startup storage-failure probe | Reproduced the availability defect above through public gateway actions. |

Environment: Firefox 158.0.1, macOS 27.0.1 arm64, Node.js v26.12.1, Python 3.9.6.
Native tests used synthetic cookies, disposable profiles, temporary installation, and a loopback fixture server.
The validator ran from the existing temporary npm cache; no project dependency was added.

Commands for the external checks:

```sh
npm exec --offline --cache /private/tmp/biscotty-mozilla-review/npm-cache --yes --package=addons-linter -- addons-linter --output json --pretty dist/biscotty-0.1.2.zip
FIREFOX_BINARY=/Applications/Firefox.app/Contents/MacOS/firefox python3 tests/native/firefox.py --export-file /private/tmp/biscotty-review-012-profile-a.json
FIREFOX_BINARY=/Applications/Firefox.app/Contents/MacOS/firefox python3 tests/native/firefox.py --fpi --import-file /private/tmp/biscotty-review-012-profile-a.json
```

Archive SHA-256:

```text
23b24d9cf0eb2a42636c7d29470ab8524aff86bc3ab481b82a9d5ba376e2c1bf
```

## Startup recovery correction

The user requested the fix after this audit and assigned the patch version 0.1.3.
Initialization now sets `live = false` on storage failure because no executor has started.
The operation stays interrupted and locked until explicit dismissal confirms marker and session cleanup.

Three public-gateway regression cases cover failure of `readMarker`, `readCurrentOperation`, and the interrupted-state session write.
Each case also verifies that failed marker or session cleanup retains the lock, successful cleanup restores both capabilities, and no deletion occurs automatically.
All three cases failed before the one-line production change and passed afterward.

The full suite now passes 151 tests.
Static checks, packaging, ZIP integrity, and Mozilla `addons-linter` 10.14.0 pass; the validator reports zero errors, warnings, or notices.
The earlier native Firefox results were not rerun for this correction.
Signed and other outstanding release gates remain open.

Rebuilt `dist/biscotty-0.1.2.zip` SHA-256:

```text
941542f77083440d24598a1ce8d30a7fb1ea6b874a2bc7998eaa2c890dc519e1
```

The version bump packages this correction as 0.1.3.
See the [current patch verification](verification.md#version-013-startup-recovery-correction) for its checks and archive digest.
