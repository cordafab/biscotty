# Primary sources

Sources were checked on 25 October 2026.
These sources support platform facts and language rules.
Product decisions come from the [approved decision record](08-decisions.md).
Platform implementation tests remain necessary.

## S01: Cookie access

[Mozilla Cookies API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies).
[Cookie fields](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies/Cookie).

Cookie access requires cookie permission and relevant host access.
The native cookie record includes HttpOnly, Secure, session, and partition information.

## S02: Cookie enumeration

[Mozilla cookies.getAll](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies/getAll).

Default enumeration excludes partitioned storage.
An empty partition selector includes partitioned and unpartitioned cookies.
A null first-party-domain selector includes the supported first-party contexts.
The enumeration filters describe stored cookies, not a current tab's actual cookie usage.
Association through contacted hosts is a project design inference.

## S03: Cookie deletion

[Mozilla cookies.remove](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies/remove).
[Mozilla cookie change events](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies/onChanged).

Deletion selects by URL and name with store and partition context.
It does not accept an exact domain-and-path identity.
Selection can prefer a same-name cookie through path length and creation order.
Read and delete are separate operations.
The conservative selector guard is a project design derived from these constraints.

## S04: Container identity

[Mozilla contextual identities](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/contextualIdentities).
[Contextual identity fields](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/contextualIdentities/ContextualIdentity).

Containers have local store identifiers and descriptive names, colors, and icons.
Names need not be unique.
The API can become unavailable when containers are disabled.
Explicit portable mapping is a project design derived from these facts.

## S05: Store discovery

[Mozilla getAllCookieStores](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies/getAllCookieStores).
[Firefox cookie implementation](https://searchfox.org/firefox-main/source/toolkit/components/extensions/parent/ext-cookies.js).

The checked Firefox source derives that store result from current tabs.
The PRD therefore requires the named-container catalog separately.
Searchfox follows current source; supported-release browser tests must confirm the behavior.

## S06: Partition identity

[Firefox cookie schema](https://searchfox.org/firefox-main/source/toolkit/components/extensions/schemas/cookies.json).

The implementation must preserve every supported native partition field.
Current schema details can exceed the simplified prose examples.

## S07: Background execution

[Mozilla background manifest settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background).
[Mozilla Manifest V3 migration](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/).

Firefox supports MV3 background scripts through event pages.
The PRD does not assume Chrome-style service-worker execution.

## S08: Toolbar action

[Mozilla action manifest settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/action).

An action can provide a packaged popup and request initial toolbar placement.
The user can subsequently move the button.

## S09: Popup lifetime

[Mozilla popup interface](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Popups).

Popup documents unload after closure.
Burn execution must therefore belong outside the frontend popup document.

## S10: Full-page options

[Mozilla options_ui](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/options_ui).
[Mozilla openOptionsPage](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/openOptionsPage).

Packaged options can open in a browser tab.

## S11: Private browsing

[Mozilla incognito manifest setting](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/incognito).
[Working with cookies](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Work_with_the_Cookies_API).

Private cookie access is a separate native context.
The agreed product excludes that context.

## S12: Tab context and permissions

[Mozilla tabs API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs).
[Mozilla tabs.query](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/query).
[Mozilla Tab fields](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/Tab).
[Mozilla activeTab permission](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/activeTab_permission).
[Mozilla host permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions).

Existing host access can expose a matching tab URL without the broad tabs permission.
Temporary active-tab access is not a substitute for Firefox cookie host access.
The backend must treat missing URL or store context as unavailable.

## S13: Native domain checks

[Mozilla publicSuffix API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/publicSuffix).
[Mozilla getDomain](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/publicSuffix/getDomain).
[Mozilla isKnownSuffix](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/publicSuffix/isKnownSuffix).
[Mozilla API announcement](https://blog.mozilla.org/addons/2026/08/06/how-the-publicsuffix-api-was-created/).

Firefox provides native base-domain and known-suffix checks.
The base-domain call can return null for an IP address, unknown suffix, or bare public suffix.
The PRD adds an exact-host fallback after rejecting a bare known suffix.

## S14: Session storage

[Mozilla storage.session](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session).

Session storage holds memory-only data for the browser session.
It supports a current result without persistent operation history.
Checked again on 25 October 2026 for the Current Site amendment.
Session storage also permits temporary current-page observations across event-page suspension.
Browser shutdown clears this memory-only storage.
It provides no guarantee that storage writes will succeed or capacity will remain available.

## S15: Permission changes

[Mozilla permissions.contains](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/contains).
[Mozilla permissions.onRemoved](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/onRemoved).
[Mozilla permissions.request](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/permissions/request).

Access checks and removal events do not create a transaction with cookie operations.
The backend must handle changed access during execution.

## S16: Temporary installation

[Mozilla temporary installation](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/).

Temporary loading supports development but does not replace signed-install verification.

## S17: Mozilla manifest declarations

[Mozilla browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings).
[Mozilla Firefox releases](https://www.firefox.com/en-US/releases/).

Release preparation must set the supported minimum and current required data-collection declarations.
The approved minimum is Firefox 153.0.

## S18: Mozilla release policies

[Mozilla add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/).

The release owner must check current submission and disclosure requirements.
This source is not a substitute for signed-install acceptance evidence.

## S19: ASD-STE100

[Official ASD-STE100 FAQ](https://www.asd-ste100.org/STE_faq.html).
[Official ASD-STE100 explanation](https://www.asd-ste100.org/about_STE.html).
[Official language-tool guidance](https://www.asd-ste100.org/STEsoftware.html).
[Official Issue 9 PDF](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf).
[Official download page](https://www.asd-ste100.org/STE_downloads.html).

Issue 9 is dated 15 January 2025.
The published rules distinguish instructions from descriptive text and permit defined technical terms.
Tools do not independently prove language conformance.
Direct retrieval of the full official PDF returned an access error during this task.
Official indexed material and guidance supplied the language facts used here.

## S20: Passive request observation

Checked on 25 October 2026.
[Mozilla webRequest API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest).
[Mozilla onBeforeRequest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onBeforeRequest).

Request observation requires `webRequest` and relevant host permissions.
Observing embedded resources requires access to the requesting page and resource hosts.
Request events provide tab, frame, request, and document context when available.
Request bodies and blocking behavior require separate listener options.
The Current Site design omits these options and does not request headers.

The API does not retrospectively supply a page's earlier requests.
Reserved domains and native visibility restrictions still apply.

Contacted-host collection is a design choice for domain association.
It does not prove that every stored cookie was sent or read.
The product therefore labels observation gaps and avoids individual cookie-use claims.

## S21: Navigation and document identity

Checked on 25 October 2026.
[Mozilla webNavigation API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webNavigation).
[Mozilla onCommitted](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webNavigation/onCommitted).
[Mozilla document identity guide](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Work_with_documentId).
[Mozilla webRequest compatibility data](https://github.com/mdn/browser-compat-data/blob/main/webextensions/api/webRequest.json).

Navigation events require `webNavigation` permission.
Committed-navigation events identify the tab, frame, document, and parent document when available.
Document identity distinguishes loaded documents from their reusable frame identifiers.
The checked compatibility data records `webRequest` document identity support from Firefox 153.
The design does not depend on `documentLifecycle`, whose Firefox support is absent in that data.

Navigation generations, observation replacement, redirect grouping, and incomplete restoration coverage are project design choices.
Native tests must verify event ordering and attribution on supported Firefox releases.
