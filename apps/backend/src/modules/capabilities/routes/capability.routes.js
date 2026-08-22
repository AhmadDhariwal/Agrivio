const { Router } = require('express');
const {
  API_ME_CAPABILITIES_PATH,
  API_PLATFORM_CAPABILITY_REGISTRY_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
} = require('@agrivio/api-contracts');
const {
  createPlatformActorMiddleware,
  requirePlatformPermission,
} = require('../../platform/platform-actor.middleware');
const {
  createRequireOrganizationContextMiddleware,
} = require('../../identity/permission.middleware');
const { createCapabilityController } = require('../controllers/capability.controller');

function registerCapabilityRoutes(deps) {
  const router = Router();
  const controller = createCapabilityController(deps);
  const platformActor = createPlatformActorMiddleware(deps.config);
  const requireCsrf = deps.requireCsrf ?? ((_req, _res, next) => next());
  const optionalAuth = deps.optionalAuth ?? ((_req, _res, next) => next());
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const organizationBase = `${API_PLATFORM_ORGANIZATIONS_PATH}/:id/capabilities`;

  router.get(
    API_ME_CAPABILITIES_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    (req, res, next) => void controller.getCurrent(req, res, next),
  );

  router.get(
    API_PLATFORM_CAPABILITY_REGISTRY_PATH,
    optionalAuth,
    platformActor,
    requirePlatformPermission('platform.organizations.view'),
    (req, res, next) => void controller.getRegistry(req, res, next),
  );

  router.get(
    organizationBase,
    optionalAuth,
    platformActor,
    requirePlatformPermission('platform.organizations.view'),
    (req, res, next) => void controller.getOrganizationPolicy(req, res, next),
  );

  router.put(
    organizationBase,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.organizations.suspend'),
    (req, res, next) => void controller.updateOrganizationPolicy(req, res, next),
  );

  router.delete(
    `${organizationBase}/overrides/:key`,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.organizations.suspend'),
    (req, res, next) => void controller.resetOverride(req, res, next),
  );

  router.delete(
    `${organizationBase}/modules/:moduleKey`,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.organizations.suspend'),
    (req, res, next) => void controller.resetModule(req, res, next),
  );

  router.delete(
    organizationBase,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.organizations.suspend'),
    (req, res, next) => void controller.resetAll(req, res, next),
  );

  router.get(
    `${organizationBase}/history`,
    optionalAuth,
    platformActor,
    requirePlatformPermission('platform.audit.view'),
    (req, res, next) => void controller.getHistory(req, res, next),
  );

  return router;
}

module.exports = {
  registerCapabilityRoutes,
};
