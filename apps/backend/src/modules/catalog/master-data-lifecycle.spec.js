import { describe, expect, it } from 'vitest';
import { createCatalogModule } from './catalog.module.js';
import { permissionsForMembershipRole } from '../identity/role-permissions.js';
import { createAccountsModule } from '../accounts-expenses/accounts.module.js';

describe('master-data and draft lifecycle', () => {
  it('deactivates products, excludes them from active lists, and keeps historical get', async () => {
    const catalog = createCatalogModule({
      persistence: 'memory',
      evaluateEntitlement: async () => ({ allowed: true }),
    });
    const actor = {
      actorId: 'owner-1',
      authContext: {
        userId: 'owner-1',
        organizationId: 'org-life',
        permissions: permissionsForMembershipRole('Owner'),
      },
    };
    const category = await catalog.catalogService.createCategory(
      'org-life',
      { name: 'Life Cat', productClass: 'general' },
      actor,
    );
    const product = await catalog.catalogService.createProduct(
      'org-life',
      {
        name: 'Life Product',
        sku: 'LIFE-1',
        categoryId: category.id,
        trackingMode: 'none',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
      },
      actor,
    );

    const inactive = await catalog.catalogService.updateProduct(
      'org-life',
      product.id,
      { expectedVersion: product.version, status: 'inactive' },
      actor,
    );
    expect(inactive.status).toBe('inactive');

    const activeOnly = await catalog.catalogService.listProducts('org-life', { status: 'active' });
    expect(activeOnly.items).toHaveLength(0);

    const all = await catalog.catalogService.listProducts('org-life', { status: 'all' });
    expect(all.items).toHaveLength(1);
    expect(all.items[0].status).toBe('inactive');

    const historical = await catalog.catalogService.getProduct('org-life', product.id);
    expect(historical.name).toBe('Life Product');
    expect(historical.status).toBe('inactive');

    await expect(
      catalog.catalogService.updateProduct(
        'org-life',
        product.id,
        { expectedVersion: product.version, status: 'active' },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    const reactivated = await catalog.catalogService.updateProduct(
      'org-life',
      product.id,
      { expectedVersion: inactive.version, status: 'active' },
      actor,
    );
    expect(reactivated.status).toBe('active');
  });

  it('discards expense drafts only and refuses posted expenses', async () => {
    const accounts = createAccountsModule({
      persistence: 'memory',
      evaluateEntitlement: async () => ({ allowed: true }),
    });
    const actor = { actorId: 'owner-1' };
    const category = await accounts.accountsService.createExpenseCategory(
      'org-life',
      { name: 'Rent' },
      actor,
    );
    const account = await accounts.accountsService.createAccount(
      'org-life',
      { name: 'Till', accountType: 'cash' },
      actor,
    );
    const draft = await accounts.accountsService.createExpenseDraft(
      'org-life',
      {
        categoryId: category.id,
        accountId: account.id,
        amount: { amount: '10.00', currency: 'PKR' },
        purpose: 'Office',
        expenseDate: '2026-08-16',
      },
      actor,
    );
    const discarded = await accounts.accountsService.discardExpenseDraft('org-life', draft.id, actor);
    expect(discarded.discarded).toBe(true);

    const postedDraft = await accounts.accountsService.createExpenseDraft(
      'org-life',
      {
        categoryId: category.id,
        accountId: account.id,
        amount: { amount: '12.00', currency: 'PKR' },
        purpose: 'Posted',
        expenseDate: '2026-08-16',
      },
      actor,
    );
    await accounts.accountsService.postExpense(
      'org-life',
      postedDraft.id,
      { expectedVersion: postedDraft.version },
      actor,
      'exp-post-1',
    );
    await expect(
      accounts.accountsService.discardExpenseDraft('org-life', postedDraft.id, actor),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('discards adjustment drafts only and refuses posted adjustments', async () => {
    const { createInventoryModule } = await import('../inventory/inventory.module.js');
    const inventory = createInventoryModule({
      persistence: 'memory',
      canAccessWarehouse: () => true,
      catalogService: {
        async getProduct() {
          return { id: 'prod-1', trackingMode: 'none', baseUnitCode: 'EA', status: 'active' };
        },
        async listPackagingUnits() {
          return { items: [] };
        },
      },
      locationsService: {
        async getWarehouse(_organizationId, warehouseId) {
          return { id: warehouseId, status: 'active' };
        },
      },
    });
    const auth = {
      userId: 'owner-1',
      organizationId: 'org-life',
      permissions: permissionsForMembershipRole('Owner'),
    };
    const draft = await inventory.inventoryService.createAdjustmentDraft(
      'org-life',
      {
        warehouseId: 'wh-1',
        productId: 'prod-1',
        adjustmentType: 'damage',
        quantity: '1',
        reason: 'draft discard',
      },
      auth,
    );
    const discarded = await inventory.inventoryService.discardAdjustmentDraft(
      'org-life',
      draft.id,
      auth,
    );
    expect(discarded.discarded).toBe(true);

    await inventory.inventoryService.postOpeningStock(
      'org-life',
      {
        warehouseId: 'wh-1',
        productId: 'prod-1',
        quantity: '10',
        inventoryValue: { amount: '100.00', currency: 'PKR' },
      },
      { actorId: 'owner-1' },
      'open-life-1',
    );

    const postedDraft = await inventory.inventoryService.createAdjustmentDraft(
      'org-life',
      {
        warehouseId: 'wh-1',
        productId: 'prod-1',
        adjustmentType: 'damage',
        quantity: '1',
        reason: 'posted',
      },
      auth,
    );
    await inventory.inventoryService.postAdjustment(
      'org-life',
      postedDraft.id,
      { reason: 'post' },
      { actorId: 'owner-1' },
      auth,
      'adj-post-life-1',
    );
    await expect(
      inventory.inventoryService.discardAdjustmentDraft('org-life', postedDraft.id, auth),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
