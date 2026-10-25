export const emptyRecord = () => ({ schemaVersion: 1, revision: 0, containerBindings: [], protectedContainerRefs: [], rules: [] });
export const rule = (overrides = {}) => ({ domain: 'example.com', includeSubdomains: true, name: null, path: null, scope: { type: 'all' }, ...overrides });
export const sender = { id: 'biscotty@test', url: 'moz-extension://test/src/frontend/options.html' };
export const envelope = (action, payload = {}, expectedRevision = 0) => ({ protocolVersion: 1, requestId: crypto.randomUUID(), action, payload, expectedRevision });
