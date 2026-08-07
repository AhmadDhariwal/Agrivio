// @ts-check
const { Router } = require('express');
const {
  API_AUTH_ACTIVATE_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_V1_PREFIX,
} = require('@agrivio/api-contracts');
const {
  createPlatformActorMiddleware,
  requirePlatformPermission,
} = require('../platform/platform-actor.middleware');
const {
  createOnboardingController,
  createPlatformOrganizationController,
} = require('./onboarding.controller');

/**
 * @param {{
 *   config: { nodeEnv: 'development' | 'test' | 'production' };
 *   onboardingService: ReturnType<import('./onboarding.service').createOnboardingService>;
 * }} deps
 */
function registerOnboardingRoutes(deps) {
  const router = Router();
  const publicController = createOnboardingController(deps);
  const platformController = createPlatformOrganizationController(deps);
  const platformActor = createPlatformActorMiddleware(deps.config);

  router.post(API_ORGANIZATION_ACTIVATION_REQUESTS_PATH, (req, res, next) => {
    void publicController.submitActivationRequest(req, res, next);
  });

  router.post(API_AUTH_ACTIVATE_PATH, (req, res, next) => {
    void publicController.activateOwner(req, res, next);
  });

  router.get(
    API_PLATFORM_ORGANIZATIONS_PATH,
    platformActor,
    requirePlatformPermission('platform.organizations.view'),
    (req, res, next) => {
      void platformController.list(req, res, next);
    },
  );

  router.get(
    `${API_PLATFORM_ORGANIZATIONS_PATH}/:id`,
    platformActor,
    requirePlatformPermission('platform.organizations.view'),
    (req, res, next) => {
      void platformController.getById(req, res, next);
    },
  );

  router.post(
    `${API_PLATFORM_ORGANIZATIONS_PATH}/:id/approve`,
    platformActor,
    requirePlatformPermission('platform.organizations.approve'),
    (req, res, next) => {
      void platformController.approve(req, res, next);
    },
  );

  router.post(
    `${API_PLATFORM_ORGANIZATIONS_PATH}/:id/reject`,
    platformActor,
    requirePlatformPermission('platform.organizations.approve'),
    (req, res, next) => {
      void platformController.reject(req, res, next);
    },
  );

  // Guard against accidental mount under wrong prefix during wiring reviews.
  void API_V1_PREFIX;

  return router;
}

module.exports = {
  registerOnboardingRoutes,
};
