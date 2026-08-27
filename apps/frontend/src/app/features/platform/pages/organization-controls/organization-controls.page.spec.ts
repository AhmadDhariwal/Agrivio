import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CapabilitiesApi } from '../../../capabilities/data-access/capabilities.api';
import { PlatformCapabilityControl } from '../../../capabilities/models/capability.models';
import { OrganizationControlsPage } from './organization-controls.page';

function control(
  key: string,
  moduleKey:
    | 'inventory.products'
    | 'inventory.categories'
    | 'inventory.stock'
    | 'inventory.openingStock'
    | 'inventory.batches'
    | 'inventory.expiry'
    | 'inventory.adjustments'
    | 'inventory.transfers'
    | 'inventory.reconciliation'
    | 'inventory.movements'
    | 'customers'
    | 'suppliers'
    | 'returns'
    | 'expenses'
    | 'expenses.categories'
    | 'accounts'
    | 'reports'
    | 'alerts',
  type: PlatformCapabilityControl['type'],
  label: string,
  policy: Record<string, boolean>,
  options: {
    override?: Record<string, boolean>;
    risk?: PlatformCapabilityControl['risk'];
    configurable?: Record<string, boolean>;
    platformEnforced?: boolean;
    reason?: string;
    effectiveValue?: Record<string, boolean>;
    reasons?: readonly string[];
  } = {},
): PlatformCapabilityControl {
  const override = options.override ?? null;
  return {
    key,
    parentKey: key === moduleKey ? 'inventory' : moduleKey,
    moduleKey,
    type,
    label,
    description: `${label} control`,
    defaultPolicy: policy,
    configurable:
      options.configurable ?? Object.fromEntries(Object.keys(policy).map((mode) => [mode, true])),
    risk: options.risk ?? 'NORMAL',
    override,
    configuredValue: { ...policy, ...(override ?? {}) },
    effectiveValue: options.effectiveValue ?? { ...policy, ...(override ?? {}) },
    reasons: options.reasons ?? [],
    ...(options.platformEnforced ? { platformEnforced: true } : {}),
    ...(options.reason ? { reason: options.reason } : {}),
  };
}

