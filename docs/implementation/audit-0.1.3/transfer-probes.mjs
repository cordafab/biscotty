import { validateConfiguration } from '../../../src/core/configuration/index.js';
import { parsePortableText, validatePortable, serializePortable, exportPortable } from '../../../src/core/transfer/index.js';
import { createApplication } from '../../../src/backend/gateway/application.js';
import { createTestAdapter } from '../../../tests/harness/adapter.js';
import { createClient } from '../../../src/backend/client/client.js';
import { createImportModel } from '../../../src/frontend/models.js';

const facts = Object.create(null);
const rules = Array.from({ length: 10000 }, (_, index) => {
  const domain = `a${index}.example.com`;
  facts[domain] = { host: domain, kind: 'dns', knownSuffix: false, baseDomain: 'example.com' };
  return { domain, includeSubdomains: false, name: null, path: null, scope: { type: 'selected', storeRefs: ['normal'] } };
});
const record = validateConfiguration({ schemaVersion: 1, revision: 1, containerBindings: [], protectedContainerRefs: [], rules }, facts);
const exportProbe = {
  validatedRuleCount: record.rules.length,
  editableBytes: Buffer.byteLength(JSON.stringify({ rules, protectedContainerRefs: [] })),
  compactPortableBytes: Buffer.byteLength(JSON.stringify(exportPortable(record))),
  prettyPortableBytes: Buffer.byteLength(`${JSON.stringify(exportPortable(record), null, 2)}\n`),
  limitBytes: 2 * 1024 * 1024
};
try {
  exportProbe.exportBytes = Buffer.byteLength(serializePortable(record));
  exportProbe.exportSucceeded = true;
} catch (error) {
  exportProbe.exportSucceeded = false;
  exportProbe.error = { name: error.name, code: error.code, message: error.message };
}

const raw = { format: 'biscotty-config', schemaVersion: 1, containers: [{ ref: '__proto__', name: 'Work', color: 'blue', icon: 'briefcase', state: 'active' }], protectedContainerRefs: ['__proto__'], rules: [] };
const validated = validatePortable(parsePortableText(JSON.stringify(raw)), {});
const importer = createImportModel({}, {});
const prototypeReferenceProbe = { validationSucceeded: true, acceptedReference: validated.containers[0].ref, choices: [] };
for (const value of ['retain', 'exclude', 'map:target']) {
  importer.mappingChoices.__proto__ = value;
  const result = { selectedValue: value, hasOwnMapping: Object.hasOwn(importer.mappingChoices, '__proto__'), storedValueType: typeof importer.mappingChoices.__proto__ };
  try {
    result.mappings = validated.containers.map(container => {
      const choice = importer.mappingChoices[container.ref];
      return { sourceRef: container.ref, action: choice.startsWith('map:') ? 'map' : choice, ...(choice.startsWith('map:') ? { targetRef: choice.slice(4) } : {}) };
    });
    result.mappingSucceeded = true;
  } catch (error) {
    result.mappingSucceeded = false;
    result.error = { name: error.name, message: error.message };
  }
  prototypeReferenceProbe.choices.push(result);
}
const adapter = createTestAdapter({ catalog: { normalStoreId: 'firefox-default', containers: [] } });
const app = createApplication(adapter, { extensionId: 'audit@test', baseURL: 'moz-extension://audit/' });
const client = createClient({ send: request => app.dispatch(request, { id: 'audit@test', url: 'moz-extension://audit/src/frontend/options.html', documentId: 'audit-document' }) });
const state = await client.getState();
const saved = await client.saveConfiguration({ rules, protectedContainerRefs: [], inactiveDecisions: [] }, state.revision);
const publicExportProbe = { saveSucceeded: true, revision: saved.revision };
try { await client.prepareExport({}, saved.revision); publicExportProbe.exportSucceeded = true; }
catch (error) { publicExportProbe.exportSucceeded = false; publicExportProbe.error = { code: error.code, message: error.message }; }
console.log(JSON.stringify({ exportProbe, publicExportProbe, prototypeReferenceProbe }, null, 2));
