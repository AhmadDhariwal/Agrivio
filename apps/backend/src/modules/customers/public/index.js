/**
 * Customers public contract for orchestrators (R1-F08-006).
 * Consumers must import this entry point — not Customers persistence models.
 */

const {
  createCustomersModule,
  createCustomersService,
} = require('../customers.module');

module.exports = {
  createCustomersModule,
  createCustomersService,
};
