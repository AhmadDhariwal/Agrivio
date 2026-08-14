/**
 * Suppliers public contract for orchestrators (R1-F08-006).
 * Consumers must import this entry point — not Suppliers persistence models.
 */

const {
  createSuppliersModule,
  createSuppliersService,
} = require('../suppliers.module');

module.exports = {
  createSuppliersModule,
  createSuppliersService,
};
