export interface ReportCatalogItem {
  key: string;
  title: string;
  filters: string[];
  required: string[];
  exports: string[];
}

export const REPORT_CAPABILITY_KEY_BY_REPORT_KEY: Readonly<Record<string, string>> = {
  sales: 'reports.reportAvailability.sales',
  purchases: 'reports.reportAvailability.purchases',
  'gross-profit': 'reports.reportAvailability.grossProfit',
  stock: 'reports.reportAvailability.stock',
  'stock-valuation': 'reports.reportAvailability.stockValuation',
  'stock-movements': 'reports.reportAvailability.stockMovements',
  'customer-ledger': 'reports.reportAvailability.customerLedger',
  'supplier-ledger': 'reports.reportAvailability.supplierLedger',
  'account-cash-book': 'reports.reportAvailability.accountCashBook',
  'financial-position': 'reports.reportAvailability.financialPosition',
  'daily-cash-position': 'reports.reportAvailability.dailyCashPosition',
  'account-statement': 'reports.reportAvailability.accountStatement',
  'cash-book': 'reports.reportAvailability.cashBook',
  'bank-book': 'reports.reportAvailability.bankBook',
  'account-transfers': 'reports.reportAvailability.accountTransfers',
  'treasury-movements': 'reports.reportAvailability.treasuryMovements',
  'manual-adjustments': 'reports.reportAvailability.manualAdjustments',
  'customer-loans': 'reports.reportAvailability.customerLoans',
  'supplier-refunds': 'reports.reportAvailability.supplierRefunds',
  'financial-reconciliation': 'reports.reportAvailability.financialReconciliation',
  expenses: 'reports.reportAvailability.expenses',
  'low-stock': 'reports.reportAvailability.lowStock',
  expiry: 'reports.reportAvailability.expiry',
  'dead-stock': 'reports.reportAvailability.deadStock',
  'top-products': 'reports.reportAvailability.topProducts',
  'top-customers': 'reports.reportAvailability.topCustomers',
  'employee-sales': 'reports.reportAvailability.employeeSales',
};

export const REPORT_EXPORT_ACTION_BY_FORMAT: Readonly<Record<string, string>> = {
  pdf: 'reports.actions.exportPdf',
  excel: 'reports.actions.exportExcel',
  csv: 'reports.actions.exportCsv',
};

export interface ReportColumn {
  key: string;
  label: string;
}

