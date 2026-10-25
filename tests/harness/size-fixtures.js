import { exportPortable } from '../../src/core/transfer/index.js';

// Build valid records at exact portable UTF-8 boundaries, including escaped text.
export function sizedRecord(targetBytes, overrides = {}) {
  const record = {
    schemaVersion: 1, revision: 0, containerBindings: [], protectedContainerRefs: [],
    rules: Array.from({ length: 600 }, (_, index) => ({ domain: 'example.com', includeSubdomains: false, name: `cookie-${index}:"\\é🧁`, path: null, scope: { type: 'all' } })),
    ...overrides
  };
  let remaining = targetBytes - Buffer.byteLength(`${JSON.stringify(exportPortable(record))}\n`);
  if (remaining < 0) throw new Error('Requested fixture is smaller than its initial data.');
  for (const rule of record.rules) {
    const count = Math.min(4096 - [...rule.name].length, remaining);
    rule.name += 'x'.repeat(count);
    remaining -= count;
  }
  if (remaining !== 0) throw new Error('Requested fixture exceeds its valid string capacity.');
  return record;
}
