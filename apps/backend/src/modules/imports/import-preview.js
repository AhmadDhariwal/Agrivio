const { ACCOUNT_TYPE_BY_IMPORT } = require('./import-templates');

function pushError(errors, rowNumber, field, code, message) {
  errors.push({ rowNumber, field, code, message });
}

function cell(row, key) {
  return String(row.values[key] ?? '').trim();
}

async function previewProductCategories(rows, deps, organizationId, errors) {
  const seen = new Set();
  const intended = [];
  for (const row of rows) {
    const name = cell(row, 'name');
    const productClass = cell(row, 'productClass');
    if (name === '') {
      pushError(errors, row.rowNumber, 'name', 'REQUIRED', 'name is required');
    }
    if (productClass === '') {
      pushError(errors, row.rowNumber, 'productClass', 'REQUIRED', 'productClass is required');
    }
    const key = name.toLowerCase().replace(/\s+/g, ' ');
    if (name !== '' && seen.has(key)) {
      pushError(errors, row.rowNumber, 'name', 'DUPLICATE_IN_FILE', 'Category name is duplicated in this workbook');
    }
    seen.add(key);
    if (name !== '') {
      const existing = await deps.catalogService.findCategoryByName(organizationId, name);
      if (existing) {
        pushError(
          errors,
          row.rowNumber,
          'name',
          'RECORD_EXISTS',
          'Category already exists and will not be overwritten',
        );
      }
    }
    intended.push({ rowNumber: row.rowNumber, action: 'create', identity: name });
  }
  return intended;
}

async function previewProducts(rows, deps, organizationId, errors) {
  const seen = new Set();
  const intended = [];
  for (const row of rows) {
    const sku = cell(row, 'sku');
    const name = cell(row, 'name');
    const categoryName = cell(row, 'categoryName');
    const trackingMode = cell(row, 'trackingMode');
    const baseUnitCode = cell(row, 'baseUnitCode');
    const measurementDimension = cell(row, 'measurementDimension');
    if (sku === '') pushError(errors, row.rowNumber, 'sku', 'REQUIRED', 'sku is required');
    if (name === '') pushError(errors, row.rowNumber, 'name', 'REQUIRED', 'name is required');
    if (categoryName === '') {
      pushError(errors, row.rowNumber, 'categoryName', 'REQUIRED', 'categoryName is required');
    }
    if (trackingMode === '') {
      pushError(errors, row.rowNumber, 'trackingMode', 'REQUIRED', 'trackingMode is required');
    }
    if (baseUnitCode === '') {
      pushError(errors, row.rowNumber, 'baseUnitCode', 'REQUIRED', 'baseUnitCode is required');
    }
    if (measurementDimension === '') {
      pushError(
        errors,
        row.rowNumber,
        'measurementDimension',
        'REQUIRED',
        'measurementDimension is required',
      );
    }
    if (sku !== '') {
      if (seen.has(sku.toUpperCase())) {
        pushError(errors, row.rowNumber, 'sku', 'DUPLICATE_IN_FILE', 'SKU is duplicated in this workbook');
      }
      seen.add(sku.toUpperCase());
      const existing = await deps.catalogService.findProductBySku(organizationId, sku);
      if (existing) {
        pushError(errors, row.rowNumber, 'sku', 'RECORD_EXISTS', 'Product SKU already exists and will not be overwritten');
      }
    }
    if (categoryName !== '') {
      const category = await deps.catalogService.findCategoryByName(organizationId, categoryName);
      if (!category) {
        pushError(errors, row.rowNumber, 'categoryName', 'CATEGORY_NOT_FOUND', 'Referenced category was not found');
      } else {
        try {
          const { assertTrackingModeAllowed } = require('../catalog/catalog.validation');
          assertTrackingModeAllowed(category.productClass, trackingMode);
        } catch (error) {
          pushError(
            errors,
            row.rowNumber,
            'trackingMode',
            'TRACKING_INVALID',
            error.message || 'trackingMode is not allowed for this category',
          );
        }
      }
    }
    intended.push({ rowNumber: row.rowNumber, action: 'create', identity: sku || name });
  }
  return intended;
}

