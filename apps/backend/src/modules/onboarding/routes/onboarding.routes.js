const { Router } = require('express');
const {
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_V1_PREFIX,
} = require('@agrivio/api-contracts');
const {
  createPlatformActorMiddleware,
  requirePlatformPermission,
} = require('../../platform/platform-actor.middleware');
const {
  createOnboardingController,
  createPlatformOrganizationController,
} = require('../controllers/onboarding.controller');

function registerOnboardingRoutes(deps) {
  const router = Router();
  const publicController = createOnboardingController(deps);
  const platformController = createPlatformOrganizationController(deps);
  const platformActor = createPlatformActorMiddleware(deps.config);
  const requireCsrf = deps.requireCsrf ?? ((_req, _res, next) => next());
  const optionalAuth = deps.optionalAuth ?? ((_req, _res, next) => next());

  router.post(API_ORGANIZATION_ACTIVATION_REQUESTS_PATH, requireCsrf, (req, res, next) => {
    void publicController.submitActivationRequest(req, res, next);
  });

  // Activation lives under the auth module routes (`/api/v1/auth/activate`).

  router.get(
    API_PLATFORM_ORGANIZATIONS_PATH,
    optionalAuth,
    platformActor,
    requirePlatformPermission('platform.organizations.view'),
    (req, res, next) => {
      void platformController.list(req, res, next);
    },
  );

  router.post(
    API_PLATFORM_ORGANIZATIONS_PATH,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.organizations.create'),
    (req, res, next) => {
      void platformController.create(req, res, next);
    },
  );

  router.get(
    `${API_PLATFORM_ORGANIZATIONS_PATH}/:id`,
    optionalAuth,
    platformActor,
    requirePlatformPermission('platform.organizations.view'),
    (req, res, next) => {
      void platformController.getById(req, res, next);
    },
  );

  router.post(
    `${API_PLATFORM_ORGANIZATIONS_PATH}/:id/approve`,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.organizations.approve'),
    (req, res, next) => {
      void platformController.approve(req, res, next);
    },
  );

  router.post(
    `${API_PLATFORM_ORGANIZATIONS_PATH}/:id/reissue-activation`,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.organizations.approve'),
    (req, res, next) => {
      void platformController.reissueActivation(req, res, next);
    },
  );

  router.post(
    `${API_PLATFORM_ORGANIZATIONS_PATH}/:id/reject`,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.organizations.approve'),
    (req, res, next) => {
      void platformController.reject(req, res, next);
    },
  );

  router.post(
    `${API_PLATFORM_ORGANIZATIONS_PATH}/:id/suspend`,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.organizations.suspend'),
    (req, res, next) => {
      void platformController.suspend(req, res, next);
    },
  );

  void API_V1_PREFIX;

  return router;
}

module.exports = {
  registerOnboardingRoutes,
};
