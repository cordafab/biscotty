# PRD: Protection and settings

Owner: Track A.
Depends on the [shared module interfaces](01-module-interfaces.md).
Provides pure policy functions and backend configuration actions.

## Configuration data

The local configuration uses one complete record.
The backend stores it under `biscotty.configuration`.

| Field | Required type and meaning |
| --- | --- |
| `schemaVersion` | Integer `1`. |
| `revision` | Nonnegative integer; increases after each user configuration commit. |
| `containerBindings` | Array of local container bindings. |
| `protectedContainerRefs` | Unique array of container references; excludes `normal`. |
| `rules` | Array of allow rules with unique canonical matchers. |

A local container binding contains the following fields.
This record is private backend data, not an editable frontend object.

| Field | Required type and meaning |
| --- | --- |
| `ref` | Opaque extension-local reference; never a Firefox store identifier. |
| `cookieStoreId` | Current Firefox identifier, or `null` for an inactive reference. |
| `name` | Latest known container name. |
| `color` | Latest known native color identifier. |
| `icon` | Latest known native icon identifier. |
| `state` | `active` or `inactive`. |

`normal` is the reserved reference for Normal browsing.
It has no entry in `containerBindings`.
Container references remain stable within the extension configuration.
An inactive reference remains valid in rules and whole-container protection settings.
It has no active deletion scope until the user maps it to an available container.

An allow rule contains the following fields.

| Field | Required type and meaning |
| --- | --- |
| `domain` | Canonical hostname or IP address. |
| `includeSubdomains` | Boolean. |
| `name` | Exact case-sensitive cookie name, or `null` for every name. |
| `path` | Exact case-sensitive cookie path, or `null` for every path. |
| `scope` | An All stores scope or a Selected stores scope. |

An All stores scope is `{ "type": "all" }`.
A Selected stores scope contains `type: "selected"` and a nonempty `storeRefs` array.
Each selected reference must be `normal` or a defined container reference.
An All stores scope has no `storeRefs` field.
An empty cookie name is different from `null`.
A specific path starts with `/`; `/` is an exact path, not every path.

Version 1 has no optional product preferences beyond this protection data.
English, manual deletion, and required confirmation are fixed behavior.
View filters and unsaved form state are not configuration settings.
Page observations and domain snapshots are temporary views, not configuration settings.

## Canonical forms and validation

- **CFG-01.** The backend MUST validate complete drafts before any configuration commit.
- **CFG-02.** Validation MUST reject unknown fields, incorrect types, undefined references, and duplicate bindings.
- **CFG-03.** Validation MUST reject empty selected scopes and duplicate canonical matchers.
- **CFG-04.** Domain normalization MUST remove a cookie-domain leading dot and a final hostname dot.
- **CFG-05.** Domain normalization MUST produce lowercase ASCII hostnames through standard URL and IDNA handling.
- **CFG-06.** A domain input MUST contain a hostname only, without a scheme, port, path, query, or user information.
- **CFG-07.** Known public suffixes MUST be rejected as rule domains through the native Firefox domain adapter.
- **CFG-08.** IP rules MUST use exact-host matching and `includeSubdomains: false`.
- **CFG-09.** Cookie name and path strings MUST retain their case and characters.
- **CFG-10.** Wildcard expressions and regular expressions MUST be rejected.

Literal wildcard characters in an exact cookie name are not wildcard expressions.
The interface must explain that cookie names are exact strings.

The canonical matcher key contains `domain`, `includeSubdomains`, `name`, and `path`.
Rule scope is not part of that key.
Store reference arrays and protected-container arrays use unique sorted values for comparison.
Two identical matcher keys with different scopes require consolidation or an explicit import conflict decision.

The backend performs native public-suffix checks outside pure logic.
It supplies the resulting domain facts to validation.
Pure logic must remain executable without Firefox.

## Resource limits

The following limits are version 1 engineering limits.
They bound parsing, messages, and local configuration size.

| Item | Maximum |
| --- | --- |
| Import text or serialized editable configuration | 2 MiB of UTF-8 data. |
| Allow rules | 10,000. |
| Container bindings or portable container descriptions | 1,000. |
| Individual name, path, or descriptive string | 4,096 Unicode code points. |
| Canonical DNS hostname | 253 ASCII characters. |
| Cookie metadata page | 200 rows. |
| Domain snapshot page | 200 domain rows. |

A limit violation produces a field-specific validation error before commit.
Limits must apply to manual edits, backend messages, and imports.
Limits do not authorize partial imports or truncated settings.

