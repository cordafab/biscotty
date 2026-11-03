# PRD: Version 0.1 publishing

Status: Implemented on 25 October 2026; preparation checks passed; release verification remains incomplete.
Delivery version: `0.1.5`.
Owner: Integration agent.
Paths: `manifest.json`, `package.json`, `scripts/`, `README.md`, and release documentation.
Dependencies: [product](00-product.md), [interfaces](01-module-interfaces.md), and [release requirements](06-verification-and-release.md).
Current security work follows [stored-cookie inventory](partition-exceptions/02-current-site-inventory.md) and [request limits](11-bounded-requests.md).

## Purpose and scope

Prepare the 0.1 release line for Mozilla submission after the publication and security review.
The original review covered version `0.1.1`; the initial amendment delivered version `0.1.2`.
Version `0.1.3` adds the startup storage recovery correction.
Version `0.1.4` adds complete portable size checks, safe imported references, and observation coverage recovery.
Version `0.1.5` verifies restored document identities and rejects cancellation during terminal cleanup.

The scope includes resource limits, accurate disclosures, release packaging, and recorded verification.
Account access, license selection, signing, and public publication remain release-owner actions.
This work does not authorize publication or weaken existing acceptance requirements.

## Interfaces and invariants

The configuration schema, portable file format, and public protocol remain version `1`.
The existing extension identity and Firefox minimum remain unchanged.
The [shared interfaces](01-module-interfaces.md) control new errors and private adapter changes.
Mozilla validation remains an external release check, without project library dependencies.

## Requirements

- **PUB-01.** The manifest and package metadata MUST identify version `0.1.5`.
- **PUB-02.** Release packaging MUST produce a versioned unsigned archive and its SHA-256 file.
- **PUB-03.** The listing MUST explain passive page observation while the popup is closed.
- **PUB-04.** Permission explanations MUST include every declared API permission and host scope.
- **PUB-05.** Disclosures MUST identify temporary observation metadata, its limits, and its cleanup conditions.
- **PUB-06.** The listing MUST distinguish stored-cookie association from verified cookie use or transmission.
- **PUB-07.** Reviewer instructions MUST describe installation, protection, burning, transfer, and observation checks with synthetic data.
- **PUB-08.** Verification records MUST identify exact tool versions, environments, observed results, and remaining checks.
- **PUB-09.** Release documentation MUST keep signed verification and public approval pending until their evidence exists.
- **PUB-10.** The final archive MUST pass Mozilla's current local validator without errors or warnings.
- **PUB-11.** Publishing preparation MUST preserve the existing no-transmission declaration and private-browsing exclusion.
- **PUB-12.** The release handoff MUST identify unresolved account, license, support, and platform requirements.

## Failure behavior

A failed package or validator check prevents a passing preparation result.
An unperformed native or signed check remains pending with its exact scope.
Local validation does not establish Mozilla approval.
No failed check permits reduced protection, remote dependencies, or hidden data transmission.

## Acceptance criteria

| Case | Expected result |
| --- | --- |
| PUB-A01 | Manifest, package metadata, package filename, and active release documentation identify `0.1.5`. |
| PUB-A02 | The archive contains production resources only and passes independent ZIP integrity checks. |
| PUB-A03 | Listing and permission notes describe both observation permissions and current session metadata. |
| PUB-A04 | Current automated tests, native checks, and Mozilla validation have separate observed results. |
| PUB-A05 | Signed, platform, and owner-only actions remain explicit when their evidence is absent. |
| PUB-A06 | The configuration format, protocol, permissions, identity, and cookie-protection behavior remain compatible. |

## Completion evidence

Record implementation results in the [verification record](../implementation/verification.md).
Record listing material and reviewer instructions in [release preparation](../implementation/release.md).
Record document checks in the [document review](REVIEW.md).
Preparation completion does not establish release approval under REL-08.
