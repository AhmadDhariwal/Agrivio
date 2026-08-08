class TenantScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

/**
 * Explicit marker for audited platform/system persistence bypasses.
 */
const SYSTEM_SCOPE = '__agrivio_system_scope__';

function createOrganizationScope(organizationId) {
  if (typeof organizationId !== 'string' || organizationId.trim().length === 0) {
    throw new TenantScopeError('organizationId is required for tenant-scoped persistence');
  }

  return { mode: 'organization', organizationId: organizationId.trim() };
}

function createSystemScope(reason, token) {
  if (token !== SYSTEM_SCOPE) {
    throw new TenantScopeError('Invalid system scope bypass token');
  }
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new TenantScopeError('System scope bypass requires a documented reason');
  }

  return { mode: 'system', reason: reason.trim(), token: SYSTEM_SCOPE };
}

function composeTenantFilter(scope, filter = {}) {
  if (scope.mode === 'system') {
    return { ...filter, __systemScope: true, __systemScopeReason: scope.reason };
  }

  return {
    ...filter,
    organizationId: scope.organizationId,
  };
}

function assertTenantWriteDocument(scope, document) {
  if (scope.mode === 'system') {
    return;
  }

  if (document['organizationId'] !== scope.organizationId) {
    throw new TenantScopeError('Document organizationId does not match tenant scope');
  }
}

function assertTenantReadFilter(scope, filter) {
  if (scope.mode === 'system') {
    return;
  }

  if (filter['organizationId'] !== scope.organizationId) {
    throw new TenantScopeError('Tenant reads must include the active organizationId filter');
  }
}

/**
 * Sample module-owned repository helper for tests and architecture guidance.
 */
function createSampleTenantRepository(deps) {
  return {
    async findById(id) {
      const filter = composeTenantFilter(deps.scope, { _id: id });
      assertTenantReadFilter(deps.scope, filter);
      return deps.collection.findOne(filter);
    },

    async insert(document) {
      assertTenantWriteDocument(deps.scope, document);
      const scoped = composeTenantFilter(deps.scope, document);
      await deps.collection.insertOne(scoped);
    },
  };
}

module.exports = {
  SYSTEM_SCOPE,
  createOrganizationScope,
  createSystemScope,
  composeTenantFilter,
  assertTenantWriteDocument,
  assertTenantReadFilter,
  createSampleTenantRepository,
  TenantScopeError,
};
