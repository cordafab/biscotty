import { BiscottyError } from '../../core/errors.js';
export const ACTIONS = Object.freeze(['getState', 'getCookies', 'getSiteContext', 'getSiteCookieDomains', 'saveSiteRule', 'setSiteProtection', 'saveConfiguration', 'previewBurn', 'startBurn', 'cancelBurn', 'dismissOperation', 'prepareExport', 'inspectImport', 'planImport', 'resolveImport', 'commitImport', 'openOptions', 'requestHostAccess']);
const revisions = new Set(['saveSiteRule', 'setSiteProtection', 'saveConfiguration', 'previewBurn', 'startBurn', 'prepareExport', 'inspectImport', 'planImport', 'resolveImport', 'commitImport']);
const mutations = new Set(['saveSiteRule', 'setSiteProtection', 'saveConfiguration', 'startBurn', 'commitImport']);
const recoveryActions = new Set(['inspectImport', 'planImport', 'resolveImport', 'commitImport']);
export const REQUEST_LIMITS = Object.freeze({ entries: 128, bytes: 8 * 1024 * 1024, ttl: 15 * 60 * 1000 });
const encodedSize = value => new TextEncoder().encode(JSON.stringify(value)).length;
const errorResponse = (response, error) => {
  const safe = error instanceof BiscottyError || (typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code));
  return { ...response, ok: false, error: safe ? { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } : { code: 'INTERNAL_FAILURE', message: 'The action could not finish. Refresh and try again.' } };
};
export function createGateway({ extensionId, baseURL, handlers, limits = REQUEST_LIMITS, now = Date.now }) {
  const requests = new Map();
  let retainedBytes = 0;
  function remove(key) { const entry = requests.get(key); clearTimeout(entry.timer); retainedBytes -= entry.bytes; requests.delete(key); }
  function reserve(bytes) {
    for (const [key, entry] of requests) if (!entry.pending && entry.expires <= now()) remove(key);
    for (const [key, entry] of requests) {
      if (requests.size < limits.entries && retainedBytes + bytes <= limits.bytes) break;
      if (!entry.pending) remove(key);
    }
    if (requests.size >= limits.entries || retainedBytes + bytes > limits.bytes) throw new BiscottyError('REQUEST_CAPACITY', 'Too many changes are pending. Wait for them to finish and try again.');
  }
  return async function dispatch(request, sender) {
    const response = { protocolVersion: 1, requestId: typeof request?.requestId === 'string' ? request.requestId : '' };
    try {
      const allowedPages = ['src/frontend/popup.html', 'src/frontend/options.html'];
      const pageURL = sender?.url;
      if (sender?.id !== extensionId || !allowedPages.some(path => pageURL === new URL(path, baseURL).href) || sender?.tab?.incognito) {
        throw new BiscottyError('INVALID_REQUEST', 'Only Biscotty pages can use this action.');
      }
      const owner = JSON.stringify([pageURL, sender.documentId ?? null, sender.tab?.id ?? null, sender.frameId ?? null]);
      if (!request || request.protocolVersion !== 1 || typeof request.requestId !== 'string' || !request.requestId || request.requestId.length > 128 || !ACTIONS.includes(request.action) || !request.payload || typeof request.payload !== 'object' || Array.isArray(request.payload)) {
        throw new BiscottyError('INVALID_REQUEST', 'The request is invalid.');
      }
      const wireLimit = request.action === 'inspectImport' ? 12 * 1024 * 1024 + 65536 : 2 * 1024 * 1024 + 65536;
      if (new TextEncoder().encode(JSON.stringify(request)).length > wireLimit) throw new BiscottyError('VALIDATION_FAILED', 'The request exceeds the size limit.');
      if (request.action === 'inspectImport' && (typeof request.payload.text !== 'string' || new TextEncoder().encode(request.payload.text).length > 2 * 1024 * 1024)) throw new BiscottyError('VALIDATION_FAILED', 'The import text exceeds the 2 MiB limit.');
      if (revisions.has(request.action) && !(Number.isSafeInteger(request.expectedRevision) && request.expectedRevision >= 0) && !(recoveryActions.has(request.action) && request.expectedRevision === null && typeof request.payload.recoveryToken === 'string')) {
        throw new BiscottyError('INVALID_REQUEST', 'A saved configuration revision is required.');
      }
      const handler = handlers[request.action];
      if (!handler) throw new BiscottyError('INVALID_REQUEST', 'The action is unavailable.');
      if (!mutations.has(request.action)) return { ...response, ok: true, data: await handler(request.payload, { ...request, owner, sender }) };
      const key = JSON.stringify([owner, request.requestId]);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(request)));
      const fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      const prior = requests.get(key);
      if (prior && !prior.pending && prior.expires <= now()) remove(key);
      if (requests.has(key)) {
        const cached = requests.get(key);
        if (cached.fingerprint !== fingerprint) throw new BiscottyError('INVALID_REQUEST', 'A request identifier cannot be reused.');
        return await cached.result;
      }
      // Reserve the largest production response before scheduling any side effect.
      const metadataBytes = encodedSize([key, fingerprint]) + 128;
      const bytes = metadataBytes + (request.action === 'saveConfiguration' ? wireLimit : 4096);
      reserve(bytes);
      const entry = { fingerprint, bytes, pending: true, expires: Infinity, result: null };
      requests.set(key, entry);
      retainedBytes += bytes;
      entry.result = Promise.resolve().then(() => handler(request.payload, { ...request, owner, sender }))
        .then(data => ({ ...response, ok: true, data }), error => errorResponse(response, error))
        .then(result => {
          retainedBytes -= entry.bytes;
          entry.bytes = metadataBytes + encodedSize(result);
          retainedBytes += entry.bytes;
          entry.pending = false;
          entry.expires = now() + limits.ttl;
          // Unexpected oversized replies are returned, but never pinned in the cache.
          if (entry.bytes > bytes) remove(key);
          else {
            entry.timer = setTimeout(() => { if (requests.get(key) === entry) remove(key); }, limits.ttl);
            entry.timer.unref?.();
          }
          return result;
        });
      return await entry.result;
    } catch (error) {
      return errorResponse(response, error);
    }
  };
}
