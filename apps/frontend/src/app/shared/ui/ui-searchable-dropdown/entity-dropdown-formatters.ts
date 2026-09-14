import { DropdownOption } from './ui-searchable-dropdown.component';

export function formatBranchOption(branch: {
  id: string;
  name: string;
  code?: string | null;
  invoicePrefix?: string | null;
  isDefault?: boolean;
}): DropdownOption {
  const parts: string[] = [];
  if (branch.code) parts.push(branch.code);
  else if (branch.invoicePrefix) parts.push(branch.invoicePrefix);
  if (branch.isDefault) parts.push('Default');

  return {
    value: branch.id,
    label: branch.name,
    meta: parts.length > 0 ? parts.join(' · ') : undefined,
  };
}

export function formatWarehouseOption(warehouse: {
  id: string;
  name: string;
  branchName?: string | null;
  branchId?: string | null;
  isDefault?: boolean;
}): DropdownOption {
  const parts: string[] = [];
  if (warehouse.branchName) parts.push(warehouse.branchName);
  if (warehouse.isDefault) parts.push('Default');

  return {
    value: warehouse.id,
    label: warehouse.name,
    meta: parts.length > 0 ? parts.join(' · ') : undefined,
  };
}

export function formatCustomerOption(customer: {
  id: string;
  name: string;
  phone?: string | null;
  priceTier?: string | null;
}): DropdownOption {
  const parts: string[] = [];
  if (customer.phone) parts.push(customer.phone);
  if (customer.priceTier) parts.push(customer.priceTier);

  return {
    value: customer.id,
    label: customer.name,
    meta: parts.length > 0 ? parts.join(' · ') : undefined,
  };
}

export function formatSupplierOption(supplier: {
  id: string;
  name: string;
  phone?: string | null;
  contactPerson?: string | null;
  ntn?: string | null;
}): DropdownOption {
  const parts: string[] = [];
  if (supplier.contactPerson) parts.push(supplier.contactPerson);
  else if (supplier.phone) parts.push(supplier.phone);
  if (supplier.ntn) parts.push(`NTN: ${supplier.ntn}`);

  return {
    value: supplier.id,
    label: supplier.name,
    meta: parts.length > 0 ? parts.join(' · ') : undefined,
  };
}

export function formatProductOption(product: {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  trackingMode?: string | null;
  baseUnitCode?: string | null;
}): DropdownOption {
  const parts: string[] = [];
  if (product.sku) parts.push(product.sku);
  else if (product.barcode) parts.push(product.barcode);
  if (product.trackingMode && product.trackingMode !== 'none') parts.push(product.trackingMode);
  else if (product.baseUnitCode) parts.push(product.baseUnitCode);

  return {
    value: product.id,
    label: product.name,
    meta: parts.length > 0 ? parts.join(' · ') : undefined,
  };
}

export function formatAccountOption(account: {
  id: string;
  name: string;
  code?: string | null;
  type?: string | null;
  currency?: string | null;
}): DropdownOption {
  const parts: string[] = [];
  if (account.code) parts.push(account.code);
  if (account.type) parts.push(account.type);

  return {
    value: account.id,
    label: account.name,
    meta: parts.length > 0 ? parts.join(' · ') : undefined,
  };
}

export function formatUserOption(user: {
  id: string;
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}): DropdownOption {
  const name = user.displayName || user.name || user.email || user.id;
  const parts: string[] = [];
  if (user.email && user.email !== name) parts.push(user.email);
  if (user.role) parts.push(user.role);

  return {
    value: user.id,
    label: name,
    meta: parts.length > 0 ? parts.join(' · ') : undefined,
  };
}

export function formatCategoryOption(category: {
  id: string;
  name: string;
  productClass?: string | null;
}): DropdownOption {
  return {
    value: category.id,
    label: category.name,
    meta: category.productClass || undefined,
  };
}

export function formatBatchOption(batch: {
  id: string;
  batchNumber: string;
  expiryDate?: string | null;
  availableQuantity?: number | null;
}): DropdownOption {
  const parts: string[] = [];
  if (batch.expiryDate) parts.push(`Exp: ${batch.expiryDate}`);
  if (batch.availableQuantity !== null && batch.availableQuantity !== undefined) {
    parts.push(`Qty: ${batch.availableQuantity}`);
  }

  return {
    value: batch.id,
    label: batch.batchNumber,
    meta: parts.length > 0 ? parts.join(' · ') : undefined,
  };
}

export function formatPackagingUnitOption(unit: {
  id: string;
  name: string;
  conversionFactor?: string | number | null;
}): DropdownOption {
  return {
    value: unit.id,
    label: unit.name,
    meta: unit.conversionFactor ? `×${unit.conversionFactor}` : undefined,
  };
}
