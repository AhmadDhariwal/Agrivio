// @ts-check
import { forbidden, unauthorized } from '../../../platform/errors/app-error.js';

/**
 * Platform permission guard middleware.
 * Reads the platform actor context injected by createPlatformAuthMiddleware.
 * Denies requests that lack the required platform permission code.
 *
 * NOTE: This middleware reads actor identity from `req.platformActor` which
 * is populated by the session auth middleware (R1-F02-003). Until full session
 * management is implemented, tests inject the actor directly.
 *
 * @param {string} requiredPermission
 * @returns {import('express').RequestHandler}
 */
export function requirePlatformPermission(requiredPermission) {
  return (req, res, next) => {
    const actor = /** @type {PlatformActor | undefined} */ (
      /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (req))['platformActor']
    );

    if (actor === undefined || actor === null) {
      return next(unauthorized('Platform authentication required'));
    }

    if (!actor.isPlatformUser) {
      return next(forbidden('Access denied: platform context required'));
    }

    if (!actor.platformPermissions.includes(requiredPermission)) {
      return next(forbidden(`Access denied: missing permission '${requiredPermission}'`));
    }

    return next();
  };
}

/**
 * @typedef {{
 *   userId: string;
 *   isPlatformUser: boolean;
 *   platformPermissions: string[];
 * }} PlatformActor
 */

/**
 * Development / test middleware: populates `req.platformActor` from a
 * `X-Platform-Actor` JSON header. Disabled in production.
 *
 * IMPORTANT: Replace this with the real session-based extraction in R1-F02-003.
 *
 * @param {{ nodeEnv: string }} config
 * @returns {import('express').RequestHandler}
 */
export function createDevPlatformActorMiddleware(config) {
  return (req, _res, next) => {
    if (config.nodeEnv === 'production') {
      return next();
    }

    const headerValue = req.headers['x-platform-actor'];
    if (typeof headerValue === 'string') {
      try {
        const parsed = JSON.parse(headerValue);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          typeof parsed.userId === 'string' &&
          typeof parsed.isPlatformUser === 'boolean' &&
          Array.isArray(parsed.platformPermissions)
        ) {
          /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (req))['platformActor'] = {
            userId: parsed.userId,
            isPlatformUser: parsed.isPlatformUser,
            platformPermissions: parsed.platformPermissions,
          };
        }
      } catch {
        // Malformed header: ignore, auth check will reject
      }
    }

    return next();
  };
}

/**
 * Extract the authenticated platform actor from a request.
 * Throws if not present.
 * @param {import('express').Request} req
 * @returns {PlatformActor}
 */
export function requirePlatformActor(req) {
  const actor = /** @type {PlatformActor | undefined} */ (
    /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (req))['platformActor']
  );
  if (actor === undefined) {
    throw unauthorized('Platform authentication required');
  }
  return actor;
}
