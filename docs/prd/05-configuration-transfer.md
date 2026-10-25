# PRD: Configuration transfer

Owner: Track D.
Depends on the [module interfaces](01-module-interfaces.md) and [configuration data](02-protection-and-settings.md#configuration-data).
Provides pure import calculations and backend import/export actions.

## Portable file contract

The configuration file contains UTF-8 JSON.
Version 1 accepts exactly the following root fields.

| Field | Required type and meaning |
| --- | --- |
| `format` | Exact string `biscotty-config`. |
| `schemaVersion` | Integer `1`. |
| `containers` | Array of portable container descriptions. |
| `protectedContainerRefs` | Unique array of portable container references. |
| `rules` | Allow rules from the shared data contract, using portable scope references. |

A portable container contains `ref`, `name`, `color`, `icon`, and `state`.
Its state is `active` or `inactive` in the exported source configuration.
Its reference is unique within that file.
It does not establish identity in the destination profile.
The reserved reference `normal` retains its defined meaning without a container description.

- **XFER-01.** Export MUST include every saved allow rule and whole-container protection setting.
- **XFER-02.** Export MUST use portable container references instead of native store identifiers or local binding references.
- **XFER-03.** Export MUST exclude cookie values, cookie inventories, page observations, domain snapshots, configuration revisions, tokens, and operation state.
- **XFER-04.** Export MUST preserve inactive references so the user can review or map them elsewhere.
- **XFER-05.** Import MUST accept only the declared format and supported schema version.
- **XFER-06.** Import MUST reject unknown fields, duplicate references, invalid matchers, and undefined scope references.
- **XFER-07.** Import MUST enforce the shared resource limits before commit.

An export uses the last saved configuration, not unsaved editor drafts.
The backend returns text and a suggested filename.
The frontend supplies a local download through standard browser file features.
The export itself must not initiate a network request.

- **XFER-29.** Export MUST use compact JSON with one final newline and the shared 2 MiB UTF-8 limit.
- **XFER-30.** Resolved import candidates MUST satisfy the portable export limit before the backend presents them as ready to commit.
- **XFER-31.** Every valid portable container reference MUST support each applicable explicit mapping decision, including prototype-related strings.

The complete mapped candidate determines the size of Merge and Replace results.
A fitting source file does not establish that its merged result fits.
Oversized existing exports require a fitting reduction under CFG-23; they must never be truncated.

## Configuration example

This example protects `example.com` in Work only.
It protects Personal in full.
It protects the named `login` cookie on `example.net` in All stores.

```json
{
  "format": "biscotty-config",
  "schemaVersion": 1,
  "containers": [
    {
      "ref": "c1",
      "name": "Work",
      "color": "blue",
      "icon": "briefcase",
      "state": "active"
    },
    {
      "ref": "c2",
      "name": "Personal",
      "color": "green",
      "icon": "fingerprint",
      "state": "active"
    }
  ],
  "protectedContainerRefs": ["c2"],
  "rules": [
    {
      "domain": "example.com",
      "includeSubdomains": true,
      "name": null,
      "path": null,
      "scope": {"type": "selected", "storeRefs": ["c1"]}
    },
    {
      "domain": "example.net",
      "includeSubdomains": false,
      "name": "login",
      "path": null,
      "scope": {"type": "all"}
    }
  ]
}
```

## Validation and staging

- **XFER-08.** Invalid input MUST fail the entire import without a settings change.
- **XFER-09.** Parsing and staging MUST treat imported text as data, never executable content.
- **XFER-10.** Imported objects MUST be reconstructed from validated fields instead of being merged into application objects directly.
- **XFER-11.** Validation MUST complete before the final preview becomes available.
- **XFER-12.** Every plan MUST bind to the current configuration revision and destination catalog.

The input byte limit must be checked before JSON parsing.
Invalid files produce a useful safe error, not a partially accepted rule set.
No automatic format downgrade or migration is required for version 1.
A future supported migration requires explicit format tests before release.

## Container mapping

Each imported named-container reference requires one explicit mapping decision.
The interface can suggest destination matches using name, color, and icon.
The user must confirm every mapping, including unique suggested matches.
Duplicate names remain separate entries.

| Decision | Result |
| --- | --- |
| Map to an available destination container | Use its existing local reference. |
| Retain as an inactive reference | Keep the settings without an active native store association. |
| Exclude this source reference | Omit its protection contribution after showing the affected entries. |

- **XFER-13.** A source native identifier or matching name MUST NOT establish destination identity automatically.
- **XFER-14.** Import MUST NOT create, rename, or delete a Firefox container.
- **XFER-15.** `normal` MUST map only to Normal browsing.
- **XFER-16.** Many-to-one mappings MUST show their combined effects and require explicit confirmation.
- **XFER-17.** An excluded reference MUST NOT silently remove an imported rule.

When exclusion empties a selected rule scope, show that rule as excluded in the final preview.
Require acknowledgment of all excluded rules before applying the import.
An All stores rule retains its All stores meaning after named-container exclusions.
The interface must state that this rule still protects all available named containers.

Retaining an inactive reference creates an extension reference only.
It does not create a native Firefox container.
Later activation requires explicit mapping through the editor.

## Merge and Replace

Merge retains unmatched existing entries and adds unmatched imported entries.
Replace starts from imported entries and lists existing-only protection for removal.
Both modes require explicit decisions for conflicts.
Neither mode silently resolves a conflict.

An identical canonical matcher with an identical mapped scope is a duplicate, not a conflict.
Different matcher keys remain separate rules even when their effects overlap.
Version 1 has no negative rules.
An existing-only rule missing from a Merge file remains unchanged.

The following differences are conflicts.

| Difference | Required decisions |
| --- | --- |
| Same canonical matcher, different mapped scope | Keep existing, Use imported, or Combine scopes. |
| Different protection flags for a mapped existing container | Keep existing or Use imported. |
| Different source protection flags mapped onto one destination | Choose the resulting protection flag explicitly. |

For scope combination, All stores combined with any scope produces All stores.
Two selected scopes combine their unique selected references.
The interface must show when a choice expands or reduces protection.
No conflict choice is preselected.

- **XFER-18.** Every conflict MUST receive an individual user decision.
- **XFER-19.** Existing protection MUST remain active until the final import commit.
- **XFER-20.** Replace MUST still honor explicit Keep existing or Combine conflict decisions.
- **XFER-21.** Replace MUST require acknowledgment of all existing-only protection scheduled for removal.
- **XFER-22.** A mode or mapping change MUST invalidate dependent conflict decisions and regenerate the plan.

The final result is the mode's starting set plus explicit conflict decisions.
Its preview must show the actual result, including retained entries in Replace mode.

## Commit behavior

The final preview shows additions, changes, removals, duplicates, inactive references, and excluded imported entries.
It also shows every conflict decision.
The user can export the existing saved configuration before applying a replacement.
The extension does not create an automatic backup file.

- **XFER-23.** Application MUST reject unresolved mappings, unresolved conflicts, stale revisions, and stale catalogs.
- **XFER-24.** Application MUST reject an active burn.
- **XFER-25.** Application MUST validate the fully resolved result again.
- **XFER-26.** Application MUST commit one complete configuration record through the shared mutation queue.
- **XFER-27.** Cancellation before commit MUST discard the staged plan without changing saved settings.
- **XFER-28.** A failed commit MUST follow the shared storage-recovery requirements.

An import must not overwrite backend-only metadata from the file.
Destination bindings come from explicit mapping and the current native catalog.
The backend assigns the new local revision.

## Configuration recovery

A confirmed missing or invalid local record has no usable expected revision.
The backend can issue a temporary recovery token bound to that observed record state and current catalog.
Only import inspection, planning, resolution, and commit accept that token with a null expected revision.
Burning, direct editing, and Merge remain unavailable during recovery.

Recovery requires a valid configuration file, complete mapping, and a Replace preview.
The preview must state that previous protection is unknown and cannot be preserved automatically.
The user must acknowledge that statement before commit.
The commit must recheck the observed record state and catalog before one complete replacement write.
It creates revision `1` and clears recovery state only after confirmed storage success.

No recovery write is permitted while native storage reads fail.
A changed observed record invalidates the token.
Recovery never applies an empty default configuration automatically.
This path does not keep a configuration backup or operation history.

## Acceptance criteria

| Case | Expected result |
| --- | --- |
| XFER-A01 | Export and reimport preserve rule meaning, including null and empty-name distinctions. |
| XFER-A02 | Import into another profile works with different native container identifiers. |
| XFER-A03 | Duplicate names and inactive containers require explicit mapping decisions. |
| XFER-A04 | Unmatched containers can be retained inactive or explicitly excluded without native container creation. |
| XFER-A05 | Merge retains existing-only entries; Replace previews their removal. |
| XFER-A06 | Every differing mapped scope and protection flag requires an individual decision. |
| XFER-A07 | Keep existing, Use imported, and Combine produce the displayed final scope. |
| XFER-A08 | A changed mode or mapping invalidates old conflict decisions. |
| XFER-A09 | Malformed, oversized, unsupported, or invalid input leaves settings unchanged. |
| XFER-A10 | Unknown keys and prototype-related input cannot change application objects. |
| XFER-A11 | An active burn or changed revision prevents a stale import commit. |
| XFER-A12 | Export contains no native store identifiers, cookie values, cookie inventory, or operation data. |
| XFER-A13 | An excluded source reference does not narrow an All stores rule. |
| XFER-A14 | The supplied example validates and retains its stated protection meaning. |
| XFER-A15 | Compact exports round-trip large valid configurations and enforce exact UTF-8 boundaries. |
| XFER-A16 | Merge rejects an oversized mapped result without changing saved settings, even when each source file fits. |
| XFER-A17 | Prototype-related references support mapping, retention, exclusion, paging, and reset without inherited-object interference. |
