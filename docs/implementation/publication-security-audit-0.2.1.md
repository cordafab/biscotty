# Biscotty 0.2.1 prepublication security and privacy evaluation

Date: 3 November 2026. Disposition: local checks passed; publication acceptance remains incomplete.

## Scope and evidence identity

Evaluated the current working tree, including staged frontend changes, rather than only the committed revision.
No production files were changed. Existing work was preserved. No upload, signing, or publication was performed.
The source inventory is [source-sha256.json](audit-0.2.1/source-sha256.json).
The exact unsigned archive is `dist/biscotty-0.2.1.zip`, containing 31 production files.
SHA-256: `6beb34707f9c30972f988bcef33cf63812413bfebeb69f871735de4661f8d141`.
These conclusions apply to this snapshot. Recheck after any source or manifest change.

## Findings and release conditions

1. **Privacy requirement needs precise limits.** No extension-originated remote transmission was found in the inspected source. However, local configuration contains site domains, cookie-name/path matchers, partition exceptions, and container names. Names and paths can contain identifying text. These settings persist in browser local storage and are included in user-requested plaintext JSON exports. This is intentional functionality, but a promise that the extension never handles or exposes personal information would be inaccurate. Explain this at export and in the public privacy statement. Avoid sharing real exports as support attachments. If the requirement forbids even user-requested exports containing identifying settings, the present product does not satisfy it and requires a product change.
2. **Public developer identity.** `manifest.json` exposes `biscotty@cordafab.com` as the extension identifier. It is an email-shaped identifier, not evidence of a working mailbox. It is visible in distributed source and Mozilla validation metadata. Confirm this is the intended public identity before first signing. AMO account/profile information also requires owner review; this audit did not access that account.
3. **Signed release and platform evidence remains missing.** Temporary installs with pre-granted website access do not establish actual installation prompts, signed updates, restart/event-page suspension, or interactive permission revocation. Test the signed candidate and supported platform/version matrix before release, including Firefox 153 and the applicable ESR. Firefox 159 on this Mac is the only browser tested in this evaluation.
4. **No independent runtime traffic capture.** Static inspection, restrictive CSP, absence of network APIs/endpoints, and lack of content scripts support the local-only conclusion. This evaluation did not attribute live network traffic to the extension. Browser background/update traffic is outside the extension's control. Do not describe these results as a proof that the whole browser or computer sends no information.
5. **Publication metadata remains unfinished.** Final support details, account identity visibility, listing assets, licensing metadata, and privacy wording need completion. The proposed listing in `release.md` is useful source material; it is not evidence of the actual AMO listing.

No newly confirmed exploitable remote disclosure or code-execution vulnerability was found within this review's scope.
This is an evidence-based review, not a guarantee of absence of vulnerabilities or Mozilla approval.

## Security assessment

| Area | Observed behavior and assessment |
| --- | --- |
| Permissions | Cookies, storage, containers, public suffix classification, navigation, and HTTP/HTTPS host access map to documented functionality. Broad host access is sensitive but necessary for all-site cookie inventory/deletion. No native messaging, filesystem, clipboard, browsing history API, or content script is declared. |
| Remote execution | Production code uses local native modules, without external libraries, remote scripts, eval, or Function construction. CSP limits scripts/styles/images/fonts to self and blocks connections, objects, forms, and base changes. |
| Website access to extension | No web-accessible resources or external-message handler is declared. Gateway checks extension ID and exact popup/settings URL and rejects private-tab senders. Handles bind to owner identity, expire, and distinguish operation kinds. |
| DOM injection | Shared renderer constructs nodes and text nodes. Inspected production UI does not use innerHTML, document.write, or dynamic script execution. Import-controlled strings are rendered as text. |
| Cookie secrets | Native cookies API necessarily returns values to the adapter, but sanitizeCookie projects only metadata. Values are absent from subsequent inventories and portable settings. Cookie names and paths remain potentially sensitive metadata. |
| Storage | Configuration and opaque interruption marker persist locally; operation state uses session storage. Navigation generations stay in bounded memory. No cloud sync or telemetry implementation was found. Local storage and exported files are not encrypted by this extension. |
| Private sessions | Manifest disables private browsing and the gateway rejects private-tab senders. Controlled tests exercise privacy and store boundaries. |
| Destructive actions | Preview, configuration revisions, scoped handles, operation locks, selector safety and stale-context checks constrain deletion. Ambiguous deletions fail safely; running websites may recreate cookies. |
| Imports and resource limits | Imports are size-limited before parsing/staging and undergo schema, domain, container-mapping and revision checks. Inventory and request caches have explicit bounds. This is not a browser-wide stress certification. |
| Errors | Unexpected exceptions receive a generic gateway response. Explicit application errors are returned to extension UI. No production console logging was found. |
| Supply chain and package | Zero declared runtime/build dependencies. Packaging uses standard Node modules and readable sources. Archive allowlist excludes documentation, profiles, tests, logs and development tooling. |

## Mozilla policy assessment

Sources checked on 3 November 2026:

- [Current Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/).
- [Policy FAQ, including user-initiated local backups](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/).

The present local-only design supports the manifest declaration `data_collection_permissions.required: ["none"]`.
Mozilla explicitly permits user-initiated local backup without additional transmission consent; remote export would change the assessment.
Permissions appear tied to the described primary purpose. No remote code, advertising, affiliate rewriting, security-header weakening, monetization, or ancillary transmission was found.
Readable source and reproducible packaging support reviewability. Validator metadata labels `options.js` under `unknownMinifiedFiles` despite zero warnings; the packaged file is the original readable native source, with no transformation.
Actual listing accuracy and final submission metadata remain unverified. Only Mozilla can grant acceptance.
Mozilla currently announces a policy change effective 1 December 2026. Reassess the policy in force if publication occurs then or later.

## Executed validation

| Check | Result / evidence |
| --- | --- |
| Automated tests | 196 passed; zero failures, skips or cancellations. [Results](audit-0.2.1/tests.tap). |
| Source and manifest checker | Passed all 29 source files. [Package log](audit-0.2.1/package.txt). |
| Package integrity and privacy inspection | 31 entries; CRCs valid; no unexpected entries, source maps, or `/Users/` or `/home/` paths; no network API calls found. URL strings are wildcard permissions, local parsing templates and the SVG namespace. [Inspection](audit-0.2.1/package-inspection.json). |
| Repeat build | Same SHA-256 across two builds. |
| Mozilla addons-linter 10.15.0 | Zero errors, warnings or notices. Installed outside the repository with scripts disabled. [Results](audit-0.2.1/mozilla-validator.json). |
| Native Firefox 159, default isolation | 19 scenarios passed. [Results](audit-0.2.1/native-default.json). |
| Native Firefox 159, first-party isolation | 20 scenarios passed, including import of the first profile's synthetic export. [Results](audit-0.2.1/native-fpi.json). |

The native runner used disposable synthetic profiles and temporary test installations. The test instrumentation is not packaged.
The initial native attempt required Firefox's `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` automation setting. Rerunning with that setting succeeded.
Node was not on the shell PATH; tests and packaging used the bundled Node executable. No project dependencies were added.
Evidence logs include the test machine's OS/browser version. They are development records, excluded from the production archive.
No signed lifecycle, Windows/Linux, assistive technology, or independent traffic-capture evidence is claimed.

## Release decision

Keep publication on hold until signed lifecycle, version/platform acceptance, final public identity and listing/privacy fields are verified.
Address the export privacy wording before making an unconditional no-personal-information claim.
The static review, automated tests, native fixtures and validator provide positive evidence for the current local-only implementation.
