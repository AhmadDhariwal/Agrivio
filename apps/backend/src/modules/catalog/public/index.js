/**
 * Catalog public contract for orchestrators (R1-F08-006).
 * Consumers must import this entry point — not Catalog persistence models.
 */

const {
  createCatalogModule,
  createCatalogService,
} = require('../catalog.module');

module.exports = {
  createCatalogModule,
  createCatalogService,
};
