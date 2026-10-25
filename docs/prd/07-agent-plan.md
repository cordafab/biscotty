# Agent work plan

This plan defines implementation responsibilities.
The PRD package itself contains no extension source code.
The baseline extension is present; the Current Site cookie-domain additions are implemented; release verification remains incomplete.

## Shared preparation

Read the [product PRD](00-product.md), [glossary](../../GLOSSARY.md), and [module interfaces](01-module-interfaces.md).
Read the assigned module PRD before editing its source paths.
Use the shared contract names in code, tests, and handoffs.

The integration agent owns shared files and contract changes.
Each track owns its listed paths.
Cross-track changes require coordination before editing another track's files.
A contract correction must update its PRD and affected callers together.

## Milestone M0: Shared foundation

Owner: Integration agent.

1. Establish the native source layout and test entry points.
2. Implement manifest settings, backend client, gateway validation, and action registration.
3. Establish native adapter interfaces and controlled test adapters.
4. Establish the shared configuration and response contracts.
5. Verify sender rejection, response envelopes, and frontend access through the client.

M0 is complete when the interface acceptance tests can run without third-party libraries.
Track-specific actions can be exercised through test adapters at this stage.
Production action placeholders are not release behavior.

The integration agent owns these future shared paths.

| Path | Purpose |
| --- | --- |
| `manifest.json` | Firefox configuration and permissions. |
| `src/backend/client/` | Public client and native transport. |
| `src/backend/gateway/` | Sender checks and action registration. |
| `src/backend/background.js` | Event-page initialization and synchronous native listener registration. |
| `tests/harness/` | Native assertions and shared contract fixtures. |
| `scripts/check.mjs` | Static module, privacy, and manifest permission checks. |
| `docs/prd/` | Shared contracts and requirement corrections. |

Do not start parallel source edits before M0 establishes these contracts.

## Milestone M1: Four parallel tracks

The tracks can work against their agreed interfaces and controlled adapters.
They do not need another track's unfinished implementation to write acceptance tests.

| Track | PRD and deliverables | Exclusive future ownership |
| --- | --- | --- |
| A: Protection and settings | Pure matching, selector safety, validation, configuration commits, and revision control. | `src/core/policy/`, `src/core/configuration/`, `src/backend/configuration/`, `tests/core/policy/`, `tests/core/configuration/`, `tests/backend/configuration/`. |
| B: Firefox and burner | Native adapters, store catalog, domain context, cookie access, previews, execution, and temporary operation state. | `src/backend/firefox/`, `src/backend/burner/`, `tests/backend/firefox/`, `tests/backend/burner/`, `tests/native/`. |
| C: Frontend | Toolbar menu, configuration editor, import GUI, accessibility, and backend-client use. | `src/frontend/`, `tests/frontend/`. |
| D: Configuration transfer | Portable file content, mapping plans, individual conflicts, resolved previews, and transfer actions. | `src/core/transfer/`, `src/backend/transfer/`, `tests/core/transfer/`, `tests/backend/transfer/`. |

Track A uses Track B's storage adapter interface, not direct Firefox calls.
Track B uses Track A's policy interface and returns sanitized views.
Track D uses Track A's validation and configuration-commit interfaces.
Track C uses the public backend client and never imports native adapters.
Each track supplies action-handler registrations for the integration agent.

The integration agent alone edits the shared registration root.
Each track can propose a registration change in its handoff.
This avoids parallel edits to the same dispatcher file.

## Track A assignment

Implement [protection and settings](02-protection-and-settings.md).
Include selector-safety calculations from the backend PRD.
Keep pure logic free of Firefox and DOM dependencies.
Test scope separation, null fields, canonical matchers, concurrent revisions, and failed writes.

Completion requires RULE-A01 through RULE-A06 and CFG-A01 through CFG-A08.
Provide the policy, validation, and configuration action interfaces to the other tracks.

## Track B assignment

Implement [Firefox backend and burner](03-firefox-backend-and-burner.md).
Also supply backend `getCookies`, `getSiteContext`, and native capability support.
Supply `getSiteCookieDomains`, `saveSiteRule`, and the page observation adapters under the amended contracts.
Use the shared configuration and policy interfaces for quick-protection commits.
Keep every privileged Firefox call within backend paths.

Completion requires BURN-A01 through BURN-A17 and the native adapter evidence.
Current Site completion also requires SITE-A01 through SITE-A12.
Identify every safety case that requires a real Firefox test during integration.

## Track C assignment

