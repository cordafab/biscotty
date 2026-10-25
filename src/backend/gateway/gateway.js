import { BiscottyError } from '../../core/errors.js';
export const ACTIONS = Object.freeze(['getState', 'getCookies', 'getSiteContext', 'setSiteProtection', 'saveConfiguration', 'previewBurn', 'startBurn', 'cancelBurn', 'dismissOperation', 'prepareExport', 'inspectImport', 'planImport', 'resolveImport', 'commitImport', 'openOptions', 'requestHostAccess']);
const revisions = new Set(['setSiteProtection', 'saveConfiguration', 'previewBurn', 'startBurn', 'prepareExport', 'inspectImport', 'planImport', 'resolveImport', 'commitImport']);
const mutations = new Set(['setSiteProtection', 'saveConfiguration', 'startBurn', 'commitImport']);
const recoveryActions = new Set(['inspectImport', 'planImport', 'resolveImport', 'commitImport']);
export function createGateway({ extensionId, baseURL, handlers }) {
  const requests = new Map();
  return async function dispatch(request, sender) {
    const response = { protocolVersion: 1, requestId: typeof request?.requestId === 'string' ? request.requestId : '' };
    try {
      const allowedPages = ['src/frontend/popup.html', 'src/frontend/options.html'];
      const owner = sender?.url;
      if (sender?.id !== extensionId || !allowedPages.some(path => owner === new URL(path, baseURL).href) || sender?.tab?.incognito) {
        throw new BiscottyError('INVALID_REQUEST', 'Only Biscotty pages can use this action.');
      }
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
      const key = JSON.stringify([owner, request.requestId]);
      const fingerprint = JSON.stringify(request);
      if (requests.has(key)) {
        const cached = requests.get(key);
        if (cached.fingerprint !== fingerprint) throw new BiscottyError('INVALID_REQUEST', 'A request identifier cannot be reused.');
        return await cached.result;
      }
      const result = Promise.resolve().then(() => handler(request.payload, { ...request, owner, sender })).then(data => ({ ...response, ok: true, data }));
      if (mutations.has(request.action)) {
        if (requests.size >= 10000) throw new BiscottyError('INVALID_REQUEST', 'Close and reopen Biscotty before sending more changes.');
        requests.set(key, { fingerprint, result });
      }
      return await result;
    } catch (error) {
      const safe = error instanceof BiscottyError || (typeof error?.code === 'string' && /^[A-Z_]+$/.test(error.code));
      return { ...response, ok: false, error: safe ? { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } : { code: 'INTERNAL_FAILURE', message: 'The action could not finish. Refresh and try again.' } };
    }
  };
}
