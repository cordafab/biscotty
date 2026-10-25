# Design decision record

The user confirmed this design on 25 October 2026.
The final instruction was to proceed with document creation.
This table records the latest answer for each interview question.

| Decision | Approved result | Main specification |
| --- | --- | --- |
| Q1 | Manual deletion and configuration only; no automatic deletion, blocking, or value editing. | [Product](00-product.md). |
| Q2 | Whole-container protection is separate from cookie allow rules. | [Protection](02-protection-and-settings.md). |
| Q3 | One burn covers eligible cookies across the current profile. | [Burner](03-firefox-backend-and-burner.md). |
| Q4 | No external libraries for implementation, builds, or tests. Standard tools are permitted. | [Product](00-product.md). |
| Q5 | Manual JSON transfer of settings; no cookie values or cloud synchronization. | [Transfer](05-configuration-transfer.md). |
| Q6 | Repository Markdown PRDs, shared contracts, and work packages for several agents. | [Agent plan](07-agent-plan.md). |
| Q7 | Container-specific protection has no effect in other containers or Normal browsing. | [Protection](02-protection-and-settings.md). |
| Q8 | Required domain, optional subdomains, optional exact name, and optional exact path. | [Protection](02-protection-and-settings.md). |
| Q9 | Private browsing is excluded. | [Product](00-product.md). |
| Q10 | Every burn requires estimated scope and explicit confirmation. | [Frontend](04-frontend.md). |
| Q11 | A bounded snapshot is processed without tab closure, reloading, or repeated deletion of newly created cookies. | [Burner](03-firefox-backend-and-burner.md). |
| Q12 | A deletion that could affect protected cookies is skipped. | [Burner](03-firefox-backend-and-burner.md#deletion-safety). |
| Q13 | Import requires explicit destination-container mapping and handling of missing references. No native container creation occurs. | [Transfer](05-configuration-transfer.md#container-mapping). |
| Q14 | Import offers Merge and Replace; Merge is initially selected. | [Transfer](05-configuration-transfer.md#merge-and-replace). |
| Q15 | Manual rule entry and cookie metadata selection are available. The toolbar also checks and changes current-site protection. | [Frontend](04-frontend.md). |
| Q16 | Firefox desktop 153.0+, Manifest V3; no Android or other-browser support. | [Native platform](03-firefox-backend-and-burner.md#native-platform). |
| Q17 | Complete required HTTP/HTTPS host access is necessary for burning. Missing access blocks the action. | [Store access](03-firefox-backend-and-burner.md#store-catalog-and-access). |
| Q18 | Local operation without telemetry, external services, or extension-initiated network requests. | [Product](00-product.md). |
| Q19 | PRD and agent prose targets ASD-STE100 Issue 9. Product GUI text uses plain English. | [Language](LANGUAGE.md). |
| Q20 | Each rule uses All stores or an explicit store set that can include Normal browsing. | [Data contract](02-protection-and-settings.md#configuration-data). |
| Q21 | Initial protection is empty. New containers are eligible unless protection applies. | [Settings lifecycle](02-protection-and-settings.md#settings-lifecycle). |
| Q22 | The editor has Save and Cancel. Unsaved changes have no effect. Navigation warns about unsaved changes where supported. | [Editor](04-frontend.md#full-page-editor). |
| Q23 | Import shows conflicts and lets the user decide each one. No existing-value priority is automatic. | [Import conflicts](05-configuration-transfer.md#merge-and-replace). |
| Q24 | Invalid imports fail in full before any configuration change. | [Validation](05-configuration-transfer.md#validation-and-staging). |
| Q25 | One burn runs at a time. Menu closure does not cancel it. Cancellation and interruption never resume automatically. | [Operation state](03-firefox-backend-and-burner.md#cancellation-and-operation-state). |
| Q26 | Individual safe deletion failures allow remaining work. Unknown settings or store scope prevents a start. | [Burner](03-firefox-backend-and-burner.md). |
| Q27 | There is no operation history. | [Temporary state](03-firefox-backend-and-burner.md#temporary-state-without-history). |
| Q28 | Requirements include packaging, signed-install verification, and public Mozilla Add-ons release readiness. | [Release](06-verification-and-release.md#release-requirements). |
| Q29 | The toolbar protects the base domain and subdomains in the current store only. | [Quick protection](04-frontend.md#quick-protection). |
| Q30 | The final rule scope model is All stores or Selected stores. Whole-container protection remains separate. | [Data contract](02-protection-and-settings.md#configuration-data). |
| Q31 | Only the current result exists temporarily. One temporary marker permits interruption detection. | [Temporary state](03-firefox-backend-and-burner.md#temporary-state-without-history). |
| Q32 | Each conflict requires a decision. Identical entries need none. New unmatched entries can be added. | [Import conflicts](05-configuration-transfer.md#merge-and-replace). |
| Q33 | Site status is full, partial, unprotected, or unavailable, based on saved policy. | [Toolbar](04-frontend.md#toolbar-menu). |
| Q34 | Toolbar removal affects the current store only. Broader protection links to its editor. | [Quick protection](04-frontend.md#quick-protection). |
| Q35 | IP and local-host shortcuts are exact. Unsupported pages are unavailable. Bare public suffixes are rejected. | [Quick protection](04-frontend.md#quick-protection). |
| Q36 | Active burns freeze protection changes. Saved changes invalidate unconfirmed previews. | [Ordering](01-module-interfaces.md#ordering-and-concurrency). |
| Q37 | Renames preserve settings. Deletion leaves an inactive reference without automatic same-name rebinding. | [Settings lifecycle](02-protection-and-settings.md#settings-lifecycle). |
| Architecture | Backend owns Firefox access and execution. Frontend owns GUI. Pure logic has neither dependency. | [Module responsibilities](01-module-interfaces.md#module-responsibilities). |

## Current Site amendment

Decision date: 25 October 2026.
Status: Approved, implementation pending.
The user confirmed the complete design and requested PRD updates.
Q38 through Q50 continue the package identifiers after the original interview.

| Decision | Approved result | Main specification |
| --- | --- | --- |
| Q38 | Include first-party and observed third-party cookie domains in the current store. | [Product](00-product.md#current-site-cookie-domains). |
| Q39 | Show one row per canonical cookie domain, with a stored-cookie count and pencil. | [Domain list](04-frontend.md#current-site-domain-list). |
| Q40 | Pencils edit protection rules; cookie value editing remains excluded. | [Domain list](04-frontend.md#current-site-domain-list). |
| Q41 | Observe page activity. Accept observation permissions, incomplete coverage, and manual reload guidance for unobserved loads. | [Backend](03-firefox-backend-and-burner.md#current-page-cookie-domains). |
| Q42 | Open the protection-rule modal inside the popup. | [Domain list](04-frontend.md#current-site-domain-list). |
| Q43 | Keep the existing site-protection summary and quick controls above the list. | [Toolbar](04-frontend.md#toolbar-menu). |
| Q44 | Save protection commits immediately; Cancel or closure before Save discards the popup form. | [Popup editing](01-module-interfaces.md#popup-rule-saves). |
| Q45 | Show applicable protection sources and let the user select an existing rule or add one. | [Domain list](04-frontend.md#current-site-domain-list). |
| Q46 | New rules select the exact displayed domain, every name and path, and the current store. | [Domain list](04-frontend.md#current-site-domain-list). |
| Q47 | Refresh snapshots on opening, manual Refresh, and successful Save; do not update the inventory live. | [Domain list](04-frontend.md#current-site-domain-list). |
| Q48 | Permit full existing-rule edits, including other stores and domains, with wider scope clearly explained. | [Popup editing](01-module-interfaces.md#popup-rule-saves). |
| Q49 | Start observation fresh for each new page, including navigation within the same website. | [Page observation](03-firefox-backend-and-burner.md#page-observation). |
| Q50 | Counts describe associated stored cookies, not verified use. The confirmed design is ready for documentation. | [Product](00-product.md#current-site-cookie-domains). |

The amendment revises NATIVE-03 and NATIVE-06 to require passive `webRequest` and `webNavigation` observation.
The original prohibition on `webRequest` is superseded only for the agreed Current Site feature.
Blocking requests, content scripts, automatic reloads, telemetry, and browsing history remain outside this feature.

Q29 and Q34 still govern quick-protection shortcuts.
Q48 permits deliberate full rule edits through the popup modal.
UI-16 now states its quick-removal scope explicitly.
UI-27 still governs cookie-row drafts in Settings.
The popup's immediate Save workflow does not change that Settings workflow.
Q31 continues to describe operation results; temporary page observations have the separate lifetime approved by Q49.

## Superseded proposals

The final store-set model replaces separate global, Normal browsing, and single-container rule-list proposals.
Per-conflict decisions replace the proposed automatic existing-value preference during Merge.
No history replaces the proposed retained latest-run summary.
These earlier proposals are not implementation requirements.
Stored associations alone and accumulated observations across several pages were rejected for the Current Site amendment.

## Engineering contracts

The documents define action names, local references, file fields, resource limits, and module ownership.
These details make the approved behavior implementable across several agents.
They do not add automatic deletion, negative rules, new cloud features, or optional confirmation settings.

Native selector limits require conservative skips.
The implementation must not claim atomic cookie-identity deletion that Firefox does not provide.
See [deletion safety](03-firefox-backend-and-burner.md#deletion-safety) for the required treatment.

The amendment adds bounded domain pages and context-bound rule saves without changing configuration or transfer schemas.
The shared contract specifies `webNavigation` alongside passive `webRequest` for navigation boundaries and document attribution.
Coverage labels describe supported observation; they do not promise unrestricted visibility into Firefox activity.
Observed-host association is a design inference, separately identified from verified API facts in [sources](SOURCES.md).
