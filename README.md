# Biscotty

Biscotty is a Firefox cookie manager.
This repository contains the native Firefox extension and approved requirements for version 1.
Implementation uses JavaScript, HTML, CSS, and Firefox APIs with no external libraries.
Release acceptance remains incomplete; see the [verification record](docs/implementation/verification.md).

The user approved the design on 25 October 2026.
The requirements use ASD-STE100 Issue 9 as their writing standard.
See the [language rules](docs/prd/LANGUAGE.md) and the [document review](docs/prd/REVIEW.md) for the review limits.

## Read the requirements

| Document | Use |
| --- | --- |
| [PRD authoring guide](AGENT.md) | Write and maintain requirements, decisions, interfaces, and acceptance cases. |
| [Product PRD](docs/prd/00-product.md) | Read the product scope and the required behavior. |
| [Module interfaces](docs/prd/01-module-interfaces.md) | Read the frontend, backend, and pure logic contracts before implementation. |
| [Protection and settings PRD](docs/prd/02-protection-and-settings.md) | Implement cookie rules and configuration storage. |
| [Firefox backend and burner PRD](docs/prd/03-firefox-backend-and-burner.md) | Implement Firefox access and safe deletion. |
| [Frontend PRD](docs/prd/04-frontend.md) | Implement the toolbar menu and configuration editor. |
| [Configuration transfer PRD](docs/prd/05-configuration-transfer.md) | Implement portable export, import, mapping, and conflict decisions. |
| [Verification and release PRD](docs/prd/06-verification-and-release.md) | Verify the extension and prepare a signed release. |
| [Agent work plan](docs/prd/07-agent-plan.md) | Assign work, respect file ownership, and integrate the modules. |
| [Decision record](docs/prd/08-decisions.md) | Trace each design decision to its requirements. |
| [Glossary](GLOSSARY.md) | Use the agreed product terms. |
| [Sources](docs/prd/SOURCES.md) | Check Firefox constraints and language sources. |

## Run and package

Firefox desktop 153.0 or later is required. Private browsing is excluded.
Open `about:debugging#/runtime/this-firefox` in a disposable Firefox profile.
Select **Load Temporary Add-on**, then choose `manifest.json`.
Grant HTTP and HTTPS access and keep Firefox containers enabled.
Use the Biscotty toolbar button to preview a burn or open Settings.

The initial allow list and protected-container set are empty.
Review protection before confirming a burn. Burning can sign you out, and websites can recreate cookies.

No dependency installation or bundler is required. Use Node.js 22 or later:

```sh
npm test
npm run check
npm run package
```

The unsigned package is `dist/biscotty-1.0.0.zip`, with a SHA-256 file beside it.
See [release preparation](docs/implementation/release.md) for packaging, permissions, and submission information.
See [native test instructions](docs/implementation/verification.md#run-native-tests) for disposable Firefox tests.

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/core/` | Pure validation, matching, selector safety, and transfer calculations. |
| `src/backend/` | Firefox adapters, gateway, queued settings, burner, transfer, and public client. |
| `src/frontend/` | Toolbar popup and full-page configuration editor. |
| `tests/` | Standard-library tests, controlled adapters, and disposable native Firefox checks. |
| `scripts/` | Static checks and deterministic native-source packaging. |

The implementation follows the [agent plan](docs/prd/07-agent-plan.md) and [shared contracts](docs/implementation/interfaces.md).
The backend owns every Firefox API call. GUI code uses the public backend client.
The extension initiates no network requests, collects no telemetry, and retains no operation history.

## Requirement words

MUST identifies a required result.
MUST NOT identifies a prohibited result.
An example explains a requirement; it does not replace that requirement.

The product PRD controls product behavior.
The module interfaces control shared data and action names.
Record and correct a document conflict before dependent implementation.
