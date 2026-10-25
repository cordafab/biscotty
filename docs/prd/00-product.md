# Product PRD: Biscotty version 1

Status: Approved design; baseline implementation present; release verification incomplete.
Current Site cookie-domain list: Approved; implementation present; release verification incomplete.
Decision date: 25 October 2026.

## Purpose

Biscotty gives a Firefox user one manual action to delete eligible cookies.
The user can protect individual cookie groups and complete containers.
The user can transfer protection settings between Firefox installations.

## Product requirements

- **PROD-01.** The extension MUST support Firefox desktop 153.0 and later supported releases.
- **PROD-02.** The extension MUST use Manifest V3 and native JavaScript, HTML, CSS, and Firefox APIs.
- **PROD-03.** Implementation, builds, and tests MUST have zero external library dependencies.
- **PROD-04.** Development tools can use standard browser features, operating system tools, and standard runtime modules.
- **PROD-05.** The extension MUST provide a toolbar button with a menu that contains the cookie burner.
- **PROD-06.** The extension MUST provide a configuration editor in a full browser tab.
- **PROD-07.** Each burn MUST cover Normal browsing and all eligible named containers in the current profile.
- **PROD-08.** Private browsing MUST remain outside version 1.
- **PROD-09.** The extension MUST keep whole-container protection separate from cookie allow rules.
- **PROD-10.** Each allow rule MUST select All stores or an explicit set of stores.
- **PROD-11.** A selected-store rule MUST have no protective effect outside its selected stores.
- **PROD-12.** Applicable protection MUST take priority over deletion.
- **PROD-13.** Each burn MUST require a preview and an explicit confirmation.
- **PROD-14.** Each burn MUST use a bounded snapshot without reloading or closing website tabs.
- **PROD-15.** The toolbar menu MUST show site protection and support protection changes for the current store.
- **PROD-16.** Configuration transfer MUST use a local JSON file without cookie values.
- **PROD-17.** Import MUST provide container mapping, Merge and Replace modes, conflict decisions, and a final preview.
- **PROD-18.** The extension MUST keep no operation history.
- **PROD-19.** The extension MUST initiate no network requests and collect no telemetry.
- **PROD-20.** GUI code MUST remain separate from Firefox access and core action execution.
- **PROD-21.** Current Site MUST list cookie domains associated with the current page, including observed third-party domains.
- **PROD-22.** Each domain row MUST provide a stored-cookie count and a pencil control for protection-rule editing.
- **PROD-23.** The popup MUST preserve its existing site-protection summary above the domain list.
- **PROD-24.** The interface MUST distinguish stored-cookie association from verified cookie transmission or use.
- **PROD-25.** Page observation MUST enforce the [resource limits](10-bounded-observation.md) and identify incomplete coverage.
- **PROD-26.** Mutation admission MUST enforce the [request limits](11-bounded-requests.md) before execution.
- **PROD-27.** Version `0.1.2` publishing preparation MUST satisfy the [0.1 publishing requirements](09-publishing-0.1.md).

The tool allowance does not permit third-party libraries or required dependency installation.

## Current Site cookie domains

Page observation identifies hosts contacted during the current page's lifetime.
The domain snapshot contains associated stored cookies from the current store.
It includes third-party cookies only within the applicable partition and first-party-isolation contexts.
Its counts do not prove that each cookie was transmitted or read.

Each canonical cookie domain appears once, with a count and a pencil.
The pencil opens a protection-rule modal inside the popup.
The user can select an applicable rule or add a rule.
Existing rules retain their full editable scope, including other stores and domains.
The modal explains those wider effects before Save.

A new rule starts with the exact domain, every name and path, and the current store.
Save protection commits that edit immediately.
Cancel or popup closure before Save discards unsaved form changes.
The Settings editor retains its separate draft and Save workflow.

Opening the popup, manual Refresh, and successful Save capture a new domain snapshot.
Bounded pages expose every row from that snapshot without live reordering.
A new document starts a new page observation, including navigation within the same website.
An unobserved page load produces incomplete observation coverage and reload guidance.
The extension does not reload pages automatically.

## Protection behavior

An allow rule contains a domain and an option for subdomains.
It can also contain an exact cookie name and an exact cookie path.
An omitted name or path matches every value for that field.

All applicable allow rules combine through protection.
Version 1 has no negative rule or protection override.
A protected container is skipped even when no cookie rule matches.

For example, a Work-only rule does not protect Normal browsing or Personal.
An All stores rule protects the matching cookies in all three stores.
Normal browsing is a separate store, not another name for All stores.

## Fixed behavior and exclusions

The initial configuration has no allow rules and no protected containers.
New containers are eligible unless an applicable protection exists.
Burn confirmation is always enabled.
The interface uses English.

Version 1 does not block cookie creation or edit cookie values.
It does not schedule deletion or delete cookies automatically.
It does not export cookies, synchronize through a cloud, or create Firefox containers during import.
It does not support Android or other browsers.

## Operation behavior

Only one burn can run at a time.
Closing its menu does not cancel the burn.
Cancellation prevents further deletion calls after the pending call finishes.
Interruption never causes automatic continuation.

The extension freezes protection changes while a burn runs.
A saved change before confirmation invalidates the burn preview.
An individual deletion failure permits other safe deletions and produces a partial result.
Unknown configuration or store scope prevents a burn from starting.

The interface shows the current operation result only.
It retains no completed-run records.
A temporary interruption marker permits recovery without a history.

## Usability and privacy

The editor supports manual rules and rule creation from cookie metadata.
Cookie values are neither displayed nor included in configuration files.
The toolbar names the exact domain and current store before a protection change.
The interface identifies inherited protection instead of silently changing other stores.

Page observation continues while the popup is closed.
Only temporary current-page domain metadata is retained for this feature.
Request headers, request bodies, cookie values, and complete browsing URLs are not retained.
The observation does not modify requests or create a browsing history.
The [backend PRD](03-firefox-backend-and-burner.md#current-page-cookie-domains) defines its lifetime and permitted metadata.

All required website permissions must be available before a burn starts.
Missing permission blocks the burner and produces recovery instructions.
The product requests no permissions that its agreed functions do not require.

## Completion criteria

Version 1 is complete when all linked PRD acceptance cases pass.
This includes minimum-version tests, current-release tests, and signed-install tests.
The release must have zero unresolved protection defects.
The release must include source, native test instructions, packaging instructions, and required Mozilla declarations.

See [verification and release](06-verification-and-release.md) for the evidence required at completion.
See the [decision record](08-decisions.md) for the approved design choices.
