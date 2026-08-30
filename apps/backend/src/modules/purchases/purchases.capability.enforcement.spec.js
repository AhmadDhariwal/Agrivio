import { describe, expect, it, vi } from 'vitest';
import appErrorModule from '../../platform/errors/app-error';
import purchasesModule from './purchases.module';

const { orgActionNotAllowed, orgFieldNotEditable } = appErrorModule;
const { createPurchasesService } = purchasesModule;

function createService(assertAllowed, store = {}) {
  return createPurchasesService({
    store,
    persistence: 'memory',
    transactionRunner: { run: async (work) => work({}) },
    catalogService: {},
    suppliersService: {},
    locationsService: {},
    inventoryService: {},
    paymentsService: {},
    accountsService: {},
    capabilityService: { assertAllowed },
  });
}

describe('Purchases capability service enforcement', () => {
  it.each([
    ['branch', { branchId: 'branch-1' }],
    ['supplierInvoiceReference', { supplierInvoiceReference: 'INV-1' }],
    ['notes', { notes: 'private note' }],
    ['packagingUnit', { lines: [{ packagingUnitId: 'pack-1' }] }],
    ['manufacturingDate', { lines: [{ manufacturingDate: '2026-08-27' }] }],
    ['landedCosts', { landedCosts: { freight: { amount: '1.00', currency: 'PKR' } } }],
  ])('blocks disabled %s edits before domain mutation', async (field, body) => {
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === `purchases.fields.${field}`) throw orgFieldNotEditable(`${field} disabled`);
    });
    const service = createService(assertAllowed);
    await expect(
      service.createPurchaseDraft('org-a', body, { userId: 'user-a' }),
    ).rejects.toMatchObject({ code: 'ORG_FIELD_NOT_EDITABLE' });
    expect(assertAllowed).toHaveBeenCalledWith(
      'org-a',
      `purchases.fields.${field}`,
      'editable',
    );
  });

  it('blocks payment-at-post independently before idempotent posting begins', async () => {
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'purchases.actions.addPaymentAtPost') {
        throw orgActionNotAllowed('Payment at post disabled');
      }
    });
    const service = createService(assertAllowed);
    await expect(
      service.postPurchase(
        'org-a',
        'purchase-1',
        { expectedVersion: 1, payments: [{ accountId: 'account-1' }] },
        { userId: 'user-a' },
        'key-1',
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
  });

  it('does not capability-gate the internal unpaid-purchase read model', async () => {
    const assertAllowed = vi.fn();
    const service = createService(assertAllowed, {
      listPurchases: vi.fn(async () => ({ items: [], total: 0 })),
    });
    await expect(service.listUnpaidSupplierPurchases('org-a', 'supplier-1')).resolves.toEqual([]);
    expect(assertAllowed).not.toHaveBeenCalled();
  });
});