Implement [frontend](04-frontend.md).
Use a controlled backend client adapter while backend work is incomplete.
Preserve saved-versus-draft state and every individual import decision.
Provide no alternate GUI path around backend authorization or operation locks.

Completion requires UI-A01 through UI-A25 against the test adapter.
Native integration cases remain required in M2.

## Current Site amendment work packages

Status: Approved; implementation present; release verification incomplete.
The following packages extend existing ownership without assigning parallel edits to shared files.
The [module interfaces](01-module-interfaces.md#current-site-action-contracts) control the new actions and reduced observation events.

| Owner | Work and dependency | Completion evidence |
| --- | --- | --- |
| Integration agent | Freeze new action, paging, token, event, and adapter fixtures before dependent track edits. | ARCH-A09 through ARCH-A11 mapped to controlled fixtures. |
| Track A | Support exact-domain policy views and complete-candidate validation through existing pure interfaces and the mutation queue. | Existing rule and configuration acceptance cases remain valid. |
| Track B | Implement request observation, navigation attribution, session retention, domain selection, and narrow popup saves. Use Track A's commit interface. | SITE-A01 through SITE-A12 and backend action tests. |
| Track C | Build grouped rows, bounded paging, shared rule-form behavior, source selection, and immediate popup Save. Use frozen backend fixtures. | UI-A14 through UI-A25 with preserved Settings draft behavior. |
| Integration agent | Update permissions, static permission checks, background initialization, public client methods, gateway registration, and state events. | Integrated ARCH-A09 through ARCH-A11 and required native cases. |

Track B supplies reduced events before Track C relies on observation coverage.
Track C can use controlled client fixtures while native observation is incomplete.
Track D needs no new transfer format; XFER-03 excludes observation and snapshot metadata.
The integration agent updates implemented-interface documentation only when the new actions actually exist.

Each handoff identifies supplied contracts, acceptance evidence, and remaining Firefox-only checks.
No package is complete merely because its future acceptance cases are documented.
The integration agent verifies redirects, nested frames, navigation, suspension, coverage gaps, and save conflicts in Firefox.
The release owner verifies new permission disclosures and signed-update behavior before release.

## Track D assignment

Implement [configuration transfer](05-configuration-transfer.md).
Keep file calculations pure and settings application inside backend actions.
Require explicit mapping and conflict choices.
Use the shared mutation queue for the final complete-record commit.

Completion requires XFER-A01 through XFER-A14.
Provide frontend fixtures for duplicate names, inactive references, and conflicting scopes.

## Required handoff from each track

Each handoff contains these items.

- Changed paths and public interfaces supplied.
- Acceptance case identifiers and observed results.
- Native tests still required during integration.
- Any contract correction with its reason and affected callers.
- Known defects and exact reproduction steps.

A track is complete only when its assigned behavior and non-native acceptance checks pass.
A stub, demonstration screen, or passing private-function test is not sufficient evidence.

## Milestone M2: Integration

Owner: Integration agent.

1. Register the completed handlers and connect the real backend client.
2. Run all module acceptance cases through their public interfaces.
3. Run cross-profile import and native cookie safety cases.
4. Verify popup closure, cancellation, permission loss, and interruption behavior.
5. Check frontend/backend separation and the zero-dependency requirement.

M2 is complete when every integrated acceptance case passes.
An unresolved protection defect returns the work to its owning track.

## Milestone M3: Signed release readiness

Owner: Integration agent and release owner.

Follow [verification and release](06-verification-and-release.md).
Package native sources, test the signed install, and prepare Mozilla submission information.
M3 is complete when the required evidence and release files are reviewable.
Publishing remains the release owner's action.

## Version 0.1.2 publishing work

Owner: Integration agent, using the existing Track B interfaces.
Follow [publishing](09-publishing-0.1.md), [observation limits](10-bounded-observation.md), and [request limits](11-bounded-requests.md).

1. Freeze the bounded observation adapter and request-capacity contracts.
2. Implement observation limits and mutation admission with their acceptance tests.
3. Update the version, disclosures, reviewer instructions, and release evidence.
4. Run native safety checks, packaging, Mozilla validation, and document checks.
5. Identify signed, platform, and owner-only checks that remain pending.

Preparation completion requires recorded evidence for the implemented amendment cases.
M3 public release completion still requires the existing signed and release-owner gates.

Version `0.1.3` adds startup storage recovery under the existing Track B ownership.
The integration agent updates metadata and release evidence for the patch.
The [publishing requirements](09-publishing-0.1.md) now identify `0.1.3`; earlier `0.1.2` evidence remains historical.
