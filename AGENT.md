# PRD authoring and maintenance

Use this guide when creating, reviewing, or changing Biscotty PRDs.
Keep requirements and implementation work within the current task scope.

## Read before editing

1. Read the [product PRD](docs/prd/00-product.md) for the approved behavior.
2. Read the affected module PRD and its dependencies from the [index](README.md).
3. Read the [module interfaces](docs/prd/01-module-interfaces.md) before changing shared data or actions.
4. Read the [decision record](docs/prd/08-decisions.md) before changing an existing requirement.
5. Follow the [language rules](docs/prd/LANGUAGE.md) and [glossary](GLOSSARY.md).

Identify the affected requirements, callers, and acceptance cases before editing.
Use the current user instruction as authorization for its stated changes.
Keep unrelated approved behavior unchanged.

## Write a PRD

Keep each module PRD focused on one assigned responsibility.
Use the existing file sequence and structure when adding a related document.
Give a new PRD the following information.

| Part | Required content |
| --- | --- |
| Status | Actual approval or implementation status, without an assumed approval. |
| Ownership | Responsible track and its assigned files. |
| Dependencies | Linked requirements and interfaces needed before the work can proceed. |
| Purpose and scope | User outcome, included behavior, and relevant exclusions. |
| Interfaces | Inputs, outputs, errors, ordering rules, and invariants. |
| Requirements | Individually verifiable results with stable identifiers. |
| Failure behavior | Recovery, cancellation, privacy, and concurrency rules where relevant. |
| Acceptance criteria | Observable results with stable case identifiers. |
| Completion evidence | Required checks and handoff information. |

Use MUST for required behavior and MUST NOT for prohibited behavior.
State the actor, condition, and required result directly.
Keep one verifiable obligation in each requirement.
Describe examples as examples, not additional hidden requirements.

Use descriptive sentences of at most 25 words.
Use procedural sentences of at most 20 words.
Keep each paragraph on one topic with no more than six sentences.
Preserve exact Firefox identifiers and file-format values.
Use the technical term register for specialized language.

Define product terms in the glossary instead of inventing synonyms in individual PRDs.
Keep implementation details outside glossary definitions.
Put shared contracts in the interface document instead of repeating them across module PRDs.

## Manage identifiers and decisions

Preserve existing requirement and acceptance identifiers.
Assign the next unused identifier within the relevant prefix.
Use `PREFIX-01` for requirements and `PREFIX-A01` for acceptance cases.
Keep each identifier unique across the package.

When retiring a requirement, record its replacement or removal reason.
Do not reuse its identifier for different behavior.
Update affected acceptance cases and references with the same change.

Separate verified platform facts from product decisions.
Check API facts against current primary Mozilla sources.
Record source links and check dates in [SOURCES.md](docs/prd/SOURCES.md).
Label a design inference instead of presenting it as a Firefox guarantee.

Record changed product decisions in [08-decisions.md](docs/prd/08-decisions.md).
Mark superseded proposals clearly.
Record unresolved product choices with their affected work.
Continue independent work while a dependent decision remains unresolved.

## Keep the package consistent

| Change | Documents to review |
| --- | --- |
| Product behavior | Product PRD, affected module PRDs, decision record, and acceptance cases. |
| Shared interface or schema | Module interfaces, affected producers and callers, examples, and acceptance cases. |
| Product terminology | Glossary and every affected document. |
| Agent assignment or dependency | Agent work plan and affected module ownership. |
| New or renamed document | README index and every affected link. |
| Completed document review | REVIEW.md, including current counts and actual check results. |

The product PRD controls behavior.
The interface document controls shared action and data names.
Resolve a contradiction in the documents before implementing dependent behavior.

Keep Firefox access and action execution in backend modules.
Keep GUI behavior in frontend modules that call the backend client.
Keep pure logic independent of Firefox and the DOM.
Preserve the zero-external-library requirement when describing builds or tests.

For work assigned to several agents, use the [agent work plan](docs/prd/07-agent-plan.md).
Define shared interfaces before parallel edits.
Assign separate file ownership, dependencies, completion criteria, and handoff evidence.

## Verify and report

1. Check local file links and heading anchors.
2. Check identifier uniqueness and all affected requirement references.
3. Parse JSON examples and check their fields, references, and stated meaning.
4. Check sentence lengths, paragraph lengths, terminology, and Markdown structure.
5. Check whitespace and final newlines, including untracked files.
6. Review affected decisions and interfaces for contradictions.
7. Update the review record with the checks actually completed.

Mechanical checks do not prove complete ASD-STE100 conformance.
State vocabulary or grammatical-role review limits honestly.
Keep future acceptance cases separate from tests that have actually passed.
Report changed documents, completed checks, and any remaining limitation.
