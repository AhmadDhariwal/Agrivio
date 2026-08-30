const {
  permissionDenied,
  authRequired,
  contextRequired,
} = require('../../platform/errors/app-error');
const { enterRequestContext, getRequestContext } = require('../../platform/http/request-context');
const { hasPermission, isKnownPermission } = require('./role-permissions');
const {
  assertBranchAccess,
  assertWarehouseAccess,
  resolveBranchIdFromRequest,
  resolveWarehouseIdFromRequest,
} = require('./assignment-scope');

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
  req.requestContext = store;
}

function createRequirePermissionMiddleware(permission) {
  return (req, _res, next) => {
    if (!isKnownPermission(permission)) {
      next(permissionDenied('Unknown permission is denied by default'));
      return;
    }

    const auth = req.auth;
    if (auth === undefined) {
      next(authRequired('Authentication required'));
      return;
    }

    const authContext = req.authContext;
    if (authContext === undefined) {
      next(authRequired('Authentication required'));
      return;
    }

    if (!hasPermission(authContext.permissions, permission)) {
      next(
        permissionDenied("You don't have permission to access this area. Contact your organization administrator if you need access."),
      );
      return;
    }

    next();
  };
}

function createRequireOrganizationContextMiddleware() {
  return (req, _res, next) => {
    const authContext = req.authContext;
    if (authContext === undefined) {
      next(authRequired('Authentication required'));
      return;
    }
    if (authContext.contextType !== 'organization' || authContext.organizationId === undefined) {
      next(contextRequired('Organization context is required'));
      return;
    }
    next();
  };
}

function createRequireBranchAccessMiddleware(options = {}) {
  return (req, _res, next) => {
    try {
      const authContext = req.authContext;
      if (authContext === undefined) {
        throw authRequired('Authentication required');
      }
      const branchId =
        typeof options.resolve === 'function'
          ? options.resolve(req)
          : resolveBranchIdFromRequest(req);
      assertBranchAccess(authContext, branchId);
      next();
    } catch (error) {
      next(error);
    }
  };
}

function createRequireWarehouseAccessMiddleware(options = {}) {
  return (req, _res, next) => {
    try {
      const authContext = req.authContext;
      if (authContext === undefined) {
        throw authRequired('Authentication required');
      }
      const warehouseId =
        typeof options.resolve === 'function'
          ? options.resolve(req)
          : resolveWarehouseIdFromRequest(req);
      assertWarehouseAccess(authContext, warehouseId);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  attachAuthContextToRequest,
  createRequirePermissionMiddleware,
  createRequireOrganizationContextMiddleware,
  createRequireBranchAccessMiddleware,
  createRequireWarehouseAccessMiddleware,
};
