const { forbidden, unauthorized } = require('../../platform/errors/app-error');
const { allowsSubscriptionLabel } = require('./entitlement');

function createRequireSubscriptionAccessMiddleware(deps) {
  const label = deps.label;
  const resolveAccessState = deps.resolveAccessState;

  return async (req, _res, next) => {
    try {
      const authContext = req.authContext;
      if (authContext === undefined) {
        next(unauthorized('Authentication required'));
        return;
      }
      if (authContext.contextType !== 'organization' || authContext.organizationId === undefined) {
        next(forbidden('Organization context is required'));
        return;
      }

      const access = await resolveAccessState(authContext.organizationId);
      req.subscriptionAccessState = access;

      if (!allowsSubscriptionLabel(access.status, label)) {
        next(
          forbidden(
            `Subscription entitlement denied for ${label} while status is ${access.status ?? 'unknown'}`,
          ),
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  createRequireSubscriptionAccessMiddleware,
};
