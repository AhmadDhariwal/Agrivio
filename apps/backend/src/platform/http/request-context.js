// @ts-check
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * @typedef {{
 *   requestId: string;
 *   organizationId?: string;
 * }} RequestContext
 */

/** @type {AsyncLocalStorage<RequestContext>} */
const storage = new AsyncLocalStorage();

/**
 * @param {RequestContext} context
 * @param {() => void} fn
 */
export function runWithRequestContext(context, fn) {
  storage.run(context, fn);
}

/**
 * @returns {RequestContext | undefined}
 */
export function getRequestContext() {
  return storage.getStore();
}

/**
 * @returns {string | undefined}
 */
export function getRequestId() {
  return storage.getStore()?.requestId;
}