async function previewPrices(rows, deps, organizationId, errors) {
  const seen = new Set();
  const intended = [];
  for (const row of rows) {
    const productSku = cell(row, 'productSku');
    const priceTier = cell(row, 'priceTier');
    const amount = cell(row, 'amount');
    if (productSku === '') {
      pushError(errors, row.rowNumber, 'productSku', 'REQUIRED', 'productSku is required');
    }
    if (priceTier === '') {
      pushError(errors, row.rowNumber, 'priceTier', 'REQUIRED', 'priceTier is required');
    }
    if (amount === '') {
      pushError(errors, row.rowNumber, 'amount', 'REQUIRED', 'amount is required');
    }
    const key = `${productSku.toUpperCase()}::${priceTier}`;
    if (productSku && priceTier && seen.has(key)) {
      pushError(errors, row.rowNumber, 'priceTier', 'DUPLICATE_IN_FILE', 'Product price tier is duplicated in this workbook');
    }
    seen.add(key);
    const product = productSku
      ? await deps.catalogService.findProductBySku(organizationId, productSku)
      : null;
    if (productSku && !product) {
      pushError(errors, row.rowNumber, 'productSku', 'PRODUCT_NOT_FOUND', 'Referenced product was not found');
    }
    if (product && priceTier) {
      const existing = await deps.catalogService.findPrice(organizationId, product.id, priceTier);
      if (existing) {
        pushError(
          errors,
          row.rowNumber,
          'priceTier',
          'RECORD_EXISTS',
          'Price tier already exists for this product and will not be overwritten',
        );
      }
    }
    intended.push({ rowNumber: row.rowNumber, action: 'create', identity: key });
  }
  return intended;
}

async function previewCustomers(rows, deps, organizationId, errors) {
  const seen = new Set();
  const intended = [];
  for (const row of rows) {
    const name = cell(row, 'name');
    const customerType = cell(row, 'customerType');
    if (name === '') pushError(errors, row.rowNumber, 'name', 'REQUIRED', 'name is required');
    if (customerType === '') {
      pushError(errors, row.rowNumber, 'customerType', 'REQUIRED', 'customerType is required');
    }
    const key = name.toLowerCase().replace(/\s+/g, ' ');
    if (name && seen.has(key)) {
      pushError(errors, row.rowNumber, 'name', 'DUPLICATE_IN_FILE', 'Customer name is duplicated in this workbook');
    }
    seen.add(key);
    if (name) {
      const existing = await deps.customersService.findCustomerByName(organizationId, name);
      if (existing) {
        pushError(
          errors,
          row.rowNumber,
          'name',
          'RECORD_EXISTS',
          'Customer already exists and will not be overwritten',
        );
      }
    }
    intended.push({ rowNumber: row.rowNumber, action: 'create', identity: name });
  }
  return intended;
}

async function previewSuppliers(rows, deps, organizationId, errors) {
  const seen = new Set();
  const intended = [];
  for (const row of rows) {
    const name = cell(row, 'name');
    if (name === '') pushError(errors, row.rowNumber, 'name', 'REQUIRED', 'name is required');
    const key = name.toLowerCase().replace(/\s+/g, ' ');
    if (name && seen.has(key)) {
      pushError(errors, row.rowNumber, 'name', 'DUPLICATE_IN_FILE', 'Supplier name is duplicated in this workbook');
    }
    seen.add(key);
    if (name) {
      const existing = await deps.suppliersService.findSupplierByName(organizationId, name);
      if (existing) {
        pushError(
          errors,
          row.rowNumber,
          'name',
          'RECORD_EXISTS',
          'Supplier already exists and will not be overwritten',
        );
      }
    }
    intended.push({ rowNumber: row.rowNumber, action: 'create', identity: name });
  }
  return intended;
}

