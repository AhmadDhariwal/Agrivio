const { Router } = require('express');
const {
  API_AUDIT_EVENTS_PATH,
  API_PLATFORM_AUDIT_EVENTS_PATH,
} = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const {
  createPlatformActorMiddleware,
  requirePlatformPermission,
} = require('../../platform/platform-actor.middleware');
const { createAuditController } = require('../controllers/audit.controller');

function registerAuditRoutes(deps) {
  const router = Router();
  const controller = createAuditController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const platformActor = createPlatformActorMiddleware(deps.config);
  const optionalAuth = deps.optionalAuth ?? ((_req, _res, next) => next());

  router.get(
    API_AUDIT_EVENTS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('audit.view'),
    deps.requireSuspendedReadAccess,
    (req, res, next) => {
      void controller.listOrganization(req, res, next);
    },
  );

  router.get(
    `${API_AUDIT_EVENTS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('audit.view'),
    deps.requireSuspendedReadAccess,
    (req, res, next) => {
      void controller.getOrganization(req, res, next);
    },
  );

  router.get(
    API_PLATFORM_AUDIT_EVENTS_PATH,
    optionalAuth,
    platformActor,
    requirePlatformPermission('platform.audit.view'),
    (req, res, next) => {
      void controller.listPlatform(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerAuditRoutes,
};
