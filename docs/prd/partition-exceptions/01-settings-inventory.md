# PRD: Settings cookie inventory

Status: User-approved design, 3 November 2026; implementation present; acceptance and release verification incomplete.
Owner: Integration agent. Implementation ownership follows the [agent plan](../07-agent-plan.md).
Dependencies: [partition exceptions](00-design.md), [product](../00-product.md), [interfaces](../01-module-interfaces.md), [settings](../02-protection-and-settings.md), [frontend](../04-frontend.md), and [burner](../03-firefox-backend-and-burner.md).

## Purpose and scope

Settings groups accessible stored cookies by container, main domain, and third-party jar.
Each third-party jar has a keep-stored or burnable choice.
The user can choose which cookies are burnable and which remain stored.
These choices edit the same saved policy used by the manual burner.
The [walkthrough](behavior.html) illustrates this design without accessing cookies.

This amendment changes existing interfaces and frontend requirements when integrated.
This approved amendment supersedes conflicting baseline contracts.

## Inventory and attribution

- **INV-01.** The backend MUST capture an inventory from accessible stored cookie metadata and supported partition identities.
- **INV-02.** The inventory MUST include accessible stores without requiring a current page observation.
- **INV-03.** The frontend MUST group the inventory by container, main domain, and third-party jar.
- **INV-04.** The frontend MUST show Normal browsing as a separate store.
- **INV-05.** The frontend MUST distinguish known top-level-site partitions from unpartitioned own-domain groupings.
- **INV-06.** The frontend MUST explain that unpartitioned cookie metadata does not identify every site that uses a cookie.
- **INV-07.** The frontend MUST show cookie name, domain, path, partition, and relevant flags.
- **INV-08.** Backend responses and frontend views MUST NOT contain cookie values.
- **INV-09.** The frontend MUST provide search and filters across the inventory.
- **INV-10.** The backend MUST page a captured snapshot without changing its row order.
- **INV-11.** The frontend MUST provide manual snapshot refresh.
- **INV-12.** The frontend MUST explain that cookies can change after the snapshot.
- **INV-13.** The backend MUST report inaccessible stores and scopes as incomplete coverage.
- **INV-14.** A snapshot capture failure MUST NOT be presented as a complete inventory.
- **INV-15.** The frontend MUST show saved rules that currently match no stored cookies.
- **INV-16.** The frontend MUST show protected-container cookies and explain the container protection.
- **INV-17.** The frontend MUST provide a path to container protection settings.

A main domain identifies the top-level site for a known partition.
Each third-party jar groups cookies by cookie domain within that partition and container.
The main domain also shows its own-domain cookies separately from third-party jars.
Unpartitioned cookies appear in an own-domain grouping, not in an inferred third-party jar.
Own-domain grouping does not assert that a cookie was used by that site.
Partition grouping does not prove that a cookie was sent or read.
Unknown associations must be labeled without inventing a top-level site.
Search and filters must not silently remove entries from the underlying snapshot.

## Plain-language help

- **INV-42.** The frontend MUST explain unfamiliar cookie and storage terms in plain language.
- **INV-43.** The inventory MUST provide an info control beside terms that need explanation.
- **INV-44.** Each info control MUST open a temporary explanation without changing saved settings.
- **INV-45.** The user MUST be able to dismiss each explanation with a close control and Escape.
- **INV-46.** Info controls and explanations MUST support keyboard access and accessible names.
- **INV-47.** Explanations MUST distinguish a known third-party jar from an unpartitioned cookie with unknown site use.
- **INV-48.** The frontend MUST explain that burnable means considered during a manual burn, subject to protection and safety checks.

Use familiar terms in the main view and explain technical terms where they appear.
For example, explain an unpartitioned cookie as a cookie not stored in a separate jar for one site.
State that Firefox cannot reliably identify every site that may use that cookie.
Explain that a third-party jar groups cookies from another domain for one main site and container.
Explain that keeping a cookie protects it from Biscotty's burner, not from changes by Firefox or websites.

## Choices and conflicts

