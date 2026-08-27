import { describe, expect, it, vi } from 'vitest';
import appErrorModule from '../../platform/errors/app-error';
import paymentsServiceModule from './payments.service';

const { conflict, orgActionNotAllowed, orgFieldNotEditable } = appErrorModule;
const { createPaymentsService } = paymentsServiceModule;

function createService(assertAllowed, store = {}) {
  return createPaymentsService({
    store,
    persistence: 'memory',
    ledgersService: {},
    accountsService: {},
    suppliersService: {},
    customersService: {},
    transactionRunner: { run: async (work) => work({}) },
    capabilityService: { assertAllowed },
  });
}

const VALID_PAYMENT = {
  supplierId: 'supplier-1',
  accountId: 'account-1',
  allocationMode: 'general',
  amount: { amount: '10.00', currency: 'PKR' },
  paymentDate: '2026-08-27',
};

describe('Supplier Payments capability service enforcement', () => {
  it('blocks disabled optional field edits before payment parsing or mutation', async () => {
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'payments.supplier.fields.notes') {
        throw orgFieldNotEditable('Notes disabled');
      }
    });
    const service = createService(assertAllowed);
    await expect(
      service.postSupplierPayment(
        'org-a',
        { ...VALID_PAYMENT, notes: 'Private note' },
        { actorId: 'user-a' },
        'key-1',
      ),
    ).rejects.toMatchObject({ code: 'ORG_FIELD_NOT_EDITABLE' });
    expect(assertAllowed).toHaveBeenCalledWith(
      'org-a',
      'payments.supplier.fields.notes',
      'editable',
    );
  });

  it('blocks invoice-specific posting independently before domain mutation', async () => {
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'payments.supplier.actions.postInvoiceSpecific') {
        throw orgActionNotAllowed('Invoice-specific payments disabled');
      }
    });
    const service = createService(assertAllowed);
    await expect(
      service.postSupplierPayment(
        'org-a',
        {
          ...VALID_PAYMENT,
          allocationMode: 'invoice_specific',
          allocations: [
            { purchaseId: 'purchase-1', amount: { amount: '10.00', currency: 'PKR' } },
          ],
        },
        { actorId: 'user-a' },
        'key-2',
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });
  });

  it('blocks supplier correction while leaving customer correction outside the submodule', async () => {
    const assertAllowed = vi.fn(async (_organizationId, key) => {
      if (key === 'payments.supplier.actions.correct') {
        throw orgActionNotAllowed('Supplier correction disabled');
      }
    });
    const supplierService = createService(assertAllowed, {
      findPaymentById: vi.fn(async () => ({ _id: 'payment-1', partyType: 'supplier' })),
    });
    await expect(
      supplierService.correctPayment(
        'org-a',
        'payment-1',
        { reason: 'Wrong amount' },
        { actorId: 'user-a' },
        'key-3',
      ),
    ).rejects.toMatchObject({ code: 'ORG_ACTION_NOT_ALLOWED' });

    const customerAssertAllowed = vi.fn();
    const customerService = createService(customerAssertAllowed, {
      findPaymentById: vi.fn(async () => ({
        _id: 'payment-2',
        partyType: 'customer',
        correctionOfId: 'payment-1',
      })),
    });
    await expect(
      customerService.correctPayment(
        'org-a',
        'payment-2',
        { reason: 'Already corrective' },
        { actorId: 'user-a' },
        'key-4',
      ),
    ).rejects.toMatchObject({ code: conflict().code });
    expect(customerAssertAllowed).not.toHaveBeenCalled();
  });

  it('does not capability-gate the session-scoped supplier posting primitive', async () => {
    const assertAllowed = vi.fn();
    const store = {
      insertPayment: vi.fn(async (_session, input) => ({ _id: 'payment-1', ...input })),
      appendAuditEvent: vi.fn(async () => undefined),
    };
    const service = createService(assertAllowed, store);
    await expect(
      service.postSupplierPaymentInSession({}, {
        organizationId: 'org-a',
        supplierId: 'supplier-1',
        accountId: 'account-1',
        allocationMode: 'general',
        amountMinorUnits: '1000',
        paymentDate: '2026-08-27',
        purchaseAllocations: [],
        advanceAmountMinorUnits: '0',
        postedAt: new Date('2026-08-27T00:00:00.000Z'),
        postedBy: 'user-a',
        postAccountMovement: false,
      }),
    ).resolves.toMatchObject({ payment: { _id: 'payment-1' }, allocations: [] });
    expect(assertAllowed).not.toHaveBeenCalled();
  });
});
