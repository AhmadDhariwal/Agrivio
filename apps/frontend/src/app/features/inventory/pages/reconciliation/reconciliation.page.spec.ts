import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReconciliationPage, FINDING_CODE_METADATA, ReconciliationFindingItem } from './reconciliation.page';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { ProductBatchRecord } from '../../models/inventory.models';

describe('ReconciliationPage', () => {
  let fixture: ComponentFixture<ReconciliationPage>;
  let page: ReconciliationPage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockInventoryApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCatalogApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockLocationsApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSessionStore: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCapabilityService: any;

  const mockProducts: ProductRecord[] = [
    {
      id: 'prod-1',
      organizationId: 'org-1',
      categoryId: 'cat-1',
      name: 'Urea Fertilizer 50kg',
      sku: 'UREA-50',
      trackingMode: 'batch',
      baseUnitCode: 'BAG',
      measurementDimension: 'mass',
      status: 'active',
      version: 1,
    },
    {
      id: 'prod-2',
      organizationId: 'org-1',
      categoryId: 'cat-1',
      name: 'DAP Fertilizer 50kg',
      sku: 'DAP-50',
      trackingMode: 'none',
      baseUnitCode: 'BAG',
      measurementDimension: 'mass',
      status: 'active',
      version: 1,
    },
  ];

  const mockWarehouses = [
    {
      id: 'wh-main',
      organizationId: 'org-1',
      name: 'Main Distribution Hub',
      code: 'WH-MAIN',
      type: 'warehouse' as const,
      status: 'active' as const,
      version: 1,
    },
    {
      id: 'wh-north',
      organizationId: 'org-1',
      name: 'North Warehouse',
      code: 'WH-NORTH',
      type: 'warehouse' as const,
      status: 'active' as const,
      version: 1,
    },
  ];

  const mockBatches: ProductBatchRecord[] = [
    {
      id: 'batch-001',
      organizationId: 'org-1',
      productId: 'prod-1',
      batchNumber: 'BATCH-2026-01',
      manufacturingDate: '2026-01-01',
      expiryDate: '2027-01-01',
      firstReceivedAt: '2026-01-05T00:00:00Z',
    },
  ];

  const mockFindings: ReconciliationFindingItem[] = [
    {
      code: 'MOVEMENT_BALANCE_QUANTITY_MISMATCH',
      warehouseId: 'wh-main',
      productId: 'prod-1',
      batchId: 'batch-001',
      movementQuantityBaseMinorUnits: '500000', // 50.0000
      balanceQuantityBaseMinorUnits: '400000',  // 40.0000 (diff = -10.0000)
    },
    {
      code: 'MOVEMENT_WITHOUT_BALANCE',
      warehouseId: 'wh-north',
      productId: 'prod-2',
      batchId: null,
      movementQuantityBaseMinorUnits: '250000', // 25.0000
      balanceQuantityBaseMinorUnits: '0',
    },
    {
      code: 'COST_STATE_VALUATION_MISMATCH',
      warehouseId: 'wh-main',
      productId: 'prod-1',
      costQuantityBaseMinorUnits: '400000',
      costInventoryValueMinorUnits: '800000',     // 8000.00 PKR
      expectedInventoryValueMinorUnits: '850000', // 8500.00 PKR
    },
  ];

  beforeEach(async () => {
    mockInventoryApi = {
      reconcileInventory: vi.fn(() => of({ ok: false, findings: mockFindings })),
      listBatches: vi.fn(() => of({ items: mockBatches, meta: { page: 1, pageSize: 200, total: 1 } })),
    };

    mockCatalogApi = {
      searchProductOptions: vi.fn(() => of(mockProducts)),
    };

    mockLocationsApi = {
      listWarehouseOptions: vi.fn(() => of(mockWarehouses)),
    };

    mockSessionStore = {
      hasPermission: vi.fn((perm: string) => perm === 'inventory.view'),
    };

    mockCapabilityService = {
      canUseModule: vi.fn(() => true),
      canUseView: vi.fn(() => true),
      canShowWidget: vi.fn(() => true),
      canViewField: vi.fn(() => true),
      canEditField: vi.fn(() => true),
      canPerformAction: vi.fn(() => true),
    };

    await TestBed.configureTestingModule({
      imports: [ReconciliationPage],
      providers: [
        provideRouter([]),
        { provide: InventoryApi, useValue: mockInventoryApi },
        { provide: CatalogApi, useValue: mockCatalogApi },
        { provide: BranchesWarehousesApi, useValue: mockLocationsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
        { provide: CapabilityService, useValue: mockCapabilityService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReconciliationPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('Component Initialization & Header', () => {
    it('loads page successfully and requests reconciliation master data', () => {
      expect(page).toBeTruthy();
      expect(mockInventoryApi.reconcileInventory).toHaveBeenCalled();
      expect(mockCatalogApi.searchProductOptions).toHaveBeenCalledWith('', 500);
      expect(mockLocationsApi.listWarehouseOptions).toHaveBeenCalled();
      expect(mockInventoryApi.listBatches).toHaveBeenCalled();
      expect(page.loading()).toBe(false);
    });

    it('renders canonical page header and back to stock action', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.page-head__title')?.textContent).toContain('Inventory reconciliation');
      expect(compiled.querySelector('.page-head__eyebrow')?.textContent).toContain('INVENTORY / RECONCILIATION');
      expect(compiled.querySelector('[data-testid="reconciliation-back-link"]')).toBeTruthy();
    });

    it('handles permission denials gracefully', () => {
      mockSessionStore.hasPermission.mockReturnValue(false);
      const permFixture = TestBed.createComponent(ReconciliationPage);
      permFixture.detectChanges();
      expect(permFixture.componentInstance.canView()).toBe(false);
      const compiled = permFixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('You do not have permission to view inventory reconciliation.');
    });
  });

  describe('Reference Enrichment & O(1) Maps', () => {
    it('populates product, warehouse, and batch maps for O(1) lookup', () => {
      expect(page.productName('prod-1')).toBe('Urea Fertilizer 50kg');
      expect(page.productSku('prod-1')).toBe('UREA-50');
      expect(page.productBaseUnit('prod-1')).toBe('BAG');
      expect(page.warehouseName('wh-main')).toBe('Main Distribution Hub');
      expect(page.batchNumber('batch-001')).toBe('BATCH-2026-01');
    });

    it('provides fallback labels for missing references', () => {
      expect(page.productName('unknown-prod')).toBe('Product (unknown-prod)');
      expect(page.productSku('unknown-prod')).toBe('—');
      expect(page.warehouseName('unknown-wh')).toBe('Warehouse (unknown-wh)');
      expect(page.batchNumber('unknown-batch')).toBe('unknown-batch');
      expect(page.batchNumber(null)).toBe('Standard (No Batch)');
    });
  });

  describe('Authoritative KPI Summary Calculations', () => {
    it('calculates total findings, quantity issues, integrity issues, and valuation issues', () => {
      expect(page.kpiTotalFindings()).toBe(3);
      expect(page.kpiQuantityIssues()).toBe(1);   // MOVEMENT_BALANCE_QUANTITY_MISMATCH
      expect(page.kpiIntegrityIssues()).toBe(1);  // MOVEMENT_WITHOUT_BALANCE
      expect(page.kpiValuationIssues()).toBe(1);  // COST_STATE_VALUATION_MISMATCH
      expect(page.isOk()).toBe(false);
    });

    it('reflects OK system status when findings array is empty', () => {
      mockInventoryApi.reconcileInventory.mockReturnValue(of({ ok: true, findings: [] }));
      page.reload();
      expect(page.isOk()).toBe(true);
      expect(page.kpiTotalFindings()).toBe(0);
      expect(page.kpiQuantityIssues()).toBe(0);
      expect(page.kpiIntegrityIssues()).toBe(0);
      expect(page.kpiValuationIssues()).toBe(0);
    });
  });

  describe('Category Tabs and Filtering', () => {
    it('filters findings by active category tab', () => {
      expect(page.filteredFindings().length).toBe(3);

      page.setCategory('quantity');
      expect(page.filteredFindings().length).toBe(1);
      expect(page.filteredFindings()[0]?.code).toBe('MOVEMENT_BALANCE_QUANTITY_MISMATCH');

      page.setCategory('integrity');
      expect(page.filteredFindings().length).toBe(1);
      expect(page.filteredFindings()[0]?.code).toBe('MOVEMENT_WITHOUT_BALANCE');

      page.setCategory('valuation');
      expect(page.filteredFindings().length).toBe(1);
      expect(page.filteredFindings()[0]?.code).toBe('COST_STATE_VALUATION_MISMATCH');

      page.setCategory('all');
      expect(page.filteredFindings().length).toBe(3);
    });

    it('filters findings by search query across product name, SKU, warehouse, batch, and code', () => {
      const searchEvent = { target: { value: 'Urea' } } as unknown as Event;
      page.onSearch(searchEvent);
      expect(page.filteredFindings().length).toBe(2); // prod-1 findings

      page.onSearch({ target: { value: 'DAP-50' } } as unknown as Event);
      expect(page.filteredFindings().length).toBe(1); // prod-2 finding

      page.onSearch({ target: { value: 'wh-north' } } as unknown as Event);
      expect(page.filteredFindings().length).toBe(1);

      page.onSearchClear();
      expect(page.filteredFindings().length).toBe(3);
    });

    it('filters findings by warehouse dropdown', () => {
      page.onWarehouseChange({ target: { value: 'wh-north' } } as unknown as Event);
      expect(page.filteredFindings().length).toBe(1);
      expect(page.filteredFindings()[0]?.warehouseId).toBe('wh-north');

      page.clearFilters();
      expect(page.filteredFindings().length).toBe(3);
      expect(page.hasActiveFilters()).toBe(false);
    });

    it('filters findings by finding code dropdown', () => {
      page.onFindingCodeChange({
        target: { value: 'COST_STATE_VALUATION_MISMATCH' },
      } as unknown as Event);
      expect(page.filteredFindings().length).toBe(1);
      expect(page.filteredFindings()[0]?.code).toBe('COST_STATE_VALUATION_MISMATCH');
    });
  });

  describe('Finding Code Humanization & Helpers', () => {
    it('maps all defined backend finding codes to human-readable metadata', () => {
      for (const [code, meta] of Object.entries(FINDING_CODE_METADATA)) {
        const resolved = page.findingMeta(code);
        expect(resolved.label).toBe(meta.label);
        expect(resolved.description).toBe(meta.description);
        expect(resolved.category).toBe(meta.category);
        expect(resolved.severity).toBe(meta.severity);
      }
    });

    it('formats minor units to 4-decimal quantity string', () => {
      expect(page.formatQuantity('500000')).toBe('50.0000');
      expect(page.formatQuantity('12345')).toBe('1.2345');
      expect(page.formatQuantity('-20000')).toBe('-2.0000');
      expect(page.formatQuantity('0')).toBe('0.0000');
      expect(page.formatQuantity(null)).toBe('—');
      expect(page.formatQuantity('')).toBe('—');
    });

    it('formats minor units to PKR monetary string', () => {
      expect(page.formatMoney('800000')).toBe('8000.00 PKR');
      expect(page.formatMoney('150')).toBe('1.50 PKR');
      expect(page.formatMoney(null)).toBe('—');
    });

    it('calculates quantity difference as a presentation helper', () => {
      const [finding1, finding2, finding3] = mockFindings;
      if (!finding1 || !finding2 || !finding3) throw new Error('Missing test findings');
      expect(page.getFindingDifference(finding1)).toBe('-10.0000');
      expect(page.getFindingDifference(finding2)).toBe('-25.0000');
      expect(page.getFindingDifference(finding3)).toBeNull();
    });
  });

  describe('Pagination & Table Rendering', () => {
    it('paginates findings correctly', () => {
      page.onPageSizeChange({ target: { value: '2' } } as unknown as Event);
      expect(page.pageSize()).toBe(2);
      expect(page.totalPages()).toBe(2);
      expect(page.paginatedFindings().length).toBe(2);

      page.onPageChange(2);
      expect(page.page()).toBe(2);
      expect(page.paginatedFindings().length).toBe(1);
    });

    it('renders table rows and inspect triggers', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const rows = compiled.querySelectorAll('[data-testid="reconciliation-row"]');
      expect(rows.length).toBe(3);
    });

    it('renders empty state when no findings exist', () => {
      mockInventoryApi.reconcileInventory.mockReturnValue(of({ ok: true, findings: [] }));
      page.reload();
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="reconciliation-empty-state"]')).toBeTruthy();
      expect(compiled.textContent).toContain('No reconciliation findings');
    });
  });

  describe('Inspector Drawer', () => {
    it('opens drawer with selected finding details and closes properly', () => {
      expect(page.selectedFinding()).toBeNull();
      const target = mockFindings[0];
      if (!target) throw new Error('Missing test finding');

      page.openInspector(target);
      expect(page.selectedFinding()).toEqual(target);

      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.inspector-drawer')).toBeTruthy();
      expect(compiled.querySelector('.drawer-title')?.textContent).toContain('Reconciliation Inspector');

      // Close inspector
      page.closeInspector();
      expect(page.selectedFinding()).toBeNull();
      fixture.detectChanges();
      expect(compiled.querySelector('.inspector-drawer')).toBeNull();
    });
  });

  describe('Error Handling & Retry', () => {
    it('displays error alert on failure and allows retry', () => {
      mockInventoryApi.reconcileInventory.mockReturnValue(throwError(() => new Error('API Error')));
      page.reload();
      expect(page.loading()).toBe(false);
      expect(page.errorMessage()).toBe('Unable to load inventory reconciliation. Please try again.');

      // Retry
      mockInventoryApi.reconcileInventory.mockReturnValue(of({ ok: true, findings: [] }));
      page.reload();
      expect(page.errorMessage()).toBeNull();
      expect(page.isOk()).toBe(true);
    });
  });

  describe('Capability & Permission Guards', () => {
    it('handles disabled organization module by rendering warning alert and skipping reload', () => {
      mockCapabilityService.canUseModule.mockImplementation(
        (key: string) => key !== 'inventory.reconciliation',
      );
      mockInventoryApi.reconcileInventory.mockClear();

      const capFixture = TestBed.createComponent(ReconciliationPage);
      const capPage = capFixture.componentInstance;
      capFixture.detectChanges();

      expect(capPage.canUseReconciliation()).toBe(false);
      expect(capPage.loading()).toBe(false);
      expect(mockInventoryApi.reconcileInventory).not.toHaveBeenCalled();

      const compiled = capFixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain(
        'Inventory reconciliation is not enabled for this organization.',
      );
    });

    it('respects showModuleInfo capability view control', () => {
      mockCapabilityService.canUseView.mockImplementation(
        (key: string) => key !== 'inventory.reconciliation.features.moduleInfo',
      );
      const capFixture = TestBed.createComponent(ReconciliationPage);
      capFixture.detectChanges();

      expect(capFixture.componentInstance.showModuleInfo()).toBe(false);
      const compiled = capFixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('agrivio-ui-module-info')).toBeNull();
    });

    it('respects showKpiCards capability view control', () => {
      mockCapabilityService.canUseView.mockImplementation(
        (key: string) => key !== 'inventory.reconciliation.features.kpiCards',
      );
      const capFixture = TestBed.createComponent(ReconciliationPage);
      capFixture.detectChanges();

      expect(capFixture.componentInstance.showKpiCards()).toBe(false);
      const compiled = capFixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.kpi-row')).toBeNull();
    });

    it('respects search and filter capability view controls', () => {
      mockCapabilityService.canUseView.mockImplementation((key: string) => {
        if (key === 'inventory.reconciliation.features.search') return false;
        if (key === 'inventory.reconciliation.features.warehouseFilter') return false;
        if (key === 'inventory.reconciliation.features.findingFilter') return false;
        return true;
      });
      const capFixture = TestBed.createComponent(ReconciliationPage);
      capFixture.detectChanges();

      expect(capFixture.componentInstance.showSearch()).toBe(false);
      expect(capFixture.componentInstance.showWarehouseFilter()).toBe(false);
      expect(capFixture.componentInstance.showFindingFilter()).toBe(false);

      const compiled = capFixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="reconciliation-search-input"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="reconciliation-warehouse-filter"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="reconciliation-finding-filter"]')).toBeNull();
    });

    it('hides inspect buttons and blocks opening inspector when inspector capability is disabled', () => {
      mockCapabilityService.canUseView.mockImplementation(
        (key: string) => key !== 'inventory.reconciliation.features.inspector',
      );
      const capFixture = TestBed.createComponent(ReconciliationPage);
      const capPage = capFixture.componentInstance;
      capFixture.detectChanges();

      expect(capPage.showInspector()).toBe(false);
      const compiled = capFixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="reconciliation-inspect-btn"]')).toBeNull();

      // Calling openInspector programmatically is blocked
      const target = mockFindings[0];
      if (target) {
        capPage.openInspector(target);
        expect(capPage.selectedFinding()).toBeNull();
      }
    });

    it('hides technical details collapsible in inspector drawer when technicalDetails capability is disabled', () => {
      mockCapabilityService.canUseView.mockImplementation(
        (key: string) => key !== 'inventory.reconciliation.features.technicalDetails',
      );
      const capFixture = TestBed.createComponent(ReconciliationPage);
      const capPage = capFixture.componentInstance;
      capFixture.detectChanges();

      expect(capPage.showTechnicalDetails()).toBe(false);
      const target = mockFindings[0];
      if (target) {
        capPage.openInspector(target);
        capFixture.detectChanges();

        const compiled = capFixture.nativeElement as HTMLElement;
        expect(compiled.querySelector('.inspector-drawer')).toBeTruthy();
        expect(compiled.querySelector('.drawer-details')).toBeNull();
      }
    });

    it('respects canRefresh action capability on header refresh and KPI card refresh', () => {
      mockCapabilityService.canPerformAction.mockImplementation(
        (key: string) => key !== 'inventory.reconciliation.actions.refresh',
      );
      const capFixture = TestBed.createComponent(ReconciliationPage);
      const capPage = capFixture.componentInstance;
      capFixture.detectChanges();

      expect(capPage.canRefresh()).toBe(false);
      const compiled = capFixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="reconciliation-header-refresh"]')).toBeNull();
      const kpiRefreshBtn = compiled.querySelector(
        '[data-testid="reconciliation-refresh"]',
      ) as HTMLButtonElement;
      expect(kpiRefreshBtn.disabled).toBe(true);
    });

    it('hides secondary workflow links when target module capabilities are disabled', () => {
      mockCapabilityService.canUseModule.mockImplementation((key: string) => {
        if (key === 'inventory.stock') return false;
        if (key === 'inventory.batches') return false;
        return true;
      });
      const capFixture = TestBed.createComponent(ReconciliationPage);
      const capPage = capFixture.componentInstance;
      capFixture.detectChanges();

      expect(capPage.canViewStock()).toBe(false);
      expect(capPage.canViewBatches()).toBe(false);

      const compiled = capFixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="reconciliation-back-link"]')).toBeNull();
      expect(compiled.querySelector('a[routerLink="/app/inventory/batches"]')).toBeNull();
    });
  });
});