- **INV-18.** Each third-party jar MUST offer keep-stored and burnable choices.
- **INV-41.** The frontend MUST also support individual-cookie choices within each jar.
- **INV-19.** An individual choice MUST create a persistent policy rule, not a one-time deletion selection.
- **INV-20.** An individual rule MUST retain cookie domain, name, path, store scope, and applicable partition scope.
- **INV-21.** The frontend MUST explain that a persistent rule can apply to a recreated cookie.
- **INV-22.** The backend MUST evaluate choices using the saved allow rules, exceptions, and container protection.
- **INV-23.** The frontend MUST show the effective result and the rules responsible for it.
- **INV-24.** An existing intentional partition exception MUST appear as a resolved override with its allow rules.
- **INV-25.** A new conflicting draft MUST show the conflicting choices before Save.
- **INV-26.** The backend MUST reject a save with unresolved conflicts and preserve the saved policy.
- **INV-27.** The frontend MUST offer explicit conflict resolution before Save.
- **INV-28.** The frontend MUST show all affected scopes before changing a broader rule.
- **INV-29.** The frontend MUST offer a narrower rule when the backend can express the requested outcome safely.
- **INV-30.** A burnable choice for a protected first-party cookie MUST require an explicit allow-rule change.
- **INV-31.** Whole-container protection MUST prevent a burnable choice from authorizing deletion in that container.
- **INV-32.** Deletion safety MUST continue to prevent ambiguous removal of protected cookies.
- **INV-33.** The frontend MUST support selecting multiple cookies or domains for one proposed choice.
- **INV-34.** The frontend MUST show the batch scope and all detected conflicts before Save.
- **INV-35.** A batch save MUST commit atomically or preserve the previous saved policy.
- **INV-36.** Inventory edits MUST use the Settings draft and Save workflow.
- **INV-37.** The backend MUST revalidate affected cookie identities and policy revisions before Save.
- **INV-38.** Changed or missing cookie identities MUST be reported for user review without silently retargeting a choice.
- **INV-39.** The frontend MUST preserve the draft when validation or Save fails.
- **INV-40.** The frontend MUST retain manual rule entry when no matching cookie exists.

A burnable choice does not delete a cookie or guarantee deletion.
The manual burn still requires preview and confirmation.
A protected container remains authoritative until the user changes its protection.

## Interface and implementation handoff

The backend owns Firefox access, snapshot capture, matching, conflict detection, and policy changes.
The frontend calls the backend client and renders its results.
Before implementation, define bounded snapshot and pagination contracts, identity revalidation, and typed conflict resolutions.
Define rule identity, scope expansion, and batch mutation semantics in the shared interfaces.
Ensure refresh and navigation do not discard unsaved drafts without an explicit user decision.
Reconcile the earlier exception precedence with explicit conflict resolution without changing existing saved protection silently.
Update affected product, module, transfer, decision, verification, and work-plan documents before implementation.

## Acceptance cases

| Case | Setup and expected result |
| --- | --- |
| INV-A01 | Accessible stores show main domains and their third-party jars without current-page observation; Normal browsing remains separate. |
| INV-A02 | Unpartitioned cookies appear under their own domain with an attribution limitation. |
| INV-A03 | Search, filters, paging, and refresh preserve snapshot ordering and report incomplete access. |
| INV-A04 | A protected container remains inspectable and explains why its cookies cannot become burnable. |
| INV-A05 | A jar keep choice and individual burnable draft show a conflict; Save fails until resolved. |
| INV-A06 | An existing intentional partition exception displays its override and the affected allow rules. |
| INV-A07 | A broad rule change displays affected stores and sites before Save. |
| INV-A08 | A batch with a conflict commits nothing and preserves the draft and saved policy. |
| INV-A09 | Cookie changes, missing identities, or revision changes require review without retargeting. |
| INV-A10 | A saved rule with no current cookie remains visible and applies to matching future cookies. |
| INV-A11 | Values never cross the backend interface or appear in the inventory. |
| INV-A12 | Native fixtures verify partition attribution, store separation, missing permissions, and safe deletion. |
| INV-A13 | Info controls open understandable explanations, work with keyboard and Escape, and do not change settings. |

## Completion evidence

Integrate contracts and baseline requirements before implementation.
Run unit, integration, and disposable Firefox fixture cases.
Record actual results separately from these future acceptance cases.
