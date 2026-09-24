import { describe, expect, it, vi } from 'vitest';

const { createFinancialReporting } = require('./financial-reporting');
const { renderCsv } = require('./report-exports');

function movement(id, accountId, amount, sourceType, sourceId, businessDate, extra = {}) {
  return {
    id,
    organizationId: 'org-1',
    accountId,
    signedAmount: { amount, currency: 'PKR' },
    sourceType,
    sourceId,
    status: 'posted',
    postedAt: `${businessDate}T10:00:00.000Z`,
    postedBy: 'user-1',
    businessDate,
    reference: null,
    purpose: null,
    category: null,
    notes: null,
    reversalOfId: null,
    ...extra,
  };
}

function fixture(overrides = {}) {
  const accounts = [
    { id: 'cash-1', name: 'Till', accountType: 'cash', status: 'active', derivedBalances: { balance: { amount: '650.00', currency: 'PKR' } } },
    { id: 'bank-1', name: 'Bank', accountType: 'bank', status: 'active', derivedBalances: { balance: { amount: '400.00', currency: 'PKR' } } },
    { id: 'wallet-1', name: 'JazzCash', accountType: 'jazzcash', status: 'active', derivedBalances: { balance: { amount: '50.00', currency: 'PKR' } } },
  ];
  const movements = [
    movement('opening', 'cash-1', '1000.00', 'account_opening', 'opening', '2026-09-23'),
    movement('sale', 'cash-1', '100.00', 'customer_payment', 'sale-1', '2026-09-24'),
    movement('transfer-out', 'cash-1', '-400.00', 'account_transfer_out', 'transfer-1', '2026-09-24'),
    movement('transfer-in', 'bank-1', '400.00', 'account_transfer_in', 'transfer-1', '2026-09-24'),
    movement('add', 'cash-1', '25.00', 'manual_inflow', 'add-1', '2026-09-24', { category: 'unclassified' }),
    movement('withdraw', 'cash-1', '-50.00', 'manual_outflow', 'withdraw-1', '2026-09-24', { category: 'unclassified' }),
    movement('adjust', 'cash-1', '-25.00', 'balance_adjustment_decrease', 'adjust-1', '2026-09-24', { balanceBefore: { amount: '675.00', currency: 'PKR' }, desiredBalance: { amount: '650.00', currency: 'PKR' }, purpose: 'Till count' }),
  ];
  const accountsService = {
    listAccounts: vi.fn(async () => ({ items: accounts, total: accounts.length })),
    listPostedMovementsForReporting: vi.fn(async () => movements),
  };
  const paymentsService = {
    listCustomerReceivableBalances: vi.fn(async () => ({ items: [{ customerId: 'customer-1', receivableMinorUnits: '20000' }] })),
    listCustomerLoanReceivableBalances: vi.fn(async () => ({ items: [{ customerId: 'customer-1', loanReceivableMinorUnits: '30000' }] })),
    listCustomerAdvanceBalances: vi.fn(async () => ({ items: [{ customerId: 'customer-1', advanceMinorUnits: '5000' }] })),
    listSupplierPayableBalances: vi.fn(async () => ({ items: [{ supplierId: 'supplier-1', payableMinorUnits: '40000' }] })),
    listSupplierAdvanceBalances: vi.fn(async () => ({ items: [{ supplierId: 'supplier-1', advanceMinorUnits: '10000' }] })),
  };
  const customerFinanceService = {
    listLoans: vi.fn(async () => ({ items: [{ id: 'loan-1', customerId: 'customer-1', principal: { amount: '300.00', currency: 'PKR' }, repaid: { amount: '0.00', currency: 'PKR' }, outstanding: { amount: '300.00', currency: 'PKR' }, businessDate: '2026-09-24', dueDate: '2026-10-24', status: 'open', disbursementAccountId: 'cash-1' }], total: 1, page: 1, pageSize: 25 })),
    listAdjustmentsForReporting: vi.fn(async () => [{ id: 'customer-adjustment', customerId: 'customer-1', balanceType: 'trade_receivable', expectedCurrentBalance: { amount: '100.00', currency: 'PKR' }, desiredBalance: { amount: '110.00', currency: 'PKR' }, delta: { amount: '10.00', currency: 'PKR' }, businessDate: '2026-09-24', reason: 'Correction', status: 'posted', reversalOfId: null }]),
  };
  const supplierFinanceService = {
    listRefunds: vi.fn(async () => ({ items: [{ id: 'refund-1', supplierId: 'supplier-1', accountId: 'bank-1', amount: { amount: '50.00', currency: 'PKR' }, businessDate: '2026-09-24', status: 'posted', reference: 'RF-1' }], total: 1, page: 1, pageSize: 25 })),
    listAdjustmentsForReporting: vi.fn(async () => [{ id: 'supplier-adjustment', supplierId: 'supplier-1', balanceType: 'supplier_advance', expectedCurrentBalance: { amount: '80.00', currency: 'PKR' }, desiredBalance: { amount: '100.00', currency: 'PKR' }, delta: { amount: '20.00', currency: 'PKR' }, businessDate: '2026-09-24', reason: 'Correction', status: 'posted', reversalOfId: null }]),
  };
  return {
    reporting: createFinancialReporting({ accountsService, paymentsService, customerFinanceService, supplierFinanceService, ...overrides }),
    accountsService,
    paymentsService,
    customerFinanceService,
    supplierFinanceService,
    movements,
  };
}

