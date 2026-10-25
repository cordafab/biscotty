# Version 0.1.5 lifecycle corrections

Date: 25 October 2026. Status: implemented; local and native regression checks passed.
The user authorized both fixes, a patch increment, a commit, and a push.
The [0.1.4 audit](audit-0.1.4/README.md) retains the original findings and failure evidence.

## Verified document restoration

A failed observation write and cleanup could leave the previous document's snapshot in session storage.
A replacement background execution trusted its hostname, scheme, and store without confirming its current document.

The Firefox adapter now reads the top-level document identity through `webNavigation.getFrame`.
Restoration retains a saved observation only when its committed document matches that native identity.
Changed, loading, missing, or unverifiable documents are discarded.
A later read reports partial coverage until a fresh observed navigation establishes coverage.
Valid observations for the same committed document retain their hosts, generation, and existing coverage.
Native frame URLs are discarded; the new adapter method returns only a document ID or null.

Controlled tests reproduce simultaneous write and cleanup failures followed by a background restart.
They also cover missing identities, failed native lookups, loading documents, and navigation queued during verification.
The native regression compares real navigation-event IDs with Firefox's current document ID.
It preserves a matching snapshot and rejects the old snapshot after same-host navigation.
Native saved-state fixtures are isolated from production listeners; storage-failure injection uses the controlled tests.

## Terminal cancellation

Cancellation previously checked the execution flag while terminal persistence still held that flag.
It could change a completed result back to `cancel_requested` during result or marker cleanup.

Cancellation now requires live execution in `running` or `cancel_requested`.
A terminal result rejects cancellation even when its storage or marker cleanup remains pending.
Two public-action regressions pause those boundaries and confirm the result remains completed and dismissible.
Cancellation during an in-flight deletion still prevents subsequent deletion calls.

## Verification

| Check | Result |
| --- | --- |
| Node.js suite | 175 passed, zero failed or skipped. |
| Independent audit probes | 30 passed; both original findings no longer reproduce. |
| Static source checks | Passed. |
| Package integrity and source comparison | All 27 production entries match source. |
| Mozilla validator 10.14.0 | Zero errors, warnings, or notices, with warnings treated as errors. |
| Native Firefox verification | 35 passed across separate default and first-party-isolated profiles, including cross-profile import. |

Environment: macOS 27.0.1 arm64, Node.js 26.12.1, npm 11.20.0, Python 3.9, and Firefox 158.0.1.
Raw evidence is stored in [audit-0.1.5](audit-0.1.5/README.md).
The package is `dist/biscotty-0.1.5.zip` with its SHA-256 file beside it.
Configuration, portable file, protocol, permissions, extension identity, and minimum Firefox version remain unchanged.

## Release limits

The fixes do not establish signed-install or signed-update verification.
Firefox 153.0, ESR, Windows, Linux, full accessibility, and complete native lifecycle coverage remain open.
License selection, support contact, account checks, and final AMO fields remain release-owner work.
No signing or public extension submission is included in Git delivery.
