# Biscotty

**Clear unwanted cookies. Keep the ones that matter.**

Biscotty is a Firefox extension that helps you clean up cookies while preserving the sites and sessions you choose. Protect what you want to keep, preview a cleanup, then confirm when you are ready. Biscotty calls this a **burn**.

## Why Biscotty?

Biscotty gives you more control than a blanket cookie cleanup, with a few practical advantages:

- **Keep useful sessions.** Protect cookies for your chosen sites so you can clean up without signing out of everything. For finer control, protect individual cookies.
- **Treat containers differently.** Keep an entire Firefox container untouched, or protect a site only in selected containers—for example, keep its Work session while clearing its Personal session.
- **Works with Firefox Total Cookie Protection.** Firefox's [Total Cookie Protection](https://www.firefox.com/en-US/features/total-cookie-protection/) keeps a separate cookie jar for each website, including cookies from embedded third-party services. Biscotty supports these jars, so you can keep a service's cookies while making its third-party cookies on selected sites eligible for cleanup.
- **Review before deleting.** Every burn starts with a preview and needs your confirmation. You decide when cleanup happens; there is no automatic deletion.
- **See what is stored.** Browse stored cookies in Settings or inspect cookie domains associated with the current site, then adjust what you keep.
- **Take your preferences with you.** Export and import protection settings as a local file, without copying cookie values.
- **Keep cleanup private.** Biscotty makes no network requests, collects no telemetry, and keeps no cleanup history.

A burn covers regular browsing and all eligible Firefox containers, including those without open tabs. Protected cookies and containers are skipped, and your tabs stay open.

## Try it

Biscotty is currently an **unsigned submission candidate**; release verification is still in progress. It requires Firefox desktop 153 or later and does not support private browsing.

1. Download or clone this repository.
2. In a separate Firefox test profile, open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select `manifest.json`.
4. Grant website access, keep Firefox containers enabled, and open Biscotty from the toolbar.
5. Protect the sites or containers you want to keep, then preview your first burn.

No sites or containers are protected by default. Deleting cookies can sign you out, and websites can create new cookies afterward. Biscotty cleans up stored cookies; it does not block websites from creating them.

The [privacy notice](PRIVACY.md) explains local settings, cookie metadata, and exported files.
The [Mozilla submission materials](docs/implementation/mozilla-submission.md) contain the proposed listing and support details.

For development, packaging, and verification details, see the [release guide](docs/implementation/release.md). The [product requirements](docs/prd/00-product.md) describe the full behavior.

## License

Biscotty is available under the [MIT License](LICENSE).
