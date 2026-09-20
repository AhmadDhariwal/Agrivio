import { describe, expect, it } from 'vitest';
import { humanizeLedgerItem, formatLedgerAmount } from './ledger-presentation.util';
import { CustomerLedgerEffectRecord } from './customer-payments.models';

describe('Ledger Presentation Utility', () => {
  it('formats customer advance received matching requirement example', () => {
    const record: CustomerLedgerEffectRecord = {
      id: 'effect-1',
      organizationId: 'org-1',
      partyType: 'customer',
      customerId: 'cust-1',
      supplierId: null,
      effectKind: 'advance',
      signedAmount: { amount: '20000.00', currency: 'PKR' },
      currency: 'PKR',
      sourceType: 'customer_payment_advance',
      sourceId: '6a835a6bc5d6f02a711e5d13',
      status: 'posted',
      postedAt: '2026-09-20T15:56:48.000Z',
      postedBy: 'user-1',
    };

    const result = humanizeLedgerItem(record);

    expect(result.title).toBe('Customer Advance Received');
    expect(result.date).toContain('2026');
    expect(result.date).toContain('20');
    expect(result.time).toMatch(/^(0[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/);
    expect(result.sourceReference).toContain('Customer Advance #1E5D13');
    expect(result.formattedAmount).toBe('+ PKR 20,000');
    expect(result.amountSign).toBe('+');
    expect(result.isPositive).toBe(true);
  });

  it('formats advance consumed matching requirement example', () => {
    const record: CustomerLedgerEffectRecord = {
      id: 'effect-2',
      organizationId: 'org-1',
      partyType: 'customer',
      customerId: 'cust-1',
      supplierId: null,
      effectKind: 'advance',
      signedAmount: { amount: '-5800.00', currency: 'PKR' },
      currency: 'PKR',
      sourceType: 'customer_advance_consumption',
      sourceId: 'sale-101',
      status: 'posted',
      postedAt: '2026-09-20T15:56:48.000Z',
      postedBy: 'user-1',
    };

    const result = humanizeLedgerItem(record);

    expect(result.title).toBe('Advance Consumed');
    expect(result.formattedAmount).toBe('- PKR 5,800');
    expect(result.amountSign).toBe('-');
    expect(result.isPositive).toBe(false);
    expect(result.sourceReference).toBe('Advance Consumption sale-101');
  });

  it('provides safe fallback for unknown sourceType', () => {
    const record: CustomerLedgerEffectRecord = {
      id: 'effect-3',
      organizationId: 'org-1',
      partyType: 'customer',
      customerId: 'cust-1',
      supplierId: null,
      effectKind: 'custom_kind',
      signedAmount: { amount: '1250.50', currency: 'PKR' },
      currency: 'PKR',
      sourceType: 'unknown_future_transaction',
      sourceId: 'src-99',
      status: 'posted',
      postedAt: '2026-09-20T15:56:48.000Z',
      postedBy: 'user-1',
    };

    const result = humanizeLedgerItem(record);

    expect(result.title).toBe('Unknown Future Transaction');
    expect(result.sourceTypeLabel).toBe('Unknown Future Transaction');
    expect(result.formattedAmount).toBe('+ PKR 1,250.50');
  });

  it('preserves decimal fractions when non-zero', () => {
    expect(formatLedgerAmount('5800.75').formatted).toBe('+ PKR 5,800.75');
    expect(formatLedgerAmount('-5800.75').formatted).toBe('- PKR 5,800.75');
  });
});
