# PRD: Frontend

Current Site cookie-domain list: Approved; implementation present; release verification incomplete.
Owner: Track C.
Depends on the [module interfaces](01-module-interfaces.md).
The frontend owns the GUI and calls backend actions.
It does not own Firefox access or authoritative policy decisions.

## Toolbar menu

- **UI-01.** The extension MUST provide a toolbar action with a packaged popup menu.
- **UI-02.** Initial placement MUST request the main toolbar without preventing the user from moving the button.
- **UI-03.** The menu MUST include Cookie burner, Settings, and the current-site protection view.
- **UI-04.** The current-site view MUST identify the exact domain target and current store.
- **UI-05.** Its status MUST come from saved effective policy, not from the number of existing cookies.

The menu must show one of four site states.

| Display state | Meaning |
| --- | --- |
| Fully protected | Whole-container protection or a site-wide rule covers the complete displayed target. |
| Partly protected | Applicable rules cover only some names, paths, or cookie domains within the target. |
| Unprotected | No applicable rule or whole-container protection covers the target. |
| Unavailable | The active page, store, permission, or domain cannot be evaluated. |

The site-protection summary describes the displayed site target, not every resource loaded by the page.
Third-party cookie domains outside that target can have different protection.
The separate domain list below the summary includes observed third-party domains.
The interface must not claim that protection guarantees a login session.

## Quick protection

- **UI-06.** A normal website shortcut MUST use Firefox's base domain and include its subdomains.
- **UI-07.** A shortcut MUST affect only the captured current store.
- **UI-08.** IP addresses and unknown-suffix local hostnames MUST use an exact-host shortcut.
- **UI-09.** Bare known public suffixes MUST be rejected.
- **UI-10.** Non-HTTP/HTTPS pages and missing tab context MUST show an unavailable site control.
- **UI-11.** The backend MUST revalidate the captured tab, host, store, and revision before a shortcut change.
- **UI-12.** A stale context MUST require refresh before the user confirms another protection change.

For example, `shop.example.com` in Work offers “Protect example.com and its subdomains in Work.”
The resulting rule has no cookie-name or path restriction.
In Normal browsing, only the `normal` reference is selected.
Local-host shortcuts explicitly state that they protect the exact host.

When a matching site-wide rule already selects another store, adding protection adds the current reference.
It must preserve the other selected references.
When equivalent protection already applies through All stores, the control explains that source.
It does not create a misleading local toggle.

- **UI-13.** Quick removal MUST remove only the current reference from equivalent selected-store site-wide protection.
- **UI-14.** Quick removal MUST preserve other selected references and all narrower rules.
- **UI-15.** An empty selected scope after quick removal MUST remove that site-wide rule.
- **UI-16.** Quick-removal controls MUST link inherited or broader protection to an editor instead of silently weakening it.
- **UI-17.** The resulting status MUST show any remaining protection after a quick removal.

A quick removal can leave partly protected cookies.
The menu must explain the remaining sources.
The editor remains available to change All stores rules or whole-container protection deliberately.

## Current Site domain list

