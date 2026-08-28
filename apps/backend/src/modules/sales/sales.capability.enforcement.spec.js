import { describe, expect, it, vi } from 'vitest';
import appErrorModule from '../../platform/errors/app-error';
import salesModule from './sales.module';

const { orgActionNotAllowed, orgFieldNotEditable } = appErrorModule;
const { createSalesService } = salesModule;

function draftRecord(overrides = {}) {
  return {
    _id: 'sale-1',
    organizationId: 'org-a',
    branchId: 'branch-1',
    warehouseId: 'warehouse-1',
    customerId: null,
    saleDate: '2026-08-28',
    notes: '',
    status: 'draft',
    version: 1,
    lines: [
      {
        productId: 'product-1',
        productNameSnapshot: 'Product One',
        packagingUnitId: null,
        unitCodeSnapshot: 'kg',
        conversionFactorSnapshot: '1',
        enteredQuantityMinorUnits: '10000',
        quantityBaseMinorUnits: '10000',
        unitPriceMinorUnits: '10000',
        lineProductAmountMinorUnits: '10000',
      },
    ],
    ...overrides,
  };
}

function createService(assertAllowed, record = draftRecord()) {
  return createSalesService({
    store: {
      findSaleById: vi.fn(async () => record),
      appendAuditEvent: vi.fn(async () => undefined),
      incrementInvoiceSequence: vi.fn(async () => 1),
    },
    persistence: 'memory',
    transactionRunner: { run: async (work) => work({}) },
    idempotency: {
      execute: async (_scope, _key, _payload, work) => ({ replay: false, response: await work() }),
    },
    catalogService: {
      getProduct: vi.fn(async () => ({
        id: 'product-1',
        name: 'Product One',
        status: 'active',
        trackingMode: 'none',
      })),
      listPrices: vi.fn(async () => ({
        items: [
          {
            status: 'active',
            priceTier: 'retail',
            price: { amount: '1.00', currency: 'PKR' },
          },
        ],
      })),
      listPackagingUnits: vi.fn(async () => ({ items: [] })),
    },
    customersService: {
      getCustomer: vi.fn(async () => ({
        id: 'customer-1',
        name: 'Customer One',
        status: 'active',
        priceTier: 'retail',
        creditEnabled: true,
        customerType: 'business',
        creditLimit: { amount: '1000.00', currency: 'PKR' },
        creditLimitBehaviour: 'warning',
      })),
    },
    locationsService: {
      getBranch: vi.fn(async () => ({
        id: 'branch-1',
        name: 'Main',
        status: 'active',
        invoicePrefix: 'MAIN',
      })),
      getWarehouse: vi.fn(async () => ({
        id: 'warehouse-1',
        name: 'Main Warehouse',
        status: 'active',
      })),
    },
    inventoryService: {},
    paymentsService: {},
    accountsService: {},
    capabilityService: { assertAllowed },
  });
}

describe('Sales capability service enforcement', () => {
  it.each([
    ['customer', { customerId: 'customer-1' }],
    ['notes', { notes: 'private note' }],
    ['packagingUnit', { lines: [{ packagingUnitId: 'pack-1' }] }],
  ])('blocks disabled %s edits before domain mutation', async (field, body) => {
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === `sales.fields.${field}`) throw orgFieldNotEditable(`${field} disabled`);
    });
    const service = createService(assertAllowed);
    await expect(
      service.createSaleDraft('org-a', body, { userId: 'user-a' }),
    ).rejects.toMatchObject({ code: 'ORG_FIELD_NOT_EDITABLE' });
    expect(assertAllowed).toHaveBeenCalledWith('org-a', `sales.fields.${field}`, 'editable');
  });

  it.each([
    [
      'addPaymentAtPost',
      { payments: [{ accountId: 'account-1', amount: { amount: '1.00', currency: 'PKR' } }] },
    ],
    [
      'approveCreditLimit',
      { approvals: { creditLimit: { reason: 'Manager approved projected receivable' } } },
    ],
    [
      'approveExpiredStock',
      { approvals: { expiredStock: { reason: 'Customer accepted expired stock' } } },
    ],
    [
      'overrideNegativeStock',
      { approvals: { negativeStock: { reason: 'Owner approved negative stock' } } },
    ],
  ])('blocks disabled %s before idempotent posting begins', async (action, body) => {
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === `sales.actions.${action}`) throw orgActionNotAllowed(`${action} disabled`);
    });
    const service = createService(assertAllowed);
    await expect(
      service.postSale(
        'org-a',
        'sale-1',
        { expectedVersion: 1, payments: [], ...body },
        { userId: 'user-a', permissions: [] },
        'key-1',
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
  });

  it('blocks selling on credit only after the domain determines a receivable exists', async () => {
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'sales.actions.sellOnCredit') throw orgActionNotAllowed('Credit disabled');
    });
    const service = createService(assertAllowed);
    await expect(
      service.postSale(
        'org-a',
        'sale-1',
        { expectedVersion: 1, payments: [] },
        { userId: 'user-a', permissions: ['sales.post'] },
        'key-1',
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
    expect(assertAllowed).toHaveBeenCalledWith(
      'org-a',
      'sales.actions.sellOnCredit',
      'allowed',
    );
  });

  it('blocks price override only when entered price differs from the resolved tier price', async () => {
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'sales.actions.overridePrice') throw orgActionNotAllowed('Override disabled');
    });
    const service = createService(
      assertAllowed,
      draftRecord({
        customerId: 'customer-1',
        lines: [
          {
            ...draftRecord().lines[0],
            unitPriceMinorUnits: '20000',
            lineProductAmountMinorUnits: '20000',
          },
        ],
      }),
    );
    await expect(
      service.postSale(
        'org-a',
        'sale-1',
        {
          expectedVersion: 1,
          payments: [
            { accountId: 'account-1', amount: { amount: '200.00', currency: 'PKR' } },
          ],
          linePriceOverrides: [{ lineIndex: 0, reason: 'Negotiated sale price' }],
        },
        { userId: 'user-a', permissions: ['sales.post', 'pricing.override'] },
        'key-1',
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
    expect(assertAllowed).toHaveBeenCalledWith(
      'org-a',
      'sales.actions.overridePrice',
      'allowed',
    );
  });
});
