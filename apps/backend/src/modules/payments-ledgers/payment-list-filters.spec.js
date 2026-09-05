import { describe, expect, it } from 'vitest';
import paymentsStoreModule from './payments.store';
import paymentsValidationModule from './payments.validation';

const { createInMemoryPaymentsStore } = paymentsStoreModule;
const { parsePaymentListFilters } = paymentsValidationModule;

describe('payment list filters', () => {
  it('normalizes exact dates and inclusive ranges', () => {
    expect(parsePaymentListFilters({ paymentDate: ' 2026-09-05 ' })).toEqual({
      paymentDate: '2026-09-05',
    });
    expect(parsePaymentListFilters({ fromDate: '2026-09-01', toDate: '2026-09-30' })).toEqual({
      fromDate: '2026-09-01',
      toDate: '2026-09-30',
    });
  });

  it('treats a legacy date-only search as an exact date without also text-searching notes', () => {
    expect(parsePaymentListFilters({ search: '2026-09-05' })).toEqual({
      paymentDate: '2026-09-05',
    });
  });

  it.each([
    [{ paymentDate: '2026-02-30' }, 'paymentDate'],
    [{ fromDate: '2026-09-10', toDate: '2026-09-01' }, 'fromDate'],
    [{ paymentDate: '2026-09-05', fromDate: '2026-09-01' }, 'paymentDate'],
  ])('rejects invalid or ambiguous date filters %#', (query, field) => {
    expect(() => parsePaymentListFilters(query)).toThrow();
    try {
      parsePaymentListFilters(query);
    } catch (error) {
      expect(error.statusCode).toBe(400);
      expect(error.details[0].field).toBe(field);
    }
  });

  it('filters inclusive date boundaries', async () => {
    const store = createInMemoryPaymentsStore();
    const base = {
      organizationId: 'org-1',
      partyType: 'customer',
      customerId: 'customer-1',
      supplierId: null,
      accountId: 'account-1',
      allocationMode: 'general',
      amountMinorUnits: '10000',
      currency: 'PKR',
      notes: '',
      status: 'posted',
      postedBy: 'user-1',
    };
    await store.insertPayment(null, {
      ...base,
      paymentDate: '2026-09-01',
      postedAt: new Date('2026-09-06T12:00:00Z'),
    });
    await store.insertPayment(null, {
      ...base,
      paymentDate: '2026-09-05',
      postedAt: new Date('2026-09-05T12:00:00Z'),
    });
    await store.insertPayment(null, {
      ...base,
      paymentDate: '2026-09-10',
      postedAt: new Date('2026-09-04T12:00:00Z'),
    });

    const result = await store.listPaymentsPage(
      'org-1',
      { partyType: 'customer', fromDate: '2026-09-01', toDate: '2026-09-05' },
      { skip: 0, pageSize: 25 },
    );

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.paymentDate).sort()).toEqual([
      '2026-09-01',
      '2026-09-05',
    ]);
  });
});