describe('OrganizationControlsPage', () => {
  let fixture: ComponentFixture<OrganizationControlsPage>;
  let saved: { expectedVersion: number; changes: readonly unknown[] } | null;
  const resetControl = vi.fn();
  const resetModule = vi.fn();

  beforeEach(async () => {
    saved = null;
    resetControl.mockReset().mockReturnValue(of({}));
    resetModule.mockReset().mockReturnValue(of({}));
    const controls = [
      control(
        'inventory.products',
        'inventory.products',
        'FEATURE',
        'Products module',
        {
          enabled: true,
        },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.products.widgets.lowStock',
        'inventory.products',
        'WIDGET',
        'Low Stock',
        { visible: true },
        { override: { visible: false } },
      ),
      control(
        'inventory.openingStock',
        'inventory.openingStock',
        'FEATURE',
        'Opening Stock',
        { enabled: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.openingStock.features.moduleInfo',
        'inventory.openingStock',
        'FEATURE',
        'Module Information',
        { enabled: true },
      ),
      control(
        'inventory.openingStock.fields.packagingUnit',
        'inventory.openingStock',
        'FIELD',
        'Packaging Unit',
        { visible: true },
        { override: { visible: false } },
      ),
      control(
        'inventory.openingStock.fields.warehouse',
        'inventory.openingStock',
        'FIELD',
        'Warehouse',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Opening Stock must identify the destination warehouse.',
        },
      ),
      control(
        'inventory.openingStock.fields.batchExpiry',
        'inventory.openingStock',
        'FIELD',
        'Batch / Expiry',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Selected product tracking rules remain authoritative.',
        },
      ),
      control(
        'inventory.openingStock.actions.post',
        'inventory.openingStock',
        'ACTION',
        'Post Opening Stock',
        { allowed: true },
        { risk: 'CRITICAL' },
      ),
      control('inventory.products.fields.sku', 'inventory.products', 'FIELD', 'SKU', {
        visible: true,
        editable: true,
      }),
      control(
        'inventory.categories',
        'inventory.categories',
        'FEATURE',
        'Categories module',
        { enabled: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.categories.widgets.totalCategories',
        'inventory.categories',
        'WIDGET',
        'Total Categories',
        { visible: true },
      ),
      control(
        'inventory.stock',
        'inventory.stock',
        'FEATURE',
        'Stock on Hand',
        { enabled: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.stock.fields.wac',
        'inventory.stock',
        'FIELD',
        'Weighted Average Cost (WAC)',
        { visible: true },
      ),
      control(
        'inventory.stock.widgets.stockRecords',
        'inventory.stock',
        'WIDGET',
        'Stock Records',
        { visible: true },
        { override: { visible: false } },
      ),
      control(
        'inventory.batches',
        'inventory.batches',
        'FEATURE',
        'Product Batches',
        { enabled: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.batches.features.moduleInfo',
        'inventory.batches',
        'FEATURE',
        'About Product Batches',
        { enabled: true },
      ),
      control('inventory.batches.features.search', 'inventory.batches', 'FEATURE', 'Search', {
        enabled: true,
      }),
      control(
        'inventory.batches.features.stockByLocation',
        'inventory.batches',
        'FEATURE',
        'Stock by Location',
        { enabled: true },
      ),
      control(
        'inventory.batches.fields.batchNumber',
        'inventory.batches',
        'FIELD',
        'Batch Number',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Primary Batch identity.',
        },
      ),
      control(
        'inventory.batches.fields.product',
        'inventory.batches',
        'FIELD',
        'Product',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'A Batch cannot be meaningfully identified without its Product.',
        },
      ),
      control(
        'inventory.batches.fields.expiryDate',
        'inventory.batches',
        'FIELD',
        'Expiry Date',
        { visible: true },
        { override: { visible: false } },
      ),
      control(
        'inventory.batches.widgets.totalBatches',
        'inventory.batches',
        'WIDGET',
        'Total Batches',
        { visible: true },
      ),
      {
        ...control(
          'inventory.batches.actions.viewStock',
          'inventory.batches',
          'ACTION',
          'View Stock',
          { allowed: true },
        ),
        dependencies: ['inventory.stock'],
      },
      control(
        'inventory.expiry',
        'inventory.expiry',
        'FEATURE',
        'Expiry Inquiry',
        { enabled: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.expiry.features.moduleInfo',
        'inventory.expiry',
        'FEATURE',
        'About Expiry Inquiry',
        { enabled: true },
      ),
      control(
        'inventory.expiry.fields.batchNumber',
        'inventory.expiry',
        'FIELD',
        'Batch Number',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Primary Batch identity.',
        },
      ),
      control(
        'inventory.expiry.fields.warehouse',
        'inventory.expiry',
        'FIELD',
        'Warehouse',
        { visible: true },
        { override: { visible: false } },
      ),
      control(
        'inventory.expiry.widgets.totalRecords',
        'inventory.expiry',
        'WIDGET',
        'Total Records',
        { visible: true },
      ),
      control(
        'inventory.adjustments',
        'inventory.adjustments',
        'MODULE',
        'Stock Adjustments',
        { enabled: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.adjustments.features.moduleInfo',
        'inventory.adjustments',
        'FEATURE',
        'About Stock Adjustments',
        { enabled: true },
      ),
      control(
        'inventory.adjustments.features.productSearch',
        'inventory.adjustments',
        'FEATURE',
        'Product Search',
        { enabled: true },
      ),
      control(
        'inventory.adjustments.features.productContext',
        'inventory.adjustments',
        'FEATURE',
        'Product Context',
        { enabled: true },
      ),
      control(
        'inventory.adjustments.features.stockContext',
        'inventory.adjustments',
        'FEATURE',
        'Stock Context',
        { enabled: true },
      ),
      control(
        'inventory.adjustments.features.guidance',
        'inventory.adjustments',
        'FEATURE',
        'Guidance',
        { enabled: true },
        { override: { enabled: false } },
      ),
      control(
        'inventory.adjustments.features.recentAdjustments',
        'inventory.adjustments',
        'FEATURE',
        'Recent Adjustments',
        { enabled: true },
      ),
      control(
        'inventory.adjustments.features.serverPostingDate',
        'inventory.adjustments',
        'FEATURE',
        'Server Posting Date',
        { enabled: true },
      ),
      control(
        'inventory.adjustments.fields.warehouse',
        'inventory.adjustments',
        'FIELD',
        'Warehouse',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Warehouse is required.',
        },
      ),
      control(
        'inventory.adjustments.fields.product',
        'inventory.adjustments',
        'FIELD',
        'Product',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Product is required.',
        },
      ),
      control(
        'inventory.adjustments.fields.adjustmentType',
        'inventory.adjustments',
        'FIELD',
        'Adjustment Type',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Adjustment Type is required.',
        },
      ),
      control(
        'inventory.adjustments.fields.quantity',
        'inventory.adjustments',
        'FIELD',
        'Quantity',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Quantity is required.',
        },
      ),
      control(
        'inventory.adjustments.fields.reason',
        'inventory.adjustments',
        'FIELD',
        'Reason',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Reason is required.',
        },
      ),
      control(
        'inventory.adjustments.fields.batch',
        'inventory.adjustments',
        'FIELD',
        'Batch',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Required for tracked products.',
        },
      ),
      control(
        'inventory.adjustments.fields.direction',
        'inventory.adjustments',
        'FIELD',
        'Direction',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Required for correction.',
        },
      ),
      control(
        'inventory.adjustments.fields.inventoryValue',
        'inventory.adjustments',
        'FIELD',
        'Inventory Value',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Required for inbound correction.',
        },
      ),
      control(
        'inventory.adjustments.actions.post',
        'inventory.adjustments',
        'ACTION',
        'Post Adjustment',
        { allowed: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.adjustments.actions.reverse',
        'inventory.adjustments',
        'ACTION',
        'Reverse Adjustment',
        { allowed: true },
        { risk: 'CRITICAL' },
      ),
      {
        ...control(
          'inventory.adjustments.actions.viewStock',
          'inventory.adjustments',
          'ACTION',
          'View Stock',
          { allowed: true },
        ),
        dependencies: ['inventory.stock'],
      },
      control(
        'inventory.adjustments.actions.viewMovements',
        'inventory.adjustments',
        'ACTION',
        'View Movements',
        { allowed: true },
      ),
      control(
        'inventory.transfers',
        'inventory.transfers',
        'MODULE',
        'Warehouse Transfers',
        { enabled: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.transfers.features.moduleInfo',
        'inventory.transfers',
        'FEATURE',
        'About Warehouse Transfers',
        { enabled: true },
      ),
      control(
        'inventory.transfers.features.productSearch',
        'inventory.transfers',
        'FEATURE',
        'Product Search',
        { enabled: true },
      ),
      control(
        'inventory.transfers.features.productContext',
        'inventory.transfers',
        'FEATURE',
        'Product Context',
        { enabled: true },
      ),
      control(
        'inventory.transfers.features.stockContext',
        'inventory.transfers',
        'FEATURE',
        'Stock Context',
        { enabled: true },
      ),
      control(
        'inventory.transfers.features.guidance',
        'inventory.transfers',
        'FEATURE',
        'Guidance',
        { enabled: true },
        { override: { enabled: false } },
      ),
      control(
        'inventory.transfers.features.recentTransfers',
        'inventory.transfers',
        'FEATURE',
        'Recent Transfers',
        { enabled: true },
      ),
      control(
        'inventory.transfers.features.serverTransferDate',
        'inventory.transfers',
        'FEATURE',
        'Server Transfer Date',
        { enabled: true },
      ),
      control(
        'inventory.transfers.fields.sourceWarehouse',
        'inventory.transfers',
        'FIELD',
        'Source Warehouse',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Source warehouse is required.',
        },
      ),
      control(
        'inventory.transfers.fields.destinationWarehouse',
        'inventory.transfers',
        'FIELD',
        'Destination Warehouse',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Destination warehouse is required.',
        },
      ),
      control(
        'inventory.transfers.fields.product',
        'inventory.transfers',
        'FIELD',
        'Product',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Product is required.',
        },
      ),
      control(
        'inventory.transfers.fields.quantity',
        'inventory.transfers',
        'FIELD',
        'Quantity',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Quantity is required.',
        },
      ),
      control(
        'inventory.transfers.fields.reason',
        'inventory.transfers',
        'FIELD',
        'Reason',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Reason is required.',
        },
      ),
      control(
        'inventory.transfers.fields.batch',
        'inventory.transfers',
        'FIELD',
        'Batch',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Required for tracked products.',
        },
      ),
      control(
        'inventory.transfers.actions.post',
        'inventory.transfers',
        'ACTION',
        'Post Transfer',
        { allowed: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.transfers.actions.reverse',
        'inventory.transfers',
        'ACTION',
        'Reverse Transfer',
        { allowed: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.transfers.actions.inspect',
        'inventory.transfers',
        'ACTION',
        'Inspect Transfer',
        { allowed: true },
      ),
      {
        ...control(
          'inventory.transfers.actions.viewStock',
          'inventory.transfers',
          'ACTION',
          'View Stock',
          { allowed: true },
        ),
        dependencies: ['inventory.stock'],
      },
      control(
        'inventory.reconciliation',
        'inventory.reconciliation',
        'FEATURE',
        'Inventory Reconciliation',
        { enabled: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.reconciliation.features.moduleInfo',
        'inventory.reconciliation',
        'FEATURE',
        'About Inventory Reconciliation',
        { enabled: true },
      ),
      control(
        'inventory.reconciliation.features.search',
        'inventory.reconciliation',
        'FEATURE',
        'Reconciliation Search',
        { enabled: true },
      ),
      control(
        'inventory.reconciliation.features.warehouseFilter',
        'inventory.reconciliation',
        'FEATURE',
        'Warehouse Filter',
        { enabled: true },
      ),
      control(
        'inventory.reconciliation.features.findingFilter',
        'inventory.reconciliation',
        'FEATURE',
        'Finding Filter',
        { enabled: true },
      ),
      control(
        'inventory.reconciliation.features.kpiCards',
        'inventory.reconciliation',
        'FEATURE',
        'KPI Summary Cards',
        { enabled: true },
      ),
      control(
        'inventory.reconciliation.features.inspector',
        'inventory.reconciliation',
        'FEATURE',
        'Detail Inspector Drawer',
        { enabled: true },
      ),
      control(
        'inventory.reconciliation.features.technicalDetails',
        'inventory.reconciliation',
        'FEATURE',
        'Technical Details Section',
        { enabled: true },
        { override: { enabled: false } },
      ),
      control(
        'inventory.reconciliation.fields.product',
        'inventory.reconciliation',
        'FIELD',
        'Product',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Product is required.',
        },
      ),
      control(
        'inventory.reconciliation.fields.warehouse',
        'inventory.reconciliation',
        'FIELD',
        'Warehouse',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Warehouse is required.',
        },
      ),
      control(
        'inventory.reconciliation.fields.batch',
        'inventory.reconciliation',
        'FIELD',
        'Batch',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Batch is required.',
        },
      ),
      control(
        'inventory.reconciliation.fields.balanceQuantity',
        'inventory.reconciliation',
        'FIELD',
        'Balance Quantity',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Balance quantity is required.',
        },
      ),
      control(
        'inventory.reconciliation.fields.movementQuantity',
        'inventory.reconciliation',
        'FIELD',
        'Movement Quantity',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Movement quantity is required.',
        },
      ),
      control(
        'inventory.reconciliation.fields.variance',
        'inventory.reconciliation',
        'FIELD',
        'Variance',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Variance is required.',
        },
      ),
      control(
        'inventory.reconciliation.fields.findingCode',
        'inventory.reconciliation',
        'FIELD',
        'Finding Code',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Finding code is required.',
        },
      ),
      control(
        'inventory.reconciliation.actions.refresh',
        'inventory.reconciliation',
        'ACTION',
        'Refresh',
        { allowed: true },
      ),
      control(
        'inventory.reconciliation.actions.inspect',
        'inventory.reconciliation',
        'ACTION',
        'Inspect Finding',
        { allowed: true },
      ),
      {
        ...control(
          'inventory.reconciliation.actions.viewStock',
          'inventory.reconciliation',
          'ACTION',
          'View Stock',
          { allowed: true },
        ),
        dependencies: ['inventory.stock'],
      },
      control(
        'inventory.reconciliation.actions.viewMovements',
        'inventory.reconciliation',
        'ACTION',
        'View Stock Movements',
        { allowed: true },
      ),
      {
        ...control(
          'inventory.reconciliation.actions.viewBatch',
          'inventory.reconciliation',
          'ACTION',
          'View Batch',
          { allowed: true },
        ),
        dependencies: ['inventory.batches'],
      },
      control(
        'inventory.movements',
        'inventory.movements',
        'MODULE',
        'Stock Movements',
        { enabled: true },
        { risk: 'CRITICAL' },
      ),
      control(
        'inventory.movements.features.moduleInfo',
        'inventory.movements',
        'FEATURE',
        'About Stock Movements',
        { enabled: true },
      ),
      control(
        'inventory.movements.features.search',
        'inventory.movements',
        'FEATURE',
        'Search Filter',
        { enabled: true },
      ),
      control(
        'inventory.movements.features.filters',
        'inventory.movements',
        'FEATURE',
        'Advanced Filters',
        { enabled: true },
      ),
      control(
        'inventory.movements.features.kpiCards',
        'inventory.movements',
        'FEATURE',
        'KPI Summary Cards',
        { enabled: true },
      ),
      control(
        'inventory.movements.features.referenceResolution',
        'inventory.movements',
        'FEATURE',
        'Reference Resolution',
        { enabled: true },
      ),
      control(
        'inventory.movements.features.inspector',
        'inventory.movements',
        'FEATURE',
        'Detail Inspector Drawer',
        { enabled: true },
      ),
      control(
        'inventory.movements.features.technicalDetails',
        'inventory.movements',
        'FEATURE',
        'Technical Details Section',
        { enabled: true },
        { override: { enabled: false } },
      ),
      control(
        'inventory.movements.features.mobileCards',
        'inventory.movements',
        'FEATURE',
        'Mobile Cards View',
        { enabled: true },
      ),
      control(
        'inventory.movements.fields.product',
        'inventory.movements',
        'FIELD',
        'Product',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Product is required.',
        },
      ),
      control(
        'inventory.movements.fields.warehouse',
        'inventory.movements',
        'FIELD',
        'Warehouse',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Warehouse is required.',
        },
      ),
      control(
        'inventory.movements.fields.direction',
        'inventory.movements',
        'FIELD',
        'Direction',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Direction is required.',
        },
      ),
      control(
        'inventory.movements.fields.quantity',
        'inventory.movements',
        'FIELD',
        'Quantity',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Quantity is required.',
        },
      ),
      control(
        'inventory.movements.fields.sourceType',
        'inventory.movements',
        'FIELD',
        'Source Type',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Source type is required.',
        },
      ),
      control(
        'inventory.movements.fields.batch',
        'inventory.movements',
        'FIELD',
        'Batch',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Batch is required.',
        },
      ),
      control(
        'inventory.movements.fields.inventoryValue',
        'inventory.movements',
        'FIELD',
        'Inventory Value',
        { visible: true },
        {
          configurable: { visible: false },
          platformEnforced: true,
          risk: 'CRITICAL',
          reason: 'Inventory value is required.',
        },
      ),
      control(
        'inventory.movements.actions.refresh',
        'inventory.movements',
        'ACTION',
        'Refresh',
        { allowed: true },
      ),
      control(
        'inventory.movements.actions.inspect',
        'inventory.movements',
        'ACTION',
        'Inspect Movement',
        { allowed: true },
      ),
      {
        ...control(
          'inventory.movements.actions.viewStock',
          'inventory.movements',
          'ACTION',
          'View Stock',
          { allowed: true },
        ),
        dependencies: ['inventory.stock'],
      },
      {
        ...control(
          'inventory.movements.actions.viewProduct',
          'inventory.movements',
          'ACTION',
          'View Product',
          { allowed: true },
        ),
        dependencies: ['inventory.products'],
      },
      {
        ...control(
          'inventory.movements.actions.viewBatch',
          'inventory.movements',
          'ACTION',
          'View Batch',
          { allowed: true },
        ),
        dependencies: ['inventory.batches'],
      },
      // Customers Module (1)
      control('customers', 'customers', 'MODULE', 'Customers', { enabled: true }, { risk: 'CRITICAL' }),
      // View (1)
      control('customers.views.desktopCards', 'customers', 'VIEW', 'Desktop Cards', { enabled: true }),
      // Features (7)
      control('customers.features.moduleInfo', 'customers', 'FEATURE', 'Module Info', { enabled: true }),
      control('customers.features.search', 'customers', 'FEATURE', 'Search', { enabled: true }),
      control('customers.features.statusFilter', 'customers', 'FEATURE', 'Status Filter', { enabled: true }),
      control('customers.features.kpiCards', 'customers', 'FEATURE', 'KPI Cards', { enabled: true }),
      control('customers.features.inspector', 'customers', 'FEATURE', 'Inspector Drawer', { enabled: true }),
      control('customers.features.technicalDetails', 'customers', 'FEATURE', 'Technical Details', { enabled: true }),
      control('customers.features.creditSection', 'customers', 'FEATURE', 'Credit Section', { enabled: true }),
      // Fields (9)
      control('customers.fields.name', 'customers', 'FIELD', 'Customer Name', { visible: true, editable: true }, { configurable: { visible: false, editable: true }, platformEnforced: true, risk: 'CRITICAL' }),
      control('customers.fields.customerType', 'customers', 'FIELD', 'Customer Type', { visible: true, editable: true }, { configurable: { visible: false, editable: true }, platformEnforced: true, risk: 'RECOMMENDED' }),
      control('customers.fields.creditEnabled', 'customers', 'FIELD', 'Credit Enabled', { visible: true, editable: true }, { configurable: { visible: false, editable: true }, platformEnforced: true, risk: 'CRITICAL' }),
      control('customers.fields.phone', 'customers', 'FIELD', 'Phone', { visible: true, editable: true }, { override: { visible: true, editable: false } }),
      control('customers.fields.priceTier', 'customers', 'FIELD', 'Price Tier', { visible: true, editable: true }),
      control('customers.fields.creditLimit', 'customers', 'FIELD', 'Credit Limit', { visible: true, editable: true }, { risk: 'RECOMMENDED' }),
      control('customers.fields.creditLimitBehaviour', 'customers', 'FIELD', 'Credit Limit Behaviour', { visible: true, editable: true }, { risk: 'RECOMMENDED' }),
      control('customers.fields.derivedBalances', 'customers', 'FIELD', 'Derived Balances', { visible: true }, { configurable: { visible: false }, platformEnforced: true, risk: 'CRITICAL' }),
      control('customers.fields.openingBalance', 'customers', 'FIELD', 'Opening Balance', { visible: true }, { configurable: { visible: false }, platformEnforced: true, risk: 'CRITICAL' }),
      // Actions (9)
      control('customers.actions.create', 'customers', 'ACTION', 'Create Customer', { allowed: true }, { risk: 'RECOMMENDED' }),
      control('customers.actions.inspect', 'customers', 'ACTION', 'Inspect Customer', { allowed: true }),
      control('customers.actions.edit', 'customers', 'ACTION', 'Edit Customer', { allowed: true }, { risk: 'RECOMMENDED' }),
      control('customers.actions.deactivate', 'customers', 'ACTION', 'Deactivate Customer', { allowed: true }, { risk: 'RECOMMENDED' }),
      control('customers.actions.reactivate', 'customers', 'ACTION', 'Reactivate Customer', { allowed: true }, { risk: 'RECOMMENDED' }),
      control('customers.actions.delete', 'customers', 'ACTION', 'Delete Customer', { allowed: true }, { risk: 'CRITICAL' }),
      control('customers.actions.editCreditPolicy', 'customers', 'ACTION', 'Edit Credit Policy', { allowed: true }, { risk: 'RECOMMENDED' }),
      control('customers.actions.postOpeningBalance', 'customers', 'ACTION', 'Post Opening Balance', { allowed: true }, { risk: 'CRITICAL' }),
      control('customers.actions.refresh', 'customers', 'ACTION', 'Refresh List', { allowed: true }),
      // Suppliers Module (1)
      control('suppliers', 'suppliers', 'MODULE', 'Suppliers', { enabled: true }, { risk: 'CRITICAL' }),
      // Features (6)
      control('suppliers.features.moduleInfo', 'suppliers', 'FEATURE', 'About Suppliers', { enabled: true }),
      control('suppliers.features.search', 'suppliers', 'FEATURE', 'Search Filter', { enabled: true }),
      control('suppliers.features.statusFilter', 'suppliers', 'FEATURE', 'Status Filter', { enabled: true }),
      control('suppliers.features.kpiCards', 'suppliers', 'FEATURE', 'KPI Summary Cards', { enabled: true }),
      control('suppliers.features.inspector', 'suppliers', 'FEATURE', 'Detail Inspector Drawer', { enabled: true }),
      control('suppliers.features.technicalDetails', 'suppliers', 'FEATURE', 'Technical Details Section', { enabled: true }),
      // Fields (6)
      control('suppliers.fields.name', 'suppliers', 'FIELD', 'Supplier Name', { visible: true, editable: true }, { configurable: { visible: false, editable: true }, platformEnforced: true, risk: 'CRITICAL' }),
      control('suppliers.fields.contactName', 'suppliers', 'FIELD', 'Contact Person', { visible: true, editable: true }),
      control('suppliers.fields.phone', 'suppliers', 'FIELD', 'Phone', { visible: true, editable: true }, { override: { visible: true, editable: false } }),
      control('suppliers.fields.email', 'suppliers', 'FIELD', 'Email', { visible: true, editable: true }),
      control('suppliers.fields.derivedBalances', 'suppliers', 'FIELD', 'Derived Balances', { visible: true }, { configurable: { visible: false }, platformEnforced: true, risk: 'CRITICAL' }),
      control('suppliers.fields.openingBalance', 'suppliers', 'FIELD', 'Opening Balance', { visible: true }, { configurable: { visible: false }, platformEnforced: true, risk: 'CRITICAL' }),
      // Actions (8)
      control('suppliers.actions.create', 'suppliers', 'ACTION', 'Create Supplier', { allowed: true }),
      control('suppliers.actions.inspect', 'suppliers', 'ACTION', 'Inspect Supplier', { allowed: true }),
      control('suppliers.actions.edit', 'suppliers', 'ACTION', 'Edit Supplier', { allowed: true }),
      control('suppliers.actions.deactivate', 'suppliers', 'ACTION', 'Deactivate Supplier', { allowed: true }),
      control('suppliers.actions.reactivate', 'suppliers', 'ACTION', 'Reactivate Supplier', { allowed: true }),
      control('suppliers.actions.delete', 'suppliers', 'ACTION', 'Delete Supplier', { allowed: true }),
      control('suppliers.actions.postOpeningBalance', 'suppliers', 'ACTION', 'Post Opening Balance', { allowed: true }),
      control('suppliers.actions.refresh', 'suppliers', 'ACTION', 'Refresh List', { allowed: true }),
      // Expenses action
      control('expenses.actions.manageCategories', 'expenses', 'ACTION', 'Manage Expense Categories', { allowed: true }),
      // Expense Categories (11)
      control('expenses.categories', 'expenses.categories', 'MODULE', 'Expense Categories', { enabled: true }, { risk: 'CRITICAL' }),
      control('expenses.categories.features.moduleInfo', 'expenses.categories', 'FEATURE', 'About Expense Categories', { enabled: true }),
      control('expenses.categories.features.search', 'expenses.categories', 'FEATURE', 'Category Search', { enabled: true }),
      control('expenses.categories.features.statusFilter', 'expenses.categories', 'FEATURE', 'Status Filter', { enabled: true }),
      control('expenses.categories.fields.name', 'expenses.categories', 'FIELD', 'Category Name', { visible: true, editable: true }, { configurable: { visible: false, editable: true }, platformEnforced: true, risk: 'CRITICAL' }),
      control('expenses.categories.fields.status', 'expenses.categories', 'FIELD', 'Lifecycle Status', { visible: true, editable: false }, { configurable: { visible: true, editable: false } }),
      {
        ...control('expenses.categories.actions.create', 'expenses.categories', 'ACTION', 'Create Category', { allowed: true }),
        dependencies: ['expenses.actions.manageCategories'],
      },
      {
        ...control('expenses.categories.actions.edit', 'expenses.categories', 'ACTION', 'Edit Category', { allowed: true }),
        dependencies: ['expenses.actions.manageCategories'],
      },
      {
        ...control('expenses.categories.actions.deactivate', 'expenses.categories', 'ACTION', 'Deactivate Category', { allowed: true }),
        dependencies: ['expenses.actions.manageCategories'],
      },
      {
        ...control('expenses.categories.actions.reactivate', 'expenses.categories', 'ACTION', 'Reactivate Category', { allowed: true }),
        dependencies: ['expenses.actions.manageCategories'],
      },
      {
        ...control('expenses.categories.actions.delete', 'expenses.categories', 'ACTION', 'Delete Category', { allowed: true }),
        dependencies: ['expenses.actions.manageCategories'],
      },
      // Accounts Module (1)
      control('accounts', 'accounts', 'MODULE', 'Accounts', { enabled: true }, { risk: 'CRITICAL' }),
      // Accounts Features (5)
      control('accounts.features.moduleInfo', 'accounts', 'FEATURE', 'About Accounts', { enabled: true }),
      control('accounts.features.search', 'accounts', 'FEATURE', 'Search Filter', { enabled: true }),
      control('accounts.features.statusFilter', 'accounts', 'FEATURE', 'Status Filter', { enabled: true }),
      control('accounts.features.movementHistory', 'accounts', 'FEATURE', 'Movement History', { enabled: true }),
      control('accounts.features.kpiCards', 'accounts', 'FEATURE', 'KPI Cards', { enabled: true }),
      // Accounts Fields (8)
      control('accounts.fields.name', 'accounts', 'FIELD', 'Account Name', { visible: true, editable: true }, { configurable: { visible: false, editable: true }, platformEnforced: true, risk: 'CRITICAL' }),
      control('accounts.fields.accountType', 'accounts', 'FIELD', 'Account Type', { visible: true, editable: false }, { configurable: { visible: false, editable: false }, platformEnforced: true, risk: 'CRITICAL' }),
      control('accounts.fields.status', 'accounts', 'FIELD', 'Lifecycle Status', { visible: true, editable: false }, { configurable: { visible: false, editable: false }, platformEnforced: true, risk: 'CRITICAL' }),
      control('accounts.fields.derivedBalance', 'accounts', 'FIELD', 'Derived Balance', { visible: true }, { configurable: { visible: false }, platformEnforced: true, risk: 'CRITICAL' }),
      control('accounts.fields.bankName', 'accounts', 'FIELD', 'Bank Name', { visible: true, editable: true }, { configurable: { visible: false, editable: true }, platformEnforced: true }),
      control('accounts.fields.accountNumberMasked', 'accounts', 'FIELD', 'Masked Account Number', { visible: true, editable: true }),
      control('accounts.fields.walletIdentifier', 'accounts', 'FIELD', 'Wallet Identifier', { visible: true, editable: true }, { configurable: { visible: false, editable: true }, platformEnforced: true }),
      control('accounts.fields.openingBalance', 'accounts', 'FIELD', 'Opening Balance', { visible: true }, { configurable: { visible: false }, platformEnforced: true, risk: 'CRITICAL' }),
      // Accounts Actions (12)
      control('accounts.actions.create', 'accounts', 'ACTION', 'Create Account', { allowed: true }),
      control('accounts.actions.inspect', 'accounts', 'ACTION', 'Inspect Account', { allowed: true }),
      control('accounts.actions.edit', 'accounts', 'ACTION', 'Edit Account', { allowed: true }),
      control('accounts.actions.deactivate', 'accounts', 'ACTION', 'Deactivate Account', { allowed: true }),
      control('accounts.actions.reactivate', 'accounts', 'ACTION', 'Reactivate Account', { allowed: true }),
      control('accounts.actions.delete', 'accounts', 'ACTION', 'Delete Account', { allowed: true }, { risk: 'CRITICAL' }),
      control('accounts.actions.postOpeningBalance', 'accounts', 'ACTION', 'Post Opening Balance', { allowed: true }, { risk: 'CRITICAL' }),
      control('accounts.actions.postManualMovement', 'accounts', 'ACTION', 'Post Manual Movement', { allowed: true }),
      control('accounts.actions.transfer', 'accounts', 'ACTION', 'Transfer Funds', { allowed: true }),
      control('accounts.actions.reverseMovement', 'accounts', 'ACTION', 'Reverse Movement', { allowed: true }),
      control('accounts.actions.reverseTransfer', 'accounts', 'ACTION', 'Reverse Transfer', { allowed: true }),
      control('accounts.actions.refresh', 'accounts', 'ACTION', 'Refresh Accounts', { allowed: true }),
      // Reports Module (1)
      control('reports', 'reports', 'MODULE', 'Reports', { enabled: true }, { risk: 'CRITICAL' }),
      // Reports Feature (1)
      control('reports.features.moduleInfo', 'reports', 'FEATURE', 'About Reports', { enabled: true }),
      // Report Availability (16)
      ...([
        ['sales', 'Sales Report'],
        ['purchases', 'Purchases Report'],
        ['grossProfit', 'Gross Profit Report'],
        ['stock', 'Stock Report'],
        ['stockValuation', 'Stock Valuation Report'],
        ['stockMovements', 'Stock Movements Report'],
        ['customerLedger', 'Customer Ledger Report'],
        ['supplierLedger', 'Supplier Ledger Report'],
        ['accountCashBook', 'Account / Cash-book Report'],
        ['expenses', 'Expenses Report'],
        ['lowStock', 'Low Stock Report'],
        ['expiry', 'Expiry Report'],
        ['deadStock', 'Dead Stock Report'],
        ['topProducts', 'Top Products Report'],
        ['topCustomers', 'Top Customers Report'],
        ['employeeSales', 'Employee Sales Report'],
      ] as const).map(([id, label]) =>
        control(
          `reports.reportAvailability.${id}`,
          'reports',
          'FEATURE',
          label,
          { enabled: true },
          id === 'sales' ? { override: { enabled: false } } : {},
        ),
      ),
      // Reports Actions (4)
      control('reports.actions.run', 'reports', 'ACTION', 'Run Report', { allowed: true }),
      control('reports.actions.exportPdf', 'reports', 'ACTION', 'Export PDF', { allowed: true }),
      control('reports.actions.exportExcel', 'reports', 'ACTION', 'Export Excel', { allowed: true }),
      control(
        'reports.actions.exportCsv',
        'reports',
        'ACTION',
        'Export CSV',
        { allowed: true },
        {
          effectiveValue: { allowed: false },
          reasons: ['entitlement_unavailable'],
        },
      ),
      // Alerts Module (1)
      control('alerts', 'alerts', 'MODULE', 'Alerts', { enabled: true }, { risk: 'CRITICAL' }),
      // Alerts Features (3)
      control('alerts.features.moduleInfo', 'alerts', 'FEATURE', 'About Alerts', { enabled: true }),
      control('alerts.features.summaryCards', 'alerts', 'FEATURE', 'Summary Cards', { enabled: true }),
      control('alerts.features.navbarNotifications', 'alerts', 'FEATURE', 'Navbar Notifications', { enabled: true }),
      // Alert Family Availability (6)
      ...([
        ['lowStock', 'Low Stock Alerts'],
        ['upcomingExpiry', 'Upcoming Expiry Alerts'],
        ['expiredStock', 'Expired Stock Alerts'],
        ['deadStock', 'Dead Stock Alerts'],
        ['customerDues', 'Customer Dues Alerts'],
        ['supplierDues', 'Supplier Dues Alerts'],
      ] as const).map(([id, label]) =>
        control(
          `alerts.alertTypeAvailability.${id}`,
          'alerts',
          'FEATURE',
          label,
          { enabled: true },
          id === 'lowStock' ? { override: { enabled: false } } : {},
        ),
      ),
      // Alerts Actions (3)
      control('alerts.actions.acknowledge', 'alerts', 'ACTION', 'Acknowledge Alert', { allowed: true }, { risk: 'RECOMMENDED' }),
      control('alerts.actions.markRead', 'alerts', 'ACTION', 'Mark Notification Read', { allowed: true }),
      control('alerts.actions.markAllRead', 'alerts', 'ACTION', 'Mark All Notifications Read', { allowed: true }),
    ];
    await TestBed.configureTestingModule({
      imports: [OrganizationControlsPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'org-a' } } },
        },
        {
          provide: CapabilitiesApi,
          useValue: {
            getOrganizationPolicy: () =>
              of({
                organization: {
                  id: 'org-a',
                  name: 'Greenfield Agro Center',
                  owner: { email: 'owner@greenfield.test' },
                  subscription: { planCode: 'Business', status: 'active' },
                },
                policy: {
                  version: 4,
                  updatedBy: null,
                  updatedAt: null,
                  operationalAllowed: true,
                  controls,
                },
              }),
            updateOrganizationPolicy: (
              _organizationId: string,
              expectedVersion: number,
              changes: readonly unknown[],
            ) => {
              saved = { expectedVersion, changes };
              return of({});
            },
            resetOrganizationControl: resetControl,
            resetOrganizationModule: resetModule,
            resetOrganization: () => of({}),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizationControlsPage);
    fixture.detectChanges();
  });

  it('shows all registered modules with business-readable policy state and no raw JSON', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Products');
    expect(text).toContain('Categories');
    expect(text).toContain('Inventory / Stock on Hand');
    expect(text).toContain('Opening Stock');
    expect(text).toContain('Product Batches');
    expect(text).toContain('Organization override');
    expect(text).toContain('— Uses default');
    expect(text).not.toContain('{"enabled"');
    expect(fixture.nativeElement.querySelector('input[role="switch"]:disabled')).toBeNull();
  });

  it('renders Opening Stock optional and required controls through the shared renderer', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.openingStock');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Opening Stock Module');
    expect(text).toContain('Optional UI');
    expect(text).toContain('Optional Fields');
    expect(text).toContain('Required Workflow Fields');
    expect(text).toContain('Warehouse');
    expect(text).toContain('Requirement');
    expect(text).toContain('Required');
    expect(text).toContain('Control');
    expect(text).toContain('Platform enforced');
    expect(text).toContain('Opening Stock must identify the destination warehouse.');
    expect(text).toContain('Batch / Expiry');
    expect(fixture.nativeElement.querySelector('input[role="switch"]:disabled')).toBeNull();
  });

  it('uses the required critical confirmation when disabling Opening Stock', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.openingStock');
    const module = component.controls().find((item) => item.key === 'inventory.openingStock');
    if (!module) throw new Error('Expected Opening Stock control');
    component.setValue(module, 'enabled', false);
    component.askSave();

    expect(component.confirmationTitle()).toBe('Disable Opening Stock for Greenfield Agro Center?');
    expect(component.confirmationMessage()).toContain(
      'Users in this organization will no longer be able to access or post Opening Stock.',
    );
    expect(component.confirmationMessage()).toContain(
      'Existing stock and historical transactions will not be changed.',
    );
    expect(component.confirmationLabel()).toBe('Disable Opening Stock');
  });

  it('uses the shared renderer for Inventory controls and stages WAC visibility', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.stock');
    fixture.detectChanges();

    const wac = component.controls().find((item) => item.key === 'inventory.stock.fields.wac');
    if (!wac) throw new Error('Expected WAC control');
    component.setValue(wac, 'visible', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Weighted Average Cost (WAC)');
    expect(component.changeSummary()).toContainEqual(
      expect.objectContaining({ label: 'Weighted Average Cost (WAC)', after: 'Hidden' }),
    );
  });

  it('renders Product Batches grouped controls and required identity through the shared renderer', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.batches');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Product Batches Module');
    expect(text).toContain('Module Information');
    expect(text).toContain('Filters');
    expect(text).toContain('Inspector');
    expect(text).toContain('Batch Number');
    expect(text).toContain('Product');
    expect(text).toContain('Requirement');
    expect(text).toContain('Required');
    expect(text).toContain('Platform enforced');
    expect(text).toContain('Expiry Date');
    expect(text).toContain('— Uses default');
    expect(text).not.toContain('{"visible"');
    expect(fixture.nativeElement.querySelector('input[role="switch"]:disabled')).toBeNull();
  });

  it('explains Batch action dependency blocking in effective policy state', () => {
    const component = fixture.componentInstance;
    const stock = component.controls().find((item) => item.key === 'inventory.stock');
    if (!stock) throw new Error('Expected Stock on Hand control');
    component.setValue(stock, 'enabled', false);
    component.selectModule('inventory.batches');
    fixture.detectChanges();

    const viewStock = component
      .controls()
      .find((item) => item.key === 'inventory.batches.actions.viewStock');
    if (!viewStock) throw new Error('Expected View Stock control');
    expect(component.effectiveValue(viewStock, 'allowed')).toBe(false);
    expect(component.effectiveReason(viewStock, 'allowed')).toBe(
      'Stock on Hand is disabled for this organization.',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Stock on Hand is disabled for this organization.',
    );
  });

  it('uses the Product Batches critical confirmation with organization-scoped data safety copy', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.batches');
    const batches = component.controls().find((item) => item.key === 'inventory.batches');
    if (!batches) throw new Error('Expected Product Batches control');
    component.setValue(batches, 'enabled', false);
    component.askSave();

    expect(component.confirmationTitle()).toBe(
      'Disable Product Batches for Greenfield Agro Center?',
    );
    expect(component.confirmationMessage()).toContain('organization Batch inquiry APIs');
    expect(component.confirmationMessage()).toContain(
      'Existing batches, stock balances, and transaction history will not be deleted or changed.',
    );
    expect(component.confirmationMessage()).toContain('Greenfield Agro Center only');
    expect(component.confirmationLabel()).toBe('Disable Product Batches');
  });

  it('stages a critical change, presents its impact, and saves version-safely', () => {
    const component = fixture.componentInstance;
    const products = component.controls().find((item) => item.key === 'inventory.products');
    if (!products) throw new Error('Expected Products control');
    component.setValue(products, 'enabled', false);

    expect(component.changeSummary()[0]).toMatchObject({
      before: 'Enabled',
      after: 'Disabled',
      risk: 'CRITICAL',
    });
    component.askSave();
    expect(component.confirmationTitle()).toContain('Disable Products module');
    expect(component.confirmationMessage()).toContain('Critical impact');
    component.confirm();

    expect(saved).toMatchObject({ expectedVersion: 4 });
    expect(saved?.changes).toHaveLength(1);
  });

  it('calls the real individual reset API with organization, semantic key, and policy version', () => {
    const component = fixture.componentInstance;
    const lowStock = component.controls().find((item) => item.key.endsWith('lowStock'));
    if (!lowStock) throw new Error('Expected Low Stock control');
    component.askResetControl(lowStock);
    expect(component.confirmationTitle()).toContain('Reset “Low Stock”');
    component.confirm();

    expect(resetControl).toHaveBeenCalledWith('org-a', lowStock.key, 4, '');
  });

  it('calls the shared module reset API with the semantic Stock-on-Hand module key', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.stock');
    component.askResetModule();
    component.confirm();

    expect(resetModule).toHaveBeenCalledWith('org-a', 'inventory.stock', 4, '');
  });

  it('calls the shared module reset API with only the Opening Stock namespace', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.openingStock');
    component.askResetModule();
    component.confirm();

    expect(resetModule).toHaveBeenCalledWith('org-a', 'inventory.openingStock', 4, '');
  });

  it('calls the shared module reset API with only the Product Batches namespace', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.batches');
    component.askResetModule();
    component.confirm();

    expect(resetModule).toHaveBeenCalledWith('org-a', 'inventory.batches', 4, '');
  });

  it('renders the Expiry Inquiry nav button and selects the module', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.expiry');
    expect(component.selectedModule()).toBe('inventory.expiry');
    expect(component.moduleLabel('inventory.expiry')).toBe('Expiry Inquiry');
  });

  it('marks platform-enforced Expiry Inquiry fields as required workflow controls', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.expiry');
    const requiredField = control(
      'inventory.expiry.fields.batchNumber',
      'inventory.expiry',
      'FIELD',
      'Batch Number',
      { visible: true },
      { configurable: { visible: false }, platformEnforced: true, risk: 'CRITICAL' },
    );
    expect(component.isRequiredWorkflowControl(requiredField)).toBe(true);
  });

  it('does not mark optional Expiry Inquiry fields as required workflow controls', () => {
    const component = fixture.componentInstance;
    const optionalField = control(
      'inventory.expiry.fields.warehouse',
      'inventory.expiry',
      'FIELD',
      'Warehouse',
      { visible: true },
    );
    expect(component.isRequiredWorkflowControl(optionalField)).toBe(false);
  });

  it('produces the correct disable confirmation message for Expiry Inquiry', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.expiry');
    const expiryControl = component
      .controls()
      .find((item) => item.key === 'inventory.expiry');
    if (expiryControl) {
      component.setValue(expiryControl, 'enabled', false);
      expect(component.disablingExpiry()).toBe(true);
      expect(component.confirmationTitle()).toContain('Disable Expiry Inquiry');
      expect(component.confirmationLabel()).toBe('Disable Expiry Inquiry');
      expect(component.confirmationMessage()).toContain('Expiry Inquiry');
    }
  });

  it('calls the shared module reset API with only the Expiry Inquiry namespace', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.expiry');
    component.askResetModule();
    component.confirm();

    expect(resetModule).toHaveBeenCalledWith('org-a', 'inventory.expiry', 4, '');
  });

  it('renders the Stock Adjustments nav button and selects the module', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.adjustments');
    expect(component.selectedModule()).toBe('inventory.adjustments');
    expect(component.moduleLabel('inventory.adjustments')).toBe('Stock Adjustments');
  });

  it('marks platform-enforced Stock Adjustments fields as required workflow controls', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.adjustments');
    const warehouseField = component
      .controls()
      .find((item) => item.key === 'inventory.adjustments.fields.warehouse');
    expect(warehouseField).toBeDefined();
    if (warehouseField) {
      expect(component.isRequiredWorkflowControl(warehouseField)).toBe(true);
    }

    const batchField = component
      .controls()
      .find((item) => item.key === 'inventory.adjustments.fields.batch');
    expect(batchField).toBeDefined();
    if (batchField) {
      expect(component.isRequiredWorkflowControl(batchField)).toBe(true);
    }
  });

  it('groups Stock Adjustments controls into Module, Module Info, Form Experience, Required Workflow Fields, History, and Actions', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.adjustments');

    expect(component.moduleControls().map((c) => c.key)).toEqual(['inventory.adjustments']);
    expect(component.moduleInfoControls().map((c) => c.key)).toEqual([
      'inventory.adjustments.features.moduleInfo',
    ]);
    expect(component.formExperienceControls().map((c) => c.key)).toEqual([
      'inventory.adjustments.features.productSearch',
      'inventory.adjustments.features.productContext',
      'inventory.adjustments.features.stockContext',
      'inventory.adjustments.features.guidance',
      'inventory.adjustments.features.serverPostingDate',
    ]);
    expect(component.requiredWorkflowControls().map((c) => c.key)).toEqual([
      'inventory.adjustments.fields.warehouse',
      'inventory.adjustments.fields.product',
      'inventory.adjustments.fields.adjustmentType',
      'inventory.adjustments.fields.quantity',
      'inventory.adjustments.fields.reason',
      'inventory.adjustments.fields.batch',
      'inventory.adjustments.fields.direction',
      'inventory.adjustments.fields.inventoryValue',
    ]);
    expect(component.historyControls().map((c) => c.key)).toEqual([
      'inventory.adjustments.features.recentAdjustments',
    ]);
    expect(component.actionControls().map((c) => c.key)).toEqual([
      'inventory.adjustments.actions.post',
      'inventory.adjustments.actions.reverse',
      'inventory.adjustments.actions.viewStock',
      'inventory.adjustments.actions.viewMovements',
    ]);
  });

  it('produces the exact disable confirmation message for Stock Adjustments', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.adjustments');
    const adjustmentsControl = component
      .controls()
      .find((item) => item.key === 'inventory.adjustments');
    expect(adjustmentsControl).toBeDefined();
    if (adjustmentsControl) {
      component.setValue(adjustmentsControl, 'enabled', false);
    }

    expect(component.disablingAdjustments()).toBe(true);
    expect(component.confirmationTitle()).toContain('Disable Stock Adjustments for Greenfield Agro Center?');
    expect(component.confirmationLabel()).toBe('Disable Stock Adjustments');
    expect(component.confirmationMessage()).toBe(
      'Users in this organization will no longer be able to access or use Stock Adjustments. Existing adjustments, stock movements and inventory balances are not deleted or modified.',
    );
  });

  it('shows dependency blocking reason for View Stock when target inventory.stock module is disabled', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.adjustments');
    const stockModule = component.controls().find((item) => item.key === 'inventory.stock');
    expect(stockModule).toBeDefined();
    if (stockModule) {
      component.setValue(stockModule, 'enabled', false);
    }

    const viewStock = component
      .actionControls()
      .find((item) => item.key === 'inventory.adjustments.actions.viewStock');
    expect(viewStock).toBeDefined();
    if (viewStock) {
      expect(component.effectiveValue(viewStock, 'allowed')).toBe(false);
      expect(component.effectiveReason(viewStock, 'allowed')).toBe(
        'Stock on Hand is disabled for this organization.',
      );
    }
  });

  it('calls the shared module reset API with only the Stock Adjustments namespace', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.adjustments');
    component.askResetModule();
    component.confirm();

    expect(resetModule).toHaveBeenCalledWith('org-a', 'inventory.adjustments', 4, '');
  });

  it('renders the Warehouse Transfers nav button and selects the module', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.transfers');
    expect(component.selectedModule()).toBe('inventory.transfers');
    expect(component.moduleLabel('inventory.transfers')).toBe('Warehouse Transfers');
  });

  it('marks platform-enforced Warehouse Transfers fields as required workflow controls', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.transfers');
    const sourceField = component
      .controls()
      .find((item) => item.key === 'inventory.transfers.fields.sourceWarehouse');
    expect(sourceField).toBeDefined();
    if (sourceField) {
      expect(component.isRequiredWorkflowControl(sourceField)).toBe(true);
    }

    const destField = component
      .controls()
      .find((item) => item.key === 'inventory.transfers.fields.destinationWarehouse');
    expect(destField).toBeDefined();
    if (destField) {
      expect(component.isRequiredWorkflowControl(destField)).toBe(true);
    }

    const batchField = component
      .controls()
      .find((item) => item.key === 'inventory.transfers.fields.batch');
    expect(batchField).toBeDefined();
    if (batchField) {
      expect(component.isRequiredWorkflowControl(batchField)).toBe(true);
    }
  });

  it('groups Warehouse Transfers controls into Module, Module Info, Form Experience, Required Workflow Fields, History, and Actions', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.transfers');

    expect(component.moduleControls().map((c) => c.key)).toEqual(['inventory.transfers']);
    expect(component.moduleInfoControls().map((c) => c.key)).toEqual([
      'inventory.transfers.features.moduleInfo',
    ]);
    expect(component.formExperienceControls().map((c) => c.key)).toEqual([
      'inventory.transfers.features.productSearch',
      'inventory.transfers.features.productContext',
      'inventory.transfers.features.stockContext',
      'inventory.transfers.features.guidance',
      'inventory.transfers.features.serverTransferDate',
    ]);
    expect(component.requiredWorkflowControls().map((c) => c.key)).toEqual([
      'inventory.transfers.fields.sourceWarehouse',
      'inventory.transfers.fields.destinationWarehouse',
      'inventory.transfers.fields.product',
      'inventory.transfers.fields.quantity',
      'inventory.transfers.fields.reason',
      'inventory.transfers.fields.batch',
    ]);
    expect(component.historyControls().map((c) => c.key)).toEqual([
      'inventory.transfers.features.recentTransfers',
    ]);
    expect(component.actionControls().map((c) => c.key)).toEqual([
      'inventory.transfers.actions.post',
      'inventory.transfers.actions.reverse',
      'inventory.transfers.actions.inspect',
      'inventory.transfers.actions.viewStock',
    ]);
  });

  it('produces the exact disable confirmation message for Warehouse Transfers', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.transfers');
    const transfersControl = component
      .controls()
      .find((item) => item.key === 'inventory.transfers');
    expect(transfersControl).toBeDefined();
    if (transfersControl) {
      component.setValue(transfersControl, 'enabled', false);
    }

    expect(component.disablingTransfers()).toBe(true);
    expect(component.confirmationTitle()).toContain('Disable Warehouse Transfers for Greenfield Agro Center?');
    expect(component.confirmationLabel()).toBe('Disable Warehouse Transfers');
    expect(component.confirmationMessage()).toBe(
      'Users in this organization will no longer be able to access or use Warehouse Transfers. Existing transfers, stock movements, batches and inventory balances are not deleted or modified.',
    );
  });

  it('shows dependency blocking reason for View Stock when target inventory.stock module is disabled on transfers', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.transfers');
    const stockModule = component.controls().find((item) => item.key === 'inventory.stock');
    expect(stockModule).toBeDefined();
    if (stockModule) {
      component.setValue(stockModule, 'enabled', false);
    }

    const viewStock = component
      .actionControls()
      .find((item) => item.key === 'inventory.transfers.actions.viewStock');
    expect(viewStock).toBeDefined();
    if (viewStock) {
      expect(component.effectiveValue(viewStock, 'allowed')).toBe(false);
      expect(component.effectiveReason(viewStock, 'allowed')).toBe(
        'Stock on Hand is disabled for this organization.',
      );
    }
  });

  it('calls the shared module reset API with only the Warehouse Transfers namespace', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.transfers');
    component.askResetModule();
    component.confirm();

    expect(resetModule).toHaveBeenCalledWith('org-a', 'inventory.transfers', 4, '');
  });

  it('groups Inventory Reconciliation controls into Module, Module Info, Filters, KPI, Inspector, Required Fields, and Actions', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.reconciliation');

    expect(component.moduleControls().map((c) => c.key)).toEqual(['inventory.reconciliation']);
    expect(component.moduleInfoControls().map((c) => c.key)).toEqual([
      'inventory.reconciliation.features.moduleInfo',
    ]);
    expect(component.filterControls().map((c) => c.key)).toEqual([
      'inventory.reconciliation.features.search',
      'inventory.reconciliation.features.warehouseFilter',
      'inventory.reconciliation.features.findingFilter',
    ]);
    expect(component.kpiControls().map((c) => c.key)).toEqual([
      'inventory.reconciliation.features.kpiCards',
    ]);
    expect(component.inspectorControls().map((c) => c.key)).toEqual([
      'inventory.reconciliation.features.inspector',
      'inventory.reconciliation.features.technicalDetails',
    ]);
    expect(component.requiredWorkflowControls().map((c) => c.key)).toEqual([
      'inventory.reconciliation.fields.product',
      'inventory.reconciliation.fields.warehouse',
      'inventory.reconciliation.fields.batch',
      'inventory.reconciliation.fields.balanceQuantity',
      'inventory.reconciliation.fields.movementQuantity',
      'inventory.reconciliation.fields.variance',
      'inventory.reconciliation.fields.findingCode',
    ]);
    expect(component.actionControls().map((c) => c.key)).toEqual([
      'inventory.reconciliation.actions.refresh',
      'inventory.reconciliation.actions.inspect',
      'inventory.reconciliation.actions.viewStock',
      'inventory.reconciliation.actions.viewMovements',
      'inventory.reconciliation.actions.viewBatch',
    ]);
  });

  it('produces the exact disable confirmation message for Inventory Reconciliation', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.reconciliation');
    const reconciliationControl = component
      .controls()
      .find((item) => item.key === 'inventory.reconciliation');
    expect(reconciliationControl).toBeDefined();
    if (reconciliationControl) {
      component.setValue(reconciliationControl, 'enabled', false);
    }

    expect(component.disablingReconciliation()).toBe(true);
    expect(component.confirmationTitle()).toContain(
      'Disable Inventory Reconciliation for Greenfield Agro Center?',
    );
    expect(component.confirmationLabel()).toBe('Disable Inventory Reconciliation');
    expect(component.confirmationMessage()).toBe(
      'Users in this organization will no longer be able to access reconciliation checks. Existing inventory records, movements, balances and cost data are not modified.',
    );
  });

  it('shows dependency blocking reason for View Stock and View Batch when target modules are disabled on reconciliation', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.reconciliation');

    // Test View Stock dependency on inventory.stock
    const stockModule = component.controls().find((item) => item.key === 'inventory.stock');
    expect(stockModule).toBeDefined();
    if (stockModule) {
      component.setValue(stockModule, 'enabled', false);
    }

    const viewStock = component
      .actionControls()
      .find((item) => item.key === 'inventory.reconciliation.actions.viewStock');
    expect(viewStock).toBeDefined();
    if (viewStock) {
      expect(component.effectiveValue(viewStock, 'allowed')).toBe(false);
      expect(component.effectiveReason(viewStock, 'allowed')).toBe(
        'Stock on Hand is disabled for this organization.',
      );
    }

    // Test View Batch dependency on inventory.batches
    const batchesModule = component.controls().find((item) => item.key === 'inventory.batches');
    expect(batchesModule).toBeDefined();
    if (batchesModule) {
      component.setValue(batchesModule, 'enabled', false);
    }

    const viewBatch = component
      .actionControls()
      .find((item) => item.key === 'inventory.reconciliation.actions.viewBatch');
    expect(viewBatch).toBeDefined();
    if (viewBatch) {
      expect(component.effectiveValue(viewBatch, 'allowed')).toBe(false);
      expect(component.effectiveReason(viewBatch, 'allowed')).toBe(
        'Product Batches is disabled for this organization.',
      );
    }
  });

  it('calls the shared module reset API with only the Inventory Reconciliation namespace', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.reconciliation');
    component.askResetModule();
    component.confirm();

    expect(resetModule).toHaveBeenCalledWith('org-a', 'inventory.reconciliation', 4, '');
  });

  it('renders the Stock Movements nav button and selects the module', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.movements');
    expect(component.selectedModule()).toBe('inventory.movements');
    expect(component.moduleLabel('inventory.movements')).toBe('Stock Movements');
  });

  it('groups Stock Movements controls into the expected sections', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.movements');

    expect(component.moduleControls().map((c) => c.key)).toEqual(['inventory.movements']);
    expect(component.moduleInfoControls().map((c) => c.key)).toEqual([
      'inventory.movements.features.moduleInfo',
    ]);
    expect(component.presentationFeatureControls().map((c) => c.key)).toEqual([
      'inventory.movements.features.search',
      'inventory.movements.features.filters',
      'inventory.movements.features.kpiCards',
      'inventory.movements.features.referenceResolution',
      'inventory.movements.features.inspector',
      'inventory.movements.features.technicalDetails',
      'inventory.movements.features.mobileCards',
    ]);
    expect(component.requiredWorkflowControls().map((c) => c.key)).toEqual([
      'inventory.movements.fields.product',
      'inventory.movements.fields.warehouse',
      'inventory.movements.fields.direction',
      'inventory.movements.fields.quantity',
      'inventory.movements.fields.sourceType',
      'inventory.movements.fields.batch',
      'inventory.movements.fields.inventoryValue',
    ]);
    expect(component.actionControls().map((c) => c.key)).toEqual([
      'inventory.movements.actions.refresh',
      'inventory.movements.actions.inspect',
      'inventory.movements.actions.viewStock',
      'inventory.movements.actions.viewProduct',
      'inventory.movements.actions.viewBatch',
    ]);
  });

  it('enforces platform rules for all required Stock Movements fields preventing hiding or disabling', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.movements');

    const requiredFields = [
      'inventory.movements.fields.product',
      'inventory.movements.fields.warehouse',
      'inventory.movements.fields.direction',
      'inventory.movements.fields.quantity',
      'inventory.movements.fields.sourceType',
      'inventory.movements.fields.batch',
      'inventory.movements.fields.inventoryValue',
    ];

    for (const key of requiredFields) {
      const field = component.controls().find((item) => item.key === key);
      expect(field).toBeDefined();
      if (field) {
        expect(component.modeReadonly(field, 'visible')).toBe(true);
        expect(component.modeLockedReason(field, 'visible')).toBe(
          'Platform rule: this required workflow field cannot be hidden or disabled.',
        );
        // Attempting to toggle has no effect
        component.setValue(field, 'visible', false);
        expect(component.isModeEnabled(field, 'visible')).toBe(true);
      }
    }
  });

  it('produces the exact disable confirmation message for Stock Movements', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.movements');
    const movementsControl = component
      .controls()
      .find((item) => item.key === 'inventory.movements');
    expect(movementsControl).toBeDefined();
    if (movementsControl) {
      component.setValue(movementsControl, 'enabled', false);
    }

    expect(component.disablingMovements()).toBe(true);
    expect(component.confirmationTitle()).toContain(
      'Disable Stock Movements for Greenfield Agro Center?',
    );
    expect(component.confirmationLabel()).toBe('Disable Stock Movements');
    expect(component.confirmationMessage()).toBe(
      'Users in this organization will no longer be able to access Stock Movements. Existing movement history and inventory records are not modified.',
    );
  });

  it('shows dependency blocking reason for View Stock, View Product, and View Batch when target modules are disabled on movements', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.movements');

    // Test View Stock dependency on inventory.stock
    const stockModule = component.controls().find((item) => item.key === 'inventory.stock');
    expect(stockModule).toBeDefined();
    if (stockModule) {
      component.setValue(stockModule, 'enabled', false);
    }

    const viewStock = component
      .actionControls()
      .find((item) => item.key === 'inventory.movements.actions.viewStock');
    expect(viewStock).toBeDefined();
    if (viewStock) {
      expect(component.effectiveValue(viewStock, 'allowed')).toBe(false);
      expect(component.effectiveReason(viewStock, 'allowed')).toBe(
        'Stock on Hand is disabled for this organization.',
      );
    }

    // Test View Product dependency on inventory.products
    const productsModule = component.controls().find((item) => item.key === 'inventory.products');
    expect(productsModule).toBeDefined();
    if (productsModule) {
      component.setValue(productsModule, 'enabled', false);
    }

    const viewProduct = component
      .actionControls()
      .find((item) => item.key === 'inventory.movements.actions.viewProduct');
    expect(viewProduct).toBeDefined();
    if (viewProduct) {
      expect(component.effectiveValue(viewProduct, 'allowed')).toBe(false);
      expect(component.effectiveReason(viewProduct, 'allowed')).toBe(
        'Products is disabled for this organization.',
      );
    }

    // Test View Batch dependency on inventory.batches
    const batchesModule = component.controls().find((item) => item.key === 'inventory.batches');
    expect(batchesModule).toBeDefined();
    if (batchesModule) {
      component.setValue(batchesModule, 'enabled', false);
    }

    const viewBatch = component
      .actionControls()
      .find((item) => item.key === 'inventory.movements.actions.viewBatch');
    expect(viewBatch).toBeDefined();
    if (viewBatch) {
      expect(component.effectiveValue(viewBatch, 'allowed')).toBe(false);
      expect(component.effectiveReason(viewBatch, 'allowed')).toBe(
        'Product Batches is disabled for this organization.',
      );
    }
  });

  it('calls the shared module reset API with only the Stock Movements namespace', () => {
    const component = fixture.componentInstance;
    component.selectModule('inventory.movements');
    component.askResetModule();
    component.confirm();

    expect(resetModule).toHaveBeenCalledWith('org-a', 'inventory.movements', 4, '');
  });

  describe('Customers Module Controls', () => {
    it('renders Customers module button, controls count, and sections', () => {
      const component = fixture.componentInstance;
      component.selectModule('customers');
      fixture.detectChanges();

      expect(component.selectedModule()).toBe('customers');
      expect(component.moduleLabel('customers')).toBe('Customers');

      // Module control (1)
      expect(component.moduleControls().length).toBe(1);
      expect(component.moduleControls()[0]?.key).toBe('customers');

      // View controls (1)
      expect(component.viewControls().length).toBe(1);
      expect(component.viewControls()[0]?.key).toBe('customers.views.desktopCards');

      // Module info controls (1)
      expect(component.moduleInfoControls().length).toBe(1);
      expect(component.moduleInfoControls()[0]?.key).toBe('customers.features.moduleInfo');

      // Filter controls (2)
      expect(component.filterControls().length).toBe(2);

      // KPI controls (1)
      expect(component.kpiControls().length).toBe(1);
      expect(component.kpiControls()[0]?.key).toBe('customers.features.kpiCards');

      // Inspector controls (2)
      expect(component.inspectorControls().length).toBe(2);

      // Configurable fields (4)
      expect(component.fieldControls().length).toBe(4);

      // Required platform-enforced fields (5)
      expect(component.requiredWorkflowControls().length).toBe(5);

      // Actions (9)
      expect(component.actionControls().length).toBe(9);
    });

    it('locks platform-enforced customer fields as non-configurable', () => {
      const component = fixture.componentInstance;
      component.selectModule('customers');

      const nameControl = component.controls().find((item) => item.key === 'customers.fields.name');
      expect(nameControl).toBeDefined();
      if (nameControl) {
        expect(component.isConfigurable(nameControl, 'visible')).toBe(false);
        expect(component.modeLockedReason(nameControl, 'visible')).toBe(
          'Platform rule: this required workflow field cannot be hidden or disabled.',
        );
      }

      const balanceControl = component
        .controls()
        .find((item) => item.key === 'customers.fields.derivedBalances');
      expect(balanceControl).toBeDefined();
      if (balanceControl) {
        expect(component.isConfigurable(balanceControl, 'visible')).toBe(false);
        expect(component.modeLockedReason(balanceControl, 'visible')).toBe(
          'Platform rule: this required workflow field cannot be hidden or disabled.',
        );
      }
    });

    it('shows disable Customers confirmation title and message', () => {
      const component = fixture.componentInstance;
      component.selectModule('customers');

      const moduleCtrl = component.controls().find((item) => item.key === 'customers');
      expect(moduleCtrl).toBeDefined();
      if (moduleCtrl) {
        component.setValue(moduleCtrl, 'enabled', false);
      }

      expect(component.disablingCustomers()).toBe(true);
      expect(component.confirmationTitle()).toBe('Disable Customers for Greenfield Agro Center?');
      expect(component.confirmationMessage()).toBe(
        'Users in this organization will no longer be able to access the Customers module or related operational features. Existing customer data, balances, and history will not be deleted.',
      );
      expect(component.confirmationLabel()).toBe('Disable Customers');
    });

    it('calls the shared module reset API with customers module key', () => {
      const component = fixture.componentInstance;
      component.selectModule('customers');
      component.askResetModule();
      component.confirm();

      expect(resetModule).toHaveBeenCalledWith('org-a', 'customers', 4, '');
    });
  });

  describe('Suppliers Module Controls', () => {
    it('renders Suppliers module button, controls count, and sections', () => {
      const component = fixture.componentInstance;
      component.selectModule('suppliers');
      fixture.detectChanges();

      expect(component.selectedModule()).toBe('suppliers');
      expect(component.moduleLabel('suppliers')).toBe('Suppliers');

      // Module control (1)
      expect(component.moduleControls().length).toBe(1);
      expect(component.moduleControls()[0]?.key).toBe('suppliers');

      // View controls (0)
      expect(component.viewControls().length).toBe(0);

      // Module info controls (1)
      expect(component.moduleInfoControls().length).toBe(1);
      expect(component.moduleInfoControls()[0]?.key).toBe('suppliers.features.moduleInfo');

      // Filter controls (2)
      expect(component.filterControls().length).toBe(2);

      // KPI controls (1)
      expect(component.kpiControls().length).toBe(1);
      expect(component.kpiControls()[0]?.key).toBe('suppliers.features.kpiCards');

      // Inspector controls (2)
      expect(component.inspectorControls().length).toBe(2);

      // Configurable fields (3)
      expect(component.fieldControls().length).toBe(3);

      // Required platform-enforced fields (3: name, derivedBalances, openingBalance)
      expect(component.requiredWorkflowControls().length).toBe(3);

      // Actions (8)
      expect(component.actionControls().length).toBe(8);
    });

    it('preserves per-mode configurability for Supplier fields', () => {
      const component = fixture.componentInstance;
      component.selectModule('suppliers');
      fixture.detectChanges();

      const nameControl = component.controls().find((item) => item.key === 'suppliers.fields.name');
      expect(nameControl).toBeDefined();
      if (nameControl) {
        expect(component.isConfigurable(nameControl, 'visible')).toBe(false);
        expect(component.modeReadonly(nameControl, 'visible')).toBe(true);
        expect(component.modeLockedReason(nameControl, 'visible')).toBe(
          'Platform rule: this required workflow field cannot be hidden or disabled.',
        );
        component.setValue(nameControl, 'visible', false);
        expect(component.value(nameControl, 'visible')).toBe(true);
        expect(component.isConfigurable(nameControl, 'editable')).toBe(true);
        expect(component.modeReadonly(nameControl, 'editable')).toBe(false);
        expect(component.modeLockedReason(nameControl, 'editable')).toBeNull();
        component.setValue(nameControl, 'editable', false);
        expect(component.value(nameControl, 'editable')).toBe(false);
      }
      expect(
        fixture.nativeElement.querySelector('input[aria-label="Supplier Name visible"]'),
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('input[aria-label="Supplier Name editable"]'),
      ).toBeTruthy();

      for (const key of [
        'suppliers.fields.contactName',
        'suppliers.fields.phone',
        'suppliers.fields.email',
      ]) {
        const optionalControl = component.controls().find((item) => item.key === key);
        expect(optionalControl).toBeDefined();
        if (optionalControl) {
          expect(component.isConfigurable(optionalControl, 'visible')).toBe(true);
          expect(component.isConfigurable(optionalControl, 'editable')).toBe(true);
        }
      }

      const balanceControl = component
        .controls()
        .find((item) => item.key === 'suppliers.fields.derivedBalances');
      expect(balanceControl).toBeDefined();
      if (balanceControl) {
        expect(component.isConfigurable(balanceControl, 'visible')).toBe(false);
        expect(component.modeReadonly(balanceControl, 'visible')).toBe(true);
        expect(component.modeLockedReason(balanceControl, 'visible')).toBe(
          'Platform rule: this required workflow field cannot be hidden or disabled.',
        );
      }

      const openingControl = component
        .controls()
        .find((item) => item.key === 'suppliers.fields.openingBalance');
      expect(openingControl).toBeDefined();
      if (openingControl) {
        expect(component.isConfigurable(openingControl, 'visible')).toBe(false);
        expect(component.modeReadonly(openingControl, 'visible')).toBe(true);
        expect(component.modeLockedReason(openingControl, 'visible')).toBe(
          'Platform rule: this required workflow field cannot be hidden or disabled.',
        );
      }
    });

    it('shows disable Suppliers confirmation title and message', () => {
      const component = fixture.componentInstance;
      component.selectModule('suppliers');

      const moduleCtrl = component.controls().find((item) => item.key === 'suppliers');
      expect(moduleCtrl).toBeDefined();
      if (moduleCtrl) {
        component.setValue(moduleCtrl, 'enabled', false);
      }

      expect(component.disablingSuppliers()).toBe(true);
      expect(component.confirmationTitle()).toBe('Disable Suppliers for Greenfield Agro Center?');
      expect(component.confirmationMessage()).toBe(
        'Users in this organization will no longer be able to access the Suppliers module or related operational features. Existing supplier data, balances, and history will not be deleted.',
      );
      expect(component.confirmationLabel()).toBe('Disable Suppliers');
    });

    it('calls the shared module reset API with suppliers module key', () => {
      const component = fixture.componentInstance;
      component.selectModule('suppliers');
      component.askResetModule();
      component.confirm();

      expect(resetModule).toHaveBeenCalledWith('org-a', 'suppliers', 4, '');
    });
  });

  describe('Expense Categories Module Controls', () => {
    it('renders Expense Categories module button, controls count, and sections', () => {
      const component = fixture.componentInstance;
      component.selectModule('expenses.categories');
      fixture.detectChanges();

      expect(component.selectedModule()).toBe('expenses.categories');
      expect(component.moduleLabel('expenses.categories')).toBe('Expense Categories');

      // Module control (1)
      expect(component.moduleControls().length).toBe(1);
      expect(component.moduleControls()[0]?.key).toBe('expenses.categories');

      // Feature controls (3: moduleInfo → moduleInfoControls, search + statusFilter → filterControls)
      expect(component.moduleInfoControls().length).toBe(1);
      expect(component.filterControls().length).toBe(2);
      expect(component.featureControls().length).toBe(0);

      // Field controls (name is platform-enforced → requiredWorkflowControls; status is configurable → fieldControls)
      expect(component.fieldControls().length).toBe(1);
      expect(component.requiredWorkflowControls().length).toBe(1);

      // Action controls (5: create, edit, deactivate, reactivate, delete)
      expect(component.actionControls().length).toBe(5);
    });

    it('enforces platform rule for required category name field', () => {
      const component = fixture.componentInstance;
      component.selectModule('expenses.categories');
      fixture.detectChanges();

      const nameControl = component
        .controls()
        .find((item) => item.key === 'expenses.categories.fields.name');
      expect(nameControl).toBeDefined();
      if (nameControl) {
        expect(component.isConfigurable(nameControl, 'visible')).toBe(false);
        expect(component.modeReadonly(nameControl, 'visible')).toBe(true);
        expect(component.modeLockedReason(nameControl, 'visible')).toBe(
          'Platform rule: this required workflow field cannot be hidden or disabled.',
        );
      }
    });

    it('blocks all 5 category mutation actions with dependency block reason when manageCategories is disabled', () => {
      const component = fixture.componentInstance;
      component.selectModule('expenses.categories');
      fixture.detectChanges();

      // Disable manageCategories in expenses module
      const manageCategoriesAction = component
        .controls()
        .find((item) => item.key === 'expenses.actions.manageCategories');
      expect(manageCategoriesAction).toBeDefined();
      if (manageCategoriesAction) {
        component.setValue(manageCategoriesAction, 'allowed', false);
      }

      const mutationKeys = [
        'expenses.categories.actions.create',
        'expenses.categories.actions.edit',
        'expenses.categories.actions.deactivate',
        'expenses.categories.actions.reactivate',
        'expenses.categories.actions.delete',
      ];

      for (const key of mutationKeys) {
        const actionControl = component.actionControls().find((item) => item.key === key);
        expect(actionControl).toBeDefined();
        if (actionControl) {
          expect(component.effectiveValue(actionControl, 'allowed')).toBe(false);
          expect(component.effectiveReason(actionControl, 'allowed')).toBe(
            'Manage Expense Categories is disabled for this organization.',
          );
        }
      }
    });

    it('allows independent configuration of category actions when manageCategories is enabled', () => {
      const component = fixture.componentInstance;
      component.selectModule('expenses.categories');
      fixture.detectChanges();

      const deleteControl = component
        .actionControls()
        .find((item) => item.key === 'expenses.categories.actions.delete');
      expect(deleteControl).toBeDefined();
      if (deleteControl) {
        component.setValue(deleteControl, 'allowed', false);
        expect(component.effectiveValue(deleteControl, 'allowed')).toBe(false);
        // No effective reason when value is directly configured (not blocked by parent/dependency)
        expect(component.effectiveReason(deleteControl, 'allowed')).toBeNull();
      }

      const createControl = component
        .actionControls()
        .find((item) => item.key === 'expenses.categories.actions.create');
      expect(createControl).toBeDefined();
      if (createControl) {
        expect(component.effectiveValue(createControl, 'allowed')).toBe(true);
      }
    });
  });

  describe('Accounts Controls', () => {
    it('selects Accounts module and renders all expected control sections', () => {
      const component = fixture.componentInstance;
      component.selectModule('accounts');
      fixture.detectChanges();

      expect(component.selectedModule()).toBe('accounts');
      expect(component.moduleLabel('accounts')).toBe('Accounts');
      expect(component.moduleControls().length).toBe(1);
      expect(component.moduleInfoControls().length).toBe(1);
      expect(component.filterControls().length).toBe(2);
      expect(component.kpiControls().length).toBe(1);
      expect(component.historyControls().length).toBe(1);
      expect(component.requiredWorkflowControls().length).toBe(7);
      expect(component.fieldControls().length).toBe(1);
      expect(component.actionControls().length).toBe(12);

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Accounts Module');
      expect(text).toContain('Module Information');
      expect(text).toContain('Filters');
      expect(text).toContain('KPI');
      expect(text).toContain('History');
      expect(text).toContain('Required Fields');
      expect(text).toContain('Fields');
      expect(text).toContain('Actions');
    });

    it('triggers critical confirmation dialog when disabling Accounts module', () => {
      const component = fixture.componentInstance;
      component.selectModule('accounts');
      const moduleControl = component.controls().find((item) => item.key === 'accounts');
      expect(moduleControl).toBeDefined();
      if (moduleControl) {
        component.setValue(moduleControl, 'enabled', false);
        component.askSave();

        expect(component.disablingAccounts()).toBe(true);
        expect(component.confirmationTitle()).toBe('Disable Accounts for Greenfield Agro Center?');
        expect(component.confirmationMessage()).toContain(
          'Users in this organization will no longer be able to access Accounts',
        );
        expect(component.confirmationLabel()).toBe('Disable Accounts');
      }
    });

    it('enforces platform rules on required fields like account name, type, and opening balance', () => {
      const component = fixture.componentInstance;
      component.selectModule('accounts');
      fixture.detectChanges();

      const nameControl = component
        .requiredWorkflowControls()
        .find((item) => item.key === 'accounts.fields.name');
      expect(nameControl).toBeDefined();
      if (nameControl) {
        expect(component.isConfigurable(nameControl, 'visible')).toBe(false);
        expect(component.modeReadonly(nameControl, 'visible')).toBe(true);
        expect(component.modeLockedReason(nameControl, 'visible')).toBe(
          'Platform rule: this required workflow field cannot be hidden or disabled.',
        );
      }
    });
  });
  describe('Reports Controls', () => {
    it('renders the complete Reports registry through the generic policy sections', () => {
      const component = fixture.componentInstance;
      component.selectModule('reports');
      fixture.detectChanges();

      expect(component.moduleLabel('reports')).toBe('Reports');
      expect(component.selectedControls()).toHaveLength(22);
      expect(component.moduleControls()).toHaveLength(1);
      expect(component.moduleInfoControls()).toHaveLength(1);
      expect(component.reportAvailabilityControls()).toHaveLength(16);
      expect(component.actionControls()).toHaveLength(4);
      expect(component.featureControls()).toHaveLength(0);

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Reports Module');
      expect(text).toContain('Report Availability');
      expect(text).toContain('Default');
      expect(text).toContain('Organization override');
      expect(text).toContain('Effective');
      expect(text).toContain('Export PDF');
      expect(text).toContain('Export Excel');
      expect(text).toContain('Export CSV');
    });

    it('supports independent report/action policy changes and backend effective restrictions', () => {
      const component = fixture.componentInstance;
      component.selectModule('reports');

      const sales = component
        .reportAvailabilityControls()
        .find((item) => item.key === 'reports.reportAvailability.sales');
      const purchases = component
        .reportAvailabilityControls()
        .find((item) => item.key === 'reports.reportAvailability.purchases');
      const pdf = component
        .actionControls()
        .find((item) => item.key === 'reports.actions.exportPdf');
      const csv = component
        .actionControls()
        .find((item) => item.key === 'reports.actions.exportCsv');

      expect(sales).toBeDefined();
      expect(purchases).toBeDefined();
      expect(pdf).toBeDefined();
      expect(csv).toBeDefined();
      if (sales && purchases && pdf && csv) {
        expect(component.effectiveValue(sales, 'enabled')).toBe(false);
        expect(component.effectiveValue(purchases, 'enabled')).toBe(true);
        component.setValue(sales, 'enabled', true);
        component.setValue(pdf, 'allowed', false);
        expect(component.effectiveValue(sales, 'enabled')).toBe(true);
        expect(component.effectiveValue(purchases, 'enabled')).toBe(true);
        expect(component.effectiveValue(pdf, 'allowed')).toBe(false);
        expect(component.effectiveValue(csv, 'allowed')).toBe(false);
        expect(component.effectiveReason(csv, 'allowed')).toBe(
          'Unavailable on the current plan entitlement.',
        );
      }
    });

    it('supports Reports disable/re-enable and organization-scoped module reset', () => {
      const component = fixture.componentInstance;
      component.selectModule('reports');
      const moduleControl = component.controls().find((item) => item.key === 'reports');
      expect(moduleControl).toBeDefined();
      if (moduleControl) {
        component.setValue(moduleControl, 'enabled', false);
        expect(component.disablingReports()).toBe(true);
        expect(component.confirmationTitle()).toBe(
          'Disable Reports for Greenfield Agro Center?',
        );
        expect(component.confirmationLabel()).toBe('Disable Reports');
        component.setValue(moduleControl, 'enabled', true);
        expect(component.effectiveValue(moduleControl, 'enabled')).toBe(true);
      }

      component.askResetModule();
      component.confirm();
      expect(resetModule).toHaveBeenCalledWith('org-a', 'reports', 4, '');
    });
  });

  describe('Alerts Controls', () => {
    it('renders the complete 13 Alerts registry controls through generic policy sections', () => {
      const component = fixture.componentInstance;
      component.selectModule('alerts');
      fixture.detectChanges();

      expect(component.moduleLabel('alerts')).toBe('Alerts');
      expect(component.selectedControls()).toHaveLength(13);
      expect(component.moduleControls()).toHaveLength(1);
      expect(component.moduleInfoControls()).toHaveLength(1);
      expect(component.presentationFeatureControls()).toHaveLength(2);
      expect(component.alertTypeAvailabilityControls()).toHaveLength(6);
      expect(component.actionControls()).toHaveLength(3);
      expect(component.featureControls()).toHaveLength(0);

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Alerts Module');
      expect(text).toContain('About Alerts');
      expect(text).toContain('Summary Cards');
      expect(text).toContain('Navbar Notifications');
      expect(text).toContain('Alert Family Availability');
      expect(text).toContain('Low Stock Alerts');
      expect(text).toContain('Upcoming Expiry Alerts');
      expect(text).toContain('Acknowledge Alert');
      expect(text).toContain('Mark Notification Read');
      expect(text).toContain('Mark All Notifications Read');
    });

    it('supports independent alert family/feature/action policy changes and effective computation', () => {
      const component = fixture.componentInstance;
      component.selectModule('alerts');

      const lowStock = component
        .alertTypeAvailabilityControls()
        .find((item) => item.key === 'alerts.alertTypeAvailability.lowStock');
      const upcomingExpiry = component
        .alertTypeAvailabilityControls()
        .find((item) => item.key === 'alerts.alertTypeAvailability.upcomingExpiry');
      const navbar = component
        .presentationFeatureControls()
        .find((item) => item.key === 'alerts.features.navbarNotifications');
      const acknowledge = component
        .actionControls()
        .find((item) => item.key === 'alerts.actions.acknowledge');

      expect(lowStock).toBeDefined();
      expect(upcomingExpiry).toBeDefined();
      expect(navbar).toBeDefined();
      expect(acknowledge).toBeDefined();

      if (lowStock && upcomingExpiry && navbar && acknowledge) {
        expect(component.effectiveValue(lowStock, 'enabled')).toBe(false);
        expect(component.effectiveValue(upcomingExpiry, 'enabled')).toBe(true);
        expect(component.effectiveValue(navbar, 'enabled')).toBe(true);
        expect(component.effectiveValue(acknowledge, 'allowed')).toBe(true);

        component.setValue(lowStock, 'enabled', true);
        component.setValue(navbar, 'enabled', false);
        component.setValue(acknowledge, 'allowed', false);

        expect(component.effectiveValue(lowStock, 'enabled')).toBe(true);
        expect(component.effectiveValue(navbar, 'enabled')).toBe(false);
        expect(component.effectiveValue(acknowledge, 'allowed')).toBe(false);
      }
    });

    it('supports Alerts module disable/re-enable, confirmation modal, and module reset', () => {
      const component = fixture.componentInstance;
      component.selectModule('alerts');
      const moduleControl = component.controls().find((item) => item.key === 'alerts');
      expect(moduleControl).toBeDefined();

      if (moduleControl) {
        component.setValue(moduleControl, 'enabled', false);
        expect(component.disablingAlerts()).toBe(true);
        expect(component.confirmationTitle()).toBe(
          'Disable Alerts for Greenfield Agro Center?',
        );
        expect(component.confirmationLabel()).toBe('Disable Alerts');
        expect(component.confirmationMessage()).toContain('Notification Center');

        component.setValue(moduleControl, 'enabled', true);
        expect(component.effectiveValue(moduleControl, 'enabled')).toBe(true);
      }

      component.askResetModule();
      component.confirm();
      expect(resetModule).toHaveBeenCalledWith('org-a', 'alerts', 4, '');
    });
  });
});
