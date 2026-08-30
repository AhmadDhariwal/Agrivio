const { assignmentScopeDenied, authRequired } = require('../../platform/errors/app-error');

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
    return Array.isArray(authContext?.branchAssignments) ? authContext.branchAssignments : [];
  }
  return Array.isArray(authContext?.warehouseAssignments) ? authContext.warehouseAssignments : [];
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
    throw authRequired('Authentication required');
  }
  if (!canAccessBranch(authContext, branchId)) {
    throw assignmentScopeDenied("You don't have access to this branch or warehouse.");
  }
}

function assertWarehouseAccess(authContext, warehouseId) {
  if (authContext === undefined) {
    throw authRequired('Authentication required');
  }
  if (!canAccessWarehouse(authContext, warehouseId)) {
    throw assignmentScopeDenied("You don't have access to this branch or warehouse.");
  }
}

function assertOptionalLocationFilters(authContext, filters = {}) {
  const branchId = normalizeTargetId(filters.branchId);
  if (filters.branchId !== undefined && filters.branchId !== null && filters.branchId !== '') {
    assertBranchAccess(authContext, branchId);
  }
  const warehouseId = normalizeTargetId(filters.warehouseId);
  if (
    filters.warehouseId !== undefined &&
    filters.warehouseId !== null &&
    filters.warehouseId !== ''
  ) {
    assertWarehouseAccess(authContext, warehouseId);
  }
}

function assertRecordAssignmentScope(authContext, record = {}) {
  if (record.warehouseId !== undefined && record.warehouseId !== null && record.warehouseId !== '') {
    if (!canAccessWarehouse(authContext, record.warehouseId)) {
      throw assignmentScopeDenied("You don't have access to this branch or warehouse.");
    }
  }
  if (record.branchId !== undefined && record.branchId !== null && record.branchId !== '') {
    if (!canAccessBranch(authContext, record.branchId)) {
      throw assignmentScopeDenied("You don't have access to this branch or warehouse.");
    }
  }
}

function resolveAccessibleTargetIds(authContext, assignmentType) {
  if (authContext === undefined || authContext.contextType !== 'organization') {
    return Object.freeze([]);
  }
  if (isOrganizationWideRole(authContext.role)) {
    return null;
  }
  const organizationId = authContext.organizationId;
  return Object.freeze(
    assignmentList(authContext, assignmentType)
      .filter((item) => String(item.organizationId) === String(organizationId))
      .map((item) => String(item.targetId)),
  );
}

function resolveAccessibleWarehouseIds(authContext) {
  return resolveAccessibleTargetIds(authContext, 'warehouse');
}

function resolveAccessibleBranchIds(authContext) {
  return resolveAccessibleTargetIds(authContext, 'branch');
}

function hasAssignedLocations(authContext) {
  if (authContext === undefined || authContext.contextType !== 'organization') {
    return false;
  }
  if (isOrganizationWideRole(authContext.role)) {
    return true;
  }
  const branches = resolveAccessibleBranchIds(authContext) ?? [];
  const warehouses = resolveAccessibleWarehouseIds(authContext) ?? [];
  return branches.length > 0 || warehouses.length > 0;
}

function filterAssignedLocationOptions(authContext, items, assignmentType, selectedIds = new Set()) {
  if (!Array.isArray(items)) {
    return [];
  }
  const allowedIds = resolveAccessibleTargetIds(authContext, assignmentType);
  if (allowedIds === null) {
    return items;
  }
  const allowed = new Set(allowedIds);
  return items.filter((item) => allowed.has(String(item.id)) || selectedIds.has(String(item.id)));
}

function assertAssignmentDelegation(actorContext, branchIds, warehouseIds) {
  if (actorContext === undefined) {
    throw authRequired('Authentication required');
  }
  if (isOrganizationWideRole(actorContext.role)) {
    return;
  }
  for (const branchId of branchIds ?? []) {
    if (!canAccessBranch(actorContext, branchId)) {
      throw assignmentScopeDenied('You can only assign branches within your own access.');
    }
  }
  for (const warehouseId of warehouseIds ?? []) {
    if (!canAccessWarehouse(actorContext, warehouseId)) {
      throw assignmentScopeDenied('You can only assign warehouses within your own access.');
    }
  }
}

function mergeDelegatedAssignments(actorContext, existingIds, requestedIds, assignmentType) {
  if (!actorContext?.role || isOrganizationWideRole(actorContext.role)) {
    return [...new Set((requestedIds ?? []).map(String))];
  }
  const allowed = new Set(resolveAccessibleTargetIds(actorContext, assignmentType) ?? []);
  const preserved = (existingIds ?? []).filter((id) => !allowed.has(String(id))).map(String);
  const requested = (requestedIds ?? []).map(String);
  for (const id of requested) {
    if (!allowed.has(id)) {
      throw assignmentScopeDenied(
        assignmentType === 'branch'
          ? 'You can only assign branches within your own access.'
          : 'You can only assign warehouses within your own access.',
      );
    }
  }
  return [...new Set([...preserved, ...requested])];
}

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
      throw assignmentScopeDenied("You don't have access to this branch or warehouse.");
    }
    const allowed =
      orgWide ||
      branchAssignments.some(
        (item) =>
          item.targetId === normalizedBranch &&
          String(item.organizationId) === String(organizationId),
      );
    if (!allowed) {
      throw assignmentScopeDenied("You don't have access to this branch or warehouse.");
    }
  }

  const normalizedWarehouse = normalizeTargetId(warehouseId);
  if (warehouseId !== undefined && warehouseId !== null) {
    if (normalizedWarehouse === null) {
      throw assignmentScopeDenied("You don't have access to this branch or warehouse.");
    }
    const allowed =
      orgWide ||
      warehouseAssignments.some(
        (item) =>
          item.targetId === normalizedWarehouse &&
          String(item.organizationId) === String(organizationId),
      );
    if (!allowed) {
      throw assignmentScopeDenied("You don't have access to this branch or warehouse.");
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
  assertOptionalLocationFilters,
  assertRecordAssignmentScope,
  resolveAccessibleWarehouseIds,
  resolveAccessibleBranchIds,
  hasAssignedLocations,
  filterAssignedLocationOptions,
  assertAssignmentDelegation,
  mergeDelegatedAssignments,
  assertAssignmentSelection,
  resolveBranchIdFromRequest,
  resolveWarehouseIdFromRequest,
};
