const { Router } = require('express');
const {
  API_PLATFORM_BILLING_RECORDS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PLATFORM_SUBSCRIPTIONS_PATH,
  API_SUBSCRIPTION_BILLING_RECORDS_PATH,
  API_SUBSCRIPTION_PATH,
  API_SUBSCRIPTION_PLANS_PATH,
} = require('@agrivio/api-contracts');
const {
  createPlatformActorMiddleware,
  requirePlatformPermission,
} = require('../platform/platform-actor.middleware');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../identity/permission.middleware');
const { createRequireSubscriptionAccessMiddleware } = require('./entitlement.middleware');
const {
  createPlatformSubscriptionController,
  createSubscriptionController,
} = require('./subscription.controller');

function registerSubscriptionRoutes(deps) {
  const router = Router();
  const orgController = createSubscriptionController(deps);
  const platformController = createPlatformSubscriptionController(deps);
  const platformActor = createPlatformActorMiddleware(deps.config);
  const requireAuth = deps.requireAuth ?? ((_req, _res, next) => next());
  const requireCsrf = deps.requireCsrf ?? ((_req, _res, next) => next());
  const optionalAuth = deps.optionalAuth ?? ((_req, _res, next) => next());
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireSubscriptionView = createRequirePermissionMiddleware('subscription.view');
  const requireBillingSubmit = createRequirePermissionMiddleware(
    'subscription.billing-evidence.submit',
  );
  const requireBillingAccess = createRequireSubscriptionAccessMiddleware({
    label: 'billing-access',
    resolveAccessState: (organizationId) =>
      deps.subscriptionService.resolveAccessState(organizationId),
  });

  router.get(
    API_SUBSCRIPTION_PATH,
    requireAuth,
    requireOrganizationContext,
    requireSubscriptionView,
    requireBillingAccess,
    (req, res, next) => {
      void orgController.getCurrent(req, res, next);
    },
  );

  router.get(
    API_SUBSCRIPTION_PLANS_PATH,
    requireAuth,
    requireOrganizationContext,
    requireSubscriptionView,
    requireBillingAccess,
    (req, res, next) => {
      void orgController.listPlans(req, res, next);
    },
  );

  router.post(
    API_SUBSCRIPTION_BILLING_RECORDS_PATH,
    requireAuth,
    requireCsrf,
    requireOrganizationContext,
    requireBillingSubmit,
    requireBillingAccess,
    (req, res, next) => {
      void orgController.submitBilling(req, res, next);
    },
  );

  router.get(
    API_SUBSCRIPTION_BILLING_RECORDS_PATH,
    requireAuth,
    requireOrganizationContext,
    requireSubscriptionView,
    requireBillingAccess,
    (req, res, next) => {
      void orgController.listBilling(req, res, next);
    },
  );

  router.get(
    `${API_SUBSCRIPTION_BILLING_RECORDS_PATH}/:id`,
    requireAuth,
    requireOrganizationContext,
    requireSubscriptionView,
    requireBillingAccess,
    (req, res, next) => {
      void orgController.getBilling(req, res, next);
    },
  );

  router.get(
    API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
    optionalAuth,
    platformActor,
    requirePlatformPermission('platform.subscriptions.manage'),
    (req, res, next) => {
      void platformController.listPlans(req, res, next);
    },
  );

  router.post(
    API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.subscriptions.manage'),
    (req, res, next) => {
      void platformController.createPlan(req, res, next);
    },
  );

  router.get(
    API_PLATFORM_SUBSCRIPTIONS_PATH,
    optionalAuth,
    platformActor,
    requirePlatformPermission('platform.subscriptions.manage'),
    (req, res, next) => {
      void platformController.listSubscriptions(req, res, next);
    },
  );

  router.post(
    `${API_PLATFORM_SUBSCRIPTIONS_PATH}/:id/suspend`,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.subscriptions.manage'),
    (req, res, next) => {
      void platformController.suspend(req, res, next);
    },
  );

  router.post(
    `${API_PLATFORM_SUBSCRIPTIONS_PATH}/:id/reactivate`,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.subscriptions.manage'),
    (req, res, next) => {
      void platformController.reactivate(req, res, next);
    },
  );

  router.post(
    `${API_PLATFORM_SUBSCRIPTIONS_PATH}/:id/cancel`,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.subscriptions.manage'),
    (req, res, next) => {
      void platformController.cancel(req, res, next);
    },
  );

  router.post(
    `${API_PLATFORM_SUBSCRIPTIONS_PATH}/:id/change-plan`,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.subscriptions.manage'),
    (req, res, next) => {
      void platformController.changePlan(req, res, next);
    },
  );

  router.get(
    API_PLATFORM_BILLING_RECORDS_PATH,
    optionalAuth,
    platformActor,
    requirePlatformPermission('platform.billing.verify'),
    (req, res, next) => {
      void platformController.listBilling(req, res, next);
    },
  );

  router.get(
    `${API_PLATFORM_BILLING_RECORDS_PATH}/:id`,
    optionalAuth,
    platformActor,
    requirePlatformPermission('platform.billing.verify'),
    (req, res, next) => {
      void platformController.getBilling(req, res, next);
    },
  );

  router.post(
    `${API_PLATFORM_BILLING_RECORDS_PATH}/:id/approve`,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.billing.verify'),
    (req, res, next) => {
      void platformController.approveBilling(req, res, next);
    },
  );

  router.post(
    `${API_PLATFORM_BILLING_RECORDS_PATH}/:id/reject`,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('platform.billing.verify'),
    (req, res, next) => {
      void platformController.rejectBilling(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerSubscriptionRoutes,
};
