import { fail, opaqueId } from '../../core/errors.js';
export function createHandles({ ttl = 15 * 60 * 1000, limit = 64 } = {}) {
  const entries = new Map();
  return {
    issue(kind, owner, data) {
      const token = opaqueId();
      for (const [key, value] of entries) if (value.expires <= Date.now()) entries.delete(key);
      while (entries.size >= limit) entries.delete(entries.keys().next().value);
      entries.set(token, { kind, owner, data, expires: Date.now() + ttl });
      return token;
    },
    get(token, kind, owner, code = 'INVALID_REQUEST') {
      const entry = entries.get(token);
      if (!entry || entry.kind !== kind || entry.owner !== owner || entry.expires <= Date.now()) {
        fail(code, 'This view has expired. Refresh and try again.');
      }
      return entry.data;
    },
    remove(token) { entries.delete(token); },
    invalidate(kind) { for (const [key, value] of entries) if (!kind || value.kind === kind) entries.delete(key); }
  };
}