This feature uses `getSiteCookieDomains` and `saveSiteRule` through the public backend client.
The [shared action contracts](01-module-interfaces.md#current-site-action-contracts) define the authoritative inputs, views, errors, and token checks.
The existing summary and quick-protection controls remain above the list.
The summary status does not summarize protection across every listed third-party domain.

- **UI-40.** Each domain row MUST show its canonical cookie domain, stored-cookie count, and pencil control.
- **UI-41.** The list MUST expose every snapshot page through a scrollable region with a keyboard-accessible Load more control.
- **UI-42.** The pencil MUST open the protection-rule modal inside the popup.
- **UI-43.** The modal MUST offer each applicable rule and an Add rule action.
- **UI-44.** The popup rule form MUST provide the same editable rule fields and validation as Settings.
- **UI-45.** The modal MUST show the complete domain matcher and store scope before an existing rule is saved.
- **UI-46.** A new rule MUST default to the exact domain, every name and path, and the captured current store.
- **UI-47.** Save protection MUST submit the selected rule change immediately.
- **UI-48.** A successful Save MUST close the modal.
- **UI-49.** A successful Save MUST refresh the site summary and domain snapshot.
- **UI-50.** Cancel or popup closure before Save MUST discard the unsaved popup form.
- **UI-51.** Popup opening and explicit Refresh MUST capture a new domain snapshot.
- **UI-52.** Requests and cookie changes within the same page MUST NOT refresh the displayed snapshot automatically.
- **UI-53.** Partial observation coverage MUST show its reason and manual reload guidance.
- **UI-54.** The domain list MUST distinguish loading, empty, error, and unavailable states.
- **UI-55.** Validation and revision errors MUST preserve the open popup form for review.
- **UI-56.** A changed page context MUST disable saving until the user refreshes and reviews the target again.
- **UI-57.** An active burn MUST disable Save protection.
- **UI-58.** Each pencil MUST have an accessible name containing its domain.
- **UI-59.** Long domains MUST remain readable without hiding their pencil controls.
- **UI-60.** The list MUST describe counts as associated stored cookies without claiming verified transmission or individual use.
- **UI-61.** Whole-container protection MUST remain visible in the modal with a link to its Settings control.

The initial request returns the first alphabetically ordered domain page.
Load more appends the next bounded page without replacing already displayed rows.
Refresh replaces the complete displayed snapshot, starting with its first page.
No page is silently omitted or replaced with a fixed maximum-domain result.

When no rule applies, the modal opens the Add rule form with the specified defaults.
Otherwise, the modal first shows protection sources and explicit rule choices.
Name and path restrictions remain visible when choosing a rule.
Whole-container protection does not hide rule choices or imply that editing one rule removes container protection.
Full rule edits can affect other domains or stores; the form explains those effects.
The modal provides no new whole-container toggle or rule-deletion action.

A new rule can conflict with an existing matcher scoped only to other stores.
The modal preserves the form and offers Settings for review instead of silently combining scopes.

The rule form remains unsaved until Save protection is submitted.
Cancel is disabled while a save request is pending.
Popup closure after submission does not cancel an accepted backend commit.
After a lost save reply, reopening refreshes saved state before another mutation attempt.
No popup draft is persisted across closure.

A configuration or catalog change marks the domain snapshot stale without live replacement.
A changed page clears its previous rows and disables saving.
The frontend preserves an open draft while the popup remains open.
Refresh requires review of the new context, current rule choices, and saved revision before another Save.
The frontend must not silently rebase an old rule index or retry a failed mutation.
Operation changes can update the Save lock without refreshing inventory rows.

Incomplete coverage must remain distinct from an empty observed result.
Suggested guidance is “Reload the page to observe its activity from the start.”
Reloading remains the user's action; Refresh alone cannot recover past request activity.
An empty domain list must not remove or alter the saved-policy summary.

## Burner screens

The initial menu action requests a backend preview.
The confirmation screen shows affected stores, proposed attempts, safe skips, and the sign-out warning.
It describes counts as estimates because websites can change cookies.
Confirmation has distinct Burn and Cancel controls.

During execution, show progress and an explicit Cancel burn control.
Closing the menu leaves execution active.
Reopening obtains current state through the backend client.
After execution, show the current result with Dismiss.
Do not show a history screen or previous-results list.

- **UI-18.** Confirmation MUST remain required for every run.
- **UI-19.** Missing required host access MUST disable burning and show restoration guidance.
- **UI-20.** An incomplete or interrupted operation MUST NOT be labeled as complete deletion.
- **UI-21.** A cancellation or interruption message MUST state that some deletions may already have occurred.
- **UI-22.** A zero-target preview MUST show that no eligible deletion is available.

## Full-page editor

Use a packaged options page with `open_in_tab: true`.
Open it through the backend `openOptions` action.
Provide the following areas.

| Area | Required functions |
| --- | --- |
| Cookie allow rules | Add, edit, remove, search, and inspect store scope. |
| Whole-container protection | Select named containers to skip in full. |
| Cookie metadata | Search domain, name, path, store, and protection status. Create a draft rule from a row. |
| Configuration transfer | Export and run the complete import workflow. |
| Availability | Explain permissions, invalid settings, inactive references, and current operation restrictions. |

- **UI-23.** Rule forms MUST provide All stores or a selected set of named containers and Normal browsing.
- **UI-24.** The form MUST distinguish exact domain matching from subdomain matching.
- **UI-25.** The form MUST distinguish unrestricted names and paths from exact string values.
- **UI-26.** Cookie metadata MUST omit values and render website-derived strings as text.
- **UI-27.** In Settings, a rule created from a cookie row MUST start as an unsaved draft for user review.
- **UI-28.** The editor MUST provide explicit Save and Cancel controls.
- **UI-29.** Unsaved changes MUST have no effect on backend operations.
- **UI-30.** Leaving a page with an unsaved draft MUST trigger the available unsaved-change warning.
- **UI-31.** A revision conflict MUST preserve the draft and offer a refresh or review path.
- **UI-32.** A live burn MUST disable saving, import application, remapping, and toolbar protection changes.
- **UI-33.** Inactive container references MUST remain visible and clearly marked.

Normal browsing has per-rule scope controls.
It is not a named container and has no whole-container protection toggle in version 1.
Use the backend catalog for all container choices.
Do not infer identity from a display name.

The frontend can use browser navigation warnings as supported by Firefox.
If Firefox suppresses a warning, the saved configuration still remains unchanged.
Cancel restores the saved revision after an explicit discard decision when the draft is dirty.

## Import interface

The import sequence is File selection, Validation, Container mapping, Mode, Conflicts, Final preview, and Apply.
An initial mode can be selected before mapping.
Merge is initially selected.
Mode changes invalidate decisions that depend on the old plan.
The backend remains authoritative at every step.

An invalid or missing configuration shows a recovery explanation and the restricted Replace import workflow.
An unreadable storage area shows an error until native access works again.
Recovery requires explicit acknowledgment that unreadable previous protection cannot be preserved automatically.

Each conflict must show the existing and imported values.
Require a separate decision for each conflict.
Do not preselect a destructive resolution or hide unresolved entries.
The final preview includes removed protection and excluded imported entries.
Replace requires an explicit acknowledgment of replaced settings.

## Presentation quality

- **UI-34.** Every action MUST be available through a keyboard with visible focus.
- **UI-35.** Forms, status changes, and errors MUST have meaningful screen-reader labels.
- **UI-36.** The GUI MUST follow system text sizing, contrast settings, and light or dark appearance.
- **UI-37.** Status MUST NOT depend on color alone.
- **UI-38.** Long cookie names, paths, and container names MUST remain readable without hiding action controls.
- **UI-39.** The GUI MUST explain user actions without exposing transport identifiers or native stack traces.

## Acceptance criteria

| Case | Expected result |
| --- | --- |
| UI-A01 | The toolbar exposes burning, site protection, and Settings. |
| UI-A02 | A site with no current cookies still shows the correct saved-policy state. |
| UI-A03 | Partial cookie-name or path protection produces Partly protected. |
| UI-A04 | Quick add in Work does not protect Personal or Normal browsing. |
| UI-A05 | Quick remove from a Work-and-Personal rule preserves Personal. |
| UI-A06 | All stores and whole-container protection are explained and linked to their editor. |
| UI-A07 | IP, localhost, unknown local suffix, public suffix, internal page, and missing-tab cases use the defined controls. |
| UI-A08 | Navigation between context capture and action prevents a stale-site mutation. |
| UI-A09 | Unsaved edits never affect burning; Save and Cancel behave as specified. |
| UI-A10 | Two windows show consistent saved revision and active-operation restrictions. |
| UI-A11 | Imported HTML and script-like strings appear only as inert text. |
| UI-A12 | Keyboard and screen-reader checks cover every destructive action and import decision. |
| UI-A13 | Current results can be dismissed; no operation history exists. |
| UI-A14 | Current Site retains its summary and shows one domain, stored-cookie count, and pencil per grouped row. |
| UI-A15 | Load more reaches every alphabetically ordered snapshot row without duplicates; long domains keep pencils accessible. |
| UI-A16 | A pencil opens the popup modal with applicable rules and Add rule; whole-container protection remains explained. |
| UI-A17 | A new rule uses the exact row domain, every name and path, and only the current store. |
| UI-A18 | Existing rules expose all fields and explain wider domain and store effects before Save. |
| UI-A19 | Save commits once, closes the modal, and refreshes results; Cancel and closure before Save change no protection. |
| UI-A20 | Popup reopening reconciles an accepted save whose reply was lost; the Settings draft workflow remains unchanged. |
| UI-A21 | Opening, Refresh, and successful Save renew snapshots; later observed hosts and cookie changes do not rearrange rows. |
| UI-A22 | Partial coverage shows its reason and reload guidance; Refresh cannot claim to recover unobserved past activity. |
| UI-A23 | Revision errors preserve drafts; changed navigation clears rows and requires target review; an active burn blocks Save. |
| UI-A24 | Keyboard, screen-reader, zoom, contrast, and long-domain checks cover pencils, paging, modal fields, and error states. |
| UI-A25 | Loading, empty, unavailable, and failed states remain distinguishable; stored-cookie counts never claim verified cookie use. |

## Current Site completion evidence

Track C supplies UI-A14 through UI-A25 through the public backend client.
Fixtures cover partial observation coverage, multiple rules, broader scopes, container protection, and stale page contexts.
Native Firefox checks verify popup geometry, focus, accessible labels, and closure during a submitted Save.
Controlled evidence and remaining native checks appear in the [verification record](../implementation/verification.md).
