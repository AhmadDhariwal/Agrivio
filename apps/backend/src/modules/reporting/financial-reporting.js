const { formatMoneyMinorUnits } = require('../../platform/primitives/money-and-time');

const TRANSFER_TYPES = new Set([
  'account_transfer_out',
  'account_transfer_in',
  'account_transfer_out_reversal',
  'account_transfer_in_reversal',
]);
const ADJUSTMENT_TYPES = new Set([
  'balance_adjustment_increase',
  'balance_adjustment_decrease',
  'balance_adjustment_increase_reversal',
  'balance_adjustment_decrease_reversal',
]);
const MANUAL_TYPES = new Set([
  'manual_inflow',
  'manual_outflow',
  'manual_inflow_reversal',
  'manual_outflow_reversal',
]);

const SOURCE_LABELS = Object.freeze({
  account_opening: 'Account opening balance',
  supplier_payment: 'Supplier payment',
  purchase_payment: 'Direct purchase payment',
  customer_payment: 'Customer payment / sale receipt',
  purchase_cancellation_refund: 'Purchase cancellation refund',
  purchase_return_refund: 'Purchase return refund',
  sale_cancellation_refund: 'Sale cancellation refund',
  sales_return_refund: 'Sales return refund',
  purchase_return_refund_reversal: 'Purchase return refund reversal',
  sales_return_refund_reversal: 'Sales return refund reversal',
  manual_inflow: 'Add money',
  manual_outflow: 'Withdraw money',
  manual_inflow_reversal: 'Add money reversal',
  manual_outflow_reversal: 'Withdraw money reversal',
  balance_adjustment_increase: 'Account balance adjustment increase',
  balance_adjustment_decrease: 'Account balance adjustment decrease',
  balance_adjustment_increase_reversal: 'Account balance adjustment increase reversal',
  balance_adjustment_decrease_reversal: 'Account balance adjustment decrease reversal',
  account_transfer_out: 'Account transfer out',
  account_transfer_in: 'Account transfer in',
  account_transfer_out_reversal: 'Transfer reversal in',
  account_transfer_in_reversal: 'Transfer reversal out',
  expense: 'Expense',
  expense_correction: 'Expense correction',
  customer_payment_correction: 'Customer payment correction',
  supplier_payment_correction: 'Supplier payment correction',
  customer_loan_disbursement: 'Customer loan disbursement',
  customer_loan_repayment: 'Customer loan repayment',
  customer_loan_repayment_reversal: 'Customer loan repayment reversal',
  customer_loan_reversal: 'Customer loan reversal',
  supplier_advance_refund: 'Supplier advance refund',
  supplier_advance_refund_reversal: 'Supplier advance refund reversal',
});

function money(value) {
  return { amount: formatMoneyMinorUnits(BigInt(value)), currency: 'PKR' };
}

function movementMinor(row) {
  if (row.signedAmountMinorUnits !== undefined) return BigInt(String(row.signedAmountMinorUnits));
  const amount = String(row.signedAmount?.amount ?? '0');
  const negative = amount.startsWith('-');
  const [whole, fraction = ''] = amount.replace('-', '').split('.');
  const parsed = BigInt(`${whole || '0'}${fraction.padEnd(2, '0').slice(0, 2)}`);
  return negative ? -parsed : parsed;
}

function effectiveDate(row) {
  return row.businessDate || String(row.postedAt ?? row.createdAt ?? '').slice(0, 10) || null;
}

function pagination(filters, total) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  return { page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) };
}

function pageRows(rows, filters) {
  const meta = pagination(filters, rows.length);
  const skip = (meta.page - 1) * meta.pageSize;
  return { rows: rows.slice(skip, skip + meta.pageSize), pagination: meta };
}

