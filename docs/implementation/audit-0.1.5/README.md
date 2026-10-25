# Version 0.1.5 verification evidence

See the [correction record](../publication-fixes-0.1.5.md) for the fixes, checks, and remaining release limits.
The [original audit](../audit-0.1.4/README.md) retains the original failures.

| Evidence | File |
| --- | --- |
| Automated tests | [node-tests.tap](node-tests.tap) |
| Static check | [source-check.txt](source-check.txt) |
| Package build | [package-build.txt](package-build.txt) |
| Package integrity and source comparison | [run-summary.json](run-summary.json) |
| Mozilla validator | [mozilla-validator.json](mozilla-validator.json) |
| Original spec probes after correction | [spec-results.json](spec-results.json) |
| Independent standards probes | [standards-results.json](standards-results.json) |
| Native Firefox, default privacy | [native-default-results.json](native-default-results.json) |
| Native Firefox, first-party isolation and import | [native-fpi-results.json](native-fpi-results.json) |
| Document verification | [document-checks.json](document-checks.json) |

The audit probe scripts accept an optional output path to preserve the historical results.
The spec fixture now supplies native document identity through the amended adapter interface.
The Node.js regression tests cover matching restoration as well as rejection, preventing a discard-everything implementation from passing.

```sh
npm test
npm run check
npm run package
node docs/implementation/audit-0.1.4/spec-probes.mjs docs/implementation/audit-0.1.5/spec-results.json
node docs/implementation/audit-0.1.4/standards-probes.mjs docs/implementation/audit-0.1.5/standards-results.json
python3 tests/native/firefox.py --export-file /tmp/biscotty-0.1.5-export.json
python3 tests/native/firefox.py --fpi --import-file /tmp/biscotty-0.1.5-export.json
addons-linter --output=json --pretty --warnings-as-errors dist/biscotty-0.1.5.zip
```
