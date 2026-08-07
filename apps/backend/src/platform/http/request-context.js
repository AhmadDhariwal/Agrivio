// @ts-check
const { AsyncLocalStorage } = require('node:async_hooks');
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
function runWithRequestContext(context, fn) {
  storage.run(context, fn);
}

/**
 * @returns {RequestContext | undefined}
 */
function getRequestContext() {
  return storage.getStore();
}

/**
 * @returns {string | undefined}
 */
function getRequestId() {
  return storage.getStore()?.requestId;
}

module.exports = {
  runWithRequestContext,
  getRequestContext,
  getRequestId,
};
