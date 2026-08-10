const { validationFailed } = require('../../platform/errors/app-error');
const {
  parseMoneyMinorUnits,
  formatMoneyMinorUnits,
} = require('../../platform/primitives/money-and-time');
const { parseConversionFactor } = require('../../platform/primitives/conversion-factor');
const {
  PRODUCT_CLASSES,
  MANDATORY_BATCH_PRODUCT_CLASSES,
} = require('./persistence/product-category.model');
const { TRACKING_MODES, MEASUREMENT_DIMENSIONS } = require('./persistence/product.model');
const { PRICE_TIERS } = require('./persistence/product-price.model');

const MAX_NAME = 160;
const MAX_SKU = 64;
const MAX_UNIT_CODE = 32;
const STATUSES = new Set(['active', 'inactive']);

function parseExpectedVersion(body) {
  const expectedVersion = body?.expectedVersion;
  if (typeof expectedVersion !== 'number' || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw validationFailed('expectedVersion must be a positive integer', [
      { field: 'expectedVersion', message: 'expectedVersion must be a positive integer' },
    ]);
  }
  return expectedVersion;
}

function requireTrimmedString(value, field, maxLength) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw validationFailed(`${field} is required`, [{ field, message: `${field} is required` }]);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw validationFailed(`${field} exceeds maximum length`, [
      { field, message: `${field} must be at most ${maxLength} characters` },
    ]);
  }
  return trimmed;
}

function optionalTrimmedString(value, field, maxLength) {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    throw validationFailed(`${field} must be a string`, [{ field, message: `${field} must be a string` }]);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw validationFailed(`${field} exceeds maximum length`, [
      { field, message: `${field} must be at most ${maxLength} characters` },
    ]);
  }
  return trimmed;
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeSku(value) {
  return value.trim().toUpperCase();
}

function assertObjectBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }
}

function parseStatus(value, field = 'status') {
  if (typeof value !== 'string' || !STATUSES.has(value)) {
    throw validationFailed(`${field} must be active or inactive`, [
      { field, message: `${field} must be active or inactive` },
    ]);
  }
  return value;
}

function parseProductClass(value) {
  if (typeof value !== 'string' || !PRODUCT_CLASSES.includes(value)) {
    throw validationFailed('productClass is invalid', [
      {
        field: 'productClass',
        message: `productClass must be one of: ${PRODUCT_CLASSES.join(', ')}`,
      },
    ]);
  }
  return value;
}

function parseTrackingMode(value) {
  if (typeof value !== 'string' || !TRACKING_MODES.includes(value)) {
    throw validationFailed('trackingMode is invalid', [
      {
        field: 'trackingMode',
        message: `trackingMode must be one of: ${TRACKING_MODES.join(', ')}`,
      },
    ]);
  }
  return value;
}

function parseMeasurementDimension(value) {
  if (typeof value !== 'string' || !MEASUREMENT_DIMENSIONS.includes(value)) {
    throw validationFailed('measurementDimension is invalid', [
      {
        field: 'measurementDimension',
        message: `measurementDimension must be one of: ${MEASUREMENT_DIMENSIONS.join(', ')}`,
      },
    ]);
  }
  return value;
}

function parsePriceTier(value) {
  if (typeof value !== 'string' || !PRICE_TIERS.includes(value)) {
    throw validationFailed('priceTier is invalid', [
      {
        field: 'priceTier',
        message: `priceTier must be one of: ${PRICE_TIERS.join(', ')}`,
      },
    ]);
  }
  return value;
}

function assertTrackingModeAllowed(productClass, trackingMode) {
  if (MANDATORY_BATCH_PRODUCT_CLASSES.has(productClass) && trackingMode === 'none') {
    throw validationFailed(
      'Batch tracking is mandatory for fertilizers, seeds, pesticides, and chemicals',
      [
        {
          field: 'trackingMode',
          message: 'trackingMode must be batch or batch_expiry for this product class',
        },
      ],
    );
  }
}

