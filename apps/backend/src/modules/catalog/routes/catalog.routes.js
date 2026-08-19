const { Router } = require('express');
const { API_PRODUCT_CATEGORIES_PATH, API_PRODUCTS_PATH } = require('@agrivio/api-contracts');
const {
  createRequireOrganizationContextMiddleware,
  createRequirePermissionMiddleware,
} = require('../../identity/permission.middleware');
const { createCatalogController } = require('../controllers/catalog.controller');
const { createRequireCapabilityMiddleware } = require('../../capabilities/capability.middleware');

function registerCatalogRoutes(deps) {
  const router = Router();
  const controller = createCatalogController(deps);
  const requireOrganizationContext = createRequireOrganizationContextMiddleware();
  const requireProductsModule = createRequireCapabilityMiddleware(
    deps.capabilityService,
    'inventory.products',
    'enabled',
  );

  router.get(
    API_PRODUCT_CATEGORIES_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('catalog.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.listCategories(req, res, next);
    },
  );

  router.post(
    API_PRODUCT_CATEGORIES_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('catalog.manage'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.createCategory(req, res, next);
    },
  );

  router.get(
    `${API_PRODUCT_CATEGORIES_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('catalog.view'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.getCategory(req, res, next);
    },
  );

  router.patch(
    `${API_PRODUCT_CATEGORIES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('catalog.manage'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.updateCategory(req, res, next);
    },
  );

  router.delete(
    `${API_PRODUCT_CATEGORIES_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('catalog.manage'),
    deps.requireOperationalAccess,
    (req, res, next) => {
      void controller.deleteCategory(req, res, next);
    },
  );

  router.get(
    API_PRODUCTS_PATH,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('catalog.view'),
    deps.requireOperationalAccess,
    requireProductsModule,
    (req, res, next) => {
      void controller.listProducts(req, res, next);
    },
  );

  router.post(
    API_PRODUCTS_PATH,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('catalog.manage'),
    deps.requireOperationalAccess,
    requireProductsModule,
    (req, res, next) => {
      void controller.createProduct(req, res, next);
    },
  );

  router.get(
    `${API_PRODUCTS_PATH}/:id`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('catalog.view'),
    deps.requireOperationalAccess,
    requireProductsModule,
    (req, res, next) => {
      void controller.getProduct(req, res, next);
    },
  );

  router.patch(
    `${API_PRODUCTS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('catalog.manage'),
    deps.requireOperationalAccess,
    requireProductsModule,
    (req, res, next) => {
      void controller.updateProduct(req, res, next);
    },
  );

  router.delete(
    `${API_PRODUCTS_PATH}/:id`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('catalog.manage'),
    deps.requireOperationalAccess,
    requireProductsModule,
    (req, res, next) => {
      void controller.deleteProduct(req, res, next);
    },
  );

  router.get(
    `${API_PRODUCTS_PATH}/:id/packaging-units`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('catalog.view'),
    deps.requireOperationalAccess,
    requireProductsModule,
    (req, res, next) => {
      void controller.listPackagingUnits(req, res, next);
    },
  );

  router.put(
    `${API_PRODUCTS_PATH}/:id/packaging-units`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('catalog.manage'),
    deps.requireOperationalAccess,
    requireProductsModule,
    (req, res, next) => {
      void controller.replacePackagingUnits(req, res, next);
    },
  );

  router.get(
    `${API_PRODUCTS_PATH}/:id/prices`,
    deps.requireAuth,
    requireOrganizationContext,
    createRequirePermissionMiddleware('pricing.view'),
    deps.requireOperationalAccess,
    requireProductsModule,
    (req, res, next) => {
      void controller.listPrices(req, res, next);
    },
  );

  router.put(
    `${API_PRODUCTS_PATH}/:id/prices`,
    deps.requireAuth,
    deps.requireCsrf,
    requireOrganizationContext,
    createRequirePermissionMiddleware('pricing.manage'),
    deps.requireOperationalAccess,
    requireProductsModule,
    (req, res, next) => {
      void controller.replacePrices(req, res, next);
    },
  );

  return router;
}

module.exports = {
  registerCatalogRoutes,
};
