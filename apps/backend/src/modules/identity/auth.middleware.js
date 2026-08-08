const { API_CSRF_HEADER } = require('@agrivio/api-contracts');
const { forbidden, unauthorized } = require('../../platform/errors/app-error');
const { readSessionToken } = require('./auth.cookies');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function clientKey(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Validate Origin/Referer for browser-originated state-changing requests.
 */
function createOriginGuardMiddleware(config) {
  const allowed = new Set(
    config.allowedOrigins ??
      (config.nodeEnv === 'production'
        ? []
        : [
            'http://localhost:4200',
            'http://127.0.0.1:4200',
            'http://localhost:3000',
            'http://127.0.0.1:3000',
          ]),
  );

  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();
      return;
    }

    const origin = req.headers.origin;
    const referer = req.headers.referer;
    if (typeof origin === 'string' && origin !== '') {
      if (allowed.size > 0 && !allowed.has(origin)) {
        next(forbidden('Origin is not allowed'));
        return;
      }
      next();
      return;
    }

    if (typeof referer === 'string' && referer !== '') {
      try {
        const refererOrigin = new URL(referer).origin;
        if (allowed.size > 0 && !allowed.has(refererOrigin)) {
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

    // Non-browser clients (focused tests / tooling) may omit Origin when not production.
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
      .then(({ session, user }) => {
        req.auth = { session, user };
        next();
      })
      .catch((error) => next(error));
  };
}

/**
 * Load authenticated session when present; do not fail when absent.
 * Used so development platform-actor bypass can co-exist with real sessions.
 */
function createOptionalAuthMiddleware(deps) {
  return (req, _res, next) => {
    const sessionToken = readSessionToken(req);
    if (typeof sessionToken !== 'string' || sessionToken === '') {
      next();
      return;
    }
    void deps.authService
      .resolveAuthenticatedSession(sessionToken)
      .then(({ session, user }) => {
        req.auth = { session, user };
        next();
      })
      .catch(() => {
        // Invalid cookie should not block the optional path; protected handlers decide.
        next();
      });
  };
}

/**
 * Attach request auth transport helpers.
 */
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
  createOriginGuardMiddleware,
  createRequireCsrfMiddleware,
  createRequireAuthMiddleware,
  createOptionalAuthMiddleware,
  createAuthTransportMiddleware,
  requireAuthContext,
  clientKey,
};