function parseMoneyInput(value, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw validationFailed(`${field} must be a money object`, [
      { field, message: `${field} must be { amount, currency }` },
    ]);
  }
  if (typeof value.amount !== 'string') {
    throw validationFailed(`${field}.amount must be a decimal string`, [
      { field: `${field}.amount`, message: 'amount must be a decimal string' },
    ]);
  }
  const currency = value.currency === undefined ? 'PKR' : value.currency;
  if (currency !== 'PKR') {
    throw validationFailed('Only PKR is supported in Release 1', [
      { field: `${field}.currency`, message: 'currency must be PKR' },
    ]);
  }
  let minor;
  try {
    minor = parseMoneyMinorUnits(value.amount);
  } catch {
    throw validationFailed(`${field}.amount is invalid`, [
      { field: `${field}.amount`, message: 'amount must have up to two decimal places' },
    ]);
  }
  if (minor < 0n) {
    throw validationFailed(`${field}.amount must not be negative`, [
      { field: `${field}.amount`, message: 'amount must not be negative' },
    ]);
  }
  return { amountMinorUnits: minor.toString(), currency: 'PKR' };
}

function parseCategoryCreate(body) {
  assertObjectBody(body);
  const name = requireTrimmedString(body.name, 'name', MAX_NAME);
  const productClass = body.productClass === undefined ? 'general' : parseProductClass(body.productClass);
  return {
    name,
    nameNormalized: normalizeName(name),
    productClass,
    status: 'active',
  };
}

function parseCategoryPatch(body) {
  assertObjectBody(body);
  const expectedVersion = parseExpectedVersion(body);
  const patch = {};
  if (body.name !== undefined) {
    const name = requireTrimmedString(body.name, 'name', MAX_NAME);
    patch.name = name;
    patch.nameNormalized = normalizeName(name);
  }
  if (body.productClass !== undefined) {
    patch.productClass = parseProductClass(body.productClass);
  }
  if (body.status !== undefined) {
    patch.status = parseStatus(body.status);
  }
  if (Object.keys(patch).length === 0) {
    throw validationFailed('At least one category field is required');
  }
  return { expectedVersion, patch };
}

function parseProductCreate(body) {
  assertObjectBody(body);
  const name = requireTrimmedString(body.name, 'name', MAX_NAME);
  const categoryId = requireTrimmedString(body.categoryId, 'categoryId', 64);
  const trackingMode = parseTrackingMode(body.trackingMode);
  const baseUnitCode = requireTrimmedString(body.baseUnitCode, 'baseUnitCode', MAX_UNIT_CODE);
  const measurementDimension = parseMeasurementDimension(body.measurementDimension);
  const skuRaw = optionalTrimmedString(body.sku, 'sku', MAX_SKU);
  const sku = skuRaw === '' ? '' : normalizeSku(skuRaw);
  return {
    name,
    nameNormalized: normalizeName(name),
    categoryId,
    trackingMode,
    baseUnitCode,
    measurementDimension,
    sku,
    status: 'active',
  };
}

function parseProductPatch(body) {
  assertObjectBody(body);
  const expectedVersion = parseExpectedVersion(body);
  const patch = {};
  if (body.name !== undefined) {
    const name = requireTrimmedString(body.name, 'name', MAX_NAME);
    patch.name = name;
    patch.nameNormalized = normalizeName(name);
  }
  if (body.categoryId !== undefined) {
    patch.categoryId = requireTrimmedString(body.categoryId, 'categoryId', 64);
  }
  if (body.trackingMode !== undefined) {
    patch.trackingMode = parseTrackingMode(body.trackingMode);
  }
  if (body.baseUnitCode !== undefined) {
    patch.baseUnitCode = requireTrimmedString(body.baseUnitCode, 'baseUnitCode', MAX_UNIT_CODE);
  }
  if (body.measurementDimension !== undefined) {
    patch.measurementDimension = parseMeasurementDimension(body.measurementDimension);
  }
  if (body.sku !== undefined) {
    const skuRaw = optionalTrimmedString(body.sku, 'sku', MAX_SKU);
    patch.sku = skuRaw === '' ? '' : normalizeSku(skuRaw);
  }
  if (body.status !== undefined) {
    patch.status = parseStatus(body.status);
  }
  if (Object.keys(patch).length === 0) {
    throw validationFailed('At least one product field is required');
  }
  return { expectedVersion, patch };
}

