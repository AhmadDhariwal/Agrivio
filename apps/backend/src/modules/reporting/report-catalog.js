const REPORT_FAMILIES = Object.freeze([
  {
    key: 'sales',
    title: 'Sales',
    filters: [
      'fromDate',
      'toDate',
      'branchId',
      'warehouseId',
      'customerId',
      'productId',
      'categoryId',
      'customerType',
      'priceTier',
      'paymentStatus',
      'paymentMethod',
      'employeeId',
      'groupBy',
    ],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'purchases',
    title: 'Purchases',
    filters: [
      'fromDate',
      'toDate',
      'branchId',
      'warehouseId',
      'supplierId',
      'productId',
      'categoryId',
      'paymentStatus',
      'paymentMethod',
      'groupBy',
    ],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'gross-profit',
    title: 'Gross profit',
    filters: [
      'fromDate',
      'toDate',
      'branchId',
      'warehouseId',
      'customerId',
      'productId',
      'categoryId',
      'employeeId',
    ],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'stock',
    title: 'Stock',
    filters: ['warehouseId', 'productId', 'categoryId'],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'stock-valuation',
    title: 'Stock valuation',
    filters: ['warehouseId', 'productId', 'categoryId'],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'stock-movements',
    title: 'Stock movements',
    filters: ['fromDate', 'toDate', 'warehouseId', 'productId', 'categoryId'],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'customer-ledger',
    title: 'Customer ledger',
    filters: ['customerId', 'fromDate', 'toDate'],
    required: ['customerId'],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'supplier-ledger',
    title: 'Supplier ledger',
    filters: ['supplierId', 'fromDate', 'toDate'],
    required: ['supplierId'],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'account-cash-book',
    title: 'Account / cash-book',
    filters: ['accountId', 'fromDate', 'toDate'],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'expenses',
    title: 'Expenses',
    filters: ['fromDate', 'toDate'],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'low-stock',
    title: 'Low stock',
    filters: ['warehouseId', 'productId', 'categoryId'],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'expiry',
    title: 'Expiry',
    filters: ['warehouseId', 'productId', 'categoryId'],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'dead-stock',
    title: 'Dead stock',
    filters: ['warehouseId', 'productId', 'categoryId'],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'top-products',
    title: 'Top products',
    filters: ['fromDate', 'toDate', 'branchId', 'warehouseId', 'categoryId'],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'top-customers',
    title: 'Top customers',
    filters: ['fromDate', 'toDate', 'branchId', 'warehouseId', 'customerType'],
    exports: ['pdf', 'excel', 'csv'],
  },
  {
    key: 'employee-sales',
    title: 'Employee sales',
    filters: ['fromDate', 'toDate', 'branchId', 'warehouseId', 'employeeId'],
    exports: ['pdf', 'excel', 'csv'],
  },
]);

const REPORT_BY_KEY = Object.freeze(
  Object.fromEntries(REPORT_FAMILIES.map((item) => [item.key, item])),
);

const KNOWN_FILTER_KEYS = Object.freeze([
  'fromDate',
  'toDate',
  'branchId',
  'warehouseId',
  'customerId',
  'supplierId',
  'productId',
  'categoryId',
  'customerType',
  'priceTier',
  'paymentStatus',
  'paymentMethod',
  'employeeId',
  'accountId',
  'groupBy',
]);

const GROUP_BY_VALUES = Object.freeze(['document', 'product', 'category', 'branch', 'day']);
const PAYMENT_STATUS_VALUES = Object.freeze(['unpaid', 'partial', 'paid']);

module.exports = {
  GROUP_BY_VALUES,
  KNOWN_FILTER_KEYS,
  PAYMENT_STATUS_VALUES,
  REPORT_BY_KEY,
  REPORT_FAMILIES,
};
