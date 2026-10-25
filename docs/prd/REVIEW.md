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
Scope: The [publishing](09-publishing-0.1.md), [observation](10-bounded-observation.md), and [request](11-bounded-requests.md) amendment and affected contracts.
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
