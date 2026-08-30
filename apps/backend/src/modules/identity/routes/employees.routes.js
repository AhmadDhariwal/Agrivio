const { Router } = require('express');
const { API_USERS_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../permission.middleware');
const { createEmployeesController } = require('../controllers/employees.controller');
const { createLocationsController } = require('../../locations/controllers/locations.controller');
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');

function registerEmployeesRoutes(deps) {
  const router = Router();
  const controller = createEmployeesController(deps);
  const locationsController = createLocationsController({
    locationsService: deps.locationsService,
  });
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireEmployeesModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'employees',
    'enabled',
  );
  const requireCreateAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'employees.actions.create',
    'allowed',
  );
  const requireEditAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'employees.actions.edit',
    'allowed',
  );
  const requireDeactivateAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'employees.actions.deactivate',
    'allowed',
  );
  const requireAssignAccessAllowed = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'employees.actions.assignAccess',
    'allowed',
  );

  router.get(
    `${API_USERS_PATH}/access-policy`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('users.view'),
    deps.requireOperationalAccess,
    requireEmployeesModule,
    (req, res, next) => {
      void controller.accessPolicy(req, res, next);
    },
  );

  router.get(
    API_USERS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('users.view'),
    deps.requireOperationalAccess,
    requireEmployeesModule,
    (req, res, next) => {
      void controller.list(req, res, next);
    },
  );

  router.post(
    API_USERS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('users.create'),
    deps.requireOperationalAccess,
    requireEmployeesModule,
    requireCreateAllowed,
    (req, res, next) => {
      void controller.create(req, res, next);
    },
  );

  router.get(
    `${API_USERS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('users.view'),
    deps.requireOperationalAccess,
    requireEmployeesModule,
    (req, res, next) => {
      void controller.get(req, res, next);
    },
  );

  router.patch(
    `${API_USERS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('users.update'),
    deps.requireOperationalAccess,
    requireEmployeesModule,
    requireEditAllowed,
    (req, res, next) => {
      void controller.update(req, res, next);
    },
  );

  router.post(
    `${API_USERS_PATH}/:id/deactivate`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('users.deactivate'),
    deps.requireOperationalAccess,
    requireEmployeesModule,
    requireDeactivateAllowed,
    (req, res, next) => {
      void controller.deactivate(req, res, next);
    },
  );

  router.put(
    `${API_USERS_PATH}/:id/access-assignments`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('users.assign-access'),
    deps.requireOperationalAccess,
    requireEmployeesModule,
    requireAssignAccessAllowed,
    (req, res, next) => {
      void locationsController.replaceAccessAssignments(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerEmployeesRoutes,
};
