import { describe, expect, it } from 'vitest';

const salesPublic = require('./public/index');
const paymentsPublic = require('../payments-ledgers/public/index');

describe('F06 P1 public contracts', () => {
  it('exposes sales module and invoice formatting without persistence imports', () => {
    expect(typeof salesPublic.createSalesModule).toBe('function');
    expect(typeof salesPublic.createSalesService).toBe('function');
    expect(typeof salesPublic.formatInvoiceNumber).toBe('function');
    expect(salesPublic.formatInvoiceNumber('TST', 3)).toBe('TST-000003');
  });

  it('exposes customer payment allocation on payments public contract', () => {
    expect(typeof paymentsPublic.allocateGeneralCustomerPayment).toBe('function');
    expect(typeof paymentsPublic.createPaymentsService).toBe('function');
  });
});
