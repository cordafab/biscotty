# Release preparation

Version: 0.1.3. Status: unsigned development package; release acceptance remains incomplete.

This patch fixes startup storage recovery. Dismissal unlocks the burner only after marker and session cleanup succeed.

## Package native sources

Use Node.js 22 or later. No dependency installation is required.

```sh
npm test
npm run check
npm run package
```

The package is `dist/biscotty-0.1.3.zip`. A SHA-256 file is written beside it.
Packaging uses Node.js standard modules and fixed ZIP timestamps. Repeated builds of unchanged source produce identical archives.
Only `manifest.json`, production `src/` files, and packaged `assets/` are included.
Tests, disposable profile files, documentation, development scripts, and operation data are excluded.
The manifest and package metadata carry the same source version.

To test an unpacked build, open `about:debugging#/runtime/this-firefox` in a disposable Firefox profile.
Choose **Load Temporary Add-on** and select the repository's `manifest.json`.
Grant both HTTP and HTTPS website access. Keep Firefox containers enabled.
A temporary install does not prove signed-install or browser-restart behavior.

## Proposed Mozilla listing

**Name:** Biscotty

Biscotty gives you a manual cookie burner with a preview before every run.
Protect cookies with domain, subdomain, exact-name, and exact-path allow rules.
Apply each rule to All stores or selected stores, including Normal browsing.
Protect a named Firefox container in full when you want the burner to skip it.

Burning covers accessible cookies in Normal browsing and available named containers, including containers without open tabs.
Private browsing is excluded. Burning can sign you out, and active websites can recreate cookies.
Biscotty skips ambiguous deletion requests when Firefox could select a protected cookie.
Counts describe estimated scope and successful deletion calls; they do not prove exact cookie identities.

Settings export and import use local JSON files with explicit container mapping and conflict decisions.
Current Site lists associated stored-cookie domains, including third-party domains observed during the current page load.
Biscotty passively observes HTTP/HTTPS requests and navigation while the popup is closed.
It retains bounded current-page hostnames, store identity, and document/frame correlation in session memory.
It omits headers, bodies, cookie values, URL paths, queries, credentials, and fragments.
Navigation replaces old page observations; tab closure, permission loss, extension reload, and browser shutdown discard them.
Resource limits can omit activity; the popup then reports incomplete coverage and offers manual reload guidance.
Association counts do not prove that a cookie was sent or read.

Cookie values are never shown or exported. Biscotty makes no network requests and collects no telemetry.
Biscotty does not run automatic deletion, block cookie creation, or synchronize through a cloud.

## Permission explanation

| Permission | Purpose |
| --- | --- |
| `cookies` | Read cookie metadata and execute confirmed safe deletion calls. |
| `storage` | Save protection settings, bounded session observations and current results, and one temporary interruption marker. |
| `contextualIdentities` | Find named containers, including containers without open tabs. |
| `publicSuffix` | Use Firefox's domain classification for rule validation and current-site shortcuts. |
| `webRequest` | Observe contacted HTTP/HTTPS hosts without headers, bodies, blocking, or request modification. |
| `webNavigation` | Separate current documents, redirects, reloads, and nested frames. |
| HTTP and HTTPS host access | Read and delete accessible website cookies across the agreed profile scope. |

The manifest excludes private browsing and declares `data_collection_permissions.required: ["none"]`.
It requests no tabs, browsingData, downloads, webRequestBlocking, or content-script permission.
The extension has no content scripts, external resources, or remote code.

## Reviewer instructions

Use a disposable Firefox desktop profile with synthetic cookies and containers.
Grant HTTP and HTTPS website access and keep containers enabled.

1. Open Settings and add a rule for a synthetic domain in one selected store.
2. Save, reopen Settings, and verify the same domain remains protected only in that store.
3. Create an unprotected synthetic cookie and open the toolbar popup.
4. Prepare a burn preview, review its scope, and confirm the burn.
5. Verify protected cookies remain and eligible synthetic cookies receive safe deletion attempts.
6. Load a fixture page with third-party resources and inspect Associated cookie domains.
7. Edit one domain rule, save it, and verify unrelated rules remain unchanged.
8. Reload the page before saving an old domain view and verify that refresh is required.
9. Export settings and import them into another disposable profile with explicit container mapping.
10. Verify Replace requires review and that cookie values are absent from the exported JSON.

The automated native fixture is documented in [verification](verification.md#run-native-tests).
It covers synthetic redirects, nested frames, cookie separation, popup forms, and cross-profile transfer.
No account, service subscription, remote server, or bundled library is required by the extension.
The production archive contains readable native source files without build transformations.

## Resource and privacy limits

Observation retains at most 128 tabs, 1,024 hosts and 256 frames per tab, and 512 pending events.
Encoded records are limited to 256 KiB each and 4 MiB in aggregate.
Automatic session writes are batched at 250-millisecond intervals; explicit reads and cleanup can flush changed state sooner.
Eviction or queue overflow invalidates affected navigation contexts and requires a fresh review before a rule save.
Mutation deduplication uses bounded backend memory with request digests, completed-response expiry, and capacity checks before execution.

Only protection configuration and a necessary opaque interruption marker use persistent local storage.
Current observations and the current operation view use memory-only session storage.
No browsing history, cookie values, telemetry, or native identifiers are exported.

## Submission fields still requiring the release owner

| Field | Status |
| --- | --- |
| Distribution | Public AMO listing proposed; no submission performed. |
| License | The release owner must select the applicable license; this repository declares none. |
| Support | The release owner must supply a support contact or website. |
| Categories and listing assets | Select categories and prepare final listing images in AMO. |
| Developer account and identity availability | Not inspected; the release owner must confirm them. |
| Privacy statement | Local-only behavior is described above; confirm the final AMO privacy fields against current policy. |
| Signed installation and update | Pending, including permission prompts and restart evidence. |

## Release owner checks

1. Review the outstanding [verification evidence](verification.md).
2. Run the minimum-version, stable, ESR, operating-system, and signed-install matrix.
3. Confirm zero unresolved protection defects.
4. Review the identity `biscotty@cordafab.com` before the first signed submission.
5. Review current [Mozilla manifest declarations](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings).
6. Review current [Mozilla add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/).
7. Submit the native-source ZIP through the release owner's Mozilla account when release approval is complete.
8. Test the returned signed package before public publication.

No signing, submission, or publication has occurred. The package is not represented as a signed installation.
