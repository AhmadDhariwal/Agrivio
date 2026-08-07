// @ts-check
const { API_PLATFORM_ACTOR_HEADER } = require('@agrivio/api-contracts');
const { forbidden, unauthorized } = require('../../platform/errors/app-error');

/**
 * Development/test-only Super Admin actor header.
 * Production must never accept this bypass.
 *
 * @param {{ nodeEnv: 'development' | 'test' | 'production' }} config
 * @returns {import('express').RequestHandler}
 */
function createPlatformActorMiddleware(config) {
  return (req, _res, next) => {
    const headerValue = req.header(API_PLATFORM_ACTOR_HEADER);

    if (config.nodeEnv === 'production') {
      if (headerValue !== undefined && headerValue.trim() !== '') {
        next(forbidden('X-Platform-Actor is not permitted in production'));
        return;
      }
      next(unauthorized('Platform authentication is not available yet'));
      return;
    }

    if (typeof headerValue !== 'string' || headerValue.trim() === '') {
      next(unauthorized('X-Platform-Actor is required outside production until session auth exists'));
      return;
    }

    const actorId = headerValue.trim();
    /** @type {import('express').Request & { platformActor?: { actorId: string; permissions: string[] } }} */
    (req).platformActor = {
      actorId,
      permissions: [
        'platform.organizations.view',
        'platform.organizations.create',
        'platform.organizations.approve',
        'platform.organizations.suspend',
      ],
    };
    next();
  };
}

/**
 * @param {string} permission
 * @returns {import('express').RequestHandler}
 */
function requirePlatformPermission(permission) {
  return (req, _res, next) => {
    const actor = /** @type {{ platformActor?: { actorId: string; permissions: string[] } }} */ (
      req
    ).platformActor;
    if (actor === undefined) {
      next(unauthorized('Platform actor is required'));
      return;
    }
    if (!actor.permissions.includes(permission)) {
      next(forbidden(`Missing permission ${permission}`));
      return;
    }
    next();
  };
}

module.exports = {
  createPlatformActorMiddleware,
  requirePlatformPermission,
};
