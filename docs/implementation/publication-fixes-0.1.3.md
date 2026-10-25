# Publication audit corrections

Date: 25 October 2026. Status: implemented and locally verified in the working tree.
The corrections were first verified as version `0.1.3` and are delivered as `0.1.4` at the user's request.
No signing or extension publication was performed.

This record follows the [audit of commit 914dc8c](publication-security-audit-0.1.3.md).
Its three functional findings are corrected. The earlier audit results and archive hash remain historical.

## Corrections

| Finding | Implemented behavior |
| --- | --- |
| F1: valid large configurations could not export | One compact JSON encoder supplies export text and UTF-8 size. The complete file, including container descriptions and newline, must fit 2 MiB before any user commit. |
| F2: prototype-related references broke mapping | Imported mapping choices use `Map`. Explicit action and destination validation supplies plain mapping data to the backend. Choices survive paging and reset when mapping restarts. |
| F3: eviction prevented coverage recovery | Fresh observed navigation starts establish new coverage independently of an evicted record. Missing starts, storage failures, and uncorrelated events remain partial. |

F1 checks apply to editor saves, popup shortcuts, domain-rule saves, mapped import previews, and final commits.
An import source that fits does not authorize a larger merged result.
Oversized changes fail before a storage write and retain the current revision and protection.

Existing valid records and native container reconciliation are not rejected solely because their portable export exceeds the limit.
`getState.exportStatus` reports the complete file size, limit, and export availability.
Settings explains the excess, disables an oversized export, and retains editing access.
Users can reduce rules, remove unused inactive references, or shorten native container names before saving a fitting result.
No rules, references, or container descriptions are silently truncated.

Configuration schema, portable schema, and protocol remain version `1`.
No permissions or external dependencies were added.

## Verification

Environment: Firefox 158.0.1 on macOS 27.0.1 ARM64; Node 26.12.1; npm 11.20.0; Mozilla `addons-linter` 10.14.0.

The original export and observation failures were reproduced before correction.
A new native import regression failed with `choice.startsWith is not a function` before the fix and passed afterward.

| Check | Observed result |
| --- | --- |
| `npm test` | 166 tests passed, zero failures or skips; includes 15 new automated regressions. |
| Exact portable boundary | 2,097,152 UTF-8 bytes accepted; one additional byte rejected without a write. Escaped and Unicode strings included. |
| Original F1 public-action reproduction | 10,000 distinct-domain rules saved and exported successfully; compact file is 1,318,991 bytes. |
| Save-path enforcement | Editor, popup shortcut, and domain-rule saves reject portable size excess without modifying saved protection. |
| Import enforcement | Merged metadata excess and oversized conflict resolutions reject before a committable preview or write. |
| Compatibility and native metadata | Existing excess, container rename, and container addition preserve protection and permit fitting reductions. |
| Imported references | Retain, Exclude, and Map each exercised for `__proto__`, `constructor`, and `toString`, with paging and reset. |
| Observation recovery | Tab and byte eviction recover after fresh navigation; other tabs and failed storage retain partial coverage. |
| Native default-privacy profile | 16 checks passed, including real mapping UI paging/reset and legacy-size warning/reduction. |
| Native first-party-isolation profile | 17 checks passed, including cross-profile import from the fresh default-profile export. |
| Original production-limit observation probe | Fresh navigation after eviction at 128 retained tabs now reports observed coverage. |
| Selector safety model | 164,640 combinations; zero unsafe classifications. |
| Packaging and source checks | 25 source files checked; production-only ZIP has 27 unique entries with valid CRCs and source-identical contents. |
| Mozilla validation of rebuilt archive | Zero errors, warnings, or notices; warnings treated as errors. |

Focused regressions are in `tests/backend/configuration/export-size.test.js`, `tests/core/transfer/transfer.test.js`,
`tests/frontend/models.test.js`, `tests/backend/firefox/observations.test.js`, and `tests/native/runner.js`.
The standard native driver creates disposable profiles and uses synthetic data.

```sh
npm test
npm run package
python3 tests/native/firefox.py --export-file /private/tmp/biscotty-fixed-profile-a.json
python3 tests/native/firefox.py --fpi --import-file /private/tmp/biscotty-fixed-profile-a.json
```

The pre-bump archive was `dist/biscotty-0.1.3.zip`: 62,304 bytes compressed and 203,897 bytes uncompressed.
SHA-256:

```text
cbf366b972d30cdf2f4727913f23bb32b8bdf63ff0a82e293fe7811c22ab4237
```

Raw execution output for this working-tree run is in `/private/tmp/biscotty-fixes-0.1.3.cXPppH/`.
This temporary directory is not included in the archive.

## Version 0.1.4 delivery

The user requested a patch increment, commit, and push after correction verification.
Manifest, package metadata, and active release references now identify `0.1.4`.
The version bump changes no production logic. The 33 native checks above were performed before the metadata bump.

The versioned package passed all 166 automated tests, source checks, ZIP integrity and source-identity checks, and Mozilla validation again.
Mozilla `addons-linter` 10.14.0 reported zero errors, warnings, or notices for `dist/biscotty-0.1.4.zip`.
The archive contains 27 files, 62,304 compressed bytes, and 203,897 uncompressed bytes.
SHA-256:

```text
044ae0d5028cac8daf03fe63dddc5eeeb51b9fa732e69e12d42697b7ef0ca120
```

Versioned-package execution output is in `/private/tmp/biscotty-release-0.1.4.x4nQsD/`.

## Remaining release checks

These fixes do not complete signed-install/update, minimum-version/ESR, Windows/Linux, accessibility, or forced browser/background interruption verification.
License, support, account availability, final AMO listing, signing, and public approval remain release-owner work.
Current local validation does not establish Mozilla approval.
