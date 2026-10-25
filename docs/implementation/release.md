# Release preparation

Version: 0.1.1. Status: unsigned development package; release acceptance remains incomplete.

## Package native sources

Use Node.js 22 or later. No dependency installation is required.

```sh
npm test
npm run check
npm run package
```

The package is `dist/biscotty-0.1.1.zip`. A SHA-256 file is written beside it.
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
Cookie values are never shown or exported. Biscotty makes no network requests and collects no telemetry.
Biscotty does not run automatic deletion, block cookie creation, or synchronize through a cloud.

## Permission explanation

| Permission | Purpose |
| --- | --- |
| `cookies` | Read cookie metadata and execute confirmed safe deletion calls. |
| `storage` | Save protection settings, memory-only current results, and one temporary interruption marker. |
| `contextualIdentities` | Find named containers, including containers without open tabs. |
| `publicSuffix` | Use Firefox's domain classification for rule validation and current-site shortcuts. |
| HTTP and HTTPS host access | Read and delete accessible website cookies across the agreed profile scope. |

The manifest excludes private browsing and declares `data_collection_permissions.required: ["none"]`.
It requests no tabs, browsingData, downloads, webRequest, or content-script permission.
The extension has no content scripts, external resources, or remote code.

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
