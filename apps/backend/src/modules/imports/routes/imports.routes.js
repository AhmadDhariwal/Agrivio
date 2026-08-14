const { Router } = require('express');
const express = require('express');
const { API_IMPORTS_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createImportsController } = require('../controllers/imports.controller');

function registerImportsRoutes(deps) {
  const router = Router();
  const controller = createImportsController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();

  router.get(
    `${API_IMPORTS_PATH}/templates`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('imports.preview'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listTemplates(req, res, next);
    },
  );

  router.get(
    `${API_IMPORTS_PATH}/templates/:importType`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('imports.preview'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.downloadTemplate(req, res, next);
    },
  );

  router.post(
    API_IMPORTS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('imports.preview'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.createJob(req, res, next);
    },
  );

  router.post(
    `${API_IMPORTS_PATH}/:id/upload`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('imports.preview'),
    deps.requireOperationalAccess,
    express.raw({
      type: (req) => {
        const value = String(req.headers['content-type'] || '')
          .split(';')[0]
          .trim()
          .toLowerCase();
        return [
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/xml',
          'text/xml',
          'application/octet-stream',
        ].includes(value);
      },
      limit: '5mb',
    }),
    (req, res, next) => {
      void controller.uploadWorkbook(req, res, next);
    },
  );

  router.post(
    `${API_IMPORTS_PATH}/:id/validate`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('imports.preview'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.validateJob(req, res, next);
    },
  );

  router.get(
    `${API_IMPORTS_PATH}/:id/errors`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('imports.preview'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listErrors(req, res, next);
    },
  );

  router.get(
    `${API_IMPORTS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('imports.preview'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getJob(req, res, next);
    },
  );

  router.post(
    `${API_IMPORTS_PATH}/:id/confirm`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('imports.execute'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.confirmJob(req, res, next);
    },
  );

  router.post(
    `${API_IMPORTS_PATH}/:id/execute`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('imports.execute'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.executeJob(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerImportsRoutes,
};