async function previewPartyOpening(rows, deps, organizationId, errors, kind) {
  const isCustomer = kind === 'receivable' || kind === 'advance';
  const nameKey = isCustomer ? 'customerName' : 'supplierName';
  const finder = isCustomer
    ? (name) => deps.customersService.findCustomerByName(organizationId, name)
    : (name) => deps.suppliersService.findSupplierByName(organizationId, name);
  const intended = [];
  for (const row of rows) {
    const name = cell(row, nameKey);
    const amount = cell(row, 'amount');
    if (name === '') pushError(errors, row.rowNumber, nameKey, 'REQUIRED', `${nameKey} is required`);
    if (amount === '') pushError(errors, row.rowNumber, 'amount', 'REQUIRED', 'amount is required');
    if (name) {
      const party = await finder(name);
      if (!party) {
        pushError(errors, row.rowNumber, nameKey, 'PARTY_NOT_FOUND', 'Referenced party was not found');
      } else if (party.openingBalance && party.openingBalance.status === 'posted') {
        pushError(
          errors,
          row.rowNumber,
          nameKey,
          'OPENING_EXISTS',
          'Opening balance already posted and will not be overwritten',
        );
      }
    }
    intended.push({ rowNumber: row.rowNumber, action: 'create', identity: name });
  }
  return intended;
}

async function previewAccountOpening(rows, deps, organizationId, errors, importType) {
  const expectedType = ACCOUNT_TYPE_BY_IMPORT[importType];
  const intended = [];
  for (const row of rows) {
    const name = cell(row, 'accountName');
    const amount = cell(row, 'amount');
    if (name === '') {
      pushError(errors, row.rowNumber, 'accountName', 'REQUIRED', 'accountName is required');
    }
    if (amount === '') pushError(errors, row.rowNumber, 'amount', 'REQUIRED', 'amount is required');
    if (name) {
      const account = await deps.accountsService.findAccountByName(organizationId, name);
      if (!account) {
        pushError(errors, row.rowNumber, 'accountName', 'ACCOUNT_NOT_FOUND', 'Referenced account was not found');
      } else if (account.accountType !== expectedType) {
        pushError(
          errors,
          row.rowNumber,
          'accountName',
          'ACCOUNT_TYPE_MISMATCH',
          `Account type must be ${expectedType}`,
        );
      } else if (account.openingBalance && account.openingBalance.status === 'posted') {
        pushError(
          errors,
          row.rowNumber,
          'accountName',
          'OPENING_EXISTS',
          'Account opening already posted and will not be overwritten',
        );
      }
    }
    intended.push({ rowNumber: row.rowNumber, action: 'create', identity: name });
  }
  return intended;
}

