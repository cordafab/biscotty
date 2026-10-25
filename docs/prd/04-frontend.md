# PRD: Frontend

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

The site view describes the displayed site target, not every resource loaded by the page.
Third-party cookie domains outside that target can have different protection.
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
- **UI-16.** Inherited or broader protection MUST link to the editor instead of being silently weakened.
- **UI-17.** The resulting status MUST show any remaining protection after a quick removal.

A quick removal can leave partly protected cookies.
The menu must explain the remaining sources.
The editor remains available to change All stores rules or whole-container protection deliberately.

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
- **UI-27.** A rule created from a cookie row MUST start as an unsaved draft for user review.
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
