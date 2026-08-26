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

export interface ReportDataset {
  reportKey: string;
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string>[];
  totals: Record<string, string>;
  filters: Record<string, string | null>;
  summary?: Record<string, unknown>;
  netSalesRevenue?: { amount: string; currency: string };
  netCogs?: { amount: string; currency: string };
  grossProfit?: { amount: string; currency: string };
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
