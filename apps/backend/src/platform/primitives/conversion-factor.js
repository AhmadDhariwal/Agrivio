/**
 * Packaging conversion factors support up to six decimal places (BR-COMMON-018).
 * Stored as canonical decimal strings so later transaction snapshots can copy the value
 * without depending on mutable current packaging configuration (FR-PRODUCT-007).
 */

const CONVERSION_FACTOR_MAX_SCALE = 6;
const CONVERSION_FACTOR_PATTERN = /^\d+(\.\d{1,6})?$/;

function parseConversionFactor(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new Error('Conversion factor must be a decimal string');
  }
  const value = String(raw).trim();
  if (!CONVERSION_FACTOR_PATTERN.test(value)) {
    throw new Error('Conversion factor must be a positive decimal with up to six places');
  }
  if (value === '0' || /^0+(\.0+)?$/.test(value)) {
    throw new Error('Conversion factor must be greater than zero');
  }
  const [whole, fraction = ''] = value.split('.');
  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction.length === 0 ? whole : `${whole}.${normalizedFraction}`;
}

function assertCompatibleMeasurementDimension(productDimension, packagingDimension) {
  if (productDimension !== packagingDimension) {
    throw new Error('Packaging unit measurement dimension must match the product base unit');
  }
}

module.exports = {
  CONVERSION_FACTOR_MAX_SCALE,
  parseConversionFactor,
  assertCompatibleMeasurementDimension,
};
