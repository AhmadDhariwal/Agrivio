const { Router } = require('express');
const {
  API_PLATFORM_OPERATIONS_BACKUPS_PATH,
  API_PLATFORM_OPERATIONS_RESTORES_PATH,
} = require('@agrivio/api-contracts');
const {
  createPlatformActorMiddleware,
  requirePlatformPermission,
} = require('../../platform/platform-actor.middleware');
const { createOperationsController } = require('../controllers/operations.controller');

function registerOperationsRoutes(deps) {
  const router = Router();
  const controller = createOperationsController(deps);
  const platformActor = createPlatformActorMiddleware(deps.config);
  const optionalAuth = deps.optionalAuth ?? ((_req, _res, next) => next());
  const requireCsrf = deps.requireCsrf ?? ((_req, _res, next) => next());

  router.get(
    API_PLATFORM_OPERATIONS_BACKUPS_PATH,
    optionalAuth,
    platformActor,
    requirePlatformPermission('operations.backups.view'),
    (req, res, next) => {
      void controller.listBackups(req, res, next);
    },
  );

  router.post(
    API_PLATFORM_OPERATIONS_RESTORES_PATH,
    optionalAuth,
    requireCsrf,
    platformActor,
    requirePlatformPermission('operations.restore.execute'),
    (req, res, next) => {
      void controller.initiateRestore(req, res, next);
    },
  );

  router.get(
    `${API_PLATFORM_OPERATIONS_RESTORES_PATH}/:id`,
    optionalAuth,
    platformActor,
    requirePlatformPermission('operations.restore.execute'),
    (req, res, next) => {
      void controller.getRestore(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerOperationsRoutes,
};
