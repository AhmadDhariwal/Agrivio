const { forbidden, unauthorized } = require('../../platform/errors/app-error');
const { enterRequestContext, getRequestContext } = require('../../platform/http/request-context');
const { hasPermission, isKnownPermission } = require('./role-permissions');

function attachAuthContextToRequest(req, authContext) {
  req.authContext = authContext;
  let store = getRequestContext();
  if (store === undefined) {
    store = enterRequestContext({
      ...(typeof req.requestId === 'string' ? { requestId: req.requestId } : {}),
    });
  }
  store.authContext = authContext;
  if (authContext.organizationId !== undefined) {
    store.organizationId = authContext.organizationId;
  } else {
    delete store.organizationId;
  }
  // Request-scoped mirror so downstream handlers share context even if ALS
  // is split across module instances under the Vitest runner.
  req.requestContext = store;
}

function createRequirePermissionMiddleware(permission) {
  return (req, _res, next) => {
    if (!isKnownPermission(permission)) {
      next(forbidden('Unknown permission is denied by default'));
      return;
    }

    const auth = req.auth;
    if (auth === undefined) {
      next(unauthorized('Authentication required'));
      return;
    }

    const authContext = req.authContext;
    if (authContext === undefined) {
      next(unauthorized('Authentication required'));
      return;
    }

    if (!hasPermission(authContext.permissions, permission)) {
      next(forbidden(`Missing permission ${permission}`));
      return;
    }

    next();
  };
}

function createRequireOrganizationContextMiddleware() {
  return (req, _res, next) => {
    const authContext = req.authContext;
    if (authContext === undefined) {
      next(unauthorized('Authentication required'));
      return;
    }
    if (authContext.contextType !== 'organization' || authContext.organizationId === undefined) {
      next(forbidden('Organization context is required'));
      return;
    }
    next();
  };
}

module.exports = {
  attachAuthContextToRequest,
  createRequirePermissionMiddleware,
  createRequireOrganizationContextMiddleware,
};
