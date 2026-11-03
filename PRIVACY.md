# Biscotty privacy notice

Effective date: 3 November 2026. Applies to version 0.2.1.

Biscotty processes cookie metadata and protection settings locally in Firefox. It makes no network requests, sends no data to its developer or third parties, uses no analytics, and has no cloud synchronization.

## Cookie access

Firefox's cookies API returns cookie records to Biscotty's backend. The adapter immediately discards cookie values and passes only metadata to the rest of the extension. Cookie values are not displayed, saved in protection settings, or included in exports.

Metadata includes domains, cookie names and paths, security flags, store references, and partition associations. Metadata can identify sites you use and can sometimes contain identifying text. Biscotty uses it to display inventories, evaluate protection, preview a burn, and perform confirmed eligible deletion calls.

Biscotty needs HTTP and HTTPS website access to inspect and delete cookies across Normal browsing and available named containers. It does not support private browsing. It does not observe page requests or maintain a list of contacted hosts. Temporary navigation generations prevent edits from applying to a stale page.

## Local storage and retention

Protection settings remain in Firefox local extension storage until changed or the extension is removed. Settings include allow rules, partition exceptions, protected-container references, and container labels and bindings. This storage is not encrypted by Biscotty.

Cookie inventories, previews, import plans, and navigation generations use bounded extension memory. The current burn result uses Firefox session storage. A necessary opaque interruption marker uses local storage until cleanup or acknowledgment. Biscotty retains no completed-burn history.

Firefox controls its own profile storage, backups, crash reports, and extension removal behavior. This notice describes Biscotty's behavior, not all browser or operating-system activity.

## Settings files

Export saves an unencrypted JSON file at your request. It contains saved protection settings, including domains, cookie-name and path matchers, partition exceptions, and container labels. These fields can contain identifying information. Cookie values, native container identifiers, inventories, and operation results are excluded.

Biscotty does not upload exported files. You control their retention and sharing. Delete exported copies yourself when no longer needed, and review them before sharing. Import reads a file you select and applies settings only after your mapping, conflict decisions, and confirmation.

## Contact

For privacy questions or support, contact **me@fabriziocorda.com**. Information you voluntarily send by email is handled outside the extension; review attachments before sending them.
