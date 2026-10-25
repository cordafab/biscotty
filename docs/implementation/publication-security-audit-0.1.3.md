# Publication and security audit: 0.1.3

Date: 25 October 2026. Source: `914dc8c4d86ab3a11b2bd440242b7bb027477a41` on `dev`.

Historical audit: F1, F2, and F3 were subsequently corrected in the working tree. See [corrections and fresh verification](publication-fixes-0.1.3.md).
The findings, archive hash, and retained results below describe the audited commit before those corrections.
The original probes include the former UI access pattern; use the current regression suites to verify the corrected implementation.

The current archive passes Mozilla's current local validator. No exploitable security vulnerability was confirmed in the reviewed code or fresh tests. I would fix the three functional defects below before publication and complete the outstanding release checks. Local validation does not establish Mozilla approval or full release readiness.

This audit reviewed the complete current implementation. Previous test results and previous security reports were not used as passing evidence. Existing tests were executed again, new adversarial probes were written, and native tests used new disposable Firefox profiles with synthetic cookies. Production source, manifest, and product requirements were not changed.

## Standards and security

No confirmed security defect was found in the gateway, configuration commits, burner, native adapters, transfer services, or frontend. This is a bounded review result, not a guarantee that vulnerabilities are absent.

The following protections were verified in source and, where noted, in fresh native checks:

- Gateway authorization checks the extension ID and exact packaged popup/options URL. A new native test confirmed that another packaged page cannot read state or start a burn.
- Cookie values are projected out by the native adapter before reaching public views. New native checks inspected state, inventory, and export for synthetic values and native store identifiers.
- Imported and website-derived text uses DOM text operations. Existing native DOM tests passed again; no executable imported content was found during review.
- CSP blocks outbound connections and string compilation. Both restrictions were independently exercised in Firefox. No production network, remote-code, content-script, native-messaging, or webpage-security-header modification path was found.
- Revision checks, owner-bound handles, serialized configuration writes, and operation locks protect mutation boundaries. Fresh checks rejected an old preview after a protection change.
- Selector guards consider potentially matching protected ancestor domains and paths, including cookies created after preview. A separate model probe examined 164,640 selector/rule/possible-native-match combinations and found zero unsafe selectors classified as safe. This checks the modeled selection rules, not every possible Firefox implementation behavior.
- Native tests exercised protected containers without open tabs, partition separation, Secure/HttpOnly cookies, encoded-path skips, cancellation, and host-permission revocation. New exact-name/path tests preserved the protected cookie and whole protected container while deleting eligible cookies.
- Observation and mutation retention have explicit bounds. A new native test confirmed that URL path, query, and fragment data from its fixture were absent from session observations and that the observed hostname was absent from persistent local storage.
- Private browsing is excluded by the manifest. Observation input also rejects incognito events. No private-session native test was performed in this audit.

The dependency-free native sources are reviewable. No material documented security-boundary violation was found. Style heuristics were not promoted into security findings.

## Spec and functional findings

### F1 — Medium: a supported saved configuration cannot be exported

