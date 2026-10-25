export class BiscottyError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'BiscottyError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
export function fail(code, message, details) { throw new BiscottyError(code, message, details); }
export function requireCondition(condition, code, message, details) {
  if (!condition) fail(code, message, details);
}
export const clone = value => structuredClone(value);
export const opaqueId = () => globalThis.crypto.randomUUID();
export const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));
