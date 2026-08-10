const { validationFailed } = require('../../platform/errors/app-error');

const MAX_NAME = 120;
const MAX_CODE = 40;
const MAX_PREFIX = 20;
const BRANCH_STATUSES = new Set(['active', 'inactive']);
const WAREHOUSE_STATUSES = new Set(['active', 'inactive']);

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

function normalizeInvoicePrefix(value) {
  return value.trim().toUpperCase();
}

function parseBranchCreate(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }
  const name = requireTrimmedString(body.name, 'name', MAX_NAME);
  const invoicePrefix = normalizeInvoicePrefix(
    requireTrimmedString(body.invoicePrefix, 'invoicePrefix', MAX_PREFIX),
  );
  if (!/^[A-Z0-9-]{1,20}$/.test(invoicePrefix)) {
    throw validationFailed('invoicePrefix must be alphanumeric (A-Z, 0-9, hyphen)', [
      { field: 'invoicePrefix', message: 'invoicePrefix must be alphanumeric (A-Z, 0-9, hyphen)' },
    ]);
  }
  return {
    name,
    nameNormalized: normalizeName(name),
    code: optionalTrimmedString(body.code, 'code', MAX_CODE),
    invoicePrefix,
    invoicePrefixNormalized: invoicePrefix,
    status: 'active',
  };
}

function parseBranchPatch(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }
  const expectedVersion = parseExpectedVersion(body);
  const patch = {};

  if (body.name !== undefined) {
    const name = requireTrimmedString(body.name, 'name', MAX_NAME);
    patch.name = name;
    patch.nameNormalized = normalizeName(name);
  }
  if (body.code !== undefined) {
    patch.code = optionalTrimmedString(body.code, 'code', MAX_CODE);
  }
  if (body.invoicePrefix !== undefined) {
    const invoicePrefix = normalizeInvoicePrefix(
      requireTrimmedString(body.invoicePrefix, 'invoicePrefix', MAX_PREFIX),
    );
    if (!/^[A-Z0-9-]{1,20}$/.test(invoicePrefix)) {
      throw validationFailed('invoicePrefix must be alphanumeric (A-Z, 0-9, hyphen)', [
        { field: 'invoicePrefix', message: 'invoicePrefix must be alphanumeric (A-Z, 0-9, hyphen)' },
      ]);
    }
    patch.invoicePrefix = invoicePrefix;
    patch.invoicePrefixNormalized = invoicePrefix;
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !BRANCH_STATUSES.has(body.status)) {
      throw validationFailed('status must be active or inactive', [
        { field: 'status', message: 'status must be active or inactive' },
      ]);
    }
    patch.status = body.status;
  }

  if (Object.keys(patch).length === 0) {
    throw validationFailed('At least one branch field is required');
  }
  return { expectedVersion, patch };
}

function parseWarehouseCreate(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }
  const name = requireTrimmedString(body.name, 'name', MAX_NAME);
  return {
    name,
    nameNormalized: normalizeName(name),
    code: optionalTrimmedString(body.code, 'code', MAX_CODE),
    status: 'active',
  };
}

function parseWarehousePatch(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }
  const expectedVersion = parseExpectedVersion(body);
  const patch = {};

  if (body.name !== undefined) {
    const name = requireTrimmedString(body.name, 'name', MAX_NAME);
    patch.name = name;
    patch.nameNormalized = normalizeName(name);
  }
  if (body.code !== undefined) {
    patch.code = optionalTrimmedString(body.code, 'code', MAX_CODE);
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !WAREHOUSE_STATUSES.has(body.status)) {
      throw validationFailed('status must be active or inactive', [
        { field: 'status', message: 'status must be active or inactive' },
      ]);
    }
    patch.status = body.status;
  }

  if (Object.keys(patch).length === 0) {
    throw validationFailed('At least one warehouse field is required');
  }
  return { expectedVersion, patch };
}

function parseAccessAssignmentsReplace(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw validationFailed('Request body must be an object');
  }
  const branchIds = body.branchIds;
  const warehouseIds = body.warehouseIds;
  if (!Array.isArray(branchIds)) {
    throw validationFailed('branchIds must be an array', [
      { field: 'branchIds', message: 'branchIds must be an array' },
    ]);
  }
  if (!Array.isArray(warehouseIds)) {
    throw validationFailed('warehouseIds must be an array', [
      { field: 'warehouseIds', message: 'warehouseIds must be an array' },
    ]);
  }

  const normalizedBranches = [
    ...new Set(
      branchIds.map((id, index) => {
        if (typeof id !== 'string' || id.trim() === '') {
          throw validationFailed('branchIds entries must be non-empty strings', [
            { field: `branchIds[${index}]`, message: 'branch id is required' },
          ]);
        }
        return id.trim();
      }),
    ),
  ];
  const normalizedWarehouses = [
    ...new Set(
      warehouseIds.map((id, index) => {
        if (typeof id !== 'string' || id.trim() === '') {
          throw validationFailed('warehouseIds entries must be non-empty strings', [
            { field: `warehouseIds[${index}]`, message: 'warehouse id is required' },
          ]);
        }
        return id.trim();
      }),
    ),
  ];

  return { branchIds: normalizedBranches, warehouseIds: normalizedWarehouses };
}

function toBranchDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    name: String(record['name']),
    code: String(record['code'] ?? ''),
    invoicePrefix: String(record['invoicePrefix']),
    status: String(record['status']),
    version: Number(record['version'] ?? 1),
  };
}

function toWarehouseDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    name: String(record['name']),
    code: String(record['code'] ?? ''),
    status: String(record['status']),
    version: Number(record['version'] ?? 1),
  };
}

module.exports = {
  parseBranchCreate,
  parseBranchPatch,
  parseWarehouseCreate,
  parseWarehousePatch,
  parseAccessAssignmentsReplace,
  toBranchDto,
  toWarehouseDto,
  parseExpectedVersion,
};
