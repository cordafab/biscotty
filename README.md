# Biscotty requirements

Biscotty is a Firefox cookie manager.
This repository contains the product requirements for version 1.
It does not contain extension implementation code.

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

## Start implementation

Read the product PRD, glossary, module interfaces, and assigned module PRD.
Complete the shared foundation before parallel implementation.
Then use the four work tracks in the agent work plan.

Future source paths define ownership only.
They do not indicate that those files already exist.

The implementation MUST use native Firefox APIs and standard platform features.
The frontend MUST call the backend through its documented interface.
The backend MUST contain no GUI code.

## Requirement words

MUST identifies a required result.
MUST NOT identifies a prohibited result.
An example explains a requirement; it does not replace that requirement.

The product PRD controls product behavior.
The module interfaces control shared data and action names.
Record and correct a document conflict before dependent implementation.
