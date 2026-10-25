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

## Superseded proposals

The final store-set model replaces separate global, Normal browsing, and single-container rule-list proposals.
Per-conflict decisions replace the proposed automatic existing-value preference during Merge.
No history replaces the proposed retained latest-run summary.
These earlier proposals are not implementation requirements.

## Engineering contracts

The documents define action names, local references, file fields, resource limits, and module ownership.
These details make the approved behavior implementable across several agents.
They do not add automatic deletion, negative rules, new cloud features, or optional confirmation settings.

Native selector limits require conservative skips.
The implementation must not claim atomic cookie-identity deletion that Firefox does not provide.
See [deletion safety](03-firefox-backend-and-burner.md#deletion-safety) for the required treatment.
