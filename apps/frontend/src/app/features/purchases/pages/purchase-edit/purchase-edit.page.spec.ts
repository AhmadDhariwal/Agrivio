import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { PurchaseEditPage } from './purchase-edit.page';
import { PurchasesApi } from '../../data-access/purchases.api';
import { ReturnsApi } from '../../data-access/returns.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { ProductRecord } from '../../../catalog/models/catalog.models';
import { PurchaseRecord } from '../../models/purchases.models';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

const mockProductNone: ProductRecord = {
  id: 'prod-1',
  organizationId: 'org-1',
  categoryId: 'cat-1',
  name: 'Standard Urea',
  sku: 'UREA-STD',
  trackingMode: 'none',
  baseUnitCode: 'KG',
  measurementDimension: 'mass',
  status: 'active',
  version: 1,
};

const mockProductBatch: ProductRecord = {
  id: 'prod-2',
  organizationId: 'org-1',
  categoryId: 'cat-1',
  name: 'Batch Fertilizer',
  sku: 'FERT-BATCH',
  trackingMode: 'batch',
  baseUnitCode: 'BAG',
  measurementDimension: 'mass',
  status: 'active',
  version: 1,
};

const mockProductExpiry: ProductRecord = {
  id: 'prod-3',
  organizationId: 'org-1',
  categoryId: 'cat-2',
  name: 'Bio Pesticide',
  sku: 'PEST-BIO',
  trackingMode: 'batch_expiry',
  baseUnitCode: 'LTR',
  measurementDimension: 'volume',
  status: 'active',
  version: 1,
};

const mockPostedRecord: PurchaseRecord = {
  id: 'pur-100',
  organizationId: 'org-1',
  branchId: null,
  warehouseId: 'wh-1',
  warehouseNameSnapshot: 'Main Warehouse',
  supplierId: 'sup-1',
  supplierNameSnapshot: 'Engro Fertilizers',
  supplierInvoiceReference: 'ENG-1001',
  purchaseDate: '2026-03-01',
  notes: 'Quarterly restock',
  status: 'posted',
  lines: [
    {
      productId: 'prod-1',
      productNameSnapshot: 'Standard Urea',
      trackingModeSnapshot: 'none',
      packagingUnitId: null,
      unitCodeSnapshot: 'KG',
      conversionFactorSnapshot: '1',
      quantity: '50',
      quantityBase: '50',
      unitCost: { amount: '100.00', currency: 'PKR' },
      lineProductAmount: { amount: '5000.00', currency: 'PKR' },
      batchNumber: null,
      manufacturingDate: null,
      expiryDate: null,
    },
  ],
  landedCosts: {
    freight: { amount: '200.00', currency: 'PKR' },
    loading: { amount: '100.00', currency: 'PKR' },
    transport: { amount: '0.00', currency: 'PKR' },
    other: { amount: '0.00', currency: 'PKR' },
  },
  goodsTotal: { amount: '5000.00', currency: 'PKR' },
  landedCostTotal: { amount: '300.00', currency: 'PKR' },
  purchaseTotal: { amount: '5300.00', currency: 'PKR' },
  paidTotal: { amount: '2000.00', currency: 'PKR' },
  payableTotal: { amount: '3300.00', currency: 'PKR' },
  payments: [
    {
      accountId: 'acc-1',
      accountNameSnapshot: 'Cash Register',
      accountTypeSnapshot: 'cash',
      amount: { amount: '2000.00', currency: 'PKR' },
      paymentId: 'pay-1',
    },
  ],
  version: 2,
  createdBy: 'usr-1',
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:30:00.000Z',
  postedAt: '2026-03-01T10:30:00.000Z',
  postedBy: 'usr-admin',
};

