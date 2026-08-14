const TEMPLATE_VERSION = 1;

const IMPORT_TYPES = [
  'product_categories',
  'products',
  'product_prices',
  'customers',
  'suppliers',
  'customer_opening_receivables',
  'customer_opening_advances',
  'supplier_opening_payables',
  'supplier_opening_advances',
  'cash_opening_balances',
  'bank_opening_balances',
  'jazzcash_opening_balances',
  'easypaisa_opening_balances',
  'opening_stock',
];

const ACCOUNT_TYPE_BY_IMPORT = {
  cash_opening_balances: 'cash',
  bank_opening_balances: 'bank',
  jazzcash_opening_balances: 'jazzcash',
  easypaisa_opening_balances: 'easypaisa',
};

const CREATE_ONLY_POLICY = 'create-only';

function column(key, required = true) {
  return { key, required };
}

const TEMPLATES = {
  product_categories: {
    importType: 'product_categories',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [column('name'), column('productClass')],
  },
  products: {
    importType: 'products',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [
      column('sku'),
      column('name'),
      column('categoryName'),
      column('trackingMode'),
      column('baseUnitCode'),
      column('measurementDimension'),
    ],
  },
  product_prices: {
    importType: 'product_prices',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [column('productSku'), column('priceTier'), column('amount')],
  },
  customers: {
    importType: 'customers',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [
      column('name'),
      column('phone', false),
      column('customerType'),
      column('priceTier', false),
    ],
  },
  suppliers: {
    importType: 'suppliers',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [column('name'), column('phone', false)],
  },
  customer_opening_receivables: {
    importType: 'customer_opening_receivables',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [column('customerName'), column('amount')],
  },
  customer_opening_advances: {
    importType: 'customer_opening_advances',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [column('customerName'), column('amount')],
  },
  supplier_opening_payables: {
    importType: 'supplier_opening_payables',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [column('supplierName'), column('amount')],
  },
  supplier_opening_advances: {
    importType: 'supplier_opening_advances',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [column('supplierName'), column('amount')],
  },
  cash_opening_balances: {
    importType: 'cash_opening_balances',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [column('accountName'), column('amount')],
  },
  bank_opening_balances: {
    importType: 'bank_opening_balances',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [column('accountName'), column('amount')],
  },
  jazzcash_opening_balances: {
    importType: 'jazzcash_opening_balances',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [column('accountName'), column('amount')],
  },
  easypaisa_opening_balances: {
    importType: 'easypaisa_opening_balances',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [column('accountName'), column('amount')],
  },
  opening_stock: {
    importType: 'opening_stock',
    version: TEMPLATE_VERSION,
    createUpdatePolicy: CREATE_ONLY_POLICY,
    columns: [
      column('productSku'),
      column('warehouseCode'),
      column('quantity'),
      column('inventoryValue'),
      column('batchNumber', false),
      column('expiryDate', false),
      column('manufacturingDate', false),
    ],
  },
};

function getTemplate(importType) {
  return TEMPLATES[importType] ?? null;
}

function listTemplates() {
  return IMPORT_TYPES.map((importType) => TEMPLATES[importType]);
}

module.exports = {
  ACCOUNT_TYPE_BY_IMPORT,
  CREATE_ONLY_POLICY,
  IMPORT_TYPES,
  TEMPLATE_VERSION,
  TEMPLATES,
  getTemplate,
  listTemplates,
};
