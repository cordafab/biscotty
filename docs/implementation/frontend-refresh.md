# Frontend refresh implementation

Implemented on 3 November 2026 from the approved first HTML concept.
The [PRD](../prd/12-frontend-refresh.md) defines the implemented requirements and acceptance cases.

## Implementation

- The action-first popup identifies the site and selected store, displays saved protection, and provides immediate scoped protection changes.
- View cookies opens grouped domains, expandable metadata, rule editing, and partition exception creation.
- The main domain is the cookie dialog heading; unpartitioned cookies have separate labels and contextual shared-use help.
- The selector changes protection and inspection scope while retaining the original active tab.
- Backend contexts bind the captured tab store separately from the selected target store.
- Site metadata pages bind their original context and exclude unrelated unpartitioned cookies and partitions.
- Settings uses Cookies, Rules, Containers, Import / Export, and Status tabs with mounted draft state.
- Info buttons use fixed circular dimensions; critical scope, conflict, recovery, and confirmation text remains visible.
- Burner preview, confirmation, progress, cancellation, and current results retain their existing actions and global scope.
- Permissions, versions, dependencies, configuration formats, and transfer formats retain their existing values.

## Evidence

| Check | Result |
| --- | --- |
| Standard-library automated tests | 196 passed. |
| Selected-store regressions | Six new tests cover independent target stores, associated metadata, stale contexts, and late responses. |
| Native Firefox 159.0 | 19 scenarios passed in a disposable profile. |
| Browser DOM checks | Seven checks passed, including nested groups and inert website strings. |
| Source checks | Syntax, module boundaries, outbound-request restrictions, and manifest checks passed. |
| Controlled browser inspection | Production popup and Settings modules exercised through the real gateway and in-memory adapter. |
| Documentation | Local links, anchors, unique definitions, JSON examples, new PRD sentence screening, and whitespace checked. |

Native results are in [the result file](frontend-refresh/native-results.json).
The [native Settings screenshot](frontend-refresh/settings-firefox.png) records the integrated tab layout before the subsequent icon-sizing refinement.
The runner requires `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` with the installed Firefox version.
Its temporary profile is separate from the user's Firefox profile.

The [browser fixture](../../tests/frontend/ui-preview.html) runs the production frontend with fictional cookies and in-memory storage.
Serve the repository locally and open that file to inspect the implemented UI without browser cookie access.
The fixture is test code and is excluded from the extension package.

Signed installation, minimum supported Firefox verification, and exhaustive assistive-technology checks remain pending.
A subsequent user request increments the source version to `0.2.1`.
No Git commit or publication was performed.

## Visual sizing refinement

The user requested larger status badges, smaller info controls, and a larger Settings gear.
Both the HTML prototype and production stylesheet implement these changes.
The production popup header now has the Settings gear, using the existing backend action.
Controlled browser inspection confirmed a 16-pixel info circle, 11-pixel info glyph, and 24-pixel gear in a 36-pixel control.
Compact cookie status badges now use `0.8rem` instead of `0.7rem`.
Help opening, Escape dismissal, and keyboard activation of the Settings gear were exercised.
The source checker and unsigned package generation passed after the refinement.