describe('PurchaseEditPage', () => {
  let mockGetPurchase: () => Observable<PurchaseRecord | null>;
  let createPurchase: ReturnType<typeof vi.fn>;
  let disabledCapabilities: Set<string>;
  let searchProductOptionsCalls = 0;
  let searchSupplierOptionsCalls = 0;

  beforeEach(async () => {
    mockGetPurchase = () => of(null);
    createPurchase = vi.fn(() => of({ id: 'pur-new', version: 1 } as PurchaseRecord));
    disabledCapabilities = new Set();
    searchProductOptionsCalls = 0;
    searchSupplierOptionsCalls = 0;

    await TestBed.configureTestingModule({
      imports: [PurchaseEditPage],
      providers: [
        provideRouter([]),
        {
          provide: PurchasesApi,
          useValue: {
            getPurchase: () => mockGetPurchase(),
            createPurchase,
            updatePurchase: () => of({} as PurchaseRecord),
            discardPurchase: () => of({} as PurchaseRecord),
            postPurchase: () => of({} as PurchaseRecord),
            cancelPurchase: () => of({} as PurchaseRecord),
          },
        },
        {
          provide: ReturnsApi,
          useValue: {
            createReturn: () => of({ id: 'ret-1', version: 1 }),
            postReturn: () => of({}),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchProductOptions: () => {
              searchProductOptionsCalls += 1;
              return of([mockProductNone, mockProductBatch, mockProductExpiry]);
            },
            listPackagingUnits: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listWarehouses: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listWarehouseOptions: () => of([{ id: 'wh-1', name: 'Main Warehouse', status: 'active' }]),
          },
        },
        {
          provide: SuppliersApi,
          useValue: {
            listSuppliers: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchSupplierOptions: () => {
              searchSupplierOptionsCalls += 1;
              return of([{ id: 'sup-1', name: 'Engro Fertilizers', status: 'active' }]);
            },
          },
        },
        {
          provide: AccountsApi,
          useValue: {
            listAccounts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listAccountOptions: () => of([{ id: 'acc-1', name: 'Cash Register', accountType: 'cash', status: 'active' }]),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (permission: string) =>
              permission === 'purchases.create' ||
              permission === 'purchases.post' ||
              permission === 'purchases.view' ||
              permission === 'purchases.cancel' ||
              permission === 'purchases.return' ||
              permission === 'returns.post',
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: (key: string) => !disabledCapabilities.has(key),
            canPerformAction: (key: string) => !disabledCapabilities.has(key),
            canViewField: (key: string) => !disabledCapabilities.has(`${key}.visible`),
            canEditField: (key: string) => !disabledCapabilities.has(`${key}.editable`),
          },
        },
      ],
    }).compileComponents();
  });

  it('preloads supplier and product selector options on create', async () => {
    const fixture: ComponentFixture<PurchaseEditPage> = TestBed.createComponent(PurchaseEditPage);
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();

    expect(searchProductOptionsCalls).toBe(1);
    expect(searchSupplierOptionsCalls).toBe(1);
  });

  it('renders draft create form branch with empty payments at post', () => {
    const fixture: ComponentFixture<PurchaseEditPage> = TestBed.createComponent(PurchaseEditPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="purchase-form"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-draft-banner"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-info-card"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-lines-form-card"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-landed-form-card"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-payments"]')).toBeTruthy();
  });

  it('renders posted purchase detail view as strictly read-only with authoritative totals and details', () => {
    const fixture: ComponentFixture<PurchaseEditPage> = TestBed.createComponent(PurchaseEditPage);
    const component = fixture.componentInstance;
    component.purchase.set(mockPostedRecord);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    // Form is not in draft mode
    expect(compiled.querySelector('[data-testid="purchase-form"]')).toBeFalsy();

    // Posted read-only view is rendered
    expect(compiled.querySelector('[data-testid="purchase-posted-view"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-posted-banner"]')).toBeTruthy();

    // Authoritative 5 KPI Cards are rendered
    const kpiRow = compiled.querySelector('[data-testid="purchase-posted-totals"]');
    expect(kpiRow).toBeTruthy();
    expect(compiled.querySelector('[data-testid="kpi-goods"]')?.textContent).toContain('5000.00');
    expect(compiled.querySelector('[data-testid="kpi-landed"]')?.textContent).toContain('300.00');
    expect(compiled.querySelector('[data-testid="kpi-total"]')?.textContent).toContain('5300.00');
    expect(compiled.querySelector('[data-testid="kpi-paid"]')?.textContent).toContain('2000.00');
    expect(compiled.querySelector('[data-testid="kpi-payable"]')?.textContent).toContain('3300.00');

    // Details card, desktop lines table, and mobile lines list
    expect(compiled.querySelector('[data-testid="purchase-details-card"]')?.textContent).toContain('Engro Fertilizers');
    expect(compiled.querySelector('[data-testid="purchase-lines-table"]')?.textContent).toContain('Standard Urea');
    expect(compiled.querySelector('[data-testid="purchase-lines-mobile-list"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-line-mobile-card"]')?.textContent).toContain('Standard Urea');
  });

  it('renders dynamic tracking controls according to product tracking mode', () => {
    const fixture: ComponentFixture<PurchaseEditPage> = TestBed.createComponent(PurchaseEditPage);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.products.set([mockProductNone, mockProductBatch, mockProductExpiry]);
    const line = component.lineGroup(0);

    // 1. None tracking mode: no batch/expiry inputs
    line.get('productId')?.setValue('prod-1');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="purchase-line-batch"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="purchase-line-expiry"]')).toBeFalsy();

    // 2. Batch tracking mode: batch number rendered, expiry hidden
    line.get('productId')?.setValue('prod-2');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="purchase-line-batch"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="purchase-line-expiry"]')).toBeFalsy();

    // 3. Batch + Expiry mode: both batch number and expiry rendered
    line.get('productId')?.setValue('prod-3');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="purchase-line-batch"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="purchase-line-expiry"]')).toBeTruthy();
  });

  it('keeps lifecycle actions reachable on posted purchases (Cancel and Return)', () => {
    const fixture: ComponentFixture<PurchaseEditPage> = TestBed.createComponent(PurchaseEditPage);
    const component = fixture.componentInstance;
    component.purchase.set(mockPostedRecord);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="purchase-cancel-section"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-cancel-btn"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-return-section"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="add-return-line"]')).toBeTruthy();
  });

  it('applies independent action and optional field policies without weakening lifecycle rules', () => {
    disabledCapabilities.add('purchases.fields.notes.visible');
    disabledCapabilities.add('purchases.fields.supplierInvoiceReference.editable');
    disabledCapabilities.add('purchases.actions.addPaymentAtPost');
    const fixture = TestBed.createComponent(PurchaseEditPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="purchase-notes"]')).toBeFalsy();
    expect((compiled.querySelector('[data-testid="purchase-reference"]') as HTMLInputElement).readOnly).toBe(true);
    expect(compiled.querySelector('[data-testid="purchase-payments"]')).toBeFalsy();

    const component = fixture.componentInstance;
    component.purchase.set(mockPostedRecord);
    fixture.detectChanges();
    expect(component.canEditDraft()).toBe(false);
    expect(compiled.querySelector('[data-testid="purchase-save"]')).toBeFalsy();
  });

  it('disables save when the draft form is invalid', () => {
    const fixture: ComponentFixture<PurchaseEditPage> = TestBed.createComponent(PurchaseEditPage);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const saveButton = fixture.nativeElement.querySelector(
      '[data-testid="purchase-save"]',
    ) as HTMLButtonElement;

    expect(component.form.valid).toBe(false);
    expect(component.canSaveDraft()).toBe(false);
    expect(saveButton.disabled).toBe(true);
  });

  it('does not call createPurchase when save() is invoked on an invalid form', () => {
    const fixture: ComponentFixture<PurchaseEditPage> = TestBed.createComponent(PurchaseEditPage);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.save();
    fixture.detectChanges();

    expect(createPurchase).not.toHaveBeenCalled();
    expect(component.formSubmitAttempted()).toBe(true);
    expect(
      component.fieldError(component.form.controls.warehouseId, 'Warehouse', true),
    ).toContain('required');
  });
});
