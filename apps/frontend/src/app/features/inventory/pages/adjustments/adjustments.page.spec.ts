import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AdjustmentsPage } from './adjustments.page';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';
import { StockAdjustmentRecord } from '../../models/inventory.models';

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

describe('AdjustmentsPage', () => {
  let fixture: ComponentFixture<AdjustmentsPage>;
  let page: AdjustmentsPage;
  let mockInventoryApi: any;
  let mockCatalogApi: any;
  let mockLocationsApi: any;
  let mockSessionStore: any;

  beforeEach(async () => {
    mockInventoryApi = {
      listAdjustments: vi.fn(() =>
        of({
          items: [
            {
              id: 'adj-1',
              organizationId: 'org-1',
              warehouseId: 'wh-1',
              productId: 'prod-1',
              batchId: null,
              adjustmentType: 'damage',
              direction: 'outbound',
              quantityBase: '10.0000',
              enteredQuantity: '10.0000',
              unitCode: 'KG',
              conversionFactorSnapshot: '1.0000',
              packagingUnitId: null,
              inventoryValue: null,
              reason: 'Bag torn in handling',
              status: 'posted',
              postedAt: '2026-08-20T10:00:00Z',
              postedBy: 'user-1',
              postedMovementId: 'mov-1',
              reversalOfId: null,
              reversedByAdjustmentId: null,
              negativeStockOverride: false,
              version: 1,
            } as StockAdjustmentRecord,
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
              warehouseId: 'wh-1',
              productId: 'prod-batch',
              batchId: 'BATCH-2026-A',
              quantityBase: '150.0000',
              version: 1,
            },
            {
              id: 'bal-2',
              organizationId: 'org-1',
              warehouseId: 'wh-1',
              productId: 'prod-batch',
              batchId: 'BATCH-2026-B',
              quantityBase: '50.0000',
              version: 1,
            },
          ],
          meta: { page: 1, pageSize: 25, total: 2 },
        }),
      ),
      createAdjustmentDraft: vi.fn(() =>
        of({
          id: 'draft-1',
          organizationId: 'org-1',
          warehouseId: 'wh-1',
          productId: 'prod-none',
          batchId: null,
          adjustmentType: 'damage',
          direction: 'outbound',
          quantityBase: '5.0000',
          enteredQuantity: '5.0000',
          unitCode: 'KG',
          conversionFactorSnapshot: '1.0000',
          packagingUnitId: null,
          inventoryValue: null,
          reason: 'Water damage',
          status: 'draft',
          postedAt: null,
          postedBy: null,
          postedMovementId: null,
          reversalOfId: null,
          reversedByAdjustmentId: null,
          negativeStockOverride: false,
          version: 1,
        } as StockAdjustmentRecord),
      ),
      postAdjustment: vi.fn(() =>
        of({
          id: 'draft-1',
          status: 'posted',
        } as StockAdjustmentRecord),
      ),
      reverseAdjustment: vi.fn(() =>
        of({
          id: 'adj-1',
          status: 'reversed',
        } as StockAdjustmentRecord),
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
    };

    mockLocationsApi = {
      listWarehouseOptions: vi.fn(() =>
        of([
          {
            id: 'wh-1',
            organizationId: 'org-1',
            name: 'Central Warehouse',
            status: 'active',
            version: 1,
          },
        ]),
      ),
    };

    mockSessionStore = {
      hasPermission: vi.fn((perm: string) => true),
    };

    await TestBed.configureTestingModule({
      imports: [AdjustmentsPage],
      providers: [
        provideRouter([]),
        { provide: InventoryApi, useValue: mockInventoryApi },
        { provide: CatalogApi, useValue: mockCatalogApi },
        { provide: BranchesWarehousesApi, useValue: mockLocationsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdjustmentsPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders page header and module info section with business guidance', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.page-head__title')?.textContent).toContain('Stock adjustments');
    const moduleInfo = compiled.querySelector('agrivio-ui-module-info');
    expect(moduleInfo).not.toBeNull();
    expect(moduleInfo?.textContent).toContain('About Stock Adjustments');
  });

  it('populates warehouses and products on init', () => {
    expect(page.warehouses().length).toBe(1);
    expect(page.products().length).toBe(3);
    expect(page.adjustments().length).toBe(1);
  });

  it('renders product context strip and tracking chip when a product is selected', () => {
    page.form.controls.warehouseId.setValue('wh-1');
    page.form.controls.productId.setValue('prod-batch');
    fixture.detectChanges();

    const contextEl = fixture.nativeElement.querySelector(
      '[data-testid="adjustment-product-context"]',
    );
    expect(contextEl).not.toBeNull();
    expect(contextEl?.textContent).toContain('Product prod-batch');
    expect(contextEl?.textContent).toContain('SKU-prod-batch');
    expect(contextEl?.textContent).toContain('KG');
    expect(contextEl?.textContent).toContain('Batch Tracked');
    expect(page.productStockOnHand()).toBe('200');
  });

  it('keeps batch optional and shows standard tracking notice when product tracking is none', () => {
    page.form.controls.warehouseId.setValue('wh-1');
    page.form.controls.productId.setValue('prod-none');
    fixture.detectChanges();

    expect(hasRequiredValidator(page.form.controls.batchId)).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="standard-tracking-note"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="adjustment-batch"]')).toBeNull();
  });

  it('requires batch and renders batch options when product has batch tracking', () => {
    page.form.controls.warehouseId.setValue('wh-1');
    page.form.controls.productId.setValue('prod-batch');
    fixture.detectChanges();

    expect(hasRequiredValidator(page.form.controls.batchId)).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="standard-tracking-note"]')).toBeNull();
    const batchSelect = fixture.nativeElement.querySelector(
      '[data-testid="adjustment-batch"]',
    ) as HTMLSelectElement;
    expect(batchSelect).not.toBeNull();
    expect(page.batchOptions().length).toBe(2);

    // Select batch and verify batch on-hand indicator
    page.form.controls.batchId.setValue('BATCH-2026-A');
    fixture.detectChanges();
    expect(page.selectedBatchStockOnHand()).toBe('150.0000');
    const batchStockEl = fixture.nativeElement.querySelector('[data-testid="batch-stock-indicator"]');
    expect(batchStockEl?.textContent).toContain('150.0000 KG');
  });

  it('manages correction direction and inventory value validators', () => {
    page.form.controls.adjustmentType.setValue('correction');
    fixture.detectChanges();

    // Default correction direction is outbound, inventoryValue is not required
    expect(hasRequiredValidator(page.form.controls.inventoryValue)).toBe(false);

    // Switch to inbound direction
    page.form.controls.direction.setValue('inbound');
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.inventoryValue)).toBe(true);

    // Switch back to outbound direction -> inventoryValue should clear and not be required
    page.form.controls.direction.setValue('outbound');
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.inventoryValue)).toBe(false);
    expect(page.form.controls.inventoryValue.value).toBe('');

    // Switch back to damage -> direction resets to outbound, inventoryValue not required
    page.form.controls.adjustmentType.setValue('damage');
    fixture.detectChanges();
    expect(page.form.controls.direction.value).toBe('outbound');
    expect(hasRequiredValidator(page.form.controls.inventoryValue)).toBe(false);
  });

  it('manages negative stock override conditional validation', () => {
    expect(hasRequiredValidator(page.form.controls.negativeStockOverrideReason)).toBe(false);

    page.form.controls.negativeStockOverride.setValue(true);
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.negativeStockOverrideReason)).toBe(true);

    page.form.controls.negativeStockOverride.setValue(false);
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.negativeStockOverrideReason)).toBe(false);
    expect(page.form.controls.negativeStockOverrideReason.value).toBe('');
  });

  it('submits valid adjustment and triggers draft creation + posting', () => {
    page.form.controls.warehouseId.setValue('wh-1');
    page.form.controls.productId.setValue('prod-none');
    page.form.controls.adjustmentType.setValue('damage');
    page.form.controls.quantity.setValue('5.0000');
    page.form.controls.reason.setValue('Water damage in storage');
    fixture.detectChanges();

    expect(page.form.valid).toBe(true);
    page.submit();

    expect(mockInventoryApi.createAdjustmentDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        warehouseId: 'wh-1',
        productId: 'prod-none',
        adjustmentType: 'damage',
        quantity: '5.0000',
        reason: 'Water damage in storage',
      }),
    );
    expect(mockInventoryApi.postAdjustment).toHaveBeenCalledWith(
      'draft-1',
      expect.objectContaining({
        reason: 'Water damage in storage',
      }),
      expect.stringContaining('adj-post-draft-1-'),
    );
    expect(page.successMessage()).toContain('posted successfully');
  });

  it('prevents double submission while saving', () => {
    page.form.controls.warehouseId.setValue('wh-1');
    page.form.controls.productId.setValue('prod-none');
    page.form.controls.adjustmentType.setValue('damage');
    page.form.controls.quantity.setValue('5.0000');
    page.form.controls.reason.setValue('Test');
    page.saving.set(true);

    page.submit();
    expect(mockInventoryApi.createAdjustmentDraft).not.toHaveBeenCalled();
  });

  it('opens confirm dialog and calls reverseAdjustment when confirmed', () => {
    const adjustmentToReverse = page.adjustments()[0]!;
    page.reverse(adjustmentToReverse);
    expect(page.reverseConfirmOpen()).toBe(true);

    page.confirmReverse('Damaged count was recount verified');
    expect(mockInventoryApi.reverseAdjustment).toHaveBeenCalledWith(
      'adj-1',
      { reason: 'Damaged count was recount verified' },
      expect.stringContaining('adj-reverse-adj-1-'),
    );
    expect(page.reverseConfirmOpen()).toBe(false);
    expect(page.successMessage()).toContain('reversed successfully');
  });
});