function movementMatches(row, filters) {
  const date = effectiveDate(row);
  if (filters.fromDate && (!date || date < filters.fromDate)) return false;
  if (filters.toDate && (!date || date > filters.toDate)) return false;
  if (filters.sourceType && row.sourceType !== filters.sourceType) return false;
  if (filters.status && String(row.status ?? 'posted') !== filters.status) return false;
  const signed = movementMinor(row);
  if (filters.direction === 'inflow' && signed <= 0n) return false;
  if (filters.direction === 'outflow' && signed >= 0n) return false;
  if (filters.search) {
    const haystack = `${row.reference ?? ''} ${row.purpose ?? ''} ${row.category ?? ''} ${row.notes ?? ''}`.toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) return false;
  }
  return true;
}

function movementRow(row, account, runningBalance) {
  const signed = movementMinor(row);
  return {
    id: row.id ?? String(row._id),
    businessDate: effectiveDate(row),
    dateSource: row.businessDate ? 'businessDate' : 'postedAt_fallback',
    postedAt: row.postedAt,
    accountId: row.accountId,
    accountName: account?.name ?? row.accountId,
    accountType: account?.accountType ?? null,
    sourceType: row.sourceType,
    sourceLabel: SOURCE_LABELS[row.sourceType] ?? (signed >= 0n ? 'Other external inflow' : 'Other external outflow'),
    sourceId: row.sourceId,
    reference: row.reference ?? null,
    description: row.purpose ?? row.notes ?? SOURCE_LABELS[row.sourceType] ?? row.sourceType,
    category: row.category ?? null,
    inflow: money(signed > 0n ? signed : 0n),
    outflow: money(signed < 0n ? -signed : 0n),
    signedAmount: money(signed),
    runningBalance: runningBalance === undefined ? null : money(runningBalance),
    status: row.status ?? 'posted',
    reversalOfId: row.reversalOfId ?? null,
  };
}

function sumMoneyItems(items, field) {
  return (items ?? []).reduce((sum, item) => sum + BigInt(String(item[field] ?? '0')), 0n);
}

