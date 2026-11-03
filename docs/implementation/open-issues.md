# Open implementation and verification issues

Date: 3 November 2026. This file records unfinished work and observed verification limits.
Passing existing tests does not establish that the approved amendments are implemented.

## Partition and inventory implementation limits

- The new exception, inventory, migration, transfer, and stored-cookie Current Site paths are implemented with controlled tests. Full acceptance and release verification remain incomplete; see the three documents under `docs/prd/partition-exceptions/` for the complete criteria.
- An inventory batch accepts at most 200 selections and a captured inventory accepts at most 10,000 cookies and 2 MiB. Larger inventories require a narrower store selection; the extension rejects oversized captures instead of presenting them as complete.
- Firefox does not provide an atomic cookie-enumeration-and-settings-write operation. Selected identities are rechecked before the write, but a website can change cookies after that check.
- The baseline PRDs retain some historical observation-era descriptions; the approved amendments and current interfaces supersede those descriptions. The current release guide and verification record reflect the stored-cookie design. Signed installation, upgrade, and platform verification are not complete.

## Verification limits

- On 3 November 2026, Firefox 159.0 on macOS 27.2 arm64 passed 18 disposable-profile scenarios and 19 with first-party isolation and cross-profile import. The fixture uses `TMPDIR=/private/tmp` and `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1`. Earlier retries encountered startup and timeout failures, and a stale dialog selector was corrected before these runs.
- Those Firefox runs exercise partition and store isolation, but do not establish every PEX, INV, and CSI acceptance case. Complete manual accessibility, larger-jar, upgrade, lifecycle, and supported-platform checks remain necessary.
- Signed installation and update, supported platform and Firefox version coverage, accessibility, and lifecycle release gates remain open as recorded in `docs/implementation/verification.md`.
- On 3 November 2026, the current checkout passed `npm test` (196 tests, zero failures or skips) and `npm run check` (29 native source files). The Firefox 159.0 native runner was attempted with the documented environment, but Firefox discarded its browsing context before extension navigation; the run did not complete.

No review or test suite can prove the absence of every possible bug or security issue. New findings should include reproduction steps and their verification status here until resolved.
