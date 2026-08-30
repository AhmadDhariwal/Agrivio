import { AuthSessionContext } from './auth.api';

export function isOrganizationWideRole(role: string | undefined): boolean {
  return role === 'Owner';
}

export function allowedBranchIds(context: AuthSessionContext | null | undefined): string[] {
  if (context === null || context === undefined || context.contextType !== 'organization') {
    return [];
  }
  if (isOrganizationWideRole(context.role)) {
    return (context.branchAssignments ?? []).map((item) => item.targetId);
  }
  return (context.branchAssignments ?? []).map((item) => item.targetId);
}

export function allowedWarehouseIds(context: AuthSessionContext | null | undefined): string[] {
  if (context === null || context === undefined || context.contextType !== 'organization') {
    return [];
  }
  return (context.warehouseAssignments ?? []).map((item) => item.targetId);
}

// Non-authoritative UI filter for branch selectors (F03 Locations CRUD will consume this).
// Owners are treated as organization-wide; empty assignment lists still allow Owner selection UX.
export function isBranchSelectable(
  context: AuthSessionContext | null | undefined,
  branchId: string,
): boolean {
  if (context === null || context === undefined || context.contextType !== 'organization') {
    return false;
  }
  if (isOrganizationWideRole(context.role)) {
    return true;
  }
  return allowedBranchIds(context).includes(branchId);
}

export function isWarehouseSelectable(
  context: AuthSessionContext | null | undefined,
  warehouseId: string,
): boolean {
  if (context === null || context === undefined || context.contextType !== 'organization') {
    return false;
  }
  if (isOrganizationWideRole(context.role)) {
    return true;
  }
  return allowedWarehouseIds(context).includes(warehouseId);
}

export function filterBranchOptions<T extends { id: string }>(
  context: AuthSessionContext | null | undefined,
  options: readonly T[],
): T[] {
  return options.filter((option) => isBranchSelectable(context, option.id));
}

export function filterWarehouseOptions<T extends { id: string }>(
  context: AuthSessionContext | null | undefined,
  options: readonly T[],
): T[] {
  return options.filter((option) => isWarehouseSelectable(context, option.id));
}

export function hasMissingOperationalAssignments(
  context: AuthSessionContext | null | undefined,
): boolean {
  if (context === null || context === undefined || context.contextType !== 'organization') {
    return false;
  }
  if (isOrganizationWideRole(context.role)) {
    return false;
  }
  const branches = context.branchAssignments ?? [];
  const warehouses = context.warehouseAssignments ?? [];
  return branches.length === 0 && warehouses.length === 0;
}