async function previewOpeningStock(rows, deps, organizationId, authContext, errors) {
  const intended = [];
  const warehouses = deps.locationsService
    ? (await deps.locationsService.listWarehouses(organizationId)).items
    : [];
  for (const row of rows) {
    const productSku = cell(row, 'productSku');
    const warehouseCode = cell(row, 'warehouseCode');
    const quantity = cell(row, 'quantity');
    const inventoryValue = cell(row, 'inventoryValue');
    const batchNumber = cell(row, 'batchNumber');
    const expiryDate = cell(row, 'expiryDate');
    if (productSku === '') {
      pushError(errors, row.rowNumber, 'productSku', 'REQUIRED', 'productSku is required');
    }
    if (warehouseCode === '') {
      pushError(errors, row.rowNumber, 'warehouseCode', 'REQUIRED', 'warehouseCode is required');
    }
    if (quantity === '') {
      pushError(errors, row.rowNumber, 'quantity', 'REQUIRED', 'quantity is required');
    }
    if (inventoryValue === '') {
      pushError(errors, row.rowNumber, 'inventoryValue', 'REQUIRED', 'inventoryValue is required');
    }
    const product = productSku
      ? await deps.catalogService.findProductBySku(organizationId, productSku)
      : null;
    if (productSku && !product) {
      pushError(errors, row.rowNumber, 'productSku', 'PRODUCT_NOT_FOUND', 'Referenced product was not found');
    }
    const warehouse = warehouses.find(
      (item) =>
        String(item.code ?? '').toLowerCase() === warehouseCode.toLowerCase() ||
        String(item.name ?? '').toLowerCase() === warehouseCode.toLowerCase(),
    );
    if (warehouseCode && !warehouse) {
      pushError(errors, row.rowNumber, 'warehouseCode', 'WAREHOUSE_NOT_FOUND', 'Referenced warehouse was not found');
    } else if (
      warehouse &&
      typeof deps.canAccessWarehouse === 'function' &&
      authContext &&
      !deps.canAccessWarehouse(authContext, String(warehouse.id))
    ) {
      pushError(errors, row.rowNumber, 'warehouseCode', 'WAREHOUSE_FORBIDDEN', 'Warehouse is not assigned to this user');
    }
    if (product) {
      if ((product.trackingMode === 'batch' || product.trackingMode === 'batch_expiry') && batchNumber === '') {
        pushError(errors, row.rowNumber, 'batchNumber', 'BATCH_REQUIRED', 'batchNumber is required for this tracking mode');
      }
      if (product.trackingMode === 'batch_expiry' && expiryDate === '') {
        pushError(errors, row.rowNumber, 'expiryDate', 'EXPIRY_REQUIRED', 'expiryDate is required for this tracking mode');
      }
      if (product.trackingMode === 'none' && batchNumber !== '') {
        pushError(errors, row.rowNumber, 'batchNumber', 'BATCH_NOT_ALLOWED', 'batchNumber is not allowed for trackingMode none');
      }
      if (product.trackingMode === 'none' && expiryDate !== '') {
        pushError(errors, row.rowNumber, 'expiryDate', 'EXPIRY_NOT_ALLOWED', 'expiryDate is not allowed for trackingMode none');
      }
    }
    intended.push({ rowNumber: row.rowNumber, action: 'create', identity: `${productSku}@${warehouseCode}` });
  }
  return intended;
}

async function previewRows(importType, rows, deps, organizationId, authContext) {
  const errors = [];
  let intended = [];
  if (importType === 'product_categories') {
    intended = await previewProductCategories(rows, deps, organizationId, errors);
  } else if (importType === 'products') {
    intended = await previewProducts(rows, deps, organizationId, errors);
  } else if (importType === 'product_prices') {
    intended = await previewPrices(rows, deps, organizationId, errors);
  } else if (importType === 'customers') {
    intended = await previewCustomers(rows, deps, organizationId, errors);
  } else if (importType === 'suppliers') {
    intended = await previewSuppliers(rows, deps, organizationId, errors);
  } else if (importType === 'customer_opening_receivables') {
    intended = await previewPartyOpening(rows, deps, organizationId, errors, 'receivable');
  } else if (importType === 'customer_opening_advances') {
    intended = await previewPartyOpening(rows, deps, organizationId, errors, 'advance');
  } else if (importType === 'supplier_opening_payables') {
    intended = await previewPartyOpening(rows, deps, organizationId, errors, 'payable');
  } else if (importType === 'supplier_opening_advances') {
    intended = await previewPartyOpening(rows, deps, organizationId, errors, 'supplier_advance');
  } else if (ACCOUNT_TYPE_BY_IMPORT[importType]) {
    intended = await previewAccountOpening(rows, deps, organizationId, errors, importType);
  } else if (importType === 'opening_stock') {
    intended = await previewOpeningStock(rows, deps, organizationId, authContext, errors);
  }
  return { errors, intended };
}

module.exports = {
  previewRows,
};