export interface MoneyDto {
  amount: string;
  currency: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface LiquidPositionDto {
  cashInHand: MoneyDto;
  bankBalances: MoneyDto;
  otherLiquidAccounts: MoneyDto;
  otherLiquid?: MoneyDto;
  totalLiquidFunds: MoneyDto;
}

export interface CustomerPositionDto {
  tradeReceivable: MoneyDto;
  customerLoanReceivable: MoneyDto;
  customerAdvance: MoneyDto;
  netTradeExposure: MoneyDto;
  netExposure?: MoneyDto;
  totalCustomerExposure: MoneyDto;
}

export interface SupplierPositionDto {
  supplierPayable: MoneyDto;
  supplierAdvance: MoneyDto;
  netSupplierPayable: MoneyDto;
}

export interface UnclassifiedTreasuryDto {
  inflow: MoneyDto;
  outflow: MoneyDto;
  net: MoneyDto;
  unclassifiedInflows?: MoneyDto;
  unclassifiedOutflows?: MoneyDto;
  netUnclassifiedTreasuryMovement?: MoneyDto;
}

export interface DailyCashReconciliationDto {
  status: string;
  expectedClosing: MoneyDto;
  difference: MoneyDto;
  internalTransferNet?: MoneyDto;
  reconciled?: boolean;
  calculatedClosing?: MoneyDto;
}

export interface ReconciliationCheckDto {
  code: string;
  status: 'Reconciled' | 'Mismatch Detected' | 'Not Checked' | string;
  reason?: string;
}

export interface ReconciliationFindingDto {
  code: string;
  severity: string;
  domain: string;
  reference: string;
  expected: string;
  actual: string;
  difference: string;
  remediation: string;
}

export interface AccountStatementRowDto {
  id: string;
  businessDate: string | null;
  dateSource?: string;
  postedAt?: string;
  accountId: string;
  accountName: string;
  accountType?: string | null;
  sourceType: string;
  sourceLabel: string;
  sourceId: string;
  reference?: string | null;
  description: string;
  category?: string | null;
  inflow: MoneyDto;
  outflow: MoneyDto;
  signedAmount: MoneyDto;
  runningBalance: MoneyDto | null;
  status: string;
  reversalOfId?: string | null;
}

export interface AccountTransferRowDto {
  id: string;
  businessDate: string | null;
  fromAccount: { id: string; name: string } | null;
  toAccount: { id: string; name: string } | null;
  amount: MoneyDto;
  reference: string | null;
  notes?: string | null;
  status: string;
  createdBy?: string | null;
  createdAt?: string | null;
  reversal?: { movementIds: string[] } | null;
  integrity?: 'complete' | 'incomplete';
}

export interface ManualAdjustmentRowDto {
  id: string;
  businessDate: string | null;
  domain: 'account' | 'customer' | 'supplier' | string;
  entity: { id: string; name?: string };
  balanceType: string;
  beforeAmount: MoneyDto | null;
  delta: MoneyDto;
  afterAmount: MoneyDto | null;
  reason?: string | null;
  reference?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  status: string;
  reversalOfId?: string | null;
}

export interface CustomerLoanRowDto {
  id: string;
  loanNumber?: string;
  customerId?: string;
  customerName?: string;
  customer?: { id: string; name: string };
  loanDate: string;
  businessDate?: string;
  reference?: string | null;
  principalAmount?: MoneyDto;
  principal?: MoneyDto;
  repaidAmount?: MoneyDto;
  repaid?: MoneyDto;
  outstandingAmount?: MoneyDto;
  outstanding?: MoneyDto;
  dueDate?: string | null;
  status: string;
  disbursementAccount?: { id: string; name: string };
  accountName?: string;
}

export interface SupplierRefundRowDto {
  id: string;
  refundNumber?: string;
  supplierId?: string;
  supplierName?: string;
  supplier?: { id: string; name: string };
  refundDate?: string;
  businessDate?: string;
  reference?: string | null;
  amount: MoneyDto;
  account?: { id: string; name: string };
  accountName?: string;
  status: string;
  reversalOfId?: string | null;
}

export interface ReportDataset {
  reportKey: string;
  title: string;
  columns?: ReportColumn[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  totals?: Record<string, any>;
  filters?: Record<string, string | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary?: Record<string, any>;
  pagination?: PaginationMeta;
  asOf?: string;
  liquidPosition?: LiquidPositionDto;
  customerPosition?: CustomerPositionDto;
  supplierPosition?: SupplierPositionDto;
  businessDate?: string;
  openingLiquidFunds?: MoneyDto;
  businessExternalInflows?: MoneyDto;
  manualExternalInflows?: MoneyDto;
  businessExternalOutflows?: MoneyDto;
  manualExternalOutflows?: MoneyDto;
  accountBalanceAdjustments?: MoneyDto;
  internalTransfers?: MoneyDto;
  internalTransferNet?: MoneyDto;
  closingLiquidFunds?: MoneyDto;
  unclassifiedTreasury?: UnclassifiedTreasuryDto;
  reconciliation?: DailyCashReconciliationDto;
  openingBalance?: MoneyDto;
  periodInflow?: MoneyDto;
  periodOutflow?: MoneyDto;
  periodNetChange?: MoneyDto;
  closingBalance?: MoneyDto;
  checks?: ReconciliationCheckDto[];
  status?: string;
  netSalesRevenue?: MoneyDto;
  netCogs?: MoneyDto;
  grossProfit?: MoneyDto;
}

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface AuthoritativeTotalItem {
  key: string;
  label: string;
  formattedValue: string;
}

export const RECONCILIATION_CHECK_NAMES: Readonly<Record<string, string>> = {
  CUSTOMER_ADVANCE_NON_NEGATIVE: 'Customer Advance Non-Negative',
  SUPPLIER_ADVANCE_NON_NEGATIVE: 'Supplier Advance Non-Negative',
  ACCOUNT_TRANSFER_LEGS: 'Account Transfer Pairing',
  TRANSFER_REVERSAL_LEGS: 'Transfer Reversal Pairing',
  CUSTOMER_LOAN_LEDGER: 'Customer Loan Outstanding',
  CUSTOMER_RECEIVABLE_TARGETS: 'Customer Trade Receivable Targets',
  SUPPLIER_PAYABLE_TARGETS: 'Supplier Payable Targets',
  ACCOUNT_MOVEMENT_LINEAGE: 'Account Movement Lineage',
};

export const BALANCE_TYPE_LABELS: Readonly<Record<string, string>> = {
  account_balance: 'Account Balance Adjustment',
  trade_receivable: 'Customer Trade Receivable Adjustment',
  customer_advance: 'Customer Advance Adjustment',
  customer_loan: 'Customer Loan Adjustment',
  payable: 'Supplier Payable Adjustment',
  supplier_advance: 'Supplier Advance Adjustment',
};
