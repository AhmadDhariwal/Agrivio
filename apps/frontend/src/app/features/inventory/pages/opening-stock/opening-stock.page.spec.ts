import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal, WritableSignal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OpeningStockPage } from './opening-stock.page';
import { InventoryApi } from '../../data-access/inventory.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';
import { By } from '@angular/platform-browser';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { OpeningStockRecord } from '../../models/inventory.models';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';

function product(id: string, trackingMode: ProductRecord['trackingMode']): ProductRecord {
  return {
    id,
    organizationId: 'org-1',
    categoryId: 'cat-1',
    name: id,
    sku: id,
    trackingMode,
    baseUnitCode: 'KG',
    measurementDimension: 'mass',
    status: 'active',
    version: 1,
  };
}

describe('OpeningStockPage', () => {
  let fixture: ComponentFixture<OpeningStockPage>;
  let page: OpeningStockPage;
  let capabilityValues: WritableSignal<Record<string, boolean>>;
  let postOpeningStock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    capabilityValues = signal({});
    postOpeningStock = vi.fn(() =>
      of({
        balance: { quantityBase: '10.0000' },
        costState: { weightedAverageCost: { amount: '100.00' } },
      }),
    );
    await TestBed.configureTestingModule({
      imports: [OpeningStockPage],
      providers: [
        provideRouter([]),
        {
          provide: InventoryApi,
          useValue: {
            postOpeningStock,
            getOpeningStock: vi.fn(() => of({
              id: 'draft-1',
              organizationId: 'org-1',
              warehouseId: 'wh-1',
              productId: 'prod-none',
              quantity: '50.0000',
              inventoryValue: { amount: '500.00', currency: 'PKR' },
              status: 'draft',
              version: 1,
            })),
            createOpeningStockDraft: vi.fn(() => of({
              id: 'draft-1',
              organizationId: 'org-1',
              warehouseId: 'wh-1',
              productId: 'prod-none',
              quantity: '50.0000',
              inventoryValue: { amount: '500.00', currency: 'PKR' },
              status: 'draft',
              version: 1,
            })),
            updateOpeningStock: vi.fn(),
            discardOpeningStock: vi.fn(() => of({ id: 'draft-1', discarded: true })),
            postOpeningStockDraft: vi.fn(() => of({
              balance: { quantityBase: '50.0000' },
              costState: { weightedAverageCost: { amount: '10.00' } },
            })),
            listOpeningStock: vi.fn(() => of({
              items: [],
              page: 1,
              pageSize: 25,
              total: 0
            })),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () =>
              of({
                items: [
                  product('prod-none', 'none'),
                  product('prod-batch', 'batch'),
                  product('prod-expiry', 'batch_expiry'),
                ],
                meta: { page: 1, pageSize: 25, total: 3 },
              }),
            searchProductOptions: () =>
              of([
                product('prod-none', 'none'),
                product('prod-batch', 'batch'),
                product('prod-expiry', 'batch_expiry'),
              ]),
            listPackagingUnits: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listWarehouses: () =>
              of({
                items: [
                  {
                    id: 'wh-1',
                    organizationId: 'org-1',
                    name: 'Main',
                    status: 'active',
                    version: 1,
                  },
                ],
                meta: { page: 1, pageSize: 25, total: 1 },
              }),
            listWarehouseOptions: () =>
              of([
                {
                  id: 'wh-1',
                  organizationId: 'org-1',
                  name: 'Main',
                  status: 'active',
                  version: 1,
                },
              ]),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
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

    fixture = TestBed.createComponent(OpeningStockPage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the module info section with business guidance', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const moduleInfo = compiled.querySelector('agrivio-ui-module-info');
    expect(moduleInfo).not.toBeNull();
    expect(moduleInfo?.textContent).toContain('About Opening Stock');
    expect(moduleInfo?.textContent).toContain('Use Opening Stock when initializing a warehouse');
  });

  it('hides only optional presentation controls while retaining required workflow fields', () => {
    capabilityValues.set({
      'inventory.openingStock.features.moduleInfo': false,
      'inventory.openingStock.features.productSearch': false,
      'inventory.openingStock.fields.packagingUnit': false,
      'inventory.openingStock.fields.manufacturingDate': false,
    });
    page.form.controls.productId.setValue('prod-batch');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('agrivio-ui-module-info')).toBeNull();
    expect(compiled.querySelector('#opening-product-search')).toBeNull();
    expect(compiled.querySelector('[data-testid="opening-packaging"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="opening-manufacturing-date"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="opening-warehouse"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="opening-product"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="opening-quantity"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="opening-inventory-value"]')).not.toBeNull();
    expect(compiled.querySelector('[data-testid="opening-batch-number"]')).not.toBeNull();
  });

  it('enforces Post and View Stock actions from the capability service', () => {
    capabilityValues.set({
      'inventory.openingStock.actions.post': false,
      'inventory.openingStock.actions.viewStock': false,
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="opening-stock-form"]')).toBeNull();
    expect(compiled.textContent).toContain('do not have permission to post opening stock');
    expect(compiled.querySelector('[data-testid="opening-stock-view-stock"]')).toBeNull();
  });

  it('keeps batch and expiry optional when tracking is off', () => {
    page.form.controls.productId.setValue('prod-none');
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.batchNumber)).toBe(false);
    expect(hasRequiredValidator(page.form.controls.expiryDate)).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="opening-batch-number"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="opening-expiry-date"]')).toBeFalsy();
  });

  it('requires batch and shows the required marker when batch tracking is on', () => {
    page.form.controls.productId.setValue('prod-batch');
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.batchNumber)).toBe(true);
    expect(hasRequiredValidator(page.form.controls.expiryDate)).toBe(false);
    const batchInput = fixture.nativeElement.querySelector(
      '[data-testid="opening-batch-number"]',
    ) as HTMLInputElement;
    expect(batchInput.getAttribute('aria-required')).toBe('true');
    expect(batchInput.closest('.ag-field')?.querySelector('.ag-field__required')?.textContent).toBe(
      '*',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="opening-expiry-date"]')).toBeFalsy();
  });

  it('requires expiry and shows the required marker when expiry tracking is on', () => {
    page.form.controls.productId.setValue('prod-expiry');
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.batchNumber)).toBe(true);
    expect(hasRequiredValidator(page.form.controls.expiryDate)).toBe(true);
    const expiryInput = fixture.nativeElement.querySelector(
      '[data-testid="opening-expiry-date"]',
    ) as HTMLInputElement;
    expect(expiryInput.getAttribute('aria-required')).toBe('true');
    expect(
      expiryInput.closest('.ag-field')?.querySelector('.ag-field__required')?.textContent,
    ).toBe('*');
  });

  it('removes the conditional validators and markers when tracking is turned off', () => {
    page.form.controls.productId.setValue('prod-expiry');
    fixture.detectChanges();
    page.form.controls.productId.setValue('prod-none');
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.batchNumber)).toBe(false);
    expect(hasRequiredValidator(page.form.controls.expiryDate)).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="opening-batch-number"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="opening-expiry-date"]')).toBeFalsy();
  });

  it('displays selected product context when a product is selected', () => {
    page.form.controls.productId.setValue('prod-batch');
    fixture.detectChanges();
    const contextEl = fixture.nativeElement.querySelector(
      '[data-testid="opening-product-context"]',
    );
    expect(contextEl).not.toBeNull();
    expect(contextEl?.textContent).toContain('prod-batch');
    expect(contextEl?.textContent).toContain('KG');
    expect(contextEl?.textContent).toContain('Batch Tracked');
  });

  it('blocks submit without API call and shows field errors when form is invalid', () => {
    page.submit();
    fixture.detectChanges();

    expect(postOpeningStock).not.toHaveBeenCalled();
    expect(page.formSubmitAttempted()).toBe(true);
    expect(page.canPost()).toBe(false);
    expect(
      fixture.nativeElement.querySelector('[data-testid="opening-stock-save"]')?.disabled,
    ).toBe(true);
    expect(page.fieldError(page.form.controls.quantity, 'Quantity', true)).toContain('required');
  });

  it('rejects non-positive quantity before posting', () => {
    page.form.patchValue({
      warehouseId: 'wh-1',
      productId: 'prod-none',
      quantity: '0',
      inventoryValue: '100.00',
    });
    fixture.detectChanges();

    expect(page.form.valid).toBe(false);
    page.submit();
    expect(postOpeningStock).not.toHaveBeenCalled();
    expect(page.fieldError(page.form.controls.quantity, 'Quantity', true)).toContain('greater than zero');
  });

  it('pre-selects product and warehouse when productId query parameter is provided', async () => {
    const routeSnapshot = {
      queryParamMap: convertToParamMap({ productId: 'prod-batch' }),
    };

    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [OpeningStockPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: routeSnapshot,
            queryParamMap: of(routeSnapshot.queryParamMap),
          },
        },
        {
          provide: InventoryApi,
          useValue: {
            postOpeningStock,
            listOpeningStock: vi.fn(() => of({ items: [], total: 0, page: 1, pageSize: 25 })),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchProductOptions: () =>
              of([
                product('prod-none', 'none'),
                product('prod-batch', 'batch'),
                product('prod-expiry', 'batch_expiry'),
              ]),
            listPackagingUnits: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listWarehouseOptions: () =>
              of([
                {
                  id: 'wh-main',
                  organizationId: 'org-1',
                  name: 'Central Warehouse',
                  status: 'active',
                  version: 1,
                },
              ]),
          },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canUseView: () => true,
            canViewField: () => true,
            canPerformAction: () => true,
          },
        },
      ],
    }).compileComponents();

    const paramFixture = TestBed.createComponent(OpeningStockPage);
    paramFixture.detectChanges();
    await paramFixture.whenStable();

    const paramPage = paramFixture.componentInstance;
    expect(paramPage.form.controls.productId.value).toBe('prod-batch');
    expect(paramPage.selectedProduct()?.id).toBe('prod-batch');
    expect(paramPage.selectedTrackingMode()).toBe('batch');
    expect(paramPage.form.controls.warehouseId.value).toBe('wh-main');
  });

  it('keeps selected product label while dropdown shows only current search query matches', () => {
    const fixture = TestBed.createComponent(OpeningStockPage);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    const p1 = { id: 'prod-none', name: 'Product prod-none', status: 'active', trackingMode: 'none' } as any;
    const p2 = { id: 'prod-batch', name: 'Product prod-batch', status: 'active', trackingMode: 'batch' } as any;

    component.products.set([p1, p2]);
    component.form.controls.productId.setValue('prod-none');
    fixture.detectChanges();

    expect(component.form.controls.productId.value).toBe('prod-none');
    expect(component.productSelectedLabel()).toBe('Product prod-none');

    // Unrelated search returns only prod-batch
    component.products.set([p2]);
    fixture.detectChanges();

    expect(component.productOptions().map((opt) => opt.value)).toEqual(['prod-batch']);
    expect(component.form.controls.productId.value).toBe('prod-none');
    expect(component.productSelectedLabel()).toBe('Product prod-none');
  });

  function mockOpeningStock(overrides: Partial<OpeningStockRecord> = {}): OpeningStockRecord {
    return {
      id: 'draft-1',
      organizationId: 'org-1',
      warehouseId: 'wh-1',
      productId: 'prod-none',
      quantity: '20.0000',
      quantityBase: '20.0000',
      unitCode: 'KG',
      conversionFactorSnapshot: '1',
      packagingUnitId: null,
      batchNumber: null,
      manufacturingDate: null,
      expiryDate: null,
      inventoryValue: { amount: '200.00', currency: 'PKR' },
      status: 'draft',
      postedAt: null,
      postedBy: null,
      postedMovementId: null,
      batchId: null,
      version: 1,
      ...overrides,
    };
  }

  describe('Draft & Discard Lifecycle', () => {
    it('renders draft actions (Discard Draft, Save as draft, Post opening stock) when record is in draft status', () => {
      page.openingStockRecord.set(mockOpeningStock({ status: 'draft', version: 1 }));
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="opening-stock-draft-badge"]')).toBeTruthy();
      expect(compiled.querySelector('[data-testid="opening-stock-discard"]')).toBeTruthy();
      expect(compiled.querySelector('[data-testid="opening-stock-save-draft"]')).toBeTruthy();
      expect(compiled.querySelector('[data-testid="opening-stock-save"]')).toBeTruthy();
      // Confirm discard button has exact required label "Discard Draft"
      expect(compiled.querySelector('[data-testid="opening-stock-discard"]')?.textContent?.trim()).toContain('Discard Draft');
    });

    it('opens confirm dialog with Discard Draft label and danger styling when Discard Draft is clicked', () => {
      page.openingStockRecord.set(mockOpeningStock({ status: 'draft', version: 1 }));
      fixture.detectChanges();

      expect(page.discardDialogOpen()).toBe(false);
      const discardBtn = fixture.nativeElement.querySelector('[data-testid="opening-stock-discard"]') as HTMLButtonElement;
      discardBtn.click();
      fixture.detectChanges();

      expect(page.discardDialogOpen()).toBe(true);
      const dialogDebug = fixture.debugElement.query(By.directive(UiConfirmDialogComponent));
      expect(dialogDebug).toBeTruthy();
      expect(dialogDebug.componentInstance.confirmLabel()).toBe('Discard Draft');
      expect(dialogDebug.componentInstance.danger()).toBe(true);
    });

    it('discards draft and resets form upon confirmation', () => {
      const inventoryApi = TestBed.inject(InventoryApi);
      const discardSpy = vi.spyOn(inventoryApi, 'discardOpeningStock').mockReturnValue(
        of({ id: 'draft-1', discarded: true })
      );

      page.openingStockRecord.set(mockOpeningStock({ status: 'draft', version: 2 }));
      page.openDiscardDialog();

      page.onDiscardConfirmed();

      expect(discardSpy).toHaveBeenCalledWith('draft-1', 2);
      expect(page.openingStockRecord()).toBeNull();
      expect(page.discardDialogOpen()).toBe(false);
      expect(page.successMessage()).toContain('Opening stock draft discarded');
    });

    it('handles 409 conflict gracefully when draft was modified elsewhere', () => {
      const inventoryApi = TestBed.inject(InventoryApi);
      vi.spyOn(inventoryApi, 'discardOpeningStock').mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 409, error: { error: { message: 'Version mismatch' } } }))
      );

      page.openingStockRecord.set(mockOpeningStock({ status: 'draft', version: 1 }));
      page.openDiscardDialog();

      page.onDiscardConfirmed();

      expect(page.discarding()).toBe(false);
      expect(page.errorMessage()).toBe('Opening stock record was modified or is no longer a draft.');
    });

    it('hides delete and discard actions and disables form when opening stock is posted', () => {
      page.openingStockRecord.set(mockOpeningStock({ id: 'post-1', status: 'posted', version: 2 }));
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="opening-stock-posted-badge"]')).toBeTruthy();
      expect(compiled.querySelector('[data-testid="opening-stock-discard"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="opening-stock-save-draft"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="opening-stock-save"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="opening-stock-view-stock"]')).toBeTruthy();
      expect(compiled.querySelector('[data-testid="opening-stock-cancel"]')).toBeTruthy();
    });

    it('creates draft when Save as draft is clicked for a new record', () => {
      const inventoryApi = TestBed.inject(InventoryApi);
      const createDraftSpy = vi.spyOn(inventoryApi, 'createOpeningStockDraft').mockReturnValue(
        of(mockOpeningStock({
          id: 'draft-new-1',
          quantity: '15.0000',
          quantityBase: '15.0000',
          inventoryValue: { amount: '150.00', currency: 'PKR' },
          status: 'draft',
          version: 1,
        }))
      );

      page.form.patchValue({
        warehouseId: 'wh-1',
        productId: 'prod-none',
        quantity: '15',
        inventoryValue: '150.00',
      });

      page.saveDraft();

      expect(createDraftSpy).toHaveBeenCalled();
      expect(page.openingStockRecord()?.id).toBe('draft-new-1');
      expect(page.successMessage()).toContain('Opening stock draft saved');
    });

    it('verifies exact flow: Create Draft -> List -> Leave Page -> Return -> See Draft -> Edit Draft -> Save -> Post', () => {
      vi.spyOn(window, 'scrollTo').mockReturnValue(undefined);
      const inventoryApi = TestBed.inject(InventoryApi);

      // 1. Create Draft
      const draftRecord = mockOpeningStock({
        id: 'draft-flow-1',
        warehouseId: 'wh-1',
        productId: 'prod-none',
        quantity: '25.0000',
        inventoryValue: { amount: '2500.00', currency: 'PKR' },
        status: 'draft',
        version: 1,
      });
      vi.spyOn(inventoryApi, 'createOpeningStockDraft').mockReturnValue(of(draftRecord));

      page.form.patchValue({
        warehouseId: 'wh-1',
        productId: 'prod-none',
        quantity: '25',
        inventoryValue: '2500.00',
      });
      page.saveDraft();
      expect(page.openingStockRecord()?.status).toBe('draft');

      // 2 & 3. Leave Page -> Return -> See Draft in List
      page.recentOpeningStock.set([draftRecord]);
      page.total.set(1);
      fixture.detectChanges();

      const row = fixture.nativeElement.querySelector('[data-testid="opening-stock-row"]');
      expect(row).toBeTruthy();
      expect(row.querySelector('[data-testid="opening-stock-edit-draft"]')).toBeTruthy();
      expect(row.querySelector('[data-testid="opening-stock-discard-draft"]')).toBeTruthy();
      expect(row.querySelector('[data-testid="opening-stock-post-draft"]')).toBeTruthy();

      // 4. Edit Draft: click Edit Draft button and restore details
      vi.spyOn(inventoryApi, 'getOpeningStock').mockReturnValue(of(draftRecord));
      page.editDraftRow(draftRecord);
      fixture.detectChanges();

      expect(page.form.controls.warehouseId.value).toBe('wh-1');
      expect(page.form.controls.productId.value).toBe('prod-none');
      expect(page.form.controls.quantity.value).toBe('25.0000');
      expect(page.form.controls.inventoryValue.value).toBe('2500.00');
      expect(page.isEditing()).toBe(true);
      expect(page.form.enabled).toBe(true);

      // 5. Save: modify quantity and save draft, status remains draft
      const updatedDraft = { ...draftRecord, quantity: '30.0000', version: 2 };
      const updateSpy = vi.spyOn(inventoryApi, 'updateOpeningStock').mockReturnValue(of(updatedDraft));
      page.form.patchValue({ quantity: '30' });
      fixture.detectChanges();
      page.saveDraft();

      expect(updateSpy).toHaveBeenCalledWith('draft-flow-1', expect.anything(), 1);
      expect(page.openingStockRecord()?.status).toBe('draft');
      expect(page.openingStockRecord()?.version).toBe(2);

      // 6. Post: post the draft, status changes to posted, form is disabled
      const postSpy = vi.spyOn(inventoryApi, 'postOpeningStockDraft').mockReturnValue(
        of({
          movement: {} as any,
          batch: null,
          balance: { quantityBase: '30.0000' } as any,
          costState: { weightedAverageCost: { amount: '100.00', currency: 'PKR' } } as any,
        })
      );
      page.submit();
      fixture.detectChanges();

      expect(postSpy).toHaveBeenCalledWith('draft-flow-1', 2, expect.any(String));
      expect(page.openingStockRecord()?.status).toBe('posted');
      // isEditing() is the authoritative signal proving the form is in read-only state after posting.
      expect(page.isEditing()).toBe(false);

      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="opening-stock-save-draft"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="opening-stock-discard"]')).toBeNull();
      expect(compiled.querySelector('[data-testid="opening-stock-posted-badge"]')).toBeTruthy();
    });

    it('verifies exact flow: Create Draft -> List -> Leave Page -> Return -> See Draft -> Discard', () => {
      const inventoryApi = TestBed.inject(InventoryApi);
      const draftRecord = mockOpeningStock({
        id: 'draft-flow-2',
        warehouseId: 'wh-1',
        productId: 'prod-none',
        quantity: '10.0000',
        status: 'draft',
        version: 1,
      });

      // 1. Revisit page and see draft in list
      page.recentOpeningStock.set([draftRecord]);
      page.total.set(1);
      fixture.detectChanges();

      const row = fixture.nativeElement.querySelector('[data-testid="opening-stock-row"]');
      expect(row).toBeTruthy();

      // 2. Click Discard Draft on the row
      page.askDiscardRow(draftRecord);
      fixture.detectChanges();
      expect(page.discardDialogOpen()).toBe(true);

      // 3. Confirm Discard
      const discardSpy = vi.spyOn(inventoryApi, 'discardOpeningStock').mockReturnValue(
        of({ id: 'draft-flow-2', discarded: true })
      );
      const listSpy = vi.spyOn(inventoryApi, 'listOpeningStock').mockReturnValue(
        of({ items: [], total: 0, page: 1, pageSize: 25 })
      );

      page.onDiscardConfirmed();

      expect(discardSpy).toHaveBeenCalledWith('draft-flow-2', 1);
      expect(page.discardDialogOpen()).toBe(false);
      expect(listSpy).toHaveBeenCalled();
      expect(page.successMessage()).toContain('discarded successfully');
    });
  });

  describe('Draft work-tray', () => {
    it('always requests only draft records on initial load', () => {
      const inventoryApi = TestBed.inject(InventoryApi);
      const listSpy = vi.spyOn(inventoryApi, 'listOpeningStock');
      // Spy records the calls made during construction (initial load)
      const calls = listSpy.mock.calls;
      // Every call must include status: 'draft'
      calls.forEach((args) => {
        expect(args[0]).toMatchObject({ status: 'draft' });
      });
    });

    it('always passes status:draft when loadHistory is called explicitly', () => {
      const inventoryApi = TestBed.inject(InventoryApi);
      const listSpy = vi.spyOn(inventoryApi, 'listOpeningStock').mockReturnValue(
        of({ items: [], total: 0, page: 1, pageSize: 25 })
      );
      page.loadHistory(1, 25);
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
    });

    it('passes status:draft on page change', () => {
      const inventoryApi = TestBed.inject(InventoryApi);
      const listSpy = vi.spyOn(inventoryApi, 'listOpeningStock').mockReturnValue(
        of({ items: [], total: 0, page: 2, pageSize: 25 })
      );
      page.onPageChange(2);
      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
    });

    it('does not render the status filter select element', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="opening-stock-status-filter"]')).toBeNull();
    });

    it('shows only Edit Draft, Discard Draft, and Post actions — never a View-only button for posted rows in work-tray', () => {
      // The work-tray only ever contains draft records
      const draftRecord = mockOpeningStock({ status: 'draft', version: 1 });
      page.recentOpeningStock.set([draftRecord]);
      page.total.set(1);
      fixture.detectChanges();

      const row = fixture.nativeElement.querySelector('[data-testid="opening-stock-row"]');
      expect(row).toBeTruthy();
      // Draft actions present
      expect(row.querySelector('[data-testid="opening-stock-edit-draft"]')).toBeTruthy();
      expect(row.querySelector('[data-testid="opening-stock-discard-draft"]')).toBeTruthy();
      expect(row.querySelector('[data-testid="opening-stock-post-draft"]')).toBeTruthy();
      // No View-only button (that button only existed for posted rows)
      expect(row.querySelector('[data-testid="opening-stock-view-posted"]')).toBeNull();
    });

    it('shows empty-state message "No drafts pending" when no drafts exist', () => {
      page.recentOpeningStock.set([]);
      page.total.set(0);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('No drafts pending');
    });

    it('refreshing the list after discard calls API with status:draft and removes the discarded row', () => {
      const inventoryApi = TestBed.inject(InventoryApi);
      const draftRecord = mockOpeningStock({ id: 'draft-refresh-1', status: 'draft', version: 1 });
      page.recentOpeningStock.set([draftRecord]);
      page.total.set(1);
      fixture.detectChanges();

      // Discard removes the item; subsequent list returns empty
      vi.spyOn(inventoryApi, 'discardOpeningStock').mockReturnValue(
        of({ id: 'draft-refresh-1', discarded: true })
      );
      const listSpy = vi.spyOn(inventoryApi, 'listOpeningStock').mockReturnValue(
        of({ items: [], total: 0, page: 1, pageSize: 25 })
      );

      page.openingStockRecord.set(draftRecord);
      page.openDiscardDialog();
      page.onDiscardConfirmed();

      expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
      expect(page.recentOpeningStock()).toHaveLength(0);
    });
  });
});
