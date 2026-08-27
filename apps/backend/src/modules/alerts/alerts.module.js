const { createAlertsService } = require('./alerts.service');
const { createInMemoryAlertsStore, createMongooseAlertsStore } = require('./alerts.store');

function createAlertsModule(options = {}) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseAlertsStore() : createInMemoryAlertsStore());

  const alertsService = createAlertsService({
    store,
    inventoryService: options.inventoryService,
    paymentsService: options.paymentsService,
    salesService: options.salesService,
    capabilityService: options.capabilityService,
    canAccessWarehouse: options.canAccessWarehouse,
    resolveOrganizationTimezone: options.resolveOrganizationTimezone,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return { store, alertsService };
}

module.exports = {
  createAlertsModule,
  createAlertsService,
  createInMemoryAlertsStore,
  createMongooseAlertsStore,
};
