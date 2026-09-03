/**
 * Authoritative field instructions, column guidelines, and realistic
 * Agrivio domain examples for each supported import type.
 */

const TEMPLATE_DOCUMENTATION = {
  product_categories: {
    title: 'Product Categories Import Guide',
    guidelines: [
      'Fill in your data on the "Import Template" sheet starting from Row 3.',
      'Do NOT modify or remove the first two header rows on the "Import Template" sheet.',
      'Category names must be unique within your organization.',
      'Allowed product classes: fertilizer, seed, pesticide, chemical, general.',
    ],
    fields: [
      {
        key: 'name',
        label: 'Category Name',
        required: true,
        allowedValues: 'Text up to 160 characters (unique)',
        description: 'Primary display name for the product category',
        example: 'Nitrogen Fertilizers',
      },
      {
        key: 'productClass',
        label: 'Product Class',
        required: true,
        allowedValues: 'fertilizer, seed, pesticide, chemical, general',
        description: 'Determines batch tracking and compliance rules for items in this category',
        example: 'fertilizer',
      },
    ],
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
      'Referenced categoryName must exactly match an existing category name.',
      'Mandatory batch tracking applies to seed, fertilizer, pesticide, and chemical categories.',
      'Allowed tracking modes: none, batch, batch_expiry.',
      'Allowed dimensions: weight, volume, count, area, length.',
    ],
    fields: [
      {
        key: 'sku',
        label: 'SKU / Product Code',
        required: true,
        allowedValues: 'Unique alphanumeric string (up to 64 chars)',
        description: 'Unique internal stock-keeping unit identifier',
        example: 'FERT-UREA-50KG',
      },
      {
        key: 'name',
        label: 'Product Name',
        required: true,
        allowedValues: 'Text up to 160 characters',
        description: 'Full commercial product description',
        example: 'Sona Urea 50kg Bag',
      },
      {
        key: 'categoryName',
        label: 'Category Name',
        required: true,
        allowedValues: 'Exact name of an existing product category',
        description: 'Category under which this product will be classified',
        example: 'Nitrogen Fertilizers',
      },
      {
        key: 'trackingMode',
        label: 'Tracking Mode',
        required: true,
        allowedValues: 'none, batch, batch_expiry',
        description: 'Inventory tracking method (must comply with category class)',
        example: 'batch',
      },
      {
        key: 'baseUnitCode',
        label: 'Base Unit Code',
        required: true,
        allowedValues: 'BAG, KG, LTR, BTL, PCS, CAN, DRUM, PKT',
        description: 'Primary unit of measure for inventory and pricing',
        example: 'BAG',
      },
      {
        key: 'measurementDimension',
        label: 'Measurement Dimension',
        required: true,
        allowedValues: 'weight, volume, count, area, length',
        description: 'Physical dimension used for unit conversions',
        example: 'weight',
      },
    ],
    examples: [
      {
        sku: 'FERT-UREA-50KG',
        name: 'Sona Urea 50kg Bag',
        categoryName: 'Nitrogen Fertilizers',
        trackingMode: 'batch',
        baseUnitCode: 'BAG',
        measurementDimension: 'weight',
      },
      {
        sku: 'FERT-DAP-50KG',
        name: 'Engro DAP 50kg Bag',
        categoryName: 'Phosphatic Fertilizers',
        trackingMode: 'batch',
        baseUnitCode: 'BAG',
        measurementDimension: 'weight',
      },
      {
        sku: 'SEED-WHT-AKBAR-50KG',
        name: 'Akbar 2019 Wheat Seed 50kg',
        categoryName: 'Certified Wheat Seeds',
        trackingMode: 'batch',
        baseUnitCode: 'BAG',
        measurementDimension: 'weight',
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
      'Allowed priceTier values: retail, wholesale, distributor.',
      'Amount must be a non-negative decimal value in PKR.',
    ],
    fields: [
      {
        key: 'productSku',
        label: 'Product SKU',
        required: true,
        allowedValues: 'Valid existing product SKU',
        description: 'SKU of the product to set pricing for',
        example: 'FERT-UREA-50KG',
      },
      {
        key: 'priceTier',
        label: 'Price Tier',
        required: true,
        allowedValues: 'retail, wholesale, distributor',
        description: 'Customer pricing group tier',
        example: 'retail',
      },
      {
        key: 'amount',
        label: 'Selling Price (PKR)',
        required: true,
        allowedValues: 'Decimal number (e.g. 4650.00)',
        description: 'Unit selling price for this tier in Pakistani Rupees',
        example: '4650.00',
      },
    ],
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
      'Allowed customer types: farmer, walk_in, business, corporate, individual.',
      'Allowed price tiers: retail, wholesale, distributor (optional, defaults to retail).',
    ],
    fields: [
      {
        key: 'name',
        label: 'Customer Name',
        required: true,
        allowedValues: 'Text up to 160 characters (unique)',
        description: 'Full name of farmer, business, or retail customer',
        example: 'Haji Muhammad Rafiq Farm',
      },
      {
        key: 'phone',
        label: 'Phone Number',
        required: false,
        allowedValues: 'Valid phone string (e.g. 03001234567)',
        description: 'Primary contact mobile number',
        example: '03001234567',
      },
      {
        key: 'customerType',
        label: 'Customer Type',
        required: true,
        allowedValues: 'farmer, walk_in, business, corporate, individual',
        description: 'Business classification of the customer',
        example: 'farmer',
      },
      {
        key: 'priceTier',
        label: 'Default Price Tier',
        required: false,
        allowedValues: 'retail, wholesale, distributor (optional)',
        description: 'Assigned default price tier for sales billing',
        example: 'retail',
      },
    ],
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
        name: 'Rashid Mahmood Farooqi',
        phone: '03451122334',
        customerType: 'individual',
        priceTier: 'retail',
      },
      {
        name: 'Counter Cash Walk-in',
        phone: '',
        customerType: 'walk_in',
        priceTier: 'retail',
      },
    ],
  },

  suppliers: {
    title: 'Suppliers Directory Import Guide',
    guidelines: [
      'Enter manufacturer and supplier accounts starting from Row 3 of "Import Template".',
      'Supplier name must be unique within your organization.',
      'Phone number is optional but recommended for purchase order tracking.',
    ],
    fields: [
      {
        key: 'name',
        label: 'Supplier Name',
        required: true,
        allowedValues: 'Text up to 160 characters (unique)',
        description: 'Official corporate or trading name of the supplier',
        example: 'Engro Fertilizers Limited',
      },
      {
        key: 'phone',
        label: 'Phone Number',
        required: false,
        allowedValues: 'Valid phone string (e.g. 04235876543)',
        description: 'Primary contact or corporate office phone',
        example: '04235876543',
      },
    ],
    examples: [
      { name: 'Engro Fertilizers Limited', phone: '04235876543' },
      { name: 'Fauji Fertilizer Company Ltd', phone: '0518452000' },
      { name: 'FMC United Agri Pakistan', phone: '04235771234' },
      { name: 'Ali Akbar Group Seeds', phone: '04211122422' },
      { name: 'Syngenta Pakistan Ltd', phone: '02135689000' },
    ],
  },

  customer_opening_receivables: {
    title: 'Customer Opening Receivables Import Guide',
    guidelines: [
      'Enter opening balance amounts owed by existing customers.',
      'customerName must exactly match an active customer in your system.',
      'Amount must be greater than zero.',
      'Cannot overwrite an already posted opening balance.',
    ],
    fields: [
      {
        key: 'customerName',
        label: 'Customer Name',
        required: true,
        allowedValues: 'Exact name of existing customer',
        description: 'Customer who owes this opening receivable balance',
        example: 'Haji Muhammad Rafiq Farm',
      },
      {
        key: 'amount',
        label: 'Opening Receivable (PKR)',
        required: true,
        allowedValues: 'Decimal number > 0 (e.g. 125000.00)',
        description: 'Outstanding balance amount owed to you at system cutover',
        example: '125000.00',
      },
    ],
    examples: [
      { customerName: 'Haji Muhammad Rafiq Farm', amount: '125000.00' },
      { customerName: 'Chaudhry Agro Traders', amount: '340000.00' },
      { customerName: 'Malik Cotton Corporation', amount: '85000.00' },
    ],
  },

  customer_opening_advances: {
    title: 'Customer Opening Advances Import Guide',
    guidelines: [
      'Enter credit balances / advance deposits held on behalf of customers at cutover.',
      'customerName must exist in your system.',
      'Amount must be greater than zero.',
    ],
    fields: [
      {
        key: 'customerName',
        label: 'Customer Name',
        required: true,
        allowedValues: 'Exact name of existing customer',
        description: 'Customer who holds an advance credit with your business',
        example: 'Rashid Mahmood Farooqi',
      },
      {
        key: 'amount',
        label: 'Advance Balance (PKR)',
        required: true,
        allowedValues: 'Decimal number > 0 (e.g. 50000.00)',
        description: 'Advance credit amount held at cutover date',
        example: '50000.00',
      },
    ],
    examples: [
      { customerName: 'Rashid Mahmood Farooqi', amount: '50000.00' },
      { customerName: 'Haji Muhammad Rafiq Farm', amount: '25000.00' },
      { customerName: 'Chaudhry Agro Traders', amount: '15000.00' },
    ],
  },

  supplier_opening_payables: {
    title: 'Supplier Opening Payables Import Guide',
    guidelines: [
      'Enter opening balances owed to suppliers at system migration cutover.',
      'supplierName must exist in your system.',
      'Amount must be greater than zero.',
    ],
    fields: [
      {
        key: 'supplierName',
        label: 'Supplier Name',
        required: true,
        allowedValues: 'Exact name of existing supplier',
        description: 'Supplier to whom balance is owed',
        example: 'Engro Fertilizers Limited',
      },
      {
        key: 'amount',
        label: 'Opening Payable (PKR)',
        required: true,
        allowedValues: 'Decimal number > 0 (e.g. 750000.00)',
        description: 'Outstanding payable liability at cutover',
        example: '750000.00',
      },
    ],
    examples: [
      { supplierName: 'Engro Fertilizers Limited', amount: '750000.00' },
      { supplierName: 'Fauji Fertilizer Company Ltd', amount: '1200000.00' },
      { supplierName: 'FMC United Agri Pakistan', amount: '420000.00' },
    ],
  },

  supplier_opening_advances: {
    title: 'Supplier Opening Advances Import Guide',
    guidelines: [
      'Enter advance payments previously made to suppliers for future delivery.',
      'supplierName must exist in your system.',
      'Amount must be greater than zero.',
    ],
    fields: [
      {
        key: 'supplierName',
        label: 'Supplier Name',
        required: true,
        allowedValues: 'Exact name of existing supplier',
        description: 'Supplier with whom advance deposit is held',
        example: 'Ali Akbar Group Seeds',
      },
      {
        key: 'amount',
        label: 'Advance Balance (PKR)',
        required: true,
        allowedValues: 'Decimal number > 0 (e.g. 100000.00)',
        description: 'Advance payment balance with supplier',
        example: '100000.00',
      },
    ],
    examples: [
      { supplierName: 'Ali Akbar Group Seeds', amount: '100000.00' },
      { supplierName: 'Syngenta Pakistan Ltd', amount: '250000.00' },
    ],
  },

  cash_opening_balances: {
    title: 'Cash Accounts Opening Balances Guide',
    guidelines: [
      'Enter physical cash-in-hand balances for established cash registers/tills.',
      'accountName must match an existing cash account of type "cash".',
      'Amount represents physical cash balance at cutover.',
    ],
    fields: [
      {
        key: 'accountName',
        label: 'Cash Account Name',
        required: true,
        allowedValues: 'Exact name of existing cash account',
        description: 'Name of the physical till or petty cash ledger',
        example: 'Main Cash Register',
      },
      {
        key: 'amount',
        label: 'Cash Balance (PKR)',
        required: true,
        allowedValues: 'Decimal number > 0 (e.g. 150000.00)',
        description: 'Verified physical cash amount',
        example: '150000.00',
      },
    ],
    examples: [
      { accountName: 'Main Cash Register', amount: '150000.00' },
      { accountName: 'Shop Cash Till 2', amount: '45000.00' },
      { accountName: 'Petty Cash Safe', amount: '25000.00' },
    ],
  },

  bank_opening_balances: {
    title: 'Bank Accounts Opening Balances Guide',
    guidelines: [
      'Enter reconciled bank opening balances for corporate/business accounts.',
      'accountName must match an existing bank account of type "bank".',
      'Amount must match bank statement balance at cutover date.',
    ],
    fields: [
      {
        key: 'accountName',
        label: 'Bank Account Name',
        required: true,
        allowedValues: 'Exact name of existing bank account',
        description: 'Name of commercial bank ledger',
        example: 'HBL Agri Business Account',
      },
      {
        key: 'amount',
        label: 'Bank Balance (PKR)',
        required: true,
        allowedValues: 'Decimal number > 0 (e.g. 3500000.00)',
        description: 'Reconciled opening bank balance',
        example: '3500000.00',
      },
    ],
    examples: [
      { accountName: 'HBL Agri Business Account', amount: '3500000.00' },
      { accountName: 'Meezan Bank Operations', amount: '2100000.00' },
      { accountName: 'MCB Seed Division Account', amount: '1450000.00' },
    ],
  },

  jazzcash_opening_balances: {
    title: 'JazzCash Wallet Opening Balances Guide',
    guidelines: [
      'Enter reconciled balance for registered JazzCash merchant/till accounts.',
      'accountName must match an account of type "jazzcash".',
    ],
    fields: [
      {
        key: 'accountName',
        label: 'JazzCash Account Name',
        required: true,
        allowedValues: 'Exact name of existing JazzCash account',
        description: 'Designated JazzCash wallet account title',
        example: 'Shop JazzCash Merchant Till',
      },
      {
        key: 'amount',
        label: 'Wallet Balance (PKR)',
        required: true,
        allowedValues: 'Decimal number > 0 (e.g. 65000.00)',
        description: 'Opening wallet balance',
        example: '65000.00',
      },
    ],
    examples: [
      { accountName: 'Shop JazzCash Merchant Till', amount: '65000.00' },
      { accountName: 'Branch JazzCash Wallet', amount: '32000.00' },
    ],
  },

  easypaisa_opening_balances: {
    title: 'EasyPaisa Wallet Opening Balances Guide',
    guidelines: [
      'Enter reconciled balance for registered EasyPaisa merchant/till accounts.',
      'accountName must match an account of type "easypaisa".',
    ],
    fields: [
      {
        key: 'accountName',
        label: 'EasyPaisa Account Name',
        required: true,
        allowedValues: 'Exact name of existing EasyPaisa account',
        description: 'Designated EasyPaisa wallet account title',
        example: 'Shop EasyPaisa Merchant Till',
      },
      {
        key: 'amount',
        label: 'Wallet Balance (PKR)',
        required: true,
        allowedValues: 'Decimal number > 0 (e.g. 55000.00)',
        description: 'Opening wallet balance',
        example: '55000.00',
      },
    ],
    examples: [
      { accountName: 'Shop EasyPaisa Merchant Till', amount: '55000.00' },
      { accountName: 'Depot EasyPaisa Wallet', amount: '28000.00' },
    ],
  },

  opening_stock: {
    title: 'Opening Stock Inventory Import Guide',
    guidelines: [
      'Enter physical inventory counts and valuation at cutover date.',
      'productSku must exist in your catalog.',
      'warehouseCode must match an existing warehouse you have access to.',
      'batchNumber is REQUIRED if product trackingMode is "batch" or "batch_expiry". Must be empty if "none".',
      'expiryDate is REQUIRED (YYYY-MM-DD) if trackingMode is "batch_expiry". Must be empty if "none".',
      'inventoryValue is total cost valuation for the line (quantity * unit cost).',
    ],
    fields: [
      {
        key: 'productSku',
        label: 'Product SKU',
        required: true,
        allowedValues: 'Existing product SKU',
        description: 'Catalog code of the inventoried item',
        example: 'FERT-UREA-50KG',
      },
      {
        key: 'warehouseCode',
        label: 'Warehouse Code',
        required: true,
        allowedValues: 'Code of authorized warehouse (e.g. WH-MAIN)',
        description: 'Warehouse facility where physical stock is located',
        example: 'WH-MAIN',
      },
      {
        key: 'quantity',
        label: 'Opening Quantity',
        required: true,
        allowedValues: 'Positive integer or decimal count',
        description: 'Physical counted stock units in base unit',
        example: '300',
      },
      {
        key: 'inventoryValue',
        label: 'Total Valuation (PKR)',
        required: true,
        allowedValues: 'Total cost value (quantity * unit cost)',
        description: 'Total monetary asset valuation for this stock lot',
        example: '1350000.00',
      },
      {
        key: 'batchNumber',
        label: 'Batch Number',
        required: false,
        allowedValues: 'Text (mandatory for batch tracked items)',
        description: 'Manufacturer or lot batch identifier',
        example: 'BATCH-UR-2026',
      },
      {
        key: 'expiryDate',
        label: 'Expiry Date',
        required: false,
        allowedValues: 'YYYY-MM-DD (mandatory for batch_expiry)',
        description: 'Product chemical expiry date',
        example: '2028-06-30',
      },
      {
        key: 'manufacturingDate',
        label: 'Manufacturing Date',
        required: false,
        allowedValues: 'YYYY-MM-DD (optional)',
        description: 'Batch production date',
        example: '2025-06-01',
      },
    ],
    examples: [
      {
        productSku: 'FERT-UREA-50KG',
        warehouseCode: 'WH-MAIN',
        quantity: '300',
        inventoryValue: '1350000.00',
        batchNumber: 'BATCH-UR-2026',
        expiryDate: '',
        manufacturingDate: '',
      },
      {
        productSku: 'FERT-DAP-50KG',
        warehouseCode: 'WH-MAIN',
        quantity: '150',
        inventoryValue: '1650000.00',
        batchNumber: 'BATCH-DAP-2026',
        expiryDate: '',
        manufacturingDate: '',
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

function getTemplateDocumentation(importType) {
  return TEMPLATE_DOCUMENTATION[importType] ?? null;
}

module.exports = {
  TEMPLATE_DOCUMENTATION,
  getTemplateDocumentation,
};
