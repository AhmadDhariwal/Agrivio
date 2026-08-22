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
    | 'inventory.reconciliation',
  type: PlatformCapabilityControl['type'],
  label: string,
  policy: Record<string, boolean>,
  options: {
    override?: Record<string, boolean>;
    risk?: PlatformCapabilityControl['risk'];
    configurable?: Record<string, boolean>;
    platformEnforced?: boolean;
    reason?: string;
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
    effectiveValue: { ...policy, ...(override ?? {}) },
    reasons: [],
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
});
