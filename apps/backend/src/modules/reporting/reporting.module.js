const { createReportingService } = require('./reporting.service');

function createReportingModule(options = {}) {
  const reportingService = createReportingService({
    salesService: options.salesService,
    purchasesService: options.purchasesService,
    accountsService: options.accountsService,
    paymentsService: options.paymentsService,
    alertsService: options.alertsService,
    returnsService: options.returnsService,
    inventoryService: options.inventoryService,
    catalogService: options.catalogService,
    customersService: options.customersService,
    locationsService: options.locationsService,
    employeesService: options.employeesService,
    resolveOrganizationTimezone: options.resolveOrganizationTimezone,
    resolvePlanEntitlements: options.resolvePlanEntitlements,
    capabilityService: options.capabilityService,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return { reportingService };
}

module.exports = {
  createReportingModule,
  createReportingService,
};
