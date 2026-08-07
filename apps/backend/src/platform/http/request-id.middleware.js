// @ts-check
const { API_REQUEST_ID_HEADER } = require('@agrivio/api-contracts');
const { getRequestContext, runWithRequestContext } = require('./request-context');
const { resolveRequestId } = require('./request-id');
/**
 * Generates or accepts a valid request id, stores it on the response, and binds request context.
 * @returns {import('express').RequestHandler}
 */
function createRequestIdMiddleware() {
  return (req, res, next) => {
    const headerValue = req.header(API_REQUEST_ID_HEADER) ?? undefined;
    const requestId = resolveRequestId(headerValue);

    res.setHeader(API_REQUEST_ID_HEADER, requestId);
    res.locals['requestId'] = requestId;
    /** @type {import('express').Request & { requestId: string }} */ (req).requestId = requestId;

    runWithRequestContext({ requestId }, () => {
      next();
    });
  };
}

/**
 * @param {import('express').Response} [res]
 * @returns {string}
 */
function requireRequestIdFromContext(res) {
  const fromContext = getRequestContext()?.requestId;
  if (fromContext !== undefined) {
    return fromContext;
  }

  if (res !== undefined) {
    const fromLocals = res.locals['requestId'];
    if (typeof fromLocals === 'string') {
      return fromLocals;
    }
  }

  throw new Error('Request id is unavailable outside the request pipeline');
}

module.exports = {
  createRequestIdMiddleware,
  requireRequestIdFromContext,
};