function createFinancialReporting(deps) {
  const accountsService = deps.accountsService;
  const paymentsService = deps.paymentsService;
  const customerFinanceService = deps.customerFinanceService;
  const supplierFinanceService = deps.supplierFinanceService;
  const now = deps.now ?? (() => new Date());

  async function context(organizationId) {
    const [{ items: accounts }, movements] = await Promise.all([
      accountsService.listAccounts(organizationId),
      accountsService.listPostedMovementsForReporting(organizationId),
    ]);
    return {
      accounts,
      movements,
      accountMap: new Map(accounts.map((item) => [String(item.id), item])),
    };
  }

  async function financialPosition(organizationId) {
    const [{ items: accounts }, receivables, loans, advances, payables, supplierAdvances] = await Promise.all([
      accountsService.listAccounts(organizationId),
      paymentsService.listCustomerReceivableBalances(organizationId),
      paymentsService.listCustomerLoanReceivableBalances(organizationId),
      paymentsService.listCustomerAdvanceBalances(organizationId),
      paymentsService.listSupplierPayableBalances(organizationId),
      paymentsService.listSupplierAdvanceBalances(organizationId),
    ]);
    const liquid = { cash: 0n, bank: 0n, other: 0n };
    for (const account of accounts) {
      if (account.status !== 'active') continue;
      const balance = movementMinor({ signedAmount: account.derivedBalances?.balance ?? { amount: '0.00' } });
      if (account.accountType === 'cash') liquid.cash += balance;
      else if (account.accountType === 'bank') liquid.bank += balance;
      else liquid.other += balance;
    }
    const trade = sumMoneyItems(receivables.items, 'receivableMinorUnits');
    const loan = sumMoneyItems(loans.items, 'loanReceivableMinorUnits');
    const customerAdvance = sumMoneyItems(advances.items, 'advanceMinorUnits');
    const payable = sumMoneyItems(payables.items, 'payableMinorUnits');
    const supplierAdvance = sumMoneyItems(supplierAdvances.items, 'advanceMinorUnits');
    const rows = [
      ['Liquid Position', 'Cash in Hand', liquid.cash],
      ['Liquid Position', 'Bank Balances', liquid.bank],
      ['Liquid Position', 'Other Liquid Accounts', liquid.other],
      ['Liquid Position', 'Total Liquid Funds', liquid.cash + liquid.bank + liquid.other],
      ['Customer Position', 'Trade Receivable', trade],
      ['Customer Position', 'Customer Loan Receivable', loan],
      ['Customer Position', 'Customer Advance', customerAdvance],
      ['Customer Position', 'Net Trade Exposure', trade - customerAdvance],
      ['Customer Position', 'Total Customer Exposure', trade + loan - customerAdvance],
      ['Supplier Position', 'Supplier Payable', payable],
      ['Supplier Position', 'Supplier Advance', supplierAdvance],
      ['Supplier Position', 'Net Supplier Payable', payable - supplierAdvance],
    ].map(([section, metric, amount]) => ({ section, metric, amount: money(amount) }));
    return {
      reportKey: 'financial-position',
      title: 'Financial Position',
      asOf: now().toISOString(),
      liquidPosition: {
        cashInHand: money(liquid.cash),
        bankBalances: money(liquid.bank),
        otherLiquidAccounts: money(liquid.other),
        totalLiquidFunds: money(liquid.cash + liquid.bank + liquid.other),
      },
      customerPosition: {
        tradeReceivable: money(trade),
        customerLoanReceivable: money(loan),
        customerAdvance: money(customerAdvance),
        netTradeExposure: money(trade - customerAdvance),
        totalCustomerExposure: money(trade + loan - customerAdvance),
      },
      supplierPosition: {
        supplierPayable: money(payable),
        supplierAdvance: money(supplierAdvance),
        netSupplierPayable: money(payable - supplierAdvance),
      },
      columns: [
        { key: 'section', label: 'Section' },
        { key: 'metric', label: 'Metric' },
        { key: 'amount', label: 'Amount' },
      ],
      rows,
      totals: {},
    };
  }

  async function dailyCashPosition(organizationId, filters) {
    const { accounts, movements } = await context(organizationId);
    const active = new Set(accounts.filter((item) => item.status === 'active').map((item) => String(item.id)));
    let opening = 0n;
    let closing = 0n;
    let businessInflows = 0n;
    let businessOutflows = 0n;
    let manualInflows = 0n;
    let manualOutflows = 0n;
    let adjustments = 0n;
    let internalNet = 0n;
    let internalVolume = 0n;
    const breakdown = new Map();
    for (const row of movements) {
      if (!active.has(String(row.accountId))) continue;
      const signed = movementMinor(row);
      const date = effectiveDate(row);
      if (date < filters.businessDate) opening += signed;
      if (date <= filters.businessDate) closing += signed;
      if (date !== filters.businessDate) continue;
      const transfer = TRANSFER_TYPES.has(row.sourceType);
      if (transfer) {
        internalNet += signed;
        if (signed < 0n) internalVolume += -signed;
      } else if (ADJUSTMENT_TYPES.has(row.sourceType)) {
        adjustments += signed;
      } else if (MANUAL_TYPES.has(row.sourceType)) {
        if (signed >= 0n) manualInflows += signed;
        else manualOutflows += -signed;
      } else if (signed >= 0n) businessInflows += signed;
      else businessOutflows += -signed;
      const key = transfer
        ? (row.sourceType.includes('reversal') ? 'Transfer Reversals' : 'Account Transfers')
        : SOURCE_LABELS[row.sourceType] ?? (signed >= 0n ? 'Other External Inflow' : 'Other External Outflow');
      breakdown.set(key, (breakdown.get(key) ?? 0n) + (transfer ? (signed < 0n ? -signed : 0n) : signed));
    }
    const expectedClosing = opening + businessInflows - businessOutflows + manualInflows - manualOutflows + adjustments;
    const difference = closing - expectedClosing;
    const unclassifiedInflow = movements.filter((row) => active.has(String(row.accountId)) && effectiveDate(row) === filters.businessDate && row.category === 'unclassified' && MANUAL_TYPES.has(row.sourceType) && movementMinor(row) > 0n).reduce((sum, row) => sum + movementMinor(row), 0n);
    const unclassifiedOutflow = movements.filter((row) => active.has(String(row.accountId)) && effectiveDate(row) === filters.businessDate && row.category === 'unclassified' && MANUAL_TYPES.has(row.sourceType) && movementMinor(row) < 0n).reduce((sum, row) => sum - movementMinor(row), 0n);
    return {
      reportKey: 'daily-cash-position',
      title: 'Daily Cash Position',
      businessDate: filters.businessDate,
      openingLiquidFunds: money(opening),
      businessExternalInflows: money(businessInflows),
      manualExternalInflows: money(manualInflows),
      businessExternalOutflows: money(businessOutflows),
      manualExternalOutflows: money(manualOutflows),
      accountBalanceAdjustments: money(adjustments),
      internalTransfers: money(internalVolume),
      internalTransferNet: money(internalNet),
      closingLiquidFunds: money(closing),
      unclassifiedTreasury: {
        inflow: money(unclassifiedInflow),
        outflow: money(unclassifiedOutflow),
        net: money(unclassifiedInflow - unclassifiedOutflow),
      },
      reconciliation: difference === 0n && internalNet === 0n
        ? { status: 'Reconciled', expectedClosing: money(expectedClosing), difference: money(0n) }
        : { status: 'Mismatch Detected', expectedClosing: money(expectedClosing), difference: money(difference), internalTransferNet: money(internalNet) },
      rows: [...breakdown.entries()].map(([category, value]) => ({ category, signedAmount: money(value) })),
      totals: { closingLiquidFunds: money(closing) },
    };
  }

  async function statement(organizationId, filters, accountType) {
    const { accounts, movements, accountMap } = await context(organizationId);
    const selectedIds = new Set(
      accounts
        .filter((item) => (!filters.accountId || String(item.id) === filters.accountId) && (!accountType || item.accountType === accountType))
        .map((item) => String(item.id)),
    );
    let opening = 0n;
    if (filters.fromDate) {
      for (const row of movements) if (selectedIds.has(String(row.accountId)) && effectiveDate(row) < filters.fromDate) opening += movementMinor(row);
    }
    const scoped = movements.filter((row) => selectedIds.has(String(row.accountId)) && movementMatches(row, filters));
    let running = opening;
    let inflow = 0n;
    let outflow = 0n;
    const rows = scoped.map((row) => {
      const signed = movementMinor(row);
      running += signed;
      if (signed >= 0n) inflow += signed; else outflow += -signed;
      return movementRow(row, accountMap.get(String(row.accountId)), running);
    });
    const paged = pageRows(rows, filters);
    return {
      reportKey: accountType === 'cash' ? 'cash-book' : accountType === 'bank' ? 'bank-book' : 'account-statement',
      title: accountType === 'cash' ? 'Cash Book' : accountType === 'bank' ? 'Bank Book' : 'Account Statement',
      openingBalance: money(opening),
      periodInflow: money(inflow),
      periodOutflow: money(outflow),
      periodNetChange: money(inflow - outflow),
      closingBalance: money(running),
      rows: paged.rows,
      pagination: paged.pagination,
      totals: { inflow: money(inflow), outflow: money(outflow), closingBalance: money(running) },
    };
  }

  async function transfers(organizationId, filters) {
    const { movements, accountMap } = await context(organizationId);
    const groups = new Map();
    for (const row of movements) {
      if (!TRANSFER_TYPES.has(row.sourceType)) continue;
      const key = String(row.sourceId);
      const group = groups.get(key) ?? { originals: [], reversals: [] };
      (row.sourceType.includes('reversal') ? group.reversals : group.originals).push(row);
      groups.set(key, group);
    }
    let rows = [...groups.entries()].map(([sourceId, group]) => {
      const out = group.originals.find((item) => item.sourceType === 'account_transfer_out');
      const incoming = group.originals.find((item) => item.sourceType === 'account_transfer_in');
      const source = out ? accountMap.get(String(out.accountId)) : null;
      const destination = incoming ? accountMap.get(String(incoming.accountId)) : null;
      const amount = out ? -movementMinor(out) : incoming ? movementMinor(incoming) : 0n;
      return {
        id: sourceId,
        businessDate: effectiveDate(out ?? incoming ?? group.reversals[0]),
        fromAccount: source ? { id: source.id, name: source.name } : null,
        toAccount: destination ? { id: destination.id, name: destination.name } : null,
        amount: money(amount),
        reference: out?.reference ?? incoming?.reference ?? null,
        notes: out?.notes ?? incoming?.notes ?? null,
        status: group.reversals.length > 0 ? 'reversed' : 'posted',
        createdBy: out?.postedBy ?? incoming?.postedBy ?? null,
        createdAt: out?.postedAt ?? incoming?.postedAt ?? null,
        reversal: group.reversals.length > 0 ? { movementIds: group.reversals.map((item) => item.id) } : null,
        integrity: group.originals.length === 2 && group.originals.reduce((sum, item) => sum + movementMinor(item), 0n) === 0n && (group.reversals.length === 0 || (group.reversals.length === 2 && group.reversals.reduce((sum, item) => sum + movementMinor(item), 0n) === 0n)) ? 'complete' : 'incomplete',
      };
    });
    if (filters.fromDate) rows = rows.filter((row) => row.businessDate && row.businessDate >= filters.fromDate);
    if (filters.toDate) rows = rows.filter((row) => row.businessDate && row.businessDate <= filters.toDate);
    if (filters.accountId) rows = rows.filter((row) => row.fromAccount?.id === filters.accountId || row.toAccount?.id === filters.accountId);
    if (filters.status) rows = rows.filter((row) => row.status === filters.status);
    if (filters.search) rows = rows.filter((row) => `${row.reference ?? ''} ${row.notes ?? ''}`.toLowerCase().includes(filters.search.toLowerCase()));
    rows.sort((a, b) => String(b.businessDate).localeCompare(String(a.businessDate)) || String(b.createdAt).localeCompare(String(a.createdAt)));
    const paged = pageRows(rows, filters);
    return { reportKey: 'account-transfers', title: 'Account Transfers', rows: paged.rows, pagination: paged.pagination, totals: {} };
  }

  async function treasuryMovements(organizationId, filters) {
    const { movements, accountMap } = await context(organizationId);
    const rows = movements.filter((row) => {
      const account = accountMap.get(String(row.accountId));
      return movementMatches(row, filters) && (!filters.accountId || String(row.accountId) === filters.accountId) && (!filters.accountType || account?.accountType === filters.accountType);
    }).map((row) => movementRow(row, accountMap.get(String(row.accountId))));
    rows.sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)));
    const unclassifiedInflow = rows.filter((row) => row.category === 'unclassified' && MANUAL_TYPES.has(row.sourceType)).reduce((sum, row) => sum + (movementMinor(row) > 0n ? movementMinor(row) : 0n), 0n);
    const unclassifiedOutflow = rows.filter((row) => row.category === 'unclassified' && MANUAL_TYPES.has(row.sourceType)).reduce((sum, row) => sum + (movementMinor(row) < 0n ? -movementMinor(row) : 0n), 0n);
    const paged = pageRows(rows, filters);
    return { reportKey: 'treasury-movements', title: 'Treasury Movements', rows: paged.rows, pagination: paged.pagination, summary: { unclassifiedInflow: money(unclassifiedInflow), unclassifiedOutflow: money(unclassifiedOutflow), netUnclassifiedTreasuryMovement: money(unclassifiedInflow - unclassifiedOutflow) }, totals: {} };
  }

  async function manualAdjustments(organizationId, filters) {
    const { movements, accountMap } = await context(organizationId);
    const [customerRows, supplierRows] = await Promise.all([
      customerFinanceService.listAdjustmentsForReporting(organizationId),
      supplierFinanceService.listAdjustmentsForReporting(organizationId),
    ]);
    const rows = movements.filter((row) => ADJUSTMENT_TYPES.has(row.sourceType)).map((row) => ({
      id: row.id,
      businessDate: effectiveDate(row),
      domain: 'account',
      entity: { id: row.accountId, name: accountMap.get(String(row.accountId))?.name ?? row.accountId },
      balanceType: 'account_balance',
      beforeAmount: row.balanceBefore ?? null,
      delta: row.signedAmount,
      afterAmount: row.desiredBalance ?? null,
      reason: row.purpose ?? null,
      category: row.category ?? null,
      reference: row.reference ?? null,
      notes: row.notes ?? null,
      createdBy: row.postedBy,
      createdAt: row.postedAt,
      status: row.reversalOfId ? 'reversal' : 'posted',
      reversalOfId: row.reversalOfId ?? null,
    })).concat(customerRows.map((row) => ({ ...row, domain: 'customer', entity: { id: row.customerId }, beforeAmount: row.expectedCurrentBalance, afterAmount: row.desiredBalance, createdBy: row.postedBy ?? null, createdAt: row.createdAt ?? null })), supplierRows.map((row) => ({ ...row, domain: 'supplier', entity: { id: row.supplierId }, beforeAmount: row.expectedCurrentBalance, afterAmount: row.desiredBalance, createdBy: row.postedBy ?? null, createdAt: row.createdAt ?? null })));
    let filtered = rows.filter((row) => (!filters.fromDate || row.businessDate >= filters.fromDate) && (!filters.toDate || row.businessDate <= filters.toDate));
    if (filters.search) filtered = filtered.filter((row) => `${row.reference ?? ''} ${row.reason ?? ''} ${row.notes ?? ''}`.toLowerCase().includes(filters.search.toLowerCase()));
    filtered.sort((a, b) => String(b.businessDate).localeCompare(String(a.businessDate)) || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    const paged = pageRows(filtered, filters);
    return { reportKey: 'manual-adjustments', title: 'Manual Financial Adjustments', rows: paged.rows, pagination: paged.pagination, totals: {} };
  }

  async function customerLoans(organizationId, filters) {
    const result = await customerFinanceService.listLoans(organizationId, filters);
    const rows = result.items;
    return { reportKey: 'customer-loans', title: 'Customer Loans', rows, pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.ceil(result.total / result.pageSize) }, totals: {} };
  }

  async function supplierRefunds(organizationId, filters) {
    const result = await supplierFinanceService.listRefunds(organizationId, filters);
    return { reportKey: 'supplier-refunds', title: 'Supplier Refunds', rows: result.items, pagination: { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: Math.ceil(result.total / result.pageSize) }, totals: {} };
  }

  async function reconciliation(organizationId, filters) {
    const [{ movements }, customerAdvances, supplierAdvances] = await Promise.all([
      context(organizationId),
      paymentsService.listCustomerAdvanceBalances(organizationId),
      paymentsService.listSupplierAdvanceBalances(organizationId),
    ]);
    const findings = [];
    for (const row of customerAdvances.items ?? []) if (BigInt(String(row.advanceMinorUnits ?? '0')) < 0n) findings.push({ code: 'CUSTOMER_ADVANCE_NEGATIVE', severity: 'error', domain: 'customer', reference: row.customerId, expected: '>= 0', actual: row.advanceMinorUnits, difference: row.advanceMinorUnits, remediation: 'Review customer advance effects and correction lineage.' });
    for (const row of supplierAdvances.items ?? []) if (BigInt(String(row.advanceMinorUnits ?? '0')) < 0n) findings.push({ code: 'SUPPLIER_ADVANCE_NEGATIVE', severity: 'error', domain: 'supplier', reference: row.supplierId, expected: '>= 0', actual: row.advanceMinorUnits, difference: row.advanceMinorUnits, remediation: 'Review supplier advance effects and refund/correction lineage.' });
    const transferGroups = new Map();
    for (const row of movements.filter((item) => TRANSFER_TYPES.has(item.sourceType))) {
      const key = `${row.sourceId}:${row.sourceType.includes('reversal') ? 'reversal' : 'original'}`;
      const group = transferGroups.get(key) ?? [];
      group.push(row);
      transferGroups.set(key, group);
    }
    for (const [reference, legs] of transferGroups) {
      const total = legs.reduce((sum, row) => sum + movementMinor(row), 0n);
      if (legs.length !== 2 || total !== 0n) findings.push({ code: reference.endsWith(':reversal') ? 'TRANSFER_REVERSAL_UNBALANCED' : 'ACCOUNT_TRANSFER_UNBALANCED', severity: 'error', domain: 'account_transfer', reference: reference.split(':')[0], expected: '2 balanced legs / 0.00 net', actual: `${legs.length} legs / ${formatMoneyMinorUnits(total)} net`, difference: total.toString(), remediation: 'Inspect immutable transfer legs; do not auto-fix.' });
    }
    const checked = [
      { code: 'CUSTOMER_ADVANCE_NON_NEGATIVE', status: 'Reconciled' },
      { code: 'SUPPLIER_ADVANCE_NON_NEGATIVE', status: 'Reconciled' },
      { code: 'ACCOUNT_TRANSFER_LEGS', status: 'Reconciled' },
      { code: 'TRANSFER_REVERSAL_LEGS', status: 'Reconciled' },
      { code: 'CUSTOMER_LOAN_LEDGER', status: 'Not Checked', reason: 'Bulk loan-source comparison is unavailable from the current read contract.' },
      { code: 'CUSTOMER_RECEIVABLE_TARGETS', status: 'Not Checked', reason: 'Bulk target reconciliation is unavailable from the current read contract.' },
      { code: 'SUPPLIER_PAYABLE_TARGETS', status: 'Not Checked', reason: 'Bulk target reconciliation is unavailable from the current read contract.' },
      { code: 'ACCOUNT_MOVEMENT_LINEAGE', status: 'Not Checked', reason: 'Source-specific lineage validation is available only in owning workflows.' },
    ];
    for (const check of checked) if (findings.some((item) => item.code.includes(check.code.split('_').slice(0, 2).join('_')))) check.status = 'Mismatch Detected';
    const paged = pageRows(findings, filters);
    return { reportKey: 'financial-reconciliation', title: 'Financial Reconciliation', status: findings.length === 0 ? 'Not Checked / Unavailable' : 'Needs Review', checks: checked, rows: paged.rows, pagination: paged.pagination, totals: { findings: findings.length } };
  }

  return {
    financialPosition,
    dailyCashPosition,
    accountStatement: (organizationId, filters) => statement(organizationId, filters),
    cashBook: (organizationId, filters) => statement(organizationId, filters, 'cash'),
    bankBook: (organizationId, filters) => statement(organizationId, filters, 'bank'),
    transfers,
    treasuryMovements,
    manualAdjustments,
    customerLoans,
    supplierRefunds,
    reconciliation,
  };
}

module.exports = {
  ADJUSTMENT_TYPES,
  MANUAL_TYPES,
  SOURCE_LABELS,
  TRANSFER_TYPES,
  createFinancialReporting,
  effectiveDate,
  movementMinor,
};