function parsePackagingUnitsReplace(body) {
  assertObjectBody(body);
  const expectedVersion = parseExpectedVersion(body);
  if (!Array.isArray(body.items)) {
    throw validationFailed('items must be an array', [
      { field: 'items', message: 'items must be an array' },
    ]);
  }
  const seen = new Set();
  const items = body.items.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw validationFailed(`items[${index}] must be an object`);
    }
    const name = requireTrimmedString(item.name, `items[${index}].name`, MAX_NAME);
    const nameNormalized = normalizeName(name);
    if (seen.has(nameNormalized)) {
      throw validationFailed('Duplicate packaging unit identity in request', [
        { field: `items[${index}].name`, message: 'Packaging unit names must be unique per product' },
      ]);
    }
    seen.add(nameNormalized);
    let conversionFactor;
    try {
      conversionFactor = parseConversionFactor(item.conversionFactor);
    } catch (error) {
      throw validationFailed(error.message, [
        {
          field: `items[${index}].conversionFactor`,
          message: error.message,
        },
      ]);
    }
    const status = item.status === undefined ? 'active' : parseStatus(item.status, `items[${index}].status`);
    return { name, nameNormalized, conversionFactor, status };
  });
  return { expectedVersion, items };
}

function parsePricesReplace(body) {
  assertObjectBody(body);
  const expectedVersion = parseExpectedVersion(body);
  if (!Array.isArray(body.items)) {
    throw validationFailed('items must be an array', [
      { field: 'items', message: 'items must be an array' },
    ]);
  }
  const seen = new Set();
  const items = body.items.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw validationFailed(`items[${index}] must be an object`);
    }
    const priceTier = parsePriceTier(item.priceTier);
    if (seen.has(priceTier)) {
      throw validationFailed('Duplicate price tier in request', [
        { field: `items[${index}].priceTier`, message: 'Each price tier may appear once' },
      ]);
    }
    seen.add(priceTier);
    const money = parseMoneyInput(item.price, `items[${index}].price`);
    const status = item.status === undefined ? 'active' : parseStatus(item.status, `items[${index}].status`);
    return {
      priceTier,
      amountMinorUnits: money.amountMinorUnits,
      currency: money.currency,
      status,
    };
  });
  return { expectedVersion, items };
}

function toCategoryDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    name: String(record['name']),
    productClass: String(record['productClass']),
    status: String(record['status']),
    version: Number(record['version'] ?? 1),
  };
}

function toProductDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    categoryId: String(record['categoryId']),
    name: String(record['name']),
    sku: String(record['sku'] ?? ''),
    trackingMode: String(record['trackingMode']),
    baseUnitCode: String(record['baseUnitCode']),
    measurementDimension: String(record['measurementDimension']),
    status: String(record['status']),
    version: Number(record['version'] ?? 1),
  };
}

function toPackagingUnitDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    productId: String(record['productId']),
    name: String(record['name']),
    conversionFactor: String(record['conversionFactor']),
    status: String(record['status']),
    version: Number(record['version'] ?? 1),
  };
}

function toProductPriceDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    productId: String(record['productId']),
    priceTier: String(record['priceTier']),
    price: {
      amount: formatMoneyMinorUnits(BigInt(String(record['amountMinorUnits']))),
      currency: String(record['currency'] ?? 'PKR'),
    },
    status: String(record['status']),
    version: Number(record['version'] ?? 1),
  };
}

module.exports = {
  parseExpectedVersion,
  parseCategoryCreate,
  parseCategoryPatch,
  parseProductCreate,
  parseProductPatch,
  parsePackagingUnitsReplace,
  parsePricesReplace,
  assertTrackingModeAllowed,
  toCategoryDto,
  toProductDto,
  toPackagingUnitDto,
  toProductPriceDto,
  PRICE_TIERS,
  PRODUCT_CLASSES,
  TRACKING_MODES,
  MEASUREMENT_DIMENSIONS,
};