Location: [serializePortable](../../src/core/transfer/index.js#L63), particularly line 64.

Create 10,000 valid rules for `a0.example.com` through `a9999.example.com`, each with exact-domain matching, unrestricted name/path, and selected scope `normal`. The editable configuration is 1,318,929 bytes and can be saved through the public backend client. Its compact portable representation is 1,318,990 bytes. The exporter always pretty-prints it, producing 2,289,015 bytes, then rejects it against the 2,097,152-byte limit with `VALIDATION_FAILED`.

Impact: users can save a supported configuration but cannot back it up or transfer it. This contradicts XFER-01, which requires export of every saved rule and whole-container protection setting. The public `saveConfiguration`/`prepareExport` probe reproduces the failure; it is not limited to calling a private helper.

Suggested correction: use compact JSON when formatting alone would exceed the portable limit. Also test that the full supported saved-data range has a valid export/import round trip.

### F2 — Low: a valid imported reference breaks container mapping

Locations: [mappingChoices initialization](../../src/frontend/models.js#L179), its reset at line 182, and [mapping choice processing](../../src/frontend/options.js#L233) at lines 233–246.

Portable validation accepts a named-container reference of `__proto__`. The UI stores mapping choices in an ordinary `{}`. Assigning a dropdown string to that key does not create an own property, so Build import plan reads an object and throws `choice.startsWith is not a function`.

Impact: this valid file cannot be mapped, retained, or excluded through the UI. The failure was reproduced for all three choices in a new Node probe and for Retain in Firefox's actual file-import screen. The mapping requirement in the transfer PRD cannot be completed for that file. No global prototype pollution, script execution, silent configuration write, or protection bypass was demonstrated.

Suggested correction: use `Map` or `Object.create(null)` for reference-keyed UI state, with consistent access and reset handling.

### F3 — Low: fresh navigation can retain an incorrect partial-coverage warning

Locations: [eviction state](../../src/backend/firefox/observations.js#L48) and [new navigation coverage](../../src/backend/firefox/observations.js#L135).

Using the production limit of 128 observations, observe tabs 1 through 129 so tab 1 is evicted. Then deliver both the navigation-start and committed events for a fresh navigation in tab 1. The new record still reports `partial` and says observation did not begin with the page load, although its start was observed.

Impact: after resource eviction, the first fresh navigation can require another reload to clear the warning. This is conservative: it understates coverage and does not bypass cookie protection or expose data. The bounded-observation requirements describe a subsequently observed navigation as the way to establish new coverage.

Suggested correction: distinguish loss of a prior document's observations from a new navigation whose start was actually observed.

Spec findings: one medium and two low. The most consequential is F1 because it prevents backup of a supported configuration. Standards/security findings: zero confirmed exploitable defects.

## Fresh verification

Environment: Firefox 158.0.1; macOS 27.0.1, ARM64; Node 26.12.1; npm 11.20.0; Mozilla `addons-linter` 10.14.0, downloaded into a separate temporary audit cache.

| Check executed during this audit | Observed result |
| --- | --- |
| `npm test` | 151 passed; zero failures or skips. |
| `npm run check` | Passed for all 25 production source files. |
| `npm run package` | Passed; repeat build produced the same archive hash. |
| Independent ZIP checks | CRC integrity, unique paths, production-only entries, and every file identical to its current source. |
| Current Mozilla validator on the ZIP, warnings treated as errors | Zero errors, warnings, or notices. |
| Existing native suite, new default-privacy profile | 14 checks passed. |
| Existing native suite, second new profile with first-party isolation and fresh profile-A export | 15 checks passed, including cross-profile import. |
| New independent native suite, another new profile | Eight security/behavior checks passed; F2 reproduced in the real UI. |
| New selector model probe | 164,640 combinations; zero unsafe classifications. |
| New transfer and production-limit observation probes | F1, F2, and F3 reproduced. These are failures of expected product behavior. |

The independent native harness initially used a cookie name Firefox rejected and initially read its fixture tab before navigation finished. Those test-fixture errors were corrected before the final fresh-profile run. They were not classified as product defects.

The audited unsigned archive is `dist/biscotty-0.1.3.zip`: 27 entries, 61,735 bytes compressed, 202,333 bytes uncompressed. SHA-256:

```text
8e4f16db94b3266e3cbf686d25c9abb27ed4cc1be080d98fad613a4eb6055db2
```

New scripts and observed results are retained in [audit-0.1.3/](audit-0.1.3/). Run the new probes from the repository root:

```sh
node docs/implementation/audit-0.1.3/transfer-probes.mjs
node docs/implementation/audit-0.1.3/security-probes.mjs
python3 docs/implementation/audit-0.1.3/native-driver.py
```

The native driver creates and removes disposable profiles. It injects its test scripts into a temporary source copy; those scripts are excluded from the release archive. Its “Reproduces…” row passes when F2 is reproduced, not when the product is correct. The probe JSON files expose the functional failures explicitly.

## Mozilla requirements checked

Mozilla's current policies were read directly during this audit. The judgments below apply to the source, unsigned archive, and prepared listing text available locally.

| Requirement area | Assessment |
| --- | --- |
| Manifest identity, version, compatibility and archive validity | Local validator passes. Firefox 153 minimum matches the publicSuffix dependency; minimum-version execution remains untested here. |
| Reviewable source and reproducibility | Native source is packaged unchanged; no minification, transpilation, bundling, remote code, or third-party libraries. A separate generated-source submission does not appear necessary for this package. |
| Necessary permissions | Each declared permission maps to implemented cookie, configuration, container, domain-classification, request-observation, or navigation behavior. Broad HTTP/HTTPS access is consistent with profile-wide manual burning. No clearly unnecessary permission was found. |
| No surprises and accurate functionality | Prepared listing text explains manual deletion, sign-out risk, safe skips, stores, private exclusion, and passive observation. Preserve those disclosures in the actual listing. F1–F3 mean some advertised workflows still have defects. |
| Data transmission and consent | `required: ["none"]` matches the reviewed local-only behavior. Local metadata access alone does not imply off-device transmission. The declaration satisfies the current new-extension manifest mechanism. |
| Privacy policy | Mozilla requires a policy when user-device data is transmitted. No such transmission was found, so absence of a separate policy is not established as a blocker here. A clear local-data statement remains useful. |
| Web, browser and user-data security | No confirmed exploitable issue; safety and privacy checks described above passed within their scope. |
| Performance and stability | Observation and mutation limits exist and controlled saturation tests passed. This audit did not establish performance across all maximum-size real Firefox profiles or long-running sessions. |
| Content, monetization, user scripts, native applications | No ads, affiliate rewriting, mining, user-script execution, or native application integration found. Ownership of code, name, and artwork remains the author's responsibility. |
| Submission information | Reviewer instructions exist locally. License selection, usable support contact, categories, final assets, account access, extension-ID availability, and actual AMO fields remain unverified or unfinished. A missing repository LICENSE file alone is not proof of AMO rejection; the appropriate license must be selected for distribution. |
| Signing and distribution | Archive remains unsigned. Mozilla signing is required for release/beta distribution. No submission, signing, or publication was performed. |

The local validator and source review support submission preparation; neither predicts the outcome of Mozilla's functional or human review. The identified functional failures may draw reviewer feedback, but this audit does not claim that any one automatically guarantees rejection.

## Checks still needed before release sign-off

These are evidence gaps, not proven security defects. Some are project acceptance requirements beyond Mozilla's basic submission requirements.

- Fix and verify F1–F3, then validate the resulting final archive again.
- Test the actual signed installation and update path, including permission prompts and host-access choices without the native test profile's automatic-grant preference.
- Test real Firefox restart during a burn and forced background-event-page loss, including interruption reporting, no automatic continuation, observation restoration, and cleanup. Controlled tests do not replace these lifecycle checks.
- Execute the supported minimum Firefox 153 and current supported ESR versions. This audit executed only Firefox 158.0.1.
- Execute Windows and Linux if claiming support for them; complete accessibility inspection, contrast/zoom checks, and representative maximum-size performance measurements required by the project.
- Finalize the AMO listing, license, support contact, account/ID availability, and reviewer notes. Submit for signing and test the returned artifact before public distribution.

## Current primary sources

Read on 25 October 2026:

- [Mozilla Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/): functionality, development practices, data handling, private browsing, and security.
- [Firefox built-in consent for data collection and transmission](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/): required declarations for new extensions and the `none` declaration.
- [Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/): validation, listing, license, support, privacy-policy, and reviewer-information fields.
- [Source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/): reviewable sources and reproducible transformations.
- [Firefox Add-on Distribution Agreement](https://extensionworkshop.com/documentation/publish/firefox-add-on-distribution-agreement/): accurate disclosures, support, ownership, and review discretion.
- [Signing and distribution](https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/): signing requirements for release/beta distribution.
- [Mozilla addons-linter](https://github.com/mozilla/addons-linter): local validator purpose and usage.
- [Firefox 153 developer release notes](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153): publicSuffix API introduction.
