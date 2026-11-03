# PRD: Current Site stored-cookie inventory

Status: User-approved design, 3 November 2026; implementation present; acceptance and release verification incomplete.
Owner: Integration agent. Implementation ownership follows the [agent plan](../07-agent-plan.md).
Dependencies: [Settings inventory](01-settings-inventory.md), [partition exceptions](00-design.md), [current backend](../03-firefox-backend-and-burner.md), [frontend](../04-frontend.md), and [shared interfaces](../01-module-interfaces.md).

## Purpose and scope

Current Site shows accessible stored cookies with known associations to the current site and store.
It uses the same inventory and policy evaluation as Settings.
It does not observe page requests or infer cookie use from contacted hosts.
This approved amendment is implemented; complete acceptance and release verification remain open.

This amendment supersedes the request-observation design and the optional inspection proposal.
Integrate affected baseline requirements and contracts before implementation.

## Requirements

- **CSI-01.** The backend MUST identify the current top-level site and cookie store without observing page requests.
- **CSI-02.** Current Site MUST show accessible cookies with a known partition belonging to the current top-level site and store.
- **CSI-03.** Current Site MUST group known third-party cookies by cookie domain.
- **CSI-04.** Current Site MUST distinguish the current site's own-domain cookies from third-party partition groups.
- **CSI-05.** Current Site MUST label unpartitioned cookies separately without claiming that the current page used them.
- **CSI-06.** Current Site MUST NOT attribute an unpartitioned cookie to a third-party jar.
- **CSI-07.** Current Site MUST exclude unknown partition associations from known-site groups and explain incomplete coverage.
- **CSI-08.** The backend MUST use the same saved policy evaluation for Current Site and Settings.
- **CSI-09.** The frontend MUST show keep-stored or burnable status and its protection reasons for each displayed group.
- **CSI-10.** Current Site MUST support the existing protection workflow and partition exception creation through backend actions.
- **CSI-11.** Current Site MUST explain that stored association does not prove transmission or use.
- **CSI-12.** Current Site MUST provide plain-language contextual help for partition and burnability terms.
- **CSI-13.** The backend MUST report unavailable permissions, stores, or enumeration as incomplete or unavailable.
- **CSI-14.** The backend MUST NOT report a truncated snapshot as complete.
- **CSI-15.** The backend MUST reject a stale context after navigation or store change.
- **CSI-16.** The frontend MUST provide manual refresh for the stored-cookie snapshot.
- **CSI-17.** The extension MUST NOT register a request listener for page observation.
- **CSI-18.** The backend MUST NOT retain contacted-host observations for Current Site.
- **CSI-19.** The migration MUST preserve saved allow rules, protected containers, and other configuration.
- **CSI-20.** Removal of observation MUST NOT change burner scope or deletion safety.
- **CSI-21.** Public responses MUST NOT contain cookie values.
- **CSI-22.** The extension MUST remove permissions used exclusively for request observation when no remaining feature requires them.

Own-domain matching must use the existing cookie domain and host-only rules.
Partition matching must use the complete supported native partition identity and the schemeful top-level site.
Unpartitioned own-domain cookies can be shown as a separately labeled group.
Other unpartitioned cookies must not be assigned to the current site's third-party jars.
A navigation or context mechanism may remain if required for current-site identity and stale-context safety.
It must not collect contacted third-party hosts.

## Interfaces and transition

The backend owns Firefox access, inventory selection, policy evaluation, and context validation.
The frontend calls the backend client and displays its results.
Before implementation, define shared snapshot, pagination, grouping, and stale-context contracts.
Reconcile the current Current Site row editor with the approved exception and Settings workflows.
Define cleanup of old temporary observation data and safe handling of in-flight events during upgrade.
Remove obsolete observation controls, settings proposals, and metadata only after migration and cleanup are specified.
Review permissions for other consumers before removing them.
No performance improvement is claimed without measurement.

## Acceptance cases

| Case | Setup and expected result |
| --- | --- |
| CSI-A01 | A known third-party partition appears under its top-level site and current store without request observation. |
| CSI-A02 | An unrelated partition and a different store do not appear in the current site's groups. |
| CSI-A03 | An unpartitioned own-domain cookie is labeled separately; another domain's unpartitioned cookie is not assigned to a third-party jar. |
| CSI-A04 | Unknown association or unavailable access is explained without claiming complete coverage. |
| CSI-A05 | Current Site and Settings report the same effective policy for the same cookie identity. |
| CSI-A06 | Navigation or store changes invalidate stale actions and snapshots. |
| CSI-A07 | Startup, navigation, restart, and upgrade register no request-observation listener and preserve protection. |
| CSI-A08 | Old temporary observations and in-flight events cannot restore observation state after migration. |
| CSI-A09 | Manual burn and deletion safety remain unchanged when observation is removed. |
| CSI-A10 | Firefox fixtures verify partition matching, permissions, stale context, and cleanup. |

## Completion evidence

Update the baseline product, interfaces, backend, frontend, observation limits, decisions, verification, and agent plan before implementation.
Review the optional inspection proposal and retire its implementation tasks.
Run unit, integration, migration, and disposable Firefox fixture cases.
Record actual results separately from these future acceptance cases.
