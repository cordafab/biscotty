# Mozilla submission materials: Biscotty 0.2.1

Prepared on 3 November 2026. Unsigned candidate; no AMO submission or publication has occurred.
Use the exact archive and evidence identified in the [submission report](submission-readiness-0.2.1.md).

## Upload and metadata

| AMO field | Prepared value |
| --- | --- |
| Distribution | On this site: public addons.mozilla.org listing |
| Package | `dist/biscotty-0.2.1.zip` |
| Name | Biscotty |
| Summary | Clear unwanted cookies. Keep the ones that matter. |
| Version | 0.2.1 |
| License | MIT; see [LICENSE](../../LICENSE) |
| Support email | me@fabriziocorda.com |
| Suggested category | Privacy & Security; select the available equivalent in AMO |
| Platforms | Firefox desktop; native evidence currently covers macOS only |
| Minimum Firefox | 153.0 |
| Private browsing | Unsupported; disabled in the manifest |
| Data collection declaration | `browser_specific_settings.gecko.data_collection_permissions.required: ["none"]` |
| Privacy notice | [Prepared public text](../../PRIVACY.md); paste into AMO's privacy-policy field or host it publicly |
| Authentication or payment | None required |
| Original source upload | Archive contains original readable source; no compilation, bundling, transpilation, or minification |

Confirm the existing public add-on identifier `biscotty@cordafab.com` and the account's public developer profile before first signing.
The identifier is embedded in the package; it does not replace the support email.
Do not lower the declared Firefox minimum to support an older ESR.
The required public-suffix and document-identity APIs begin in Firefox 153.

## Listing description

Clear unwanted cookies while keeping the sites and sessions you choose.

Biscotty provides a manual cookie burner with a preview before every run. Protect domains, subdomains, or individual cookies by exact name and path. Apply protection to all stores or selected Firefox containers. You can also protect an entire named container.

Browse stored cookies in Settings, or inspect cookies associated with the current site in a selected container. Known third-party partitions appear separately. Partition exceptions let you make selected third-party cookies eligible for cleanup while retaining broader protection. Marking cookies burnable changes protection; deletion still requires a confirmed burn.

A burn covers accessible HTTP and HTTPS cookies in Normal browsing and available named containers, including containers without open tabs. No sites or containers are protected by default. Private browsing is excluded.

Burning can sign you out. Protected cookies are skipped, and uncertain deletion requests are skipped when Firefox might select a protected cookie. Preview counts are estimates; successful deletion calls do not prove exact cookie identities. Active websites can recreate cookies. Biscotty does not block cookie creation or delete automatically.

Export and import protection settings through local JSON files with explicit container mapping and conflict review. Exports exclude cookie values but can contain identifying domains, cookie names, paths, and container labels. Files are unencrypted; review them before sharing.

Biscotty makes no network requests, collects no telemetry, and uses no cloud service. It does not observe page requests or retain contacted hosts. Cookie associations describe stored cookies and do not prove that a cookie was sent or read.

Website access is needed to inspect and delete cookies across the profile. Cookies, local storage, container, public-suffix, and navigation permissions support inventory, protection, and rejection of stale page edits. Full permission explanations appear in the [release guide](release.md#permission-explanation).

## Version notes

Version 0.2.1 includes the refreshed popup and Settings interface, selected-container cookie inspection, and the export privacy disclosure. Protection settings, partition exceptions, manual burn confirmation, and local-only behavior remain supported.

## Notes to Mozilla reviewers

The package contains readable native JavaScript, HTML, CSS, and an SVG icon. There are no external libraries, downloaded code, content scripts, obfuscation, generated JavaScript, or network endpoints. `src/frontend/options.js` is original readable source even if validator metadata classifies it as an unknown minified file. It has not been transformed.

Packaging requires Node.js 22 or later and no dependency installation. From the matching repository snapshot:

```sh
npm test
npm run check
npm run package
```

The ZIP has `manifest.json` at its root. The supplied package and checksum identify the candidate. Packaging uses fixed ZIP timestamps. Recorded reproducibility applies to the tested Node/zlib environment; compression versions can differ across runtimes. Reviewers can compare unpacked file hashes with the source inventory.

Use a disposable Firefox desktop profile and synthetic cookies. Grant HTTP and HTTPS website access, and keep Firefox containers enabled. No external service, account, or test credentials are needed. Follow the [reviewer procedure](release.md#reviewer-instructions). Current Site uses stored-cookie associations; the loopback fixtures use redirects and nested frames solely to test navigation and partition boundaries.

Native testing can consume the exact archive:

```sh
FIREFOX_BINARY=/path/to/firefox TMPDIR=/private/tmp MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 \
  python3 tests/native/firefox.py --package dist/biscotty-0.2.1.zip --smoke
FIREFOX_BINARY=/path/to/firefox TMPDIR=/private/tmp MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 \
  python3 tests/native/firefox.py --package dist/biscotty-0.2.1.zip --export-file /tmp/biscotty-a.json
FIREFOX_BINARY=/path/to/firefox TMPDIR=/private/tmp MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 \
  python3 tests/native/firefox.py --package dist/biscotty-0.2.1.zip --fpi --import-file /tmp/biscotty-a.json
```

The smoke mode temporarily installs the unmodified archive. Scenario mode extracts its production files and adds test instrumentation only to a disposable copy. Neither mode produces a signed installation.

## Listing assets and final submission

Use the [packaged icon](../../assets/icon.svg). A [production Settings screenshot](submission-0.2.1/settings.png) is supplied from a disposable test profile. Capture additional toolbar images after the signed candidate passes lifecycle checks, if required by the listing form.

The owner must accept Mozilla's agreement and provide any account verification AMO requests. Submit only after reviewing the [remaining release gates](submission-readiness-0.2.1.md#remaining-release-gates). Test the returned signed candidate before public publication. No signing credentials were read or stored during preparation.

## Policy sources

Checked on 3 November 2026: [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/), [policy FAQ](https://extensionworkshop.com/documentation/publish/add-on-policies-faq/), [submission guide](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/), [source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/), and [packaging](https://extensionworkshop.com/documentation/publish/package-your-extension/).

These policies support readable native sources and an accurate no-transmission declaration. Mozilla's review determines acceptance. Recheck the policy in force if submitting on or after the announced 1 December 2026 policy change.
