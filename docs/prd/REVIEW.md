# Document review

Review date: 25 October 2026.
Scope: Requirements and agent work packages only.
The [Current Site amendment review](#current-site-amendment-review) records the current package checks.
Earlier results below describe the baseline package.

## Review record

| Check | Result |
| --- | --- |
| File scope | Passed. The package contains 16 Markdown documents and one Git ignore file. |
| Requirement identifiers | Passed. All 212 requirement identifiers are unique. |
| Acceptance identifiers | Passed. All 66 acceptance case identifiers are unique. |
| Decision trace | Passed. Q1 through Q37 and the final module-separation instruction are recorded. |
| Local links | Passed. All checked local file targets and heading anchors resolve. |
| JSON example | Passed. Parsing, root fields, matcher fields, references, and matcher uniqueness were checked. |
| Sentence screening | Passed. Screened descriptions meet the 25-word limit; numbered instructions meet the 20-word limit. |
| Paragraph screening | Passed. Checked prose paragraphs contain at most six sentences. |
| Git ignore behavior | Passed. All 27 path cases match the intended ignore or visibility rule. |
| Text hygiene | Passed. Delivered files have final newlines and no trailing whitespace. |

Sentence screening treats exact identifiers as technical tokens.
It excludes JSON data and document headings.
Table fragments are checked as descriptive text.
These checks inspect the new documents even though they are not yet tracked by Git.

## Design review

The review checked the final user amendments, not only the initial proposals.
Rules support All stores or selected store sets.
Import conflicts require individual decisions.
No operation history is retained.
The frontend calls the backend client without direct Firefox API access.

The review also checked cross-module failure behavior.
Native binding data remains private to the backend.
Repeated selectors retain a bounded candidate count.
Selector guards consider protected cookies absent from the snapshot.
Invalid settings require explicit recovery rather than empty default protection.

The agent plan assigns four parallel tracks after the shared foundation.
It assigns shared-file ownership, interface handoffs, and integration checks.
Every module PRD includes completion evidence.

## Maintenance additions

AGENT.md defines PRD writing, stable identifiers, decision updates, interface coordination, and review requirements.
AGENTS.md points agents to that guide and the implementation contracts.
The README index includes the authoring guide.

The Git ignore file covers local profiles, generated packages, test output, and temporary development files.
Specifications, test fixture data, and environment examples remain visible.

## Implementation status

The original review covered requirements only.
Extension implementation is now present.
The [implementation verification record](../implementation/verification.md) contains actual test results and remaining release checks.
The original document checks above do not establish extension release readiness.

## Language assurance

The prose targets ASD-STE100 Issue 9.
Editorial review used short sentences, direct requirements, consistent terms, and the technical term register.
The full official dictionary was not available through the retrieved PDF.
Exhaustive vocabulary and grammatical-role conformance is therefore not asserted.
Independent certification is not claimed.

## Implementation maintenance check

Date: 25 October 2026.
The product status and agent-plan introduction now reflect the implementation.
Product requirements and acceptance identifiers are unchanged.
The baseline package defined 212 unique requirements and 66 unique acceptance cases.
Local Markdown links and heading anchors passed the implementation maintenance check.
The transfer JSON example parsed successfully.

Changed text and new source files passed whitespace and final-newline checks.
Implementation test results and pending native cases appear in the [verification record](../implementation/verification.md).
This maintenance check does not add a language certification or release approval.

## Current Site amendment review

Review date: 25 October 2026.
Feature status: Approved, implementation pending.
Scope: Current Site requirements, shared contracts, acceptance cases, and implementation work packages.
The earlier counts and implementation results describe the baseline, not completion of this amendment.

| Check | Result |
| --- | --- |
| Package scope | Passed. 16 package Markdown documents checked; 14 documentation files changed for the amendment. |
| Requirement identifiers | Passed. 268 unique definitions; all original 212 identifiers retained. |
| Acceptance identifiers | Passed. 93 unique definitions; all original 66 identifiers retained. |
| References and decisions | Passed. All checked requirement references resolve; decision identifiers continue through Q50. |
| Local links | Passed. All 131 local file targets and heading anchors resolve across the package. |
| JSON example | Passed. Transfer example fields, scope references, unique matchers, and stated protection meaning checked. |
| Sentence screening | Passed. Descriptions and table fragments meet 25 words; numbered instructions meet 20 words. |
| Paragraph screening | Passed. Checked prose paragraphs contain at most six sentences. |
| Markdown and text hygiene | Passed. Heading structure, code fences, final newlines, and trailing whitespace checked. |
| Diff whitespace | Passed. The documentation diff passes `git diff --check`. |
| Platform sources | Request, navigation, document identity, and session-storage facts checked against primary Mozilla sources. |

The review reconciled passive observation with NATIVE-03 and NATIVE-06.
It preserved bounded inventory pages and separated snapshot stability from observation lifetime.
It distinguished exact-domain rule editing from current-site quick-protection shortcuts.
It checked current-store and partition selection, broader rule scope, stale navigation, duplicate matchers, and burn locking.

The action contracts define context-bound paging and rule saves without a configuration or transfer schema change.
Page observations and domain snapshots remain excluded from export and persistent settings.
The frontend modal preserves Settings draft behavior and explains incomplete observation coverage.
Current-page metadata is temporary; retained request history and cookie values remain prohibited.

The checker uses only Python standard-library modules and read-only Git inspection.
Sentence screening treats inline software identifiers as technical tokens and excludes headings and fenced data.
Editorial review does not establish exhaustive ASD-STE100 vocabulary or grammatical-role conformance.
Existing language-assurance limits remain applicable.

Extension tests, packaging, native Firefox checks, and signed-update checks were not run for this documentation task.
New acceptance cases remain future verification obligations.
No implementation or release-completion claim is added by this review.

## Implementation status update: 25 October 2026

Current Site implementation is present; release verification remains incomplete.
This update changes status descriptions without changing requirements, acceptance identifiers, contracts, or product decisions.
The [implementation verification record](../implementation/verification.md#current-site-amendment-evidence) lists controlled checks and observed Firefox results.
Native toolbar geometry, accessibility, permission-loss, suspension, and signed-release evidence remain incomplete.
The earlier amendment review records the document status at its review time.
Changed status lines were checked for concise sentences and consistent product terms.
No new claim of full ASD-STE100 conformance is made.

## Version 0.1.2 publishing review

Review date: 25 October 2026.
Scope: The [publishing](09-publishing-0.1.md), observation, and [request](11-bounded-requests.md) amendment and affected contracts.
Status: Implementation and preparation checks passed; signed release verification remains incomplete.

| Check | Result |
| --- | --- |
| Package scope | 19 package Markdown documents, including three new PRDs. |
| Requirement identifiers | 309 unique definitions; all original 268 identifiers retained. |
| Acceptance identifiers | 115 unique definitions; all original 93 identifiers retained. |
| References | Requirement references resolve; generic identifier-format examples remain examples. |
| Local links | All 180 checked package and implementation file targets and heading anchors resolve. |
| JSON example | The portable configuration example parses; its existing semantic acceptance test passes. |
| Sentence screening | New PRD descriptions and table fragments meet the 25-word limit. |
| Paragraph screening | New PRD prose paragraphs contain at most six sentences. |
| Decision trace | PUB-D01 through PUB-D05 record implementation authorization and preserved release-owner gates. |
| Module contracts | Aggregate observation writes, resource limits, request admission, and `REQUEST_CAPACITY` are consistent across contracts. |
| Text hygiene | Checked Markdown files have final newlines and no trailing whitespace. |

The review distinguishes project resource decisions from verified Mozilla API facts.
The 0.1.1 security report remains historical; current remediation evidence appears in the [verification record](../implementation/verification.md#version-012-publishing-preparation).
The existing glossary meanings, configuration format, portable format, and public protocol remain unchanged.
New computing terms appear in the technical noun register.

Editorial review checked requirement scope, direct subjects, failure behavior, ordering, and acceptance evidence.
Mechanical screening does not establish exhaustive dictionary or grammatical-role conformance.
No independent ASD-STE100 certification or public release approval is claimed.

## Version 0.1.3 patch review

Review date: 25 October 2026.
Scope: Startup storage recovery, version metadata, active publishing requirements, and release evidence.
Status: Local preparation checks passed; signed release verification remains incomplete.

| Check | Result |
| --- | --- |
| Requirement identifiers | 309 unique definitions; no identifiers added or removed. |
| Acceptance identifiers | 115 unique definitions; no identifiers added or removed. |
| Version consistency | Manifest, package metadata, active requirements, and release paths identify `0.1.3`. |
| Local links | All 193 file targets and heading anchors resolve across 24 Markdown files. |
| JSON examples | All fenced JSON examples parse; existing semantic acceptance tests pass. |
| Sentence screening | Changed PRD sentences and table fragments meet 25 words. |
| Text hygiene | Code fences, final newlines, trailing whitespace, and diff whitespace pass. |
| Decision trace | PUB-D06 supersedes the delivery version in PUB-D01; earlier evidence remains historical. |
| Implementation checks | 151 tests, static checks, packaging, ZIP integrity, and Mozilla validation pass. |

The correction retains the operation lock until explicit dismissal confirms marker and session cleanup.
Native Firefox checks were not rerun for this patch.
Signed, platform, accessibility, and lifecycle evidence remains incomplete.
No full ASD-STE100 conformance or public release approval is claimed.

## Publication audit correction review

Review date: 25 October 2026.
Scope: Complete portable size checks, imported-reference handling, navigation coverage recovery, and affected contracts.
Status: Implemented; local verification passed; signed release verification remains incomplete.

| Check | Result |
| --- | --- |
| Requirement identifiers | 320 unique definitions; all 309 original definitions retained. |
| Acceptance identifiers | 123 unique definitions; all 115 original definitions retained. |
| Decisions | FIX-D01 through FIX-D04 record the user-approved corrections and compatibility behavior. |
| Interfaces | `exportStatus` documented; configuration, portable file, and protocol versions remain `1`. |
| Regression evidence | 166 automated tests and 33 native Firefox checks pass; original findings no longer reproduce through current interfaces. |
| Release archive | Packaging, ZIP integrity, source identity, and Mozilla validation pass. |
| Local links | All 212 checked file targets and heading anchors resolve across 26 Markdown files. |
| JSON example | The fenced JSON example parses; its semantic acceptance test passes. |
| Text checks | Changed PRD sentences, paragraph lengths, final newlines, and trailing whitespace pass screening. |

The historical correction record was removed during the approved documentation cleanup.
Historical audit probes retain their original UI access pattern and are separate from current regression tests.
Changed requirements retain short sentences, stable terms, explicit failure behavior, and unchanged protection semantics.
Mechanical checks do not establish exhaustive dictionary or grammatical-role conformance.

## Version 0.1.4 delivery review

Review date: 25 October 2026.
The user requested a patch increment, commit, and push of the completed corrections.
Manifest, package metadata, active publishing requirements, and package paths identify `0.1.4`.
PUB-D07 supersedes the earlier delivery version without changing protection behavior.

All 320 requirement definitions and 123 acceptance definitions remain unique.
All 214 checked local file targets and heading anchors resolve across 26 Markdown files.
The JSON example, paragraph screening, final newlines, and diff whitespace pass.
The versioned package passes 166 automated tests, source checks, ZIP checks, and Mozilla validation.
The 33 native checks preceded the metadata-only increment.
Signed installation and public extension publication remain pending.

## Version 0.1.5 lifecycle correction review

Review date: 25 October 2026.
Scope: Verified document restoration, terminal cancellation rejection, patch increment, and Git delivery.
Status: Implemented; local and native regression checks passed; signed release verification remains incomplete.

| Check | Result |
| --- | --- |
| Requirement identifiers | 322 unique definitions; earlier definitions retained. |
| Acceptance identifiers | 125 unique definitions; OBS-A10 and BURN-A18 added. |
| Adapter contract | `getDocumentId` supplies native identity without retaining frame URLs or changing permissions. |
| Decisions | PUB-D08 records user authorization and supersedes the delivery version in PUB-D07. |
| Regression evidence | 175 automated tests, 30 independent probes, and 35 native Firefox scenarios pass. |
| Release archive | Version `0.1.5` passes packaging, ZIP integrity, source identity, and Mozilla validation. |
| Document checks | Local links, anchors, JSON examples, changed sentence lengths, final newlines, and whitespace pass. |

The historical correction record was removed during the approved documentation cleanup.
The historical audit and corrected probe artifacts were removed during the approved documentation cleanup.
Mechanical screening does not establish exhaustive vocabulary or grammatical-role conformance.

## Optional third-party inspection proposal — 3 November 2026

The proposed feature documents are separate from the approved baseline and are not implemented acceptance evidence.
The proposal identifies affected requirements, ownership, test cases, and unresolved shared contracts.
Local links and proposal identifiers were checked mechanically.
Full vocabulary, grammatical-role, and ASD-STE100 conformance review remains open.
Native Firefox testing remains incomplete because the disposable-profile harness did not start Firefox.

## Partition-specific deletion exceptions — 3 November 2026

The user approved the design amendment. Implementation and release verification remain incomplete.
The amendment records baseline conflicts and requires contract integration before implementation.
The accompanying HTML is an illustrative walkthrough, not a Firefox test.

Checks completed: 38 unique exception requirements, 11 unique acceptance cases, proposal file links, final newlines, and git diff whitespace.
Sentence-length, anchor, full-package reference, and vocabulary checks remain incomplete.

## Settings cookie inventory — 3 November 2026

The user approved the inventory design. Implementation and release verification remain incomplete.
The inventory amendment preserves explicit conflict resolution and identifies required interface integration.

The user refined the inventory hierarchy to container, main domain, and third-party jar.
Each jar has a keep-stored or burnable choice; individual-cookie choices remain available.

Plain-language contextual help was added to the inventory proposal and illustrative HTML.

## Current Site stored-cookie inventory — 3 November 2026

The user approved removal of request observation and a separate replacement PRD.
The optional inspection proposal is superseded; the implemented baseline remains until integration.

## Frontend refresh — 3 November 2026

The user approved the action-first concept and authorized implementation with an English UI and corresponding PRD updates.
The [frontend refresh PRD](12-frontend-refresh.md) records the implemented behavior and superseded placement and store-selection requirements.
The product, frontend, interfaces, glossary, decision record, source references, and agent ownership were aligned.

The package contains 499 unique requirement definitions and 181 unique acceptance definitions.
All 165 checked local links and anchors resolve across the twelve changed and new Markdown documents in this review.
Changed JSON examples parse; the new module PRD passes sentence-length screening.
Whitespace and final-newline checks passed for changed source and documentation files.

The automated suite passed 196 tests; 19 native scenarios passed in a disposable Firefox 159.0 profile.
Seven browser DOM checks passed; the final asynchronous-selection refinement passed its three focused model regressions.
The browser fixture exercised production frontend modules against the controlled backend.
Native verification includes popup rule editing, unchanged burner behavior, keyboard tab selection, and preserved Settings drafts.
The initial native attempt required the current Firefox automation environment variable; a subsequent run reached the scenarios.
A later scenario failure exposed a test waiting for a disabled metadata-loading control; the test now waits for availability.

These checks do not establish exhaustive ASD-STE100 vocabulary or grammatical-role conformance.
Signed installation, Firefox minimum-version verification, and exhaustive accessibility review remain incomplete.

### Visual sizing refinement

The user requested larger status badges, smaller info circles, and a larger Settings gear.
The prototype and extension now use 16-pixel info circles and a 24-pixel gear inside a 36-pixel control.
Controlled browser inspection confirmed computed dimensions, larger metadata badges, help opening, Escape dismissal, and keyboard activation of Settings.
Source checks, changed-document checks, and unsigned packaging were repeated for this refinement.
The earlier full-suite and native results describe the integrated behavior before these visual refinements.

### Version 0.2.1 metadata increment

The user requested a patch increment from `0.2.0` to `0.2.1`.
Manifest, package metadata, active package paths, and release documentation now identify `0.2.1`.
UX-D09 records this authorization; earlier verification evidence retains its historical version.
Source checks, unsigned packaging, archive integrity, metadata agreement, and SHA-256 verification passed.

## Approved documentation cleanup — 3 November 2026

The user confirmed the cleanup scope after reviewing superseded documents, audit retention, and frontend prototypes.
Removed 56 files: retired specifications, the replaced implementation proposal, historical audit reports and probes, and all frontend prototypes.
Current tests and version 0.2.1 audit evidence remain available.
The [decision record](08-decisions.md#documentation-cleanup--3-november-2026) records retired identifiers and replacement guidance.
Historical review counts above describe their original revisions.

| Check | Actual result |
| --- | --- |
| Markdown scope | 28 current Markdown files in the root and documentation package. |
| Local links | 248 local file targets and heading anchors resolve. |
| Identifier definitions | 444 requirement and 160 acceptance definitions; no duplicates. |
| JSON examples | 1 PRD JSON examples parse successfully. |
| Text hygiene | Current Markdown final newlines and trailing whitespace checked; Git diff whitespace check passed. |
| Contracts | Navigation guidance now describes in-memory generations and legacy cleanup; current inventory contracts remain authoritative. |
| Automated suite and source checks | Attempted; unavailable because this environment has no Node.js or npm executable. |

No native Firefox checks were run for this documentation cleanup.
Editorial review covered changed guidance and retired references; exhaustive vocabulary and grammatical-role conformance was not checked.

## Implementation status verification — 3 November 2026

Status descriptions now identify the partition and inventory implementation as present, with acceptance and release verification incomplete.
The amendment wording now identifies the approved contracts as authoritative over conflicting baseline descriptions.
No requirement, acceptance, or decision identifiers changed.

The current checkout passes 196 automated tests with zero failures or skips.
The source check passes for 29 native files, and the unsigned 0.2.1 package passes ZIP integrity verification.
The Firefox 159.0 run did not complete because Firefox discarded the Marionette browsing context before extension navigation.
The implementation open-issues record contains this failed attempt.
Signed installation, platform coverage, accessibility, lifecycle, and complete acceptance verification remain open.
