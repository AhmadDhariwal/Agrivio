const { forbidden, unauthorized } = require('../../platform/errors/app-error');

function isOrganizationWideRole(role) {
  return role === 'Owner';
}

function normalizeTargetId(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  return value.trim();
}

function assignmentList(authContext, assignmentType) {
  if (assignmentType === 'branch') {
    return Array.isArray(authContext.branchAssignments) ? authContext.branchAssignments : [];
  }
  return Array.isArray(authContext.warehouseAssignments) ? authContext.warehouseAssignments : [];
}

function hasAssignment(authContext, assignmentType, targetId) {
  const organizationId = authContext.organizationId;
  if (organizationId === undefined) {
    return false;
  }
  return assignmentList(authContext, assignmentType).some(
    (item) =>
      String(item.targetId) === String(targetId) &&
      String(item.organizationId) === String(organizationId),
  );
}

/**
 * Server-side branch access decision. Client input is never authoritative.
 * Owners have organization-wide branch access while in organization context.
 */
function canAccessBranch(authContext, branchId) {
  const targetId = normalizeTargetId(branchId);
  if (targetId === null) {
    return false;
  }
  if (authContext === undefined || authContext.contextType !== 'organization') {
    return false;
  }
  if (isOrganizationWideRole(authContext.role)) {
    return true;
  }
  return hasAssignment(authContext, 'branch', targetId);
}

function canAccessWarehouse(authContext, warehouseId) {
  const targetId = normalizeTargetId(warehouseId);
  if (targetId === null) {
    return false;
  }
  if (authContext === undefined || authContext.contextType !== 'organization') {
    return false;
  }
  if (isOrganizationWideRole(authContext.role)) {
    return true;
  }
  return hasAssignment(authContext, 'warehouse', targetId);
}

function assertBranchAccess(authContext, branchId) {
  if (authContext === undefined) {
    throw unauthorized('Authentication required');
  }
  if (!canAccessBranch(authContext, branchId)) {
    throw forbidden('Branch is outside the authorized assignment scope');
  }
}

function assertWarehouseAccess(authContext, warehouseId) {
  if (authContext === undefined) {
    throw unauthorized('Authentication required');
  }
  if (!canAccessWarehouse(authContext, warehouseId)) {
    throw forbidden('Warehouse is outside the authorized assignment scope');
  }
}

/**
 * Validate optional client-supplied branch/warehouse against server assignments.
 * Used by session context selection and business handlers.
 */
function assertAssignmentSelection(authContextOrRole, organizationId, assignments, branchId, warehouseId) {
  const role =
    typeof authContextOrRole === 'string' ? authContextOrRole : authContextOrRole?.role;
  const orgWide = isOrganizationWideRole(role);
  const branchAssignments = [];
  const warehouseAssignments = [];

  for (const assignment of assignments ?? []) {
    if (assignment['status'] !== undefined && assignment['status'] !== 'active') {
      continue;
    }
    const entry = {
      targetId: String(assignment['targetId']),
      organizationId: String(assignment['organizationId']),
    };
    if (assignment['assignmentType'] === 'branch') {
      branchAssignments.push(entry);
    } else if (assignment['assignmentType'] === 'warehouse') {
      warehouseAssignments.push(entry);
    }
  }

  const normalizedBranch = normalizeTargetId(branchId);
  if (branchId !== undefined && branchId !== null) {
    if (normalizedBranch === null) {
      throw forbidden('Branch is outside the authorized assignment scope');
    }
    const allowed =
      orgWide ||
      branchAssignments.some(
        (item) =>
          item.targetId === normalizedBranch &&
          String(item.organizationId) === String(organizationId),
      );
    if (!allowed) {
      throw forbidden('Requested branch is outside the authorized assignment scope');
    }
  }

  const normalizedWarehouse = normalizeTargetId(warehouseId);
  if (warehouseId !== undefined && warehouseId !== null) {
    if (normalizedWarehouse === null) {
      throw forbidden('Warehouse is outside the authorized assignment scope');
    }
    const allowed =
      orgWide ||
      warehouseAssignments.some(
        (item) =>
          item.targetId === normalizedWarehouse &&
          String(item.organizationId) === String(organizationId),
      );
    if (!allowed) {
      throw forbidden('Requested warehouse is outside the authorized assignment scope');
    }
  }
}

function resolveBranchIdFromRequest(req) {
  return (
    req.params?.branchId ??
    req.body?.branchId ??
    req.query?.branchId ??
    req.authContext?.branchId
  );
}

function resolveWarehouseIdFromRequest(req) {
  return (
    req.params?.warehouseId ??
    req.body?.warehouseId ??
    req.query?.warehouseId ??
    req.authContext?.warehouseId
  );
}

module.exports = {
  isOrganizationWideRole,
  canAccessBranch,
  canAccessWarehouse,
  assertBranchAccess,
  assertWarehouseAccess,
  assertAssignmentSelection,
  resolveBranchIdFromRequest,
  resolveWarehouseIdFromRequest,
};
