/**
 * Documentation-only metadata (descriptions, field labels, guidelines, and realistic
 * domain examples). All authoritative fields, column lists, required/optional flags,
 * and canonical enums are derived directly from the canonical import registry and domain models.
 */

const { getTemplate } = require('./import-templates');
const {
  PRODUCT_CLASSES,
  TRACKING_MODES,
  MEASUREMENT_DIMENSIONS,
  PRICE_TIERS,
} = require('../catalog/catalog.validation');
const { CUSTOMER_TYPES } = require('../customers/customers.validation');

const CANONICAL_FIELD_RULES = {
  productClass: `One of: ${PRODUCT_CLASSES.join(', ')}`,
  trackingMode: `One of: ${TRACKING_MODES.join(', ')}`,
  measurementDimension: `One of: ${MEASUREMENT_DIMENSIONS.join(', ')}`,
  priceTier: `One of: ${PRICE_TIERS.join(', ')}`,
  customerType: `One of: ${CUSTOMER_TYPES.join(', ')}`,
};

const DOCUMENTATION_METADATA = {
  product_categories: {
    title: 'Product Categories Import Guide',
    guidelines: [
      'Fill in your data on the "Import Template" sheet starting from Row 3.',
      'Do NOT modify or remove the first two header rows on the "Import Template" sheet.',
      'Category names must be unique within your organization.',
      `Allowed product classes: ${PRODUCT_CLASSES.join(', ')}.`,
    ],
    fieldDescriptions: {
      name: {
        label: 'Category Name',
        allowedValues: 'Text up to 160 characters (unique)',
        description: 'Primary display name for the product category',
        example: 'Nitrogen Fertilizers',
      },
      productClass: {
        label: 'Product Class',
        description: 'Determines batch tracking and compliance rules for items in this category',
        example: 'fertilizer',
      },
    },
    examples: [
      { name: 'Nitrogen Fertilizers', productClass: 'fertilizer' },
      { name: 'Phosphatic Fertilizers', productClass: 'fertilizer' },
      { name: 'Certified Wheat Seeds', productClass: 'seed' },
      { name: 'Broad Spectrum Insecticides', productClass: 'pesticide' },
      { name: 'Post-Emergence Herbicides', productClass: 'chemical' },
    ],
  },

  products: {
    title: 'Products Catalog Import Guide',
    guidelines: [
      'Enter new products on the "Import Template" sheet starting from Row 3.',
      'SKU must be unique across all active and inactive products in your organization.',
      'Referenced categoryName must exactly match an existing category name in your organization.',
      'Mandatory batch tracking applies to seed, fertilizer, pesticide, and chemical categories.',
      `Allowed tracking modes: ${TRACKING_MODES.join(', ')}.`,
      `Allowed measurement dimensions: ${MEASUREMENT_DIMENSIONS.join(', ')}.`,
    ],
    fieldDescriptions: {
      sku: {
        label: 'SKU / Product Code',
        allowedValues: 'Unique alphanumeric string (up to 64 chars)',
        description: 'Unique internal stock-keeping unit identifier',
        example: 'FERT-UREA-50KG',
      },
      name: {
        label: 'Product Name',
        allowedValues: 'Text up to 160 characters',
        description: 'Full commercial product description',
        example: 'Sona Urea 50kg Bag',
      },
      categoryName: {
        label: 'Category Name',
        allowedValues: 'Exact name of an existing product category',
        description: 'Category under which this product will be classified',
        example: 'Nitrogen Fertilizers',
      },
      trackingMode: {
        label: 'Tracking Mode',
        description: 'Inventory tracking method (must comply with category class)',
        example: 'batch',
      },
      baseUnitCode: {
        label: 'Base Unit Code',
        allowedValues: 'BAG, KG, LTR, BTL, PCS, CAN, DRUM, PKT',
        description: 'Primary unit of measure for inventory and pricing',
        example: 'BAG',
      },
      measurementDimension: {
        label: 'Measurement Dimension',
        description:
          'Physical dimension used for unit conversions (e.g. mass for kg/bags, volume for liters)',
        example: 'mass',
      },
    },
    examples: [
      {
        sku: 'FERT-UREA-50KG',
        name: 'Sona Urea 50kg Bag',
        categoryName: 'Nitrogen Fertilizers',
        trackingMode: 'batch',
        baseUnitCode: 'BAG',
        measurementDimension: 'mass',
      },
      {
        sku: 'FERT-DAP-50KG',
        name: 'Engro DAP 50kg Bag',
        categoryName: 'Phosphatic Fertilizers',
        trackingMode: 'batch',
        baseUnitCode: 'BAG',
        measurementDimension: 'mass',
      },
      {
        sku: 'SEED-WHT-AKBAR-50KG',
        name: 'Akbar 2019 Wheat Seed 50kg',
        categoryName: 'Certified Wheat Seeds',
        trackingMode: 'batch',
        baseUnitCode: 'BAG',
        measurementDimension: 'mass',
      },
      {
        sku: 'PEST-CHLOR-1L',
        name: 'Chlorpyrifos 40% EC 1L',
        categoryName: 'Broad Spectrum Insecticides',
        trackingMode: 'batch_expiry',
        baseUnitCode: 'BTL',
        measurementDimension: 'volume',
      },
      {
        sku: 'CHEM-GLYPHO-5L',
        name: 'Glyphosate 48% SL 5L',
        categoryName: 'Post-Emergence Herbicides',
        trackingMode: 'batch_expiry',
        baseUnitCode: 'CAN',
        measurementDimension: 'volume',
      },
    ],
  },

  product_prices: {
    title: 'Product Pricing Tiers Import Guide',
    guidelines: [
      'Define price tiers for existing products starting from Row 3 of "Import Template".',
      'productSku must exist in your catalog.',
      `Allowed priceTier values: ${PRICE_TIERS.join(', ')}.`,
      'Amount must be a non-negative decimal value in PKR.',
    ],
    fieldDescriptions: {
      productSku: {
        label: 'Product SKU',
        allowedValues: 'Valid existing product SKU',
        description: 'SKU of the product to set pricing for',
        example: 'FERT-UREA-50KG',
      },
      priceTier: {
        label: 'Price Tier',
        description: 'Customer pricing group tier',
        example: 'retail',
      },
      amount: {
        label: 'Selling Price (PKR)',
        allowedValues: 'Decimal number (e.g. 4650.00)',
        description: 'Unit selling price for this tier in Pakistani Rupees',
        example: '4650.00',
      },
    },
    examples: [
      { productSku: 'FERT-UREA-50KG', priceTier: 'retail', amount: '4650.00' },
      { productSku: 'FERT-UREA-50KG', priceTier: 'wholesale', amount: '4500.00' },
      { productSku: 'FERT-DAP-50KG', priceTier: 'retail', amount: '11500.00' },
      { productSku: 'SEED-WHT-AKBAR-50KG', priceTier: 'retail', amount: '6200.00' },
      { productSku: 'PEST-CHLOR-1L', priceTier: 'retail', amount: '1850.00' },
    ],
  },

  customers: {
    title: 'Customers Directory Import Guide',
    guidelines: [
      'Enter customer profiles starting from Row 3 of "Import Template".',
      'Customer name must be unique within your organization.',
      `Allowed customer types: ${CUSTOMER_TYPES.join(', ')}.`,
      `Allowed price tiers: ${PRICE_TIERS.join(', ')} (optional, defaults to retail).`,
    ],
    fieldDescriptions: {
      name: {
        label: 'Customer Name',
        allowedValues: 'Text up to 160 characters (unique)',
        description: 'Full name of farmer, business, or retail customer',
        example: 'Haji Muhammad Rafiq Farm',
      },
      phone: {
        label: 'Phone Number',
        allowedValues: 'Valid phone string (e.g. 03001234567)',
        description: 'Primary contact mobile number',
        example: '03001234567',
      },
      customerType: {
        label: 'Customer Type',
        description: 'Business classification of the customer',
        example: 'farmer',
      },
      priceTier: {
        label: 'Default Price Tier',
        description: 'Assigned default price tier for sales billing',
        example: 'retail',
      },
    },
    examples: [
      {
        name: 'Haji Muhammad Rafiq Farm',
        phone: '03001234567',
        customerType: 'farmer',
        priceTier: 'retail',
      },
      {
        name: 'Chaudhry Agro Traders',
        phone: '03217654321',
        customerType: 'business',
        priceTier: 'wholesale',
      },
      {
        name: 'Malik Cotton Corporation',
        phone: '03339876543',
        customerType: 'corporate',
        priceTier: 'distributor',
      },
      {
        name: 'Bashir Ahmed Khan',
        phone: '03451122334',
        customerType: 'individual',
        priceTier: 'retail',
      },
      {
        name: 'Daily Walk-in Customer Counter',
        phone: '',
        customerType: 'walk_in',
        priceTier: 'retail',
      },
    ],
  },

  suppliers: {
    title: 'Suppliers Directory Import Guide',
    guidelines: [
      'Enter suppliers starting from Row 3 of "Import Template".',
      'Supplier name must be unique within your organization.',
      'Phone is optional but strongly recommended for purchase order dispatch.',
    ],
    fieldDescriptions: {
      name: {
        label: 'Supplier / Company Name',
        allowedValues: 'Text up to 160 characters (unique)',
        description: 'Official registered trading name of vendor or distributor',
        example: 'Engro Fertilizers Limited',
      },
      phone: {
        label: 'Contact Phone',
        allowedValues: 'Valid phone or landline string (e.g. 04235789000)',
        description: 'Official representative or sales desk telephone number',
        example: '04235789000',
      },
    },
    examples: [
      { name: 'Engro Fertilizers Limited', phone: '04235789000' },
      { name: 'Fauji Fertilizer Company (FFC)', phone: '0518450001' },
      { name: 'Fatima Fertilizer Company', phone: '042111328462' },
      { name: 'Syngenta Pakistan Limited', phone: '021111796436' },
      { name: 'Ali Akbar Group Seeds', phone: '04235299400' },
    ],
  },

  customer_opening_receivables: {
    title: 'Customer Opening Receivables Import Guide',
    guidelines: [
      'Record outstanding receivables from existing customers on Row 3 onwards.',
      'customerName must exactly match an active customer in your directory.',
      'Amount must be greater than zero and in Pakistani Rupees.',
    ],
    fieldDescriptions: {
      customerName: {
        label: 'Customer Name',
        allowedValues: 'Exact name of an existing customer',
        description: 'Customer who owes this outstanding balance',
        example: 'Haji Muhammad Rafiq Farm',
      },
      amount: {
        label: 'Receivable Amount (PKR)',
        allowedValues: 'Positive decimal number (e.g. 150000.00)',
        description: 'Opening ledger receivable debit balance',
        example: '150000.00',
      },
    },
    examples: [
      { customerName: 'Haji Muhammad Rafiq Farm', amount: '150000.00' },
      { customerName: 'Chaudhry Agro Traders', amount: '485000.00' },
      { customerName: 'Malik Cotton Corporation', amount: '1200000.00' },
      { customerName: 'Bashir Ahmed Khan', amount: '35000.00' },
    ],
  },

  customer_opening_advances: {
    title: 'Customer Opening Advances Import Guide',
    guidelines: [
      'Record customer prepaid/advance deposits on Row 3 onwards.',
      'customerName must exist in your directory.',
      'Amount must be greater than zero in PKR.',
    ],
    fieldDescriptions: {
      customerName: {
        label: 'Customer Name',
        allowedValues: 'Exact name of an existing customer',
        description: 'Customer who holds this unadjusted advance deposit',
        example: 'Chaudhry Agro Traders',
      },
      amount: {
        label: 'Advance Amount (PKR)',
        allowedValues: 'Positive decimal number (e.g. 50000.00)',
        description: 'Opening credit balance payable as future goods/services',
        example: '50000.00',
      },
    },
    examples: [
      { customerName: 'Chaudhry Agro Traders', amount: '50000.00' },
      { customerName: 'Haji Muhammad Rafiq Farm', amount: '25000.00' },
      { customerName: 'Bashir Ahmed Khan', amount: '10000.00' },
    ],
  },

  supplier_opening_payables: {
    title: 'Supplier Opening Payables Import Guide',
    guidelines: [
      'Record opening unpaid credit balances owed to vendors on Row 3 onwards.',
      'supplierName must exactly match an active supplier in your directory.',
      'Amount must be greater than zero in PKR.',
    ],
    fieldDescriptions: {
      supplierName: {
        label: 'Supplier Name',
        allowedValues: 'Exact name of an existing supplier',
        description: 'Vendor to whom this balance is owed',
        example: 'Engro Fertilizers Limited',
      },
      amount: {
        label: 'Payable Amount (PKR)',
        allowedValues: 'Positive decimal number (e.g. 850000.00)',
        description: 'Opening ledger payable credit balance',
        example: '850000.00',
      },
    },
    examples: [
      { supplierName: 'Engro Fertilizers Limited', amount: '850000.00' },
      { supplierName: 'Fauji Fertilizer Company (FFC)', amount: '1420000.00' },
      { supplierName: 'Syngenta Pakistan Limited', amount: '360000.00' },
    ],
  },

  supplier_opening_advances: {
    title: 'Supplier Opening Advances Import Guide',
    guidelines: [
      'Record advance payments already dispatched to suppliers on Row 3 onwards.',
      'supplierName must exist in your directory.',
      'Amount must be greater than zero in PKR.',
    ],
    fieldDescriptions: {
      supplierName: {
        label: 'Supplier Name',
        allowedValues: 'Exact name of an existing supplier',
        description: 'Supplier holding this unadjusted security or preorder advance',
        example: 'Fatima Fertilizer Company',
      },
      amount: {
        label: 'Advance Amount (PKR)',
        allowedValues: 'Positive decimal number (e.g. 300000.00)',
        description: 'Opening advance payment debit balance',
        example: '300000.00',
      },
    },
    examples: [
      { supplierName: 'Fatima Fertilizer Company', amount: '300000.00' },
      { supplierName: 'Ali Akbar Group Seeds', amount: '125000.00' },
    ],
  },

  cash_opening_balances: {
    title: 'Cash In Hand Opening Balance Import Guide',
    guidelines: [
      'Record cash register and office safe opening balances starting from Row 3.',
      'accountName represents the physical cash till, register, or branch vault.',
      'Amount must be greater than zero in PKR.',
    ],
    fieldDescriptions: {
      accountName: {
        label: 'Cash Account / Till Name',
        allowedValues: 'Text description of physical cash location',
        description: 'Identifier for physical cash register or safe',
        example: 'Main Counter Cash Till',
      },
      amount: {
        label: 'Opening Cash (PKR)',
        allowedValues: 'Positive decimal number (e.g. 175000.00)',
        description: 'Verified physical cash count on opening date',
        example: '175000.00',
      },
    },
    examples: [
      { accountName: 'Main Counter Cash Till', amount: '175000.00' },
      { accountName: 'Head Office Petty Cash Safe', amount: '50000.00' },
      { accountName: 'Branch 2 Cash Drawer', amount: '65000.00' },
    ],
  },

  bank_opening_balances: {
    title: 'Bank Accounts Opening Balance Import Guide',
    guidelines: [
      'Record commercial bank account opening balances starting from Row 3.',
      'accountName should include bank name and account or branch identifier.',
      'Amount must be greater than zero in PKR.',
    ],
    fieldDescriptions: {
      accountName: {
        label: 'Bank Account Name',
        allowedValues: 'Bank name with branch or account reference',
        description: 'Commercial bank account title',
        example: 'Habib Bank Limited (HBL) - Main Branch',
      },
      amount: {
        label: 'Opening Balance (PKR)',
        allowedValues: 'Positive decimal number (e.g. 1850000.00)',
        description: 'Bank statement closing balance on opening date',
        example: '1850000.00',
      },
    },
    examples: [
      { accountName: 'Habib Bank Limited (HBL) - Main Branch', amount: '1850000.00' },
      { accountName: 'Meezan Bank Limited - Islamic Current', amount: '2450000.00' },
      { accountName: 'MCB Bank Limited - Agri Finance A/C', amount: '920000.00' },
    ],
  },

  jazzcash_opening_balances: {
    title: 'JazzCash Business Wallets Opening Balance Import Guide',
    guidelines: [
      'Record JazzCash merchant and till wallet balances starting from Row 3.',
      'accountName should include till number or registered merchant SIM title.',
      'Amount must be greater than zero in PKR.',
    ],
    fieldDescriptions: {
      accountName: {
        label: 'JazzCash Wallet Name / Till ID',
        allowedValues: 'Merchant till or wallet account title',
        description: 'JazzCash registered till number or merchant account',
        example: 'JazzCash Merchant Till 03001234567',
      },
      amount: {
        label: 'Wallet Balance (PKR)',
        allowedValues: 'Positive decimal number (e.g. 85000.00)',
        description: 'Current verified balance in mobile wallet',
        example: '85000.00',
      },
    },
    examples: [
      { accountName: 'JazzCash Merchant Till 03001234567', amount: '85000.00' },
      { accountName: 'JazzCash Field Collection Wallet', amount: '42000.00' },
    ],
  },

  easypaisa_opening_balances: {
    title: 'Easypaisa Business Wallets Opening Balance Import Guide',
    guidelines: [
      'Record Easypaisa merchant and till wallet balances starting from Row 3.',
      'accountName should include till number or registered merchant phone.',
      'Amount must be greater than zero in PKR.',
    ],
    fieldDescriptions: {
      accountName: {
        label: 'Easypaisa Wallet Name / Till ID',
        allowedValues: 'Merchant till or wallet account title',
        description: 'Easypaisa registered till number or merchant account',
        example: 'Easypaisa Till 03457654321',
      },
      amount: {
        label: 'Wallet Balance (PKR)',
        allowedValues: 'Positive decimal number (e.g. 62000.00)',
        description: 'Current verified balance in mobile wallet',
        example: '62000.00',
      },
    },
    examples: [
      { accountName: 'Easypaisa Till 03457654321', amount: '62000.00' },
      { accountName: 'Easypaisa Counter Payment Wallet', amount: '31500.00' },
    ],
  },

  opening_stock: {
    title: 'Opening Inventory Stock Import Guide',
    guidelines: [
      'Record initial warehouse stock levels starting from Row 3 of "Import Template".',
      'productSku must exist in your catalog.',
      'warehouseCode must match an existing warehouse code in your organization.',
      'Quantity and inventoryValue must be non-negative numeric values.',
      'batchNumber and dates are optional for non-tracked items, but required for batch-tracked categories.',
      'Date formats: YYYY-MM-DD (e.g. 2026-12-31).',
    ],
    fieldDescriptions: {
      productSku: {
        label: 'Product SKU',
        allowedValues: 'Valid existing product SKU',
        description: 'Stock-keeping unit being introduced into inventory',
        example: 'FERT-UREA-50KG',
      },
      warehouseCode: {
        label: 'Warehouse Code',
        allowedValues: 'Valid existing warehouse identifier',
        description: 'Destination warehouse facility code',
        example: 'WH-MAIN',
      },
      quantity: {
        label: 'Physical Quantity',
        allowedValues: 'Positive decimal number',
        description: 'Count or volume in product base units',
        example: '500',
      },
      inventoryValue: {
        label: 'Total Inventory Valuation (PKR)',
        allowedValues: 'Positive decimal number',
        description: 'Total monetary purchase cost value for this quantity',
        example: '2325000.00',
      },
      batchNumber: {
        label: 'Batch / Lot Number',
        allowedValues: 'Alphanumeric batch string (required for tracked items)',
        description: 'Manufacturer batch or lot number',
        example: 'BATCH-2026-04A',
      },
      expiryDate: {
        label: 'Expiry Date',
        allowedValues: 'YYYY-MM-DD format (required for expiry-tracked items)',
        description: 'Product chemical expiry date',
        example: '2027-12-31',
      },
      manufacturingDate: {
        label: 'Manufacturing Date',
        allowedValues: 'YYYY-MM-DD format',
        description: 'Date goods were packaged or produced',
        example: '2026-01-15',
      },
    },
    examples: [
      {
        productSku: 'FERT-UREA-50KG',
        warehouseCode: 'WH-MAIN',
        quantity: '500',
        inventoryValue: '2325000.00',
        batchNumber: 'BATCH-2026-04A',
        expiryDate: '',
        manufacturingDate: '2026-01-15',
      },
      {
        productSku: 'FERT-DAP-50KG',
        warehouseCode: 'WH-MAIN',
        quantity: '200',
        inventoryValue: '2300000.00',
        batchNumber: 'BATCH-DAP-99',
        expiryDate: '',
        manufacturingDate: '2025-11-20',
      },
      {
        productSku: 'SEED-WHT-AKBAR-50KG',
        warehouseCode: 'WH-SEED',
        quantity: '80',
        inventoryValue: '480000.00',
        batchNumber: 'BATCH-AKB-01',
        expiryDate: '',
        manufacturingDate: '',
      },
      {
        productSku: 'PEST-CHLOR-1L',
        warehouseCode: 'WH-MAIN',
        quantity: '120',
        inventoryValue: '192000.00',
        batchNumber: 'BATCH-CP-88',
        expiryDate: '2028-06-30',
        manufacturingDate: '2025-06-01',
      },
      {
        productSku: 'TOOL-SPRAYER-16L',
        warehouseCode: 'WH-MAIN',
        quantity: '25',
        inventoryValue: '87500.00',
        batchNumber: '',
        expiryDate: '',
        manufacturingDate: '',
      },
    ],
  },
};

/**
 * Returns template documentation for an import type with fields and required/optional
 * flags dynamically derived from the authoritative template registry (import-templates.js)
 * and canonical domain enums.
 */
function getTemplateDocumentation(importType) {
  const template = getTemplate(importType);
  if (!template) {
    return null;
  }
  const docMeta = DOCUMENTATION_METADATA[importType];
  if (!docMeta) {
    return null;
  }

  // Derive field metadata strictly according to canonical registry column order and required flags
  const fields = template.columns.map((col) => {
    const desc = docMeta.fieldDescriptions?.[col.key] || {};
    const allowedValues =
      CANONICAL_FIELD_RULES[col.key] ||
      desc.allowedValues ||
      (col.required ? 'Mandatory text' : 'Optional text');

    return {
      key: col.key,
      label: desc.label || col.key,
      required: col.required, // Derived strictly from canonical registry!
      allowedValues,
      description: desc.description || '',
      example: desc.example || '',
    };
  });

  return {
    title: docMeta.title,
    guidelines: docMeta.guidelines,
    fields,
    examples: docMeta.examples,
  };
}

module.exports = {
  CANONICAL_FIELD_RULES,
  DOCUMENTATION_METADATA,
  getTemplateDocumentation,
};