describe('Phase 4 financial reporting', () => {
  it('builds authoritative liquid, customer, and supplier positions from bulk reads', async () => {
    const { reporting, accountsService, paymentsService } = fixture();
    const result = await reporting.financialPosition('org-1');

    expect(result.liquidPosition).toMatchObject({
      cashInHand: { amount: '650.00' },
      bankBalances: { amount: '400.00' },
      otherLiquidAccounts: { amount: '50.00' },
      totalLiquidFunds: { amount: '1100.00' },
    });
    expect(result.customerPosition).toMatchObject({ tradeReceivable: { amount: '200.00' }, customerLoanReceivable: { amount: '300.00' }, customerAdvance: { amount: '50.00' }, netTradeExposure: { amount: '150.00' }, totalCustomerExposure: { amount: '450.00' } });
    expect(result.supplierPosition).toMatchObject({ supplierPayable: { amount: '400.00' }, supplierAdvance: { amount: '100.00' }, netSupplierPayable: { amount: '300.00' } });
    expect(accountsService.listAccounts).toHaveBeenCalledTimes(1);
    expect(paymentsService.listCustomerReceivableBalances).toHaveBeenCalledTimes(1);
  });

  it('excludes transfer legs from daily external flow and reports unclassified net', async () => {
    const { reporting } = fixture();
    const result = await reporting.dailyCashPosition('org-1', { businessDate: '2026-09-24' });

    expect(result.openingLiquidFunds.amount).toBe('1000.00');
    expect(result.businessExternalInflows.amount).toBe('100.00');
    expect(result.manualExternalInflows.amount).toBe('25.00');
    expect(result.manualExternalOutflows.amount).toBe('50.00');
    expect(result.accountBalanceAdjustments.amount).toBe('-25.00');
    expect(result.internalTransfers.amount).toBe('400.00');
    expect(result.internalTransferNet.amount).toBe('0.00');
    expect(result.closingLiquidFunds.amount).toBe('1050.00');
    expect(result.unclassifiedTreasury).toMatchObject({ inflow: { amount: '25.00' }, outflow: { amount: '50.00' }, net: { amount: '-25.00' } });
    expect(result.reconciliation.status).toBe('Reconciled');
  });

  it('returns an account statement equation while retaining the individual transfer leg', async () => {
    const { reporting } = fixture();
    const result = await reporting.accountStatement('org-1', { accountId: 'cash-1', fromDate: '2026-09-24', toDate: '2026-09-24', page: 1, pageSize: 25 });

    expect(result.openingBalance.amount).toBe('1000.00');
    expect(result.periodInflow.amount).toBe('125.00');
    expect(result.periodOutflow.amount).toBe('475.00');
    expect(result.closingBalance.amount).toBe('650.00');
    expect(result.rows.some((row) => row.sourceType === 'account_transfer_out')).toBe(true);
    expect(result.pagination).toMatchObject({ page: 1, pageSize: 25, total: 5, totalPages: 1 });
  });

  it('shows one business transfer row and detects incomplete transfer fixtures', async () => {
    const complete = fixture();
    const report = await complete.reporting.transfers('org-1', { page: 1, pageSize: 25 });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ id: 'transfer-1', status: 'posted', integrity: 'complete', amount: { amount: '400.00' } });

    const incompleteMovements = complete.movements.filter((row) => row.id !== 'transfer-in');
    const incomplete = fixture({ accountsService: { listAccounts: complete.accountsService.listAccounts, listPostedMovementsForReporting: vi.fn(async () => incompleteMovements) } });
    const reconciliation = await incomplete.reporting.reconciliation('org-1', { page: 1, pageSize: 25 });
    expect(reconciliation.status).toBe('Needs Review');
    expect(reconciliation.rows.some((row) => row.code === 'ACCOUNT_TRANSFER_UNBALANCED')).toBe(true);
  });

  it('combines account, customer, and supplier adjustments without writing financial state', async () => {
    const { reporting, accountsService, customerFinanceService, supplierFinanceService } = fixture();
    const result = await reporting.manualAdjustments('org-1', { page: 1, pageSize: 25 });

    expect(result.rows.map((row) => row.domain)).toEqual(expect.arrayContaining(['account', 'customer', 'supplier']));
    expect(result.rows.find((row) => row.domain === 'account')).toMatchObject({ beforeAmount: { amount: '675.00' }, afterAmount: { amount: '650.00' } });
    expect(accountsService.listPostedMovementsForReporting).toHaveBeenCalledTimes(1);
    expect(customerFinanceService.listAdjustmentsForReporting).toHaveBeenCalledTimes(1);
    expect(supplierFinanceService.listAdjustmentsForReporting).toHaveBeenCalledTimes(1);
    expect(Object.values(accountsService).some((fn) => fn.mock?.calls.some((call) => call[0] === 'write'))).toBe(false);
  });

  it('reuses loan/refund bulk services and keeps wallets out of bank book', async () => {
    const { reporting } = fixture();
    const [loans, refunds, bankBook] = await Promise.all([
      reporting.customerLoans('org-1', { page: 1, pageSize: 25 }),
      reporting.supplierRefunds('org-1', { page: 1, pageSize: 25 }),
      reporting.bankBook('org-1', { page: 1, pageSize: 25 }),
    ]);
    expect(loans.rows[0]).toMatchObject({ id: 'loan-1', outstanding: { amount: '300.00' } });
    expect(refunds.rows[0]).toMatchObject({ id: 'refund-1', amount: { amount: '50.00' } });
    expect(bankBook.rows.every((row) => row.accountType === 'bank')).toBe(true);
  });

  it('reuses the existing export renderer with inferred columns and readable money cells', async () => {
    const { reporting } = fixture();
    const dataset = await reporting.accountStatement('org-1', { accountId: 'cash-1', page: 1, pageSize: 25 });
    const csv = renderCsv(dataset).toString('utf8');
    expect(csv).toContain('Business Date');
    expect(csv).toContain('1000.00 PKR');
    expect(csv).not.toContain('[object Object]');
  });
});
