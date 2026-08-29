import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { TransfersPage } from './transfers.page';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';
import { WarehouseTransferRecord } from '../../models/inventory.models';

function mockProduct(id: string, trackingMode: ProductRecord['trackingMode']): ProductRecord {
  return {
    id,
    organizationId: 'org-1',
    categoryId: 'cat-1',
    name: `Product ${id}`,
    sku: `SKU-${id}`,
    trackingMode,
    baseUnitCode: 'KG',
    measurementDimension: 'mass',
    status: 'active',
    version: 1,
  };
}

describe('TransfersPage', () => {
  let fixture: ComponentFixture<TransfersPage>;
  let page: TransfersPage;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockInventoryApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockCatalogApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockLocationsApi: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSessionStore: any;
  const capabilityValues = signal<Record<string, boolean>>({});

  beforeEach(async () => {
    capabilityValues.set({});
    mockInventoryApi = {
      listTransfers: vi.fn(() =>
        of({
          items: [
            {
              id: 'xfer-1',
              organizationId: 'org-1',
              sourceWarehouseId: 'wh-source',
              destinationWarehouseId: 'wh-dest',
              productId: 'prod-batch',
              batchId: 'BATCH-001',
              quantityBase: '25.0000',
              enteredQuantity: '25.0000',
              unitCode: 'KG',
              transferValue: { amount: '12500.00', currency: 'PKR' },
              reason: 'Rebalance branch stock',
              status: 'posted',
              postedAt: '2026-08-22T10:30:00Z',
              postedBy: 'user-1',
              outboundMovementId: 'mov-out-1',
              inboundMovementId: 'mov-in-1',
              reversalOfId: null,
              reversedByTransferId: null,
              negativeStockOverride: false,
              version: 1,
            } as WarehouseTransferRecord,
          ],
          meta: { page: 1, pageSize: 25, total: 1 },
        }),
      ),
      listBalances: vi.fn(() =>
        of({
          items: [
            {
              id: 'bal-1',
              organizationId: 'org-1',
              warehouseId: 'wh-source',
              productId: 'prod-batch',
              batchId: 'BATCH-001',
              quantityBase: '100.0000',
              version: 1,
            },
            {
              id: 'bal-2',
              organizationId: 'org-1',
              warehouseId: 'wh-source',
              productId: 'prod-batch',
              batchId: 'BATCH-002',
              quantityBase: '50.0000',
              version: 1,
            },
          ],
          meta: { page: 1, pageSize: 25, total: 2 },
        }),
      ),
      listBatches: vi.fn(() =>
        of({
          items: [
            {
              id: 'BATCH-001',
              organizationId: 'org-1',
              productId: 'prod-batch',
              batchNumber: 'LOT-2026-A',
              manufacturingDate: '2026-01-01',
              expiryDate: '2027-12-31',
              firstReceivedAt: '2026-01-05T00:00:00Z',
            },
            {
              id: 'BATCH-002',
              organizationId: 'org-1',
              productId: 'prod-batch',
              batchNumber: 'LOT-2026-B',
              manufacturingDate: '2026-02-01',
              expiryDate: '2027-06-30',
              firstReceivedAt: '2026-02-05T00:00:00Z',
            },
          ],
          meta: { page: 1, pageSize: 25, total: 2 },
        }),
      ),
      createTransferDraft: vi.fn(() =>
        of({
          id: 'draft-xfer-1',
          organizationId: 'org-1',
          sourceWarehouseId: 'wh-source',
          destinationWarehouseId: 'wh-dest',
          productId: 'prod-none',
          batchId: null,
          quantityBase: '10.0000',
          enteredQuantity: '10.0000',
          unitCode: 'KG',
          transferValue: null,
          reason: 'Inter-warehouse transfer',
          status: 'draft',
          outboundMovementId: null,
          inboundMovementId: null,
          reversalOfId: null,
          reversedByTransferId: null,
          version: 1,
        } as WarehouseTransferRecord),
      ),
      postTransfer: vi.fn(() =>
        of({
          id: 'draft-xfer-1',
          status: 'posted',
        } as WarehouseTransferRecord),
      ),
      reverseTransfer: vi.fn(() =>
        of({
          id: 'xfer-1',
          status: 'reversed',
        } as WarehouseTransferRecord),
      ),
    };

    mockCatalogApi = {
      searchProductOptions: vi.fn(() =>
        of([
          mockProduct('prod-none', 'none'),
          mockProduct('prod-batch', 'batch'),
          mockProduct('prod-expiry', 'batch_expiry'),
        ]),
      ),
      getProduct: vi.fn((id: string) =>
        of({
          id,
          organizationId: 'org-1',
          categoryId: 'cat-1',
          name: `Historical Product ${id}`,
          sku: `SKU-HIST-${id}`,
          trackingMode: 'none',
          baseUnitCode: 'BAG',
          measurementDimension: 'count',
          status: 'inactive',
          version: 1,
        }),
      ),
    };

    mockLocationsApi = {
      listWarehouseOptions: vi.fn(() =>
        of([
          {
            id: 'wh-source',
            organizationId: 'org-1',
            name: 'Central Warehouse',
            status: 'active',
            version: 1,
          },
          {
            id: 'wh-dest',
            organizationId: 'org-1',
            name: 'North Region Warehouse',
            status: 'active',
            version: 1,
          },
        ]),
      ),
      getWarehouse: vi.fn((id: string) =>
        of({
          id,
          organizationId: 'org-1',
          name: `Archived Warehouse ${id}`,
          code: 'ARCH',
          status: 'inactive',
          version: 1,
        }),
      ),
    };

    mockSessionStore = {
      hasPermission: vi.fn((perm: string) => Boolean(perm)),
    };

    await TestBed.configureTestingModule({
      imports: [TransfersPage],
      providers: [
        provideRouter([]),
        { provide: InventoryApi, useValue: mockInventoryApi },
        { provide: CatalogApi, useValue: mockCatalogApi },
        { provide: BranchesWarehousesApi, useValue: mockLocationsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: (key: string) => capabilityValues()[key] ?? true,
            canUseView: (key: string) => capabilityValues()[key] ?? true,
            canViewField: (key: string) => capabilityValues()[key] ?? true,
            canPerformAction: (key: string) => capabilityValues()[key] ?? true,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TransfersPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders canonical page header and module info section', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.page-head__title')?.textContent).toContain(
      'Warehouse transfers',
    );
    expect(compiled.querySelector('.page-head__eyebrow')?.textContent).toContain(
      'INVENTORY / TRANSFERS',
    );
    const moduleInfo = compiled.querySelector('agrivio-ui-module-info');
    expect(moduleInfo).not.toBeNull();
    expect(moduleInfo?.textContent).toContain('About Warehouse Transfers');
  });

  it('populates warehouses, products, and transfers on init', () => {
    expect(page.warehouses().length).toBe(2);
    expect(page.products().length).toBe(3);
    expect(page.transfers().length).toBe(1);
    expect(page.total()).toBe(1);
  });

  it('enforces sourceWarehouseId !== destinationWarehouseId validation', () => {
    page.form.controls.sourceWarehouseId.setValue('wh-source');
    page.form.controls.destinationWarehouseId.setValue('wh-source');
    fixture.detectChanges();

    expect(page.form.controls.destinationWarehouseId.hasError('sameWarehouse')).toBe(true);
    expect(page.form.invalid).toBe(true);

    page.form.controls.destinationWarehouseId.setValue('wh-dest');
    fixture.detectChanges();
    expect(page.form.controls.destinationWarehouseId.hasError('sameWarehouse')).toBe(false);
  });

  it('renders product context strip and tracking chip when a product is selected', () => {
    page.form.controls.sourceWarehouseId.setValue('wh-source');
    page.form.controls.productId.setValue('prod-batch');
    fixture.detectChanges();

    const contextEl = fixture.nativeElement.querySelector(
      '[data-testid="transfer-product-context"]',
    );
    expect(contextEl).not.toBeNull();
    expect(contextEl?.textContent).toContain('Product prod-batch');
    expect(contextEl?.textContent).toContain('SKU-prod-batch');
    expect(contextEl?.textContent).toContain('KG');
    expect(contextEl?.textContent).toContain('Batch Tracked');
    expect(page.productSourceStockOnHand()).toBe('150');
  });

  it('handles standard tracking mode (none) properly', () => {
    page.form.controls.sourceWarehouseId.setValue('wh-source');
    page.form.controls.productId.setValue('prod-none');
    fixture.detectChanges();

    expect(hasRequiredValidator(page.form.controls.batchId)).toBe(false);
    expect(
      fixture.nativeElement.querySelector('[data-testid="standard-tracking-note"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="transfer-batch"]')).toBeNull();
  });

  it('requires batch and populates batch options when product has batch tracking', () => {
    page.form.controls.sourceWarehouseId.setValue('wh-source');
    page.form.controls.productId.setValue('prod-batch');
    fixture.detectChanges();

    expect(hasRequiredValidator(page.form.controls.batchId)).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[data-testid="standard-tracking-note"]'),
    ).toBeNull();
    const batchSelect = fixture.nativeElement.querySelector(
      '[data-testid="transfer-batch"]',
    ) as HTMLSelectElement;
    expect(batchSelect).not.toBeNull();
    expect(page.batchOptions().length).toBe(2);

    // Select batch and verify batch stock on-hand indicator
    page.form.controls.batchId.setValue('BATCH-001');
    fixture.detectChanges();
    expect(page.selectedBatchStockOnHand()).toBe('100.0000');
    const batchStockEl = fixture.nativeElement.querySelector(
      '[data-testid="batch-stock-indicator"]',
    );
    expect(batchStockEl?.textContent).toContain('100.0000 KG');
  });

  it('resets downstream state when source warehouse changes', () => {
    page.form.controls.sourceWarehouseId.setValue('wh-source');
    page.form.controls.productId.setValue('prod-batch');
    page.form.controls.batchId.setValue('BATCH-001');
    fixture.detectChanges();

    expect(page.selectedBatchStockOnHand()).toBe('100.0000');

    // Switch source warehouse
    page.form.controls.sourceWarehouseId.setValue('wh-dest');
    fixture.detectChanges();

    expect(page.form.controls.batchId.value).toBe('');
    expect(page.selectedBatchStockOnHand()).toBeNull();
  });

  it('resets downstream state when product changes', () => {
    page.form.controls.sourceWarehouseId.setValue('wh-source');
    page.form.controls.productId.setValue('prod-batch');
    page.form.controls.batchId.setValue('BATCH-001');
    fixture.detectChanges();

    expect(hasRequiredValidator(page.form.controls.batchId)).toBe(true);

    // Switch to standard product
    page.form.controls.productId.setValue('prod-none');
    fixture.detectChanges();

    expect(page.form.controls.batchId.value).toBe('');
    expect(hasRequiredValidator(page.form.controls.batchId)).toBe(false);
    expect(page.selectedTrackingMode()).toBe('none');
  });

  it('handles negative stock override when authorized', () => {
    expect(hasRequiredValidator(page.form.controls.negativeStockOverrideReason)).toBe(false);

    page.form.controls.negativeStockOverride.setValue(true);
    fixture.detectChanges();

    expect(hasRequiredValidator(page.form.controls.negativeStockOverrideReason)).toBe(true);
    const reasonInput = fixture.nativeElement.querySelector(
      '[data-testid="transfer-override-reason"]',
    );
    expect(reasonInput).not.toBeNull();

    page.form.controls.negativeStockOverride.setValue(false);
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.negativeStockOverrideReason)).toBe(false);
  });

  it('posts transfer successfully and resets form', () => {
    page.form.controls.sourceWarehouseId.setValue('wh-source');
    page.form.controls.destinationWarehouseId.setValue('wh-dest');
    page.form.controls.productId.setValue('prod-none');
    page.form.controls.quantity.setValue('10.00');
    page.form.controls.reason.setValue('Seasonal distribution');
    fixture.detectChanges();

    page.submit();

    expect(mockInventoryApi.createTransferDraft).toHaveBeenCalledWith({
      sourceWarehouseId: 'wh-source',
      destinationWarehouseId: 'wh-dest',
      productId: 'prod-none',
      quantity: '10.00',
      reason: 'Seasonal distribution',
    });

    expect(mockInventoryApi.postTransfer).toHaveBeenCalledWith(
      'draft-xfer-1',
      { reason: 'Seasonal distribution' },
      expect.stringContaining('xfer-post-draft-xfer-1-'),
    );

    expect(page.successMessage()).toBe('Transfer posted successfully.');
    expect(page.form.controls.quantity.value).toBe('');
    expect(page.form.controls.sourceWarehouseId.value).toBe('');
    expect(page.selectedProduct()).toBeNull();
  });

  it('handles transfer reversal workflow via confirm dialog', () => {
    const transfer = page.transfers().at(0) as WarehouseTransferRecord;
    page.reverse(transfer);
    fixture.detectChanges();

    expect(page.reverseConfirmOpen()).toBe(true);

    page.confirmReverse('Stock damaged during transit');
    expect(mockInventoryApi.reverseTransfer).toHaveBeenCalledWith(
      'xfer-1',
      { reason: 'Stock damaged during transit' },
      expect.stringContaining('xfer-reverse-xfer-1-'),
    );

    expect(page.successMessage()).toBe('Transfer reversed successfully.');
    expect(page.reverseConfirmOpen()).toBe(false);
  });

  it('renders recent transfers table with resolved human-readable warehouse and product names', () => {
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector('[data-testid="transfer-row"]');
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('Central Warehouse');
    expect(row.textContent).toContain('North Region Warehouse');
    expect(row.textContent).toContain('Product prod-batch');
    expect(row.textContent).toContain('25.0000 KG');
    expect(row.textContent).toContain('posted');
  });

  it('opens and closes the slide-over transfer inspector drawer', () => {
    const transfer = page.transfers().at(0) as WarehouseTransferRecord;
    page.openInspector(transfer);
    fixture.detectChanges();

    const drawer = fixture.nativeElement.querySelector('.inspector-drawer');
    expect(drawer).not.toBeNull();
    expect(drawer.textContent).toContain('Transfer Inspector');
    expect(drawer.textContent).toContain('Central Warehouse');
    expect(drawer.textContent).toContain('North Region Warehouse');
    expect(drawer.textContent).toContain('Product prod-batch');
    expect(drawer.textContent).toContain('25.0000 KG');
    expect(drawer.textContent).toContain('Rebalance branch stock');

    page.closeInspector();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.inspector-drawer')).toBeNull();
  });

  it('handles product search filtering', async () => {
    const searchInput = fixture.nativeElement.querySelector(
      '[data-testid="transfer-product-search"]',
    ) as HTMLInputElement;
    searchInput.value = 'Urea';
    searchInput.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();

    expect(mockCatalogApi.searchProductOptions).toHaveBeenCalledWith('Urea', 500, 'active');
  });

  it('falls back to raw IDs for historical records outside the cached product/warehouse options', () => {
    mockInventoryApi.listTransfers.mockReturnValue(
      of({
        items: [
          {
            id: 'xfer-hist',
            organizationId: 'org-1',
            sourceWarehouseId: 'wh-archived-1',
            destinationWarehouseId: 'wh-archived-2',
            productId: 'prod-archived-99',
            batchId: null,
            quantityBase: '50.0000',
            enteredQuantity: '50.0000',
            unitCode: 'BAG',
            transferValue: null,
            reason: 'Historical audit transfer',
            status: 'posted',
            postedAt: '2025-05-10T12:00:00Z',
            postedBy: 'user-hist',
            outboundMovementId: 'mov-out-99',
            inboundMovementId: 'mov-in-99',
            reversalOfId: null,
            reversedByTransferId: null,
            version: 1,
          } as WarehouseTransferRecord,
        ],
        meta: { page: 1, pageSize: 25, total: 1 },
      }),
    );

    page.onPageChange(1);
    fixture.detectChanges();

    expect(mockCatalogApi.getProduct).not.toHaveBeenCalled();
    expect(mockLocationsApi.getWarehouse).not.toHaveBeenCalled();

    expect(page.productName('prod-archived-99')).toBe('prod-archived-99');
    expect(page.productSku('prod-archived-99')).toBe('—');
    expect(page.warehouseName('wh-archived-1')).toBe('wh-archived-1');
  });

  it('does not issue per-ID product or warehouse lookups when transfer rows share missing references', () => {
    mockInventoryApi.listTransfers.mockReturnValue(
      of({
        items: [
          {
            id: 'xfer-dup-1',
            organizationId: 'org-1',
            sourceWarehouseId: 'wh-missing-A',
            destinationWarehouseId: 'wh-missing-B',
            productId: 'prod-missing-101',
            batchId: null,
            quantityBase: '10.0000',
            enteredQuantity: '10.0000',
            unitCode: 'KG',
            transferValue: null,
            reason: 'Batch 1',
            status: 'posted',
            postedAt: '2026-08-20T10:00:00Z',
            postedBy: 'user-1',
            outboundMovementId: 'mov-1',
            inboundMovementId: 'mov-2',
            reversalOfId: null,
            reversedByTransferId: null,
            version: 1,
          } as WarehouseTransferRecord,
          {
            id: 'xfer-dup-2',
            organizationId: 'org-1',
            sourceWarehouseId: 'wh-missing-A',
            destinationWarehouseId: 'wh-missing-B',
            productId: 'prod-missing-101',
            batchId: null,
            quantityBase: '20.0000',
            enteredQuantity: '20.0000',
            unitCode: 'KG',
            transferValue: null,
            reason: 'Batch 2',
            status: 'posted',
            postedAt: '2026-08-21T10:00:00Z',
            postedBy: 'user-1',
            outboundMovementId: 'mov-3',
            inboundMovementId: 'mov-4',
            reversalOfId: null,
            reversedByTransferId: null,
            version: 1,
          } as WarehouseTransferRecord,
        ],
        meta: { page: 1, pageSize: 25, total: 2 },
      }),
    );

    page.onPageChange(1);
    fixture.detectChanges();

    expect(mockCatalogApi.getProduct).not.toHaveBeenCalled();
    expect(mockLocationsApi.getWarehouse).not.toHaveBeenCalled();
    expect(page.productName('prod-missing-101')).toBe('prod-missing-101');
    expect(page.warehouseName('wh-missing-A')).toBe('wh-missing-A');
  });

  it('renders transfer history when cached reference maps do not contain row IDs', () => {
    mockInventoryApi.listTransfers.mockReturnValue(
      of({
        items: [
          {
            id: 'xfer-err',
            organizationId: 'org-1',
            sourceWarehouseId: 'wh-deleted-1',
            destinationWarehouseId: 'wh-deleted-2',
            productId: 'prod-deleted-999',
            batchId: null,
            quantityBase: '10.0000',
            enteredQuantity: '10.0000',
            unitCode: 'KG',
            transferValue: null,
            reason: 'Deleted item audit',
            status: 'posted',
            postedAt: '2024-01-01T00:00:00Z',
            postedBy: 'user-hist',
            outboundMovementId: 'mov-err-1',
            inboundMovementId: 'mov-err-2',
            reversalOfId: null,
            reversedByTransferId: null,
            version: 1,
          } as WarehouseTransferRecord,
        ],
        meta: { page: 1, pageSize: 25, total: 1 },
      }),
    );

    page.onPageChange(1);
    fixture.detectChanges();

    expect(page.transfers().length).toBe(1);
    expect(page.productName('prod-deleted-999')).toBe('prod-deleted-999');
    expect(page.warehouseName('wh-deleted-1')).toBe('wh-deleted-1');
  });

  it('renders mobile-specific transfer cards and supports lifecycle actions', () => {
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('[data-testid="transfer-card"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Product prod-batch');
    expect(card.textContent).toContain('SKU-prod-batch');
    expect(card.textContent).toContain('Central Warehouse');
    expect(card.textContent).toContain('North Region Warehouse');
    expect(card.textContent).toContain('25.0000 KG');
    expect(card.textContent).toContain('posted');

    // Inspect action from card
    const inspectBtn = card.querySelector('[data-testid="transfer-inspect-card"]');
    expect(inspectBtn).not.toBeNull();
    inspectBtn.click();
    fixture.detectChanges();
    expect(page.selectedTransfer()?.id).toBe('xfer-1');
    page.closeInspector();

    // Reverse action from card
    const reverseBtn = card.querySelector('[data-testid="transfer-reverse-card"]');
    expect(reverseBtn).not.toBeNull();
    reverseBtn.click();
    fixture.detectChanges();
    expect(page.reverseConfirmOpen()).toBe(true);
  });

  it('retains the desktop table renderer alongside the mobile card container', () => {
    fixture.detectChanges();
    const desktopTable = fixture.nativeElement.querySelector('.desktop-table-view');
    expect(desktopTable).not.toBeNull();
    expect(desktopTable.querySelector('[data-testid="transfers-list"]')).not.toBeNull();
    expect(desktopTable.querySelectorAll('th').length).toBe(7);

    const mobileCards = fixture.nativeElement.querySelector('.mobile-cards-view');
    expect(mobileCards).not.toBeNull();
    expect(mobileCards.querySelector('[data-testid="transfer-card"]')).not.toBeNull();
  });

  it('does not refetch product or warehouse options on subsequent transfers reload', () => {
    mockInventoryApi.listTransfers.mockReturnValue(
      of({
        items: [
          {
            id: 'xfer-page-2',
            organizationId: 'org-1',
            sourceWarehouseId: 'wh-source',
            destinationWarehouseId: 'wh-dest',
            productId: 'prod-batch',
            batchId: 'BATCH-001',
            quantityBase: '15.0000',
            enteredQuantity: '15.0000',
            unitCode: 'KG',
            transferValue: null,
            reason: 'Page 2 transfer',
            status: 'posted',
            postedAt: '2026-08-22T11:00:00Z',
            postedBy: 'user-1',
            outboundMovementId: 'mov-10',
            inboundMovementId: 'mov-11',
            reversalOfId: null,
            reversedByTransferId: null,
            version: 1,
          } as WarehouseTransferRecord,
        ],
        meta: { page: 2, pageSize: 25, total: 2 },
      }),
    );

    page.onPageChange(2);
    fixture.detectChanges();

    // 0 HTTP lookup calls triggered because prod-batch and warehouses are already cached
    expect(mockCatalogApi.getProduct).not.toHaveBeenCalled();
    expect(mockLocationsApi.getWarehouse).not.toHaveBeenCalled();
  });

  describe('Organization Capability & UI Policy Integration', () => {
    it('shows module disabled alert and blocks loading when inventory.transfers module is disabled', () => {
      capabilityValues.set({
        'inventory.transfers': false,
      });
      fixture = TestBed.createComponent(TransfersPage);
      page = fixture.componentInstance;
      fixture.detectChanges();

      expect(page.canUseTransfers()).toBe(false);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain(
        'Warehouse Transfers is not enabled for this organization.',
      );
      expect(compiled.querySelector('[data-testid="transfer-form"]')).toBeNull();
    });

    it('hides module info when moduleInfo feature is disabled', () => {
      capabilityValues.set({
        'inventory.transfers.features.moduleInfo': false,
      });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('agrivio-ui-module-info')).toBeNull();
    });

    it('hides Find Product search and adjusts form grid to 2 columns when productSearch is disabled', () => {
      capabilityValues.set({
        'inventory.transfers.features.productSearch': false,
      });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="transfer-product-search"]')).toBeNull();
      expect(compiled.querySelector('.form-grid--2col')).not.toBeNull();
    });

    it('hides Product Context strip when productContext is disabled', () => {
      capabilityValues.set({
        'inventory.transfers.features.productContext': false,
      });
      page.form.controls.productId.setValue('prod-batch');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="transfer-product-context"]')).toBeNull();
    });

    it('hides on-hand stock and batch stock indicator when stockContext is disabled, while maintaining batch required validation', () => {
      capabilityValues.set({
        'inventory.transfers.features.stockContext': false,
      });
      page.form.controls.sourceWarehouseId.setValue('wh-source');
      page.form.controls.destinationWarehouseId.setValue('wh-dest');
      page.form.controls.productId.setValue('prod-batch');
      page.form.controls.batchId.setValue('BATCH-001');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      // Product context strip should not contain warehouse stock on hand
      expect(compiled.querySelector('.stock-highlight')).toBeNull();
      // Batch stock indicator should be hidden
      expect(compiled.querySelector('[data-testid="batch-stock-indicator"]')).toBeNull();
      // But batch field is still required by product tracking mode
      expect(hasRequiredValidator(page.form.controls.batchId)).toBe(true);
    });

    it('hides Guidance panel and applies single-col layout modifier when guidance is disabled', () => {
      capabilityValues.set({
        'inventory.transfers.features.guidance': false,
      });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.guidance-panel')).toBeNull();
      expect(compiled.querySelector('.context-layout--single-col')).not.toBeNull();
    });

    it('hides Server Transfer Date context when serverTransferDate is disabled', () => {
      capabilityValues.set({
        'inventory.transfers.features.serverTransferDate': false,
      });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.context-date-strip')).toBeNull();
    });

    it('hides Recent Transfers history section and skips transfers list fetch when recentTransfers is disabled', () => {
      capabilityValues.set({
        'inventory.transfers.features.recentTransfers': false,
      });
      mockInventoryApi.listTransfers.mockClear();
      fixture = TestBed.createComponent(TransfersPage);
      page = fixture.componentInstance;
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.history-card')).toBeNull();
      expect(mockInventoryApi.listTransfers).not.toHaveBeenCalled();
    });

    it('disables Post transfer submission when post action is disabled', () => {
      capabilityValues.set({
        'inventory.transfers.actions.post': false,
      });
      page.form.controls.sourceWarehouseId.setValue('wh-source');
      page.form.controls.destinationWarehouseId.setValue('wh-dest');
      page.form.controls.productId.setValue('prod-none');
      page.form.controls.quantity.setValue('10.0000');
      page.form.controls.reason.setValue('Valid transfer');
      fixture.detectChanges();

      expect(page.canPostTransfer()).toBe(false);
      const submitBtn = fixture.nativeElement.querySelector(
        '[data-testid="transfer-submit"]',
      ) as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);

      page.submit();
      expect(mockInventoryApi.createTransferDraft).not.toHaveBeenCalled();
      expect(mockInventoryApi.postTransfer).not.toHaveBeenCalled();
    });

    it('removes Reverse button and blocks reverse method when reverse action is disabled', () => {
      capabilityValues.set({
        'inventory.transfers.actions.reverse': false,
      });
      fixture.detectChanges();

      expect(page.canReverseTransfer()).toBe(false);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="transfer-reverse"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="transfer-reverse-card"]')).toBeNull();

      const item = page.transfers()[0];
      expect(item).toBeDefined();
      if (item) {
        page.reverse(item);
      }
      expect(page.reverseConfirmOpen()).toBe(false);
    });

    it('removes Inspect button and blocks openInspector method when inspect action is disabled', () => {
      capabilityValues.set({
        'inventory.transfers.actions.inspect': false,
      });
      fixture.detectChanges();

      expect(page.canInspectTransfer()).toBe(false);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="transfer-inspect"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="transfer-inspect-card"]')).toBeNull();

      const item = page.transfers()[0];
      expect(item).toBeDefined();
      if (item) {
        page.openInspector(item);
      }
      expect(page.selectedTransfer()).toBeNull();
    });

    it('hides View Stock action button when action is disabled or target stock module is disabled', () => {
      capabilityValues.set({
        'inventory.transfers.actions.viewStock': false,
      });
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="transfer-view-stock"]')).toBeNull();
    });

    it('retains negative-stock override permission control via RBAC, not capability', () => {
      // Capability values do not affect negative stock override
      mockSessionStore.hasPermission = vi.fn(
        (perm: string) => perm !== 'inventory.negative-stock.override',
      );
      fixture = TestBed.createComponent(TransfersPage);
      page = fixture.componentInstance;
      fixture.detectChanges();

      expect(page.canOverride()).toBe(false);
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="transfer-override"]')).toBeNull();
    });
  });
});
