import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ReturnsListPage } from './returns-list.page';
import { ReturnsApi } from '../../data-access/returns.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { SalesReturnRecord } from '../../models/returns.models';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';

describe('ReturnsListPage', () => {
  const mockReturn1: SalesReturnRecord = {
    id: 'ret-101',
    organizationId: 'org-1',
    returnType: 'sales',
    purchaseId: null,
    saleId: 'sale-001234',
    supplierId: null,
    customerId: 'cust-1',
    customerIdentifyingName: 'Al Noor Traders (Multan)',
    customerIdentifyingPhone: '03001234567',
    warehouseId: 'wh-1',
    reason: 'Customer returned excess DAP bags in original factory packing',
    resolution: 'ledger_adjustment',
    refundAccountId: null,
    approvedReturnValue: null,
    withoutInvoiceApproval: null,
    status: 'posted',
    lines: [
      {
        productId: 'prod-1',
        productNameSnapshot: 'Engro DAP (Di-Ammonium Phosphate 18-46-0)',
        packagingUnitId: null,
        unitCodeSnapshot: 'BAG',
        conversionFactorSnapshot: '50',
        quantity: '2',
        quantityBase: '100',
        batchId: 'batch-1',
        batchNumber: 'ENG-DAP-2026-08',
        originalLineIndex: 0,
        stockCondition: 'sellable',
        unsellableReason: null,
        returnInventoryValue: { amount: '24800.00', currency: 'PKR' },
        returnRevenue: { amount: '24800.00', currency: 'PKR' },
      },
    ],
    returnTotal: { amount: '24800.00', currency: 'PKR' },
    currency: 'PKR',
    version: 1,
    postedAt: '2026-08-28T10:45:00.000Z',
    postedBy: 'user-1',
    reversedByCorrectiveTransactionId: null,
    reversedAt: null,
    reversedBy: null,
  };

  const mockReturn2: SalesReturnRecord = {
    id: 'ret-102',
    organizationId: 'org-1',
    returnType: 'purchase',
    purchaseId: 'purch-000567',
    saleId: null,
    supplierId: 'supp-1',
    customerId: null,
    customerIdentifyingName: null,
    customerIdentifyingPhone: null,
    warehouseId: 'wh-1',
    reason: 'Damaged during delivery',
    resolution: 'ledger_adjustment',
    refundAccountId: null,
    approvedReturnValue: null,
    withoutInvoiceApproval: null,
    status: 'reversed',
    lines: [
      {
        productId: 'prod-2',
        productNameSnapshot: 'Sona Urea',
        packagingUnitId: null,
        unitCodeSnapshot: 'BAG',
        conversionFactorSnapshot: '50',
        quantity: '5',
        quantityBase: '250',
        batchId: null,
        batchNumber: null,
        originalLineIndex: 0,
        stockCondition: 'unsellable',
        unsellableReason: 'damaged',
        returnInventoryValue: { amount: '15000.00', currency: 'PKR' },
        returnRevenue: null,
      },
    ],
    returnTotal: { amount: '15000.00', currency: 'PKR' },
    currency: 'PKR',
    version: 2,
    postedAt: '2026-08-20T08:30:00.000Z',
    postedBy: 'user-1',
    reversedByCorrectiveTransactionId: 'corr-1',
    reversedAt: '2026-08-21T09:00:00.000Z',
    reversedBy: 'user-2',
  };

  const mockDraftReturn: SalesReturnRecord = {
    ...mockReturn1,
    id: 'ret-103',
    status: 'draft',
    postedAt: null,
    postedBy: null,
    version: 1,
  };

  const mockWarehouses = [
    { id: 'wh-1', name: 'Central Distribution Hub (Multan)', code: 'CDH-01' },
    { id: 'wh-2', name: 'North Branch Depot (Lahore)', code: 'NBD-01' },
  ];

  let mockReturnsApi: {
    listReturns: ReturnType<typeof vi.fn>;
    reverseReturn: ReturnType<typeof vi.fn>;
    discardReturn: ReturnType<typeof vi.fn>;
    postReturn: ReturnType<typeof vi.fn>;
  };
  let mockLocationsApi: {
    listWarehouseOptions: ReturnType<typeof vi.fn>;
  };
  let mockSessionStore: {
    hasPermission: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockReturnsApi = {
      listReturns: vi
        .fn()
        .mockReturnValue(
          of({ items: [mockReturn1, mockReturn2], meta: { page: 1, pageSize: 25, total: 2 } }),
        ),
      reverseReturn: vi
        .fn()
        .mockReturnValue(of({ ...mockReturn1, status: 'reversed', version: 2 })),
      discardReturn: vi.fn().mockReturnValue(of({ id: 'ret-103', discarded: true })),
      postReturn: vi
        .fn()
        .mockReturnValue(of({ ...mockDraftReturn, status: 'posted', version: 2 })),
    };

    mockLocationsApi = {
      listWarehouseOptions: vi.fn().mockReturnValue(of(mockWarehouses)),
    };

    mockSessionStore = {
      hasPermission: vi.fn().mockReturnValue(true),
    };
  });

  async function createComponent(): Promise<{
    fixture: ComponentFixture<ReturnsListPage>;
    component: ReturnsListPage;
  }> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ReturnsListPage],
      providers: [
        provideRouter([]),
        { provide: ReturnsApi, useValue: mockReturnsApi },
        { provide: BranchesWarehousesApi, useValue: mockLocationsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ReturnsListPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, component };
  }

  it('renders page header, eyebrow, and count pill', async () => {
    const { fixture } = await createComponent();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Returns');
    expect(text).toContain('Returns and Corrections');
    expect(text).toContain('2 returns');
  });

  it('renders workflow launcher action buttons when permitted', async () => {
    const { fixture } = await createComponent();
    const withoutInvoiceBtn = fixture.nativeElement.querySelector(
      '[data-testid="without-invoice-link"]',
    );
    const salesReturnBtn = fixture.nativeElement.querySelector(
      '[data-testid="linked-sale-return-link"]',
    );
    const purchaseReturnBtn = fixture.nativeElement.querySelector(
      '[data-testid="purchase-return-link"]',
    );

    expect(withoutInvoiceBtn).toBeTruthy();
    expect(withoutInvoiceBtn.textContent).toContain('Return without invoice');
    expect(salesReturnBtn).toBeTruthy();
    expect(salesReturnBtn.textContent).toContain('Linked return from a sale');
    expect(purchaseReturnBtn).toBeTruthy();
    expect(purchaseReturnBtn.textContent).toContain('Purchase return from a purchase');
  });

  it('hides without-invoice launcher if user lacks permission', async () => {
    mockSessionStore.hasPermission.mockImplementation((perm: string) => {
      if (perm === 'returns.without-invoice.approve') return false;
      return true;
    });

    const { fixture } = await createComponent();
    const withoutInvoiceBtn = fixture.nativeElement.querySelector(
      '[data-testid="without-invoice-link"]',
    );
    expect(withoutInvoiceBtn).toBeNull();
  });

  it('shows warning alert when returns.view permission is missing', async () => {
    mockSessionStore.hasPermission.mockReturnValue(false);
    const { fixture } = await createComponent();
    expect(fixture.nativeElement.textContent).toContain(
      'You do not have permission to view returns.',
    );
    expect(mockReturnsApi.listReturns).not.toHaveBeenCalled();
  });

  it('renders dense table with items and formatted columns', async () => {
    const { fixture } = await createComponent();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="return-row"]');
    expect(rows.length).toBe(2);

    const firstRowText = rows[0].textContent;
    expect(firstRowText).toContain('Linked sales return');
    expect(firstRowText).toContain('Engro DAP');
    expect(firstRowText).toContain('Central Distribution Hub (Multan)');
    expect(firstRowText).toContain('SALES RETURN');
    expect(firstRowText).toContain('Sale #001234');
    expect(firstRowText).toContain('Al Noor Traders (Multan)');
    expect(firstRowText).toContain('PKR 24,800.00');
    expect(firstRowText).toContain('POSTED');
  });

  it('triggers server reload on returnType filter change', async () => {
    const { component } = await createComponent();
    mockReturnsApi.listReturns.mockClear();

    const selectEvent = { target: { value: 'sales' } } as unknown as Event;
    component.onReturnTypeChange(selectEvent);

    expect(component.returnTypeFilter()).toBe('sales');
    expect(mockReturnsApi.listReturns).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        returnType: 'sales',
      }),
    );
  });

  it('triggers server reload on status filter change', async () => {
    const { component } = await createComponent();
    mockReturnsApi.listReturns.mockClear();

    const selectEvent = { target: { value: 'posted' } } as unknown as Event;
    component.onStatusChange(selectEvent);

    expect(component.statusFilter()).toBe('posted');
    expect(mockReturnsApi.listReturns).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        status: 'posted',
      }),
    );
  });

  it('triggers server reload on warehouse filter change', async () => {
    const { component } = await createComponent();
    mockReturnsApi.listReturns.mockClear();

    const selectEvent = { target: { value: 'wh-1' } } as unknown as Event;
    component.onWarehouseChange(selectEvent);

    expect(component.warehouseFilter()).toBe('wh-1');
    expect(mockReturnsApi.listReturns).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        warehouseId: 'wh-1',
      }),
    );
  });

  it('clears all filters and resets pagination to page 1', async () => {
    const { component } = await createComponent();
    component.returnTypeFilter.set('sales');
    component.statusFilter.set('posted');
    component.warehouseFilter.set('wh-1');
    component.page.set(3);

    mockReturnsApi.listReturns.mockClear();
    component.clearFilters();

    expect(component.returnTypeFilter()).toBe('');
    expect(component.statusFilter()).toBe('');
    expect(component.warehouseFilter()).toBe('');
    expect(component.page()).toBe(1);
    expect(mockReturnsApi.listReturns).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
      }),
    );
  });

  it('opens confirm reversal dialog when reverse is initiated', async () => {
    const { component } = await createComponent();
    expect(component.reverseDialogOpen()).toBe(false);

    component.openReverseDialog(mockReturn1);
    expect(component.reverseDialogOpen()).toBe(true);
    expect(component.itemToReverse()?.id).toBe('ret-101');
  });

  it('executes reverse return with reason and updates list status', async () => {
    const { component } = await createComponent();
    component.openReverseDialog(mockReturn1);

    component.onConfirmReverse('Damaged in transport verification');
    expect(mockReturnsApi.reverseReturn).toHaveBeenCalledWith(
      'ret-101',
      { reason: 'Damaged in transport verification', expectedVersion: 1 },
      expect.any(String),
    );

    expect(component.successMessage()).toContain(
      'Return reversed with a linked corrective transaction',
    );
    const updated = component.items().find((item) => item.id === 'ret-101');
    expect(updated?.status).toBe('reversed');
  });

  it('shows error if reversal reason is empty', async () => {
    const { component } = await createComponent();
    component.openReverseDialog(mockReturn1);

    component.onConfirmReverse('   ');
    expect(component.errorMessage()).toBe('A reversal reason is required.');
    expect(mockReturnsApi.reverseReturn).not.toHaveBeenCalled();
  });

  it('renders empty state when no returns exist', async () => {
    mockReturnsApi.listReturns.mockReturnValue(
      of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    );
    const { fixture } = await createComponent();
    expect(fixture.nativeElement.querySelector('[data-testid="returns-empty"]')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('No returns found');
  });

  it('renders error alert when API returns failure', async () => {
    mockReturnsApi.listReturns.mockReturnValue(throwError(() => new Error('Server unavailable')));
    const { fixture } = await createComponent();
    expect(fixture.nativeElement.textContent).toContain('Unable to load returns.');
  });

  it('loads warehouse filter options once and paginates with one returns request', async () => {
    const { component } = await createComponent();
    expect(mockLocationsApi.listWarehouseOptions).toHaveBeenCalledTimes(1);
    expect(mockReturnsApi.listReturns).toHaveBeenCalledTimes(1);

    mockReturnsApi.listReturns.mockClear();
    component.onPageChange(2);
    expect(mockReturnsApi.listReturns).toHaveBeenCalledTimes(1);
    expect(mockLocationsApi.listWarehouseOptions).toHaveBeenCalledTimes(1);
  });

  it('handles pagination page changes', async () => {
    const { component } = await createComponent();
    mockReturnsApi.listReturns.mockClear();

    component.onPageChange(2);
    expect(component.page()).toBe(2);
    expect(mockReturnsApi.listReturns).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it('handles pagination pageSize changes', async () => {
    const { component } = await createComponent();
    mockReturnsApi.listReturns.mockReturnValue(
      of({ items: [mockReturn1, mockReturn2], meta: { page: 1, pageSize: 50, total: 2 } }),
    );
    mockReturnsApi.listReturns.mockClear();

    component.onPageSizeChange(50);
    expect(component.pageSize()).toBe(50);
    expect(component.page()).toBe(1);
    expect(mockReturnsApi.listReturns).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 50 }),
    );
  });

  it('renders [ Post ] and [ Discard Draft ] for draft items and hides delete/discard for posted items', async () => {
    mockReturnsApi.listReturns.mockReturnValue(
      of({ items: [mockDraftReturn, mockReturn1], meta: { page: 1, pageSize: 25, total: 2 } }),
    );
    const { fixture } = await createComponent();

    const postBtn = fixture.nativeElement.querySelector('[data-testid="return-post"]');
    const discardBtn = fixture.nativeElement.querySelector('[data-testid="return-discard"]');
    expect(postBtn).toBeTruthy();
    expect(postBtn.textContent).toContain('Post');
    expect(discardBtn).toBeTruthy();
    expect(discardBtn.textContent).toContain('Discard Draft');

    // In mobile cards
    const mobilePostBtn = fixture.nativeElement.querySelector('[data-testid="return-mobile-post"]');
    const mobileDiscardBtn = fixture.nativeElement.querySelector('[data-testid="return-mobile-discard"]');
    expect(mobilePostBtn).toBeTruthy();
    expect(mobileDiscardBtn).toBeTruthy();

    // Verify posted item in row 2 does NOT have delete or discard
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="return-row"]');
    const postedRowText = rows[1].textContent;
    expect(postedRowText).not.toContain('Discard Draft');
    expect(postedRowText).not.toContain('Delete');
  });

  it('opens confirmation dialog on discard draft with danger=true and confirmLabel="Discard Draft"', async () => {
    mockReturnsApi.listReturns.mockReturnValue(
      of({ items: [mockDraftReturn], meta: { page: 1, pageSize: 25, total: 1 } }),
    );
    const { fixture, component } = await createComponent();

    expect(component.discardDialogOpen()).toBe(false);
    const discardBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="return-discard"]',
    );
    discardBtn.click();
    fixture.detectChanges();

    expect(component.discardDialogOpen()).toBe(true);

    const dialogDebugs = fixture.debugElement.queryAll(By.directive(UiConfirmDialogComponent));
    const discardDialog = dialogDebugs.find(
      (d) => d.componentInstance.confirmLabel() === 'Discard Draft',
    );
    expect(discardDialog).toBeTruthy();
    expect(discardDialog!.componentInstance.open()).toBe(true);
    expect(discardDialog!.componentInstance.confirmLabel()).toBe('Discard Draft');
    expect(discardDialog!.componentInstance.danger()).toBe(true);
    expect(discardDialog!.componentInstance.title()).toBe('Discard draft return?');
  });

  it('executes discard draft, removes item from list, and updates count', async () => {
    mockReturnsApi.listReturns.mockReturnValue(
      of({ items: [mockDraftReturn, mockReturn1], meta: { page: 1, pageSize: 25, total: 2 } }),
    );
    const { component } = await createComponent();

    component.openDiscardDialog(mockDraftReturn);
    component.onConfirmDiscard();

    expect(mockReturnsApi.discardReturn).toHaveBeenCalledWith('ret-103', 1);
    expect(component.items().find((item) => item.id === 'ret-103')).toBeUndefined();
    expect(component.total()).toBe(1);
    expect(component.successMessage()).toBe('Draft return was discarded.');
  });

  it('handles 409 conflict when discarding draft return with standard message', async () => {
    mockReturnsApi.listReturns.mockReturnValue(
      of({ items: [mockDraftReturn], meta: { page: 1, pageSize: 25, total: 1 } }),
    );
    mockReturnsApi.discardReturn.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' })),
    );
    const { component } = await createComponent();

    component.openDiscardDialog(mockDraftReturn);
    component.onConfirmDiscard();

    expect(component.errorMessage()).toBe('Return was modified or is no longer a draft.');
  });

  it('posts draft return when Post is clicked', async () => {
    mockReturnsApi.listReturns.mockReturnValue(
      of({ items: [mockDraftReturn], meta: { page: 1, pageSize: 25, total: 1 } }),
    );
    const { fixture, component } = await createComponent();

    const postBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="return-post"]',
    );
    postBtn.click();
    fixture.detectChanges();

    expect(mockReturnsApi.postReturn).toHaveBeenCalledWith(
      'ret-103',
      {
        expectedVersion: 1,
        resolution: 'ledger_adjustment',
        reason: 'Customer returned excess DAP bags in original factory packing',
      },
      expect.any(String),
    );
    const updated = component.items().find((item) => item.id === 'ret-103');
    expect(updated?.status).toBe('posted');
    expect(component.successMessage()).toBe('Return posted successfully.');
  });

  it('hides Post and Discard Draft buttons when returns.post permission is missing', async () => {
    mockReturnsApi.listReturns.mockReturnValue(
      of({ items: [mockDraftReturn], meta: { page: 1, pageSize: 25, total: 1 } }),
    );
    mockSessionStore.hasPermission.mockImplementation((perm: string) => perm !== 'returns.post');
    const { fixture } = await createComponent();

    const postBtn = fixture.nativeElement.querySelector('[data-testid="return-post"]');
    const discardBtn = fixture.nativeElement.querySelector('[data-testid="return-discard"]');
    expect(postBtn).toBeNull();
    expect(discardBtn).toBeNull();
  });
});
