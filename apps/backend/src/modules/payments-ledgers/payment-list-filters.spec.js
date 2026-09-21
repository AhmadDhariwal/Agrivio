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

  it('filters customer payments by customerId in store', async () => {
    const store = createInMemoryPaymentsStore();
    const base = {
      organizationId: 'org-1',
      partyType: 'customer',
      supplierId: null,
      accountId: 'account-1',
      allocationMode: 'general',
      amountMinorUnits: '10000',
      currency: 'PKR',
      notes: '',
      paymentDate: '2026-09-01',
      status: 'posted',
      postedBy: 'user-1',
    };
    await store.insertPayment(null, { ...base, customerId: 'cust-A' });
    await store.insertPayment(null, { ...base, customerId: 'cust-B' });
    await store.insertPayment(null, { ...base, customerId: 'cust-A' });

    const resultA = await store.listPaymentsPage(
      'org-1',
      { partyType: 'customer', customerId: 'cust-A' },
      { skip: 0, pageSize: 25 },
    );
    expect(resultA.total).toBe(2);
    expect(resultA.items.every((item) => item.customerId === 'cust-A')).toBe(true);

    const resultB = await store.listPaymentsPage(
      'org-1',
      { partyType: 'customer', customerId: 'cust-B' },
      { skip: 0, pageSize: 25 },
    );
    expect(resultB.total).toBe(1);
    expect(resultB.items[0].customerId === 'cust-B').toBe(true);
  });

  describe('appliedTo derivation via toPaymentDto', () => {
    const { toPaymentDto } = paymentsValidationModule;
    const dummyRecord = {
      _id: 'pay-1',
      organizationId: 'org-1',
      partyType: 'customer',
      customerId: 'cust-1',
      accountId: 'acc-1',
      allocationMode: 'general',
      amountMinorUnits: '10000',
      currency: 'PKR',
      paymentDate: '2026-09-01',
      status: 'posted',
    };

    it('Scenario A: sets appliedTo = receivable when allocated only to sale', () => {
      const allocations = [{ status: 'posted', targetType: 'sale' }];
      const dto = toPaymentDto(dummyRecord, allocations);
      expect(dto.appliedTo).toBe('receivable');
    });

    it('Scenario B: sets appliedTo = receivable when allocated only to customer_opening_receivable', () => {
      const allocations = [{ status: 'posted', targetType: 'customer_opening_receivable' }];
      const dto = toPaymentDto(dummyRecord, allocations);
      expect(dto.appliedTo).toBe('receivable');
    });

    it('Scenario C: sets appliedTo = advance when allocated only to customer_advance', () => {
      const allocations = [{ status: 'posted', targetType: 'customer_advance' }];
      const dto = toPaymentDto(dummyRecord, allocations);
      expect(dto.appliedTo).toBe('advance');
    });

    it('Scenario D: sets appliedTo = receivable_and_advance when partially settles receivable and remainder is advance', () => {
      const allocations = [
        { status: 'posted', targetType: 'sale' },
        { status: 'posted', targetType: 'customer_advance' },
      ];
      const dto = toPaymentDto(dummyRecord, allocations);
      expect(dto.appliedTo).toBe('receivable_and_advance');
    });

    it('Scenario E: sets appliedTo = null when allocations are voided or non-posted', () => {
      const voidedAllocations = [{ status: 'voided', targetType: 'sale' }];
      const dto = toPaymentDto(dummyRecord, voidedAllocations);
      expect(dto.appliedTo).toBeNull();

      const emptyDto = toPaymentDto(dummyRecord, []);
      expect(emptyDto.appliedTo).toBeNull();
    });

    it('enrichment includes customer summary without exposing internal ids', () => {
      const customer = { id: 'cust-1', name: 'Al-Madina Agri', phone: '0300-1122334' };
      const dto = toPaymentDto(dummyRecord, [], customer);
      expect(dto.customer).toEqual({
        id: 'cust-1',
        name: 'Al-Madina Agri',
        phone: '0300-1122334',
      });
    });
  });
});
