const { forbidden, unauthorized } = require('../../platform/errors/app-error');

function createRequireCapabilityMiddleware(capabilityService, key, mode) {
  return async (req, _res, next) => {
    try {
      const authContext = req.authContext;
      if (authContext === undefined) {
        throw unauthorized('Authentication required');
      }
      if (authContext.contextType !== 'organization' || !authContext.organizationId) {
        throw forbidden('Organization context is required');
      }
      await capabilityService.assertAllowed(authContext.organizationId, key, mode, {
        permissions: authContext.permissions ?? [],
        ...(req.subscriptionAccessState === undefined
          ? {}
          : { subscriptionAccessState: req.subscriptionAccessState }),
        ...(req.subscriptionAccessState === undefined
          ? {}
          : { operationalAllowed: req.subscriptionAccessState.accessLevel === 'operational' }),
      });
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  createRequireCapabilityMiddleware,
};
