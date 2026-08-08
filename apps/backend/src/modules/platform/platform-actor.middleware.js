const { API_PLATFORM_ACTOR_HEADER } = require('@agrivio/api-contracts');
const { forbidden, unauthorized } = require('../../platform/errors/app-error');
const { hasPermission, permissionsForPlatformAccess } = require('../identity/role-permissions');

/**
 * Platform authorization for Super Admin routes.
 * Prefer authenticated platform session context. X-Platform-Actor remains a
 * development/test-only bypass and is impossible in production.
 */
function createPlatformActorMiddleware(config) {
  return (req, _res, next) => {
    const headerValue = req.header(API_PLATFORM_ACTOR_HEADER);

    if (config.nodeEnv === 'production') {
      if (headerValue !== undefined && headerValue.trim() !== '') {
        next(forbidden('X-Platform-Actor is not permitted in production'));
        return;
      }
    } else if (typeof headerValue === 'string' && headerValue.trim() !== '') {
      req.platformActor = {
        actorId: headerValue.trim(),
        permissions: [...permissionsForPlatformAccess('super_admin')],
      };
      next();
      return;
    }

    const auth = req.auth;
    const authContext = req.authContext;

    if (auth === undefined) {
      next(unauthorized('Platform authentication required'));
      return;
    }

    if (authContext?.contextType !== 'platform' && auth.session.activeContextType !== 'platform') {
      next(forbidden('Platform context is required'));
      return;
    }

    if (auth.user['platformAccess'] !== 'super_admin') {
      next(forbidden('Missing platform authorization'));
      return;
    }

    req.platformActor = {
      actorId: String(auth.user['_id']),
      permissions: [...(authContext?.permissions ?? permissionsForPlatformAccess('super_admin'))],
    };
    next();
  };
}

function requirePlatformPermission(permission) {
  return (req, _res, next) => {
    const actor = req.platformActor;
    if (actor === undefined) {
      next(unauthorized('Platform actor is required'));
      return;
    }
    if (!hasPermission(actor.permissions, permission)) {
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
