# Open implementation and verification issues

Date: 3 November 2026. Current candidate: 0.2.1.
See the [submission report](submission-readiness-0.2.1.md) for exact evidence and archive identity.

## Current results

The candidate passes 196 automated tests, source checks, reproducible packaging, independent archive inspection, and Mozilla validation.
Firefox 159.0.1 and ESR 153.6.0 each pass 19 default-isolation scenarios and 20 first-party-isolated cross-profile scenarios on macOS.
Six checks pass against the unmodified unsigned archive, including zero extension-attributed HTTP requests during the smoke workflow.
The export privacy notice now explains identifying settings and unencrypted files.
No unresolved protection defect was confirmed in this evaluation.

## Remaining release gates

- Firefox 153.0 automation failed to initialize on macOS 27.2. Launch diagnostics report a child-process permission error. Minimum-version behavior remains unverified.
- Signed installation, actual permission prompts, signed updates, browser restart during a burn, and real event-page suspension remain unverified.
- Windows and Linux native tests, complete keyboard/screen-reader/zoom/contrast review, and exhaustive current acceptance coverage remain pending.
- Live permission revocation, container deletion during execution, popup closure during a real burn, and large native profiles need the remaining manual matrix.
- The owner must review AMO account identity, the existing public extension identifier, listing metadata, and the returned signed package before publication.

## Test infrastructure findings

The first ESR run observed terminal burn state before marker cleanup released the operation lock.
The native helper now waits for cleanup before the next scenario edits settings; both final ESR suites pass.
Initial minimum-version launches and one ESR automation-session launch failed before scenarios ran.
These attempts are not passing evidence; diagnostics and the initial ESR scenario results are retained with the current evidence.
The test runner now records startup diagnostics and can test production files extracted from the exact ZIP.
Its smoke mode installs the unmodified ZIP without injected extension scripts.

## Product limits

Inventories reject captures above 10,000 cookies or 2 MiB instead of silently truncating them.
Batches contain at most 200 selections. Larger captures require narrower store scope.
Firefox cannot atomically enumerate cookies and write protection settings; a website can change cookies after the final identity check.
Conservative deletion checks skip ambiguous selectors and cannot promise exact native cookie identities.
Historic request-observation requirements remain marked as superseded; current stored-cookie and frontend amendments control behavior.
