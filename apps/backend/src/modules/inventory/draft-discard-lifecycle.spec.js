import { describe, expect, it } from 'vitest';
const { createInventoryModule } = require('./inventory.module');

function setup() {
  const inventory = createInventoryModule({
    persistence: 'memory',
    catalogService: {
      async getProduct(_organizationId, productId) {
        return {
          id: productId,
          trackingMode: 'none',
          baseUnitCode: 'EA',
          status: 'active',
        };
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
    canAccessWarehouse: (authContext, warehouseId) =>
      authContext?.warehouseIds?.includes(warehouseId) === true,
    hasPermission: () => true,
  });
  return inventory;
}

function auth(organizationId = 'org-1', warehouseIds = ['wh-1', 'wh-2']) {
  return { userId: 'owner-1', organizationId, warehouseIds, permissions: [] };
}

function openingBody(overrides = {}) {
  return {
    warehouseId: 'wh-1',
    productId: 'prod-1',
    quantity: '5',
    inventoryValue: { amount: '50.00', currency: 'PKR' },
    ...overrides,
  };
}

describe('draft/discard inventory lifecycle', () => {
  it('creates, edits, and discards opening stock drafts with zero inventory effects', async () => {
    const { inventoryService, store } = setup();
    const created = await inventoryService.createOpeningStockDraft(
      'org-1',
      openingBody(),
      auth(),
    );
    expect(created).toMatchObject({ status: 'draft', version: 1, quantity: '5.0000' });
    expect(store._debug.movements.size).toBe(0);
    expect(store._debug.balances.size).toBe(0);
    expect(store._debug.costStates.size).toBe(0);
    expect(store._debug.batches.size).toBe(0);

    const updated = await inventoryService.updateOpeningStockDraft(
      'org-1',
      created.id,
      { expectedVersion: created.version, quantity: '7' },
      auth(),
    );
    expect(updated).toMatchObject({ status: 'draft', version: 2, quantity: '7.0000' });
    expect(store._debug.movements.size).toBe(0);
    expect(store._debug.balances.size).toBe(0);
    expect(store._debug.costStates.size).toBe(0);

    const discarded = await inventoryService.discardOpeningStockDraft(
      'org-1',
      created.id,
      { expectedVersion: updated.version },
      auth(),
    );
    expect(discarded).toEqual({ id: created.id, discarded: true });
    expect(store._debug.openingStocks.size).toBe(0);
    expect(store._debug.audits.map((event) => event.action)).toContain(
      'inventory.opening_stock.draft.discarded',
    );
  });

  it('posts through the existing stock engine and blocks posted discard and stale changes', async () => {
    const { inventoryService, store } = setup();
    const draft = await inventoryService.createOpeningStockDraft(
      'org-1',
      openingBody(),
      auth(),
    );
    const posted = await inventoryService.postOpeningStockDraft(
      'org-1',
      draft.id,
      { expectedVersion: draft.version },
      { actorId: 'owner-1' },
      auth(),
      'opening-draft-post-1',
    );
    expect(posted.data.openingStock.status).toBe('posted');
    expect(posted.data.movement.sourceType).toBe('opening_stock');
    expect(posted.data.movement.sourceId).toBe(draft.id);
    expect(store._debug.movements.size).toBe(1);
    expect(store._debug.balances.size).toBe(1);
    expect(store._debug.costStates.size).toBe(1);

    await expect(
      inventoryService.discardOpeningStockDraft(
        'org-1',
        draft.id,
        { expectedVersion: posted.data.openingStock.version },
        auth(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const editable = await inventoryService.createOpeningStockDraft(
      'org-1',
      openingBody({ quantity: '2' }),
      auth(),
    );
    await inventoryService.updateOpeningStockDraft(
      'org-1',
      editable.id,
      { expectedVersion: editable.version, quantity: '3' },
      auth(),
    );
    await expect(
      inventoryService.discardOpeningStockDraft(
        'org-1',
        editable.id,
        { expectedVersion: editable.version },
        auth(),
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('enforces tenant and warehouse assignment scope', async () => {
    const { inventoryService } = setup();
    await expect(
      inventoryService.createOpeningStockDraft(
        'org-1',
        openingBody(),
        auth('org-1', ['wh-other']),
      ),
    ).rejects.toMatchObject({ code: 'ASSIGNMENT_SCOPE_DENIED' });

    const draft = await inventoryService.createOpeningStockDraft(
      'org-1',
      openingBody(),
      auth(),
    );
    await expect(
      inventoryService.getOpeningStock('org-2', draft.id, auth('org-2')),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lists both draft and posted opening stock records for the tenant', async () => {
    const { inventoryService } = setup();
    const authCtx = auth();

    const draft1 = await inventoryService.createOpeningStockDraft('org-1', openingBody(), authCtx);
    const draft2 = await inventoryService.createOpeningStockDraft(
      'org-1',
      openingBody({ quantity: '10', warehouseId: 'wh-2' }),
      authCtx,
    );

    await inventoryService.postOpeningStockDraft(
      'org-1',
      draft2.id,
      { expectedVersion: draft2.version },
      { actorId: 'owner-1' },
      authCtx,
      'list-test-post-1',
    );

    const all = await inventoryService.listOpeningStock('org-1', {}, authCtx);
    expect(all.items).toHaveLength(2);
    const statuses = all.items.map((item) => item.status).sort();
    expect(statuses).toEqual(['draft', 'posted']);

    const draftsOnly = await inventoryService.listOpeningStock('org-1', { status: 'draft' }, authCtx);
    expect(draftsOnly.items).toHaveLength(1);
    expect(draftsOnly.items[0].id).toBe(draft1.id);
    expect(draftsOnly.items[0].status).toBe('draft');

    const postedOnly = await inventoryService.listOpeningStock('org-1', { status: 'posted' }, authCtx);
    expect(postedOnly.items).toHaveLength(1);
    expect(postedOnly.items[0].id).toBe(draft2.id);
    expect(postedOnly.items[0].status).toBe('posted');
  });

  it('list endpoint reflects discard: discarded draft disappears immediately', async () => {
    const { inventoryService } = setup();
    const authCtx = auth();

    const draft = await inventoryService.createOpeningStockDraft('org-1', openingBody(), authCtx);

    const before = await inventoryService.listOpeningStock('org-1', {}, authCtx);
    expect(before.items).toHaveLength(1);

    await inventoryService.discardOpeningStockDraft('org-1', draft.id, { expectedVersion: draft.version }, authCtx);

    const after = await inventoryService.listOpeningStock('org-1', {}, authCtx);
    expect(after.items).toHaveLength(0);
  });

  it('list scopes results by warehouse assignment', async () => {
    const { inventoryService } = setup();
    const fullAuth = auth('org-1', ['wh-1', 'wh-2']);
    const restrictedAuth = auth('org-1', ['wh-1']);

    await inventoryService.createOpeningStockDraft('org-1', openingBody({ warehouseId: 'wh-1' }), fullAuth);
    await inventoryService.createOpeningStockDraft('org-1', openingBody({ warehouseId: 'wh-2' }), fullAuth);

    const fullList = await inventoryService.listOpeningStock('org-1', {}, fullAuth);
    expect(fullList.items).toHaveLength(2);

    const restrictedList = await inventoryService.listOpeningStock('org-1', {}, restrictedAuth);
    expect(restrictedList.items).toHaveLength(1);
    expect(restrictedList.items[0].warehouseId).toBe('wh-1');
  });

  it('list is tenant-isolated: org-2 cannot see org-1 records', async () => {
    const { inventoryService } = setup();
    await inventoryService.createOpeningStockDraft('org-1', openingBody(), auth('org-1'));
    const result = await inventoryService.listOpeningStock('org-2', {}, auth('org-2'));
    expect(result.items).toHaveLength(0);
  });
});
