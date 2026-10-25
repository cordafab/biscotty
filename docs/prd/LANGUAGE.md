# Language rules

The writing target is ASD-STE100 Issue 9.
These rules apply to PRDs, acceptance criteria, and agent instructions.
Product GUI text uses concise English; it does not require separate STE certification.

## Writing controls

1. Use one meaning for each product term.
2. Use the [glossary](../../GLOSSARY.md) for product nouns.
3. Use direct verbs and explicit subjects.
4. Keep descriptive sentences at 25 words or fewer.
5. Keep procedural sentences at 20 words or fewer.
6. Give one instruction in each procedural sentence.
7. Keep each paragraph on one topic with no more than six sentences.
8. Use MUST for required behavior.
9. Preserve exact identifiers and file-format values.
10. Review vocabulary, grammatical role, and approved meaning separately from sentence length.

Requirement and acceptance identifiers are references, not prose words.
Tables contain concise fragments where a complete sentence would repeat the column meaning.
JSON examples contain data, not natural-language instructions.
URLs, paths, and exact native identifiers retain their required spelling.

## Technical noun register

Product technical nouns are defined in the glossary.
The following additional technical nouns have fixed meanings in this package.

| Technical noun | Meaning |
| --- | --- |
| API | A named platform programming interface. |
| Firefox API | A native Firefox extension programming interface. |
| Backend | The modules that own privileged platform access and core action execution. |
| Frontend | The modules that own the GUI and call the backend client. |
| Pure logic | Computation without external effects or GUI access. |
| Module | An interface with its implementation. |
| Interface | The inputs, outputs, ordering rules, errors, and invariants known to a caller. |
| Adapter | An implementation that satisfies an interface for a particular environment. |
| GUI | Graphical user interface. |
| DOM | The browser document object model. |
| Manifest V3 | Firefox's extension manifest format, version 3. |
| Event page | A nonpersistent Firefox background execution document. |
| Configuration revision | A value that identifies a committed settings version. |
| Canonical matcher | The normalized domain, subdomain option, name, and path used to identify one rule. |
| Opaque handle | A reference whose internal contents are not interpreted by its caller. |
| Mutation queue | The ordered path through which configuration changes are committed. |
| Sender | The extension or page context that submitted a native message. |
| Payload | The data supplied to a backend action. |
| Host permission | Firefox access granted for matching website addresses. |
| JSON | The configuration and message data notation used by the product. |
| Schema | The permitted fields, types, values, and relationships of a data record. |
| UTF-8 | The text encoding used by configuration files and size checks. |
| Unicode | The character system used for text. |
| IDNA | The standard treatment of international domain names. |
| Punycode | The ASCII representation used for international domain labels. |
| Prototype | A JavaScript object inheritance mechanism. |
| Fixture | Controlled data or a controlled environment used in a test. |
| Test harness | The native functions that execute and report test cases. |
| MiB | A data-size unit equal to 1,048,576 bytes. |

Exact software names, API members, enum values, and future paths are technical identifiers.
Their spelling comes from their native contract or the module interface document.
Do not rewrite those identifiers to imitate ordinary English.

## Technical verb register

| Technical verb | Fixed computing meaning |
| --- | --- |
| Canonicalize | Convert equivalent data to the agreed comparison form. |
| Normalize | Apply the stated field-format rules without changing intended meaning. |
| Parse | Convert text into data according to its format. |
| Serialize | Convert structured data into its defined stored or transferred representation. |
| Deduplicate | Remove equivalent repeated data while preserving its defined effect. |
| Revalidate | Repeat the specified validation against current state. |
| Render | Produce the visible document representation from frontend state. |
| Dispatch | Select the registered action handler for a validated request. |
| Rebind | Change an inactive extension reference to an explicitly selected available container. |

These verbs describe established software operations.
Use an ordinary approved verb when it expresses the same meaning clearly.

## Review method and limits

Mechanical checks cover sentence length, local links, requirement identifiers, and basic Markdown structure.
Editorial review covers short sentences, direct requirements, consistent terms, and separation of instructions from description.
The source constraints are recorded in [primary sources](SOURCES.md#s19-asd-ste100).

The package targets Issue 9 conformance.
It does not claim independent certification or exhaustive dictionary verification.
Mechanical checks alone cannot establish full ASD-STE100 conformance.
See the [document review](REVIEW.md) for the checks actually completed.
