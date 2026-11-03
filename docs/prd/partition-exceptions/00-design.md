# PRD: Partition-specific deletion exceptions

Status: User-approved design, 3 November 2026; implementation present; acceptance and release verification incomplete.
Owner: Integration agent. Implementation ownership follows the [agent plan](../07-agent-plan.md).
Dependencies: [product](../00-product.md), [interfaces](../01-module-interfaces.md), [settings](../02-protection-and-settings.md), [burner](../03-firefox-backend-and-burner.md), [frontend](../04-frontend.md), and [transfer](../05-configuration-transfer.md).

## Purpose and scope

A user can allow cookies while making selected third-party partitioned cookies burnable for manual deletion.
An exception selects a cookie domain, a top-level site, and a store scope.
The design applies to any supported domains; the animation uses example domains only.
[Open the behavior animation](behavior.html).
The [Settings inventory amendment](01-settings-inventory.md) defines inspection and policy editing.

This amendment supersedes the no-override statement and modifies PROD-12, RULE-08, RULE-10, and their acceptance cases when integrated.
The approved amendment supersedes conflicting baseline contracts.

## Rule and matching

- **PEX-01.** An exception MUST contain independently configured cookie-domain and top-level-site domain selectors.
- **PEX-02.** Each domain selector MUST support exact matching or matching the domain and its subdomains.
- **PEX-03.** An exception MUST select all stores or a nonempty explicit set of stores.
- **PEX-04.** An exception MUST support all schemes, HTTP only, or HTTPS only for the top-level site.
- **PEX-05.** An exception MUST support an optional exact cookie name and an optional exact cookie path.
- **PEX-06.** An exception MUST have an enabled state.
- **PEX-07.** A matching enabled exception MUST override all matching cookie allow rules for that cookie.
- **PEX-08.** Any matching enabled exception MUST be sufficient for the override.
- **PEX-09.** An exception MUST NOT override whole-container protection.
- **PEX-10.** An exception MUST match only a cookie with a known supported partition identity and top-level site.
- **PEX-11.** An exception MUST NOT match unpartitioned cookies or cookies with an unknown site relationship.
- **PEX-12.** An exception MUST NOT match a cookie domain and top-level site with the same base domain.
- **PEX-13.** Domain matching MUST use complete label boundaries and the existing canonicalization and public-suffix validation.
- **PEX-14.** A missing container reference MUST remain inactive until explicitly mapped or removed.
- **PEX-15.** An exception MUST NOT change burnability of a cookie without an applicable allow rule.
- **PEX-16.** A protected or potentially protected cookie MUST remain subject to the existing deletion selector safety checks.
- **PEX-17.** The backend MUST skip an ambiguous selector that could delete a protected cookie.
- **PEX-18.** Exception changes MUST invalidate affected previews and follow existing mutation locking and revision rules.
- **PEX-19.** Fresh installations and migrations MUST start with no deletion exceptions.
- **PEX-20.** Migration MUST preserve existing protection and MUST fail closed if its result cannot be validated.

Use Firefox's public-suffix facilities for base-domain comparison.
For IP addresses and local hosts, compare canonical exact hosts when no base domain exists.
A cookie does not carry its own scheme; do not infer it from the Secure flag.
The scheme selector filters the top-level partition site, not the cookie domain.
Unknown or unsupported partition identity fails closed.
An exception does not block cookie creation or schedule deletion.

## Backend and frontend responsibilities

- **PEX-21.** The backend MUST own validation, normalization, persistence, matching, precedence, preview, and deletion decisions.
- **PEX-22.** The backend MUST provide separate list, create, update, enable, disable, and delete operations for exceptions.
- **PEX-23.** The backend MUST provide a policy evaluation operation with matching exceptions, overridden allow rules, and effective protection reasons.
- **PEX-24.** Mutating operations MUST validate the expected revision and commit atomically through the configuration mutation queue.
- **PEX-25.** Backend responses MUST NOT expose cookie values.
- **PEX-26.** The frontend MUST call the backend client for policy and configuration actions.
- **PEX-27.** Settings MUST list, create, edit, enable, disable, and delete exceptions separately from allow rules.
- **PEX-28.** Current Site MUST offer exception creation from a displayed cookie-domain row.
- **PEX-29.** Current Site MUST prefill the current store, exact top-level site, and exact selected cookie domain.
- **PEX-30.** The form MUST permit changes to every prefilled selector before saving.
- **PEX-31.** New forms MUST default to both schemes and unrestricted name and path.
- **PEX-32.** The burn preview MUST explain matching exceptions and overridden allow rules for affected cookies.
- **PEX-33.** The burn preview MUST explain protected-container and ambiguous-selector skips.

The shared interface amendment must define action names, schemas, pagination, error codes, request bounds, and concurrency behavior before implementation.
It must preserve the current frontend/backend boundary and avoid browser objects in public responses.
The preview must remain bounded and must not retain operation history.

## Transfer and lifecycle

- **PEX-34.** Export MUST include enabled and disabled exceptions and their complete selectors.
- **PEX-35.** Import MUST preserve exception selectors and use explicit container mapping for unresolved references.
- **PEX-36.** Import MUST support the existing Merge and Replace modes with explicit conflict decisions.
- **PEX-37.** Import MUST validate the complete result and preserve existing configuration on failure.
- **PEX-38.** Exception storage and transfer MUST obey the existing request and portable-size limits.

Before implementation, define versioned local and portable schemas and migration from existing records.
Define canonical exception identity, duplicate handling, merge conflicts, and a bounded exception count.
Define import compatibility and recovery without silently broadening an exception.
Document these decisions in the shared interfaces and transfer PRD before coding.

## Acceptance cases

| Case | Setup and expected result |
| --- | --- |
| PEX-A01 | A Google allow rule protects Work. A matching Facebook partition exception makes Google's partitioned cookie burnable; Google's unpartitioned cookie stays protected. |
| PEX-A02 | Work and Personal are selected. Matching cookies in both stores are burnable; Normal browsing is unaffected. |
| PEX-A03 | Whole-container protection wins over a matching exception. |
| PEX-A04 | A same-base-domain subdomain partition, unknown partition, and unpartitioned cookie do not match. |
| PEX-A05 | Exact and subdomain selectors independently respect complete labels, scheme, name, and path. |
| PEX-A06 | Two matching exceptions permit the override; disabling either leaves the other effective. |
| PEX-A07 | A selector that could remove a protected cookie is skipped and explained. |
| PEX-A08 | Current Site prefills editable exact selectors and current store; Settings supports manual entry. |
| PEX-A09 | Import, export, inactive references, migration, revision conflicts, and burn locking preserve protection and selector meaning. |
| PEX-A10 | Preview identifies applicable exceptions and overridden allow rules without exposing cookie values. |
| PEX-A11 | Native Firefox fixtures verify store and partition isolation, scheme selection, and safe removal. |

## Completion evidence

Integrate the amendment into the baseline product, interfaces, settings, burner, frontend, transfer, decisions, work plan, and verification documents.
Resolve the schema and compatibility details above before implementation.
Run unit, integration, and disposable Firefox fixture cases, including selector ambiguity and migration.
Record actual results separately from these future acceptance cases.
