import { describe, expect, it } from 'vitest';
import { createCatalogModule } from '../../src/modules/catalog/catalog.module.js';
import { createCustomersModule } from '../../src/modules/customers/customers.module.js';
import { createSuppliersModule } from '../../src/modules/suppliers/suppliers.module.js';
import { createAccountsModule } from '../../src/modules/accounts-expenses/accounts.module.js';
import { createLedgersModule } from '../../src/modules/payments-ledgers/ledgers.module.js';
import { createInventoryModule } from '../../src/modules/inventory/inventory.module.js';
import { createLocationsModule } from '../../src/modules/locations/locations.module.js';
import { createImportsModule } from '../../src/modules/imports/imports.module.js';
import { createOperationsModule } from '../../src/modules/operations/operations.module.js';
import { renderImportWorkbook } from '../../src/modules/imports/import-workbook.js';
import { permissionsForMembershipRole, permissionsForPlatformAccess } from '../../src/modules/identity/role-permissions.js';

const actor = {
  actorId: 'owner-1',
  authContext: {
    userId: 'owner-1',
    organizationId: 'org-1',
    permissions: permissionsForMembershipRole('Owner'),
  },
};

function allowEntitlement() {
  return { allowed: true };
}

describe('R1-F09-005 backup restore and import rehearsals', () => {
  it('verifies backup policy, restores an in-memory catalog snapshot, and reconciles an opening import', async () => {
    const operations = createOperationsModule();
    await operations.operationsService.recordBackupOutcome({
      status: 'success',
      policyRef: 'rehearsal-daily',
      providerRef: 'in-process-memory',
    });
    const verified = await operations.operationsService.verifyBackupPolicy({
      maxAgeMs: 60 * 60 * 1000,
    });
    expect(verified.status).toBe('success');

    const restoreActor = {
      actorId: 'ops-1',
      permissions: [...permissionsForPlatformAccess('super_admin'), 'operations.restore.execute'],
    };
    const restore = await operations.operationsService.initiateRestoreCoordination(
      { reason: 'F09 restore rehearsal IR-REH-1' },
      restoreActor,
    );
    expect(restore.productionRestoreExecuted).toBe(false);
    expect(restore.coordinationOnly).toBe(true);
    expect(restore.verificationStatus).toBe('pending');

    const catalog = createCatalogModule({
      persistence: 'memory',
      evaluateEntitlement: async () => allowEntitlement(),
    });
    await catalog.catalogService.createCategory(
      'org-1',
      { name: 'Baseline Seed', productClass: 'seed' },
      actor,
    );
    const snapshot = catalog.store.exportRehearsalSnapshot();
    await catalog.catalogService.createCategory(
      'org-1',
      { name: 'Drift Category', productClass: 'general' },
      actor,
    );
    expect((await catalog.catalogService.listCategories('org-1')).items).toHaveLength(2);
    catalog.store.restoreRehearsalSnapshot(snapshot);
    const restored = await catalog.catalogService.listCategories('org-1');
    expect(restored.items).toHaveLength(1);
    expect(restored.items[0].name).toBe('Baseline Seed');

    const ledgers = createLedgersModule({ persistence: 'memory' });
    const customers = createCustomersModule({
      persistence: 'memory',
      evaluateEntitlement: async () => allowEntitlement(),
      ledgersService: ledgers.ledgersService,
    });
    const suppliers = createSuppliersModule({
      persistence: 'memory',
      evaluateEntitlement: async () => allowEntitlement(),
      ledgersService: ledgers.ledgersService,
    });
    const accounts = createAccountsModule({ persistence: 'memory' });
    const locations = createLocationsModule({
      persistence: 'memory',
      evaluateEntitlement: async () => allowEntitlement(),
    });
    const inventory = createInventoryModule({
      persistence: 'memory',
      catalogService: catalog.catalogService,
      locationsService: locations.locationsService,
      canAccessWarehouse: () => true,
      hasPermission: () => true,
      resolveOrganizationTimezone: async () => 'Asia/Karachi',
    });
    const imports = createImportsModule({
      persistence: 'memory',
      catalogService: catalog.catalogService,
      customersService: customers.customersService,
      suppliersService: suppliers.suppliersService,
      accountsService: accounts.accountsService,
      inventoryService: inventory.inventoryService,
      locationsService: locations.locationsService,
      canAccessWarehouse: () => true,
      resolvePlanEntitlements: async () => ({ imports: true }),
    });

    const job = await imports.importsService.createJob('org-1', { importType: 'product_categories' }, actor);
    await imports.importsService.uploadWorkbook(
      'org-1',
      job.id,
      {
        buffer: renderImportWorkbook('product_categories', [
          { name: 'Imported Fertilizer', productClass: 'fertilizer' },
        ]),
        originalFileName: 'opening.xls',
      },
      actor,
    );
    const preview = await imports.importsService.validateJob('org-1', job.id, actor.authContext);
    expect(preview.preview.validRows).toBe(1);
    expect(preview.preview.invalidRows).toBe(0);
    await imports.importsService.confirmJob('org-1', preview.id, actor);
    const executed = await imports.importsService.executeJob(
      'org-1',
      preview.id,
      actor,
      'f09-rehearsal-import',
    );
    expect(executed.data.status).toBe('completed');
    expect(executed.data.result.createdCount).toBe(1);
    const afterImport = await catalog.catalogService.listCategories('org-1');
    expect(afterImport.items.map((item) => item.name).sort()).toEqual([
      'Baseline Seed',
      'Imported Fertilizer',
    ]);
  });
});
