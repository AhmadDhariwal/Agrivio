const { API_CSRF_HEADER } = require('@agrivio/api-contracts');
const { forbidden, unauthorized } = require('../../platform/errors/app-error');
const { readSessionToken } = require('./auth.cookies');
const { attachAuthContextToRequest } = require('./permission.middleware');
const { isAllowedBrowserOrigin } = require('./cors-origins');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Explicit CORS allowlist with credentials. Credentials are never permitted
 * from arbitrary origins.
 */
function createCorsMiddleware(config) {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin !== '' && isAllowedBrowserOrigin(origin, config)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, Idempotency-Key');
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Max-Age', '600');
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

function createOriginGuardMiddleware(config) {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.headers.origin;
    const referer = req.headers.referer;
    if (typeof origin === 'string' && origin !== '') {
      if (!isAllowedBrowserOrigin(origin, config)) {
        next(forbidden('Origin is not allowed'));
        return;
      }
      next();
      return;
    }

    if (typeof referer === 'string' && referer !== '') {
      try {
        const refererOrigin = new URL(referer).origin;
        if (!isAllowedBrowserOrigin(refererOrigin, config)) {
          next(forbidden('Referer is not allowed'));
          return;
        }
        next();
        return;
      } catch {
        next(forbidden('Referer is not allowed'));
        return;
      }
    }

    if (config.nodeEnv === 'production') {
      next(forbidden('Origin or Referer is required'));
      return;
    }
    next();
  };
}

function createRequireCsrfMiddleware(deps) {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const sessionToken = readSessionToken(req);
    const csrfToken = req.header(API_CSRF_HEADER) ?? undefined;
    void deps.authService
      .assertCsrf(sessionToken, csrfToken)
      .then(() => next())
      .catch((error) => next(error));
  };
}

function createRequireAuthMiddleware(deps) {
  return (req, _res, next) => {
    const sessionToken = readSessionToken(req);
    void deps.authService
      .resolveAuthenticatedSession(sessionToken)
      .then(({ session, user, authContext }) => {
        req.auth = { session, user };
        attachAuthContextToRequest(req, authContext);
        next();
      })
      .catch((error) => next(error));
  };
}

function createOptionalAuthMiddleware(deps) {
  return (req, _res, next) => {
    const sessionToken = readSessionToken(req);
    if (typeof sessionToken !== 'string' || sessionToken === '') {
      next();
      return;
    }
    void deps.authService
      .resolveAuthenticatedSession(sessionToken)
      .then(({ session, user, authContext }) => {
        req.auth = { session, user };
        attachAuthContextToRequest(req, authContext);
        next();
      })
      .catch(() => {
        next();
      });
  };
}

function createAuthTransportMiddleware() {
  return (req, _res, next) => {
    const sessionToken = readSessionToken(req);
    const csrfHeader = req.header(API_CSRF_HEADER);
    const transport = { clientKey: clientKey(req) };
    if (sessionToken !== undefined) {
      transport.sessionToken = sessionToken;
    }
    if (typeof csrfHeader === 'string' && csrfHeader !== '') {
      transport.csrfToken = csrfHeader;
    }
    req.authTransport = transport;
    next();
  };
}

function requireAuthContext(req) {
  const auth = req.auth;
  if (auth === undefined) {
    throw unauthorized('Authentication required');
  }
  return auth;
}

module.exports = {
  createCorsMiddleware,
  createOriginGuardMiddleware,
  createRequireCsrfMiddleware,
  createRequireAuthMiddleware,
  createOptionalAuthMiddleware,
  createAuthTransportMiddleware,
  requireAuthContext,
  clientKey,
};
