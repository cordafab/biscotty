# PRD: Frontend refresh

Status: Implemented, 3 November 2026; automated and disposable Firefox checks passed; signed-release verification remains incomplete.
Owner: Integration agent for contracts and backend changes; Track C for frontend files.
Dependencies: [product](00-product.md), [interfaces](01-module-interfaces.md#selected-container-frontend-amendment), and [frontend](04-frontend.md).
Also depends on [stored-cookie inventory](partition-exceptions/02-current-site-inventory.md) and [Settings inventory](partition-exceptions/01-settings-inventory.md).

## Purpose and scope

Implement the approved action-first layout with concise English controls and contextual information dialogs.
The popup provides site protection, selected-container inspection, cookie metadata, and the existing manual burner.
Settings presents one section at a time while retaining drafts, protection rules, exceptions, and configuration transfer.

This amendment supersedes UI-07's current-store-only shortcut and the previous full-page section layout.
UI-23's rule-scope controls remain required.
PROD-23 retains the site-protection summary in the main popup; the inventory moves into a dialog.
UI-40 through UI-61 retain applicable editing, paging, accessibility, and stale-context safeguards inside that dialog.
Q29 and Q34 now apply to the selected store instead of exclusively the active tab's store.

## Interfaces and ownership

Shared inputs, token binding, validation, and output fields are defined in the [module interfaces](01-module-interfaces.md#selected-container-frontend-amendment).
Frontend code calls the existing backend client; it does not call Firefox APIs directly.
The backend owns domain association, effective protection, native store selection, and mutation admission.
Changes do not add permissions or change configuration and transfer schemas.

## Requirements

- **UX-01.** Product controls MUST use concise English text.
- **UX-02.** The popup MUST identify the current domain above its protection controls.
- **UX-03.** The popup MUST initially select the active tab's cookie store.
- **UX-04.** The popup selector MUST offer Normal browsing and every available named container.
- **UX-05.** Selecting a store MUST update site protection and cookie inspection without moving the active tab.
- **UX-06.** Quick protection MUST affect only the selected store.
- **UX-07.** Quick removal MUST preserve other stores and narrower or inherited protection.
- **UX-08.** The popup MUST display saved effective protection, independently of existing cookie counts.
- **UX-09.** The popup MUST provide a View cookies control that opens an inventory dialog.
- **UX-10.** The cookie dialog MUST display the main domain as its prominent heading.
- **UX-11.** The cookie dialog MUST identify the selected store.
- **UX-12.** The cookie dialog MUST distinguish main-site cookies, known third-party jars, and unpartitioned cookies.
- **UX-13.** Unpartitioned help MUST explain that shared cookies cannot reliably identify every site using them.
- **UX-14.** The interface MUST NOT describe an empty jar list as proof that third-party cookies are absent.
- **UX-15.** Cookie details MUST provide metadata without cookie values.
- **UX-16.** The cookie dialog MUST retain domain rule editing and third-party partition exception creation.
- **UX-17.** The cookie dialog MUST expose all captured domain and metadata pages through explicit controls.
- **UX-18.** The popup MUST keep burner scope visible as all eligible stores.
- **UX-19.** The burner MUST retain preview, confirmation, cancellation, progress, and current-result controls.
- **UX-20.** Settings MUST provide Cookies, Rules, Containers, Import / Export, and Status tabs.
- **UX-21.** Settings MUST display only the selected tab panel.
- **UX-22.** Tab changes MUST preserve Settings drafts and staged inventory choices.
- **UX-23.** Tabs MUST support arrow keys, Home, End, and selected-tab semantics.
- **UX-24.** Settings MUST provide Previous section and Next section controls.
- **UX-25.** Explanatory info controls MUST use fixed circular dimensions and accessible names.
- **UX-26.** Info dialogs MUST support a close control and Escape.
- **UX-27.** Critical scope, conflicts, destructive confirmation, and recovery messages MUST remain visible without opening help.
- **UX-28.** Long lists MUST retain explicit snapshot paging controls.
- **UX-29.** Status restrictions MUST have an attention indicator outside the hidden Status panel.

## Visual sizing refinement

The user requested these refinements on 3 November 2026 after implementation review.
Status badges use larger text: `0.9rem`, or `0.8rem` inside compact cookie metadata.
Info controls use a 16-pixel circle and an 11-pixel glyph, with an expanded pointer region.
The popup header provides an Open Settings gear with a 24-pixel glyph inside a 36-pixel control.
The footer Settings button remains available.
The implemented frontend preserves this visual hierarchy.

## Failure behavior and invariants

Stale navigation, unavailable stores, changed settings, or missing permissions invalidate site-dependent operations.
Changing the selected store invalidates its displayed inventory and pending read results.
Open rule forms retain their existing stale-review safeguards.
Active burns lock protection mutations and configuration application.
Unsupported pages show unavailable site controls while retaining the independent burner and Settings entry points.

Unknown partition associations remain separate from an empty result.
Unpartitioned cookies retain ordinary allow-rule and whole-container protection behavior.
Partition exceptions cannot target unpartitioned cookies.
The interface describes actual stored metadata instead of assuming a global browser isolation setting.

## Acceptance cases

| Case | Expected result |
| --- | --- |
| UX-A01 | Opening the popup selects the active store and displays its saved protection. |
| UX-A02 | Selecting another container changes protection and inventory without navigating or moving the tab. |
| UX-A03 | Protecting a domain changes only the selected store; another store retains its previous policy. |
| UX-A04 | Navigation, catalog changes, and context-token mixing reject stale reads and mutations. |
| UX-A05 | Cookie inspection displays the main domain prominently and labels unpartitioned cookies separately. |
| UX-A06 | Known jars expose metadata and paging without showing cookie values or inventing site associations. |
| UX-A07 | Every Settings tab opens independently; keyboard navigation and section paging select the correct panel. |
| UX-A08 | Moving between tabs preserves rule drafts, inventory choices, and explicit import decisions. |
| UX-A09 | Every info control remains circular; its dialog closes through its control and Escape. |
| UX-A10 | Burner scope remains global; preview and confirmation remain required regardless of selected store. |
| UX-A11 | Unsupported pages and missing permissions expose recovery without enabling unsafe actions. |

## Completion evidence

The implementation changes `src/frontend/`, `src/backend/firefox/views.js`, and the corresponding controlled and native tests.
`tabs.js` owns mounted panel selection and keyboard navigation.
The popup model owns selected-store state and discards outdated asynchronous responses.

| Check | Actual result |
| --- | --- |
| Automated suite | 196 tests passed, including six selected-store and stale-response regressions. |
| Native Firefox | 19 disposable-profile scenarios passed on Firefox 159.0, including popup editing and preserved tab drafts. |
| Browser DOM checks | Seven checks passed, including nested groups and inert website strings. |
| Static source check | Module boundaries, syntax, privacy restrictions, and manifest checks passed. |
| Controlled browser review | Container switching, immediate protection, grouped metadata, mounted drafts, and keyboard tab selection were exercised. |
| Document review | Changed local links, definition uniqueness, JSON examples, new requirement sentence lengths, whitespace, and final newlines were checked. |

Detailed evidence is recorded in the [implementation record](../implementation/frontend-refresh.md).
Acceptance cases remain specifications; the table identifies the checks actually executed.
Signed installation, minimum-version Firefox, exhaustive assistive-technology review, and release-owner verification remain incomplete.