## Rule matching

- **RULE-01.** A rule MUST first match the current cookie store through its scope.
- **RULE-02.** An All stores scope MUST include Normal browsing and current or future named containers.
- **RULE-03.** A Selected stores scope MUST include only its explicit references.
- **RULE-04.** Exact domain matching MUST compare canonical cookie domains, not the current tab hostname.
- **RULE-05.** Subdomain matching MUST require equality or a suffix preceded by a complete label separator.
- **RULE-06.** `example.com` MUST NOT match `badexample.com` or `example.com.attacker.test`.
- **RULE-07.** A non-null name or path MUST match exactly.
- **RULE-08.** Any applicable allow rule MUST protect the cookie.
- **RULE-09.** Whole-container protection MUST protect every cookie in that container.
- **RULE-10.** Rules MUST apply across all supported partition identities within their store scope.
- **RULE-11.** Matching MUST NOT depend on cookie values, expiry class, Secure, HttpOnly, or session status.
- **RULE-12.** Normal browsing MUST remain separate from all named containers.

Cookie host-only and domain-cookie flags do not create separate allow-rule categories.
Cookies with the same canonical domain use the same domain matcher.

## Settings lifecycle

- **CFG-11.** A confirmed first installation MUST create an empty allow list and empty protected-container set.
- **CFG-12.** An unexpectedly missing or invalid configuration MUST block burning instead of creating empty protection.
- **CFG-13.** Each successful user commit MUST replace one complete configuration record and increase its revision once.
- **CFG-14.** The backend MUST expose the new record only after it confirms the storage write.
- **CFG-15.** A failed commit MUST preserve the last confirmed active configuration or block actions until recovery.
- **CFG-16.** Save and import MUST reject an outdated expected revision without changing settings.
- **CFG-17.** Protection mutations MUST remain blocked during an active burn.
- **CFG-18.** A container rename MUST retain its binding and rules.
- **CFG-19.** A container deletion MUST retain an inactive reference instead of rebinding by name.
- **CFG-20.** Rebinding an inactive reference MUST require an explicit user decision.

Native container changes are outside the configuration mutation queue.
The backend must reconcile them without changing the protection scope of an active burn.
It must invalidate previews when a relevant store change affects their scope.
Missing catalog access blocks a new preview.
Metadata reconciliation can wait until an active burn ends.

It must use the same mutation queue as user commits.
Metadata-only reconciliation retains the user configuration revision and updates the catalog generation.
The catalog generation participates in preview and import-plan validation.

An explicit inactive-reference mapping replaces its uses with the selected available reference.
It preserves protection already assigned to that destination.
The final draft shows any resulting rule-scope or protection change before Save.
An inactive-reference removal must identify every affected rule before Save.
The backend must reject a remaining empty selected scope or undefined reference.

An invalid or unexpectedly missing record can be replaced only through the explicit [import recovery path](05-configuration-transfer.md#configuration-recovery).
A storage read failure must be resolved before any recovery write.
Recovery must never create empty protection as an automatic error response.

## Acceptance criteria

| Case | Setup and expected result |
| --- | --- |
| RULE-A01 | A Work-only rule protects Work; the same cookie remains eligible in Personal and Normal browsing. |
| RULE-A02 | A Work-and-Personal rule protects both; Normal browsing remains eligible. |
| RULE-A03 | An All stores rule protects all supported stores, including a later-created container. |
| RULE-A04 | A protected container retains cookies without any allow rule. |
| RULE-A05 | Exact domain, subdomain, case, empty name, null name, exact path, and null path produce distinct expected matches. |
| RULE-A06 | A cookie in another partition receives the same protection within the same store. |
| CFG-A01 | A new installation has no built-in exceptions. |
| CFG-A02 | Invalid settings block burning and preserve recovery information. |
| CFG-A03 | Two editor saves with one expected revision yield one commit and one revision error. |
| CFG-A04 | A storage failure does not expose a partly changed configuration. |
| CFG-A05 | Renaming preserves protection; deleting and recreating the name does not transfer protection. |
| CFG-A06 | Maximum-size valid input succeeds; each limit violation fails without a settings change. |
| CFG-A07 | An update retains existing protection and does not run first-install initialization again. |
| CFG-A08 | Invalid or missing settings require confirmed valid replacement; an unreadable storage area permits no recovery write. |

Track A also provides pure selector-safety calculations described in the [burner PRD](03-firefox-backend-and-burner.md#deletion-safety).
