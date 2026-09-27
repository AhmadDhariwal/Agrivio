import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { PurchaseDetailPage } from './purchase-detail.page';
import { PurchasesApi } from '../../data-access/purchases.api';
import { ReturnsApi } from '../../data-access/returns.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { PurchaseRecord } from '../../models/purchases.models';

const money = { amount: '100.00', currency: 'PKR' };

const basePurchase: PurchaseRecord = {
  id: 'purchase-1',
  organizationId: 'org-1',
  branchId: null,
  warehouseId: 'warehouse-old',
  warehouseNameSnapshot: 'Historic Store',
  supplierId: 'supplier-1',
  supplierNameSnapshot: 'Farm Supply',
  supplierInvoiceReference: 'INV-1',
  purchaseDate: '2026-09-04',
  notes: '',
  status: 'posted',
  lines: [
    {
      productId: 'p1',
      productNameSnapshot: 'Seed',
      trackingModeSnapshot: 'none',
      packagingUnitId: null,
      unitCodeSnapshot: 'bag',
      conversionFactorSnapshot: '1',
      quantity: '1',
      quantityBase: '1',
      unitCost: money,
      lineProductAmount: money,
      batchNumber: null,
      manufacturingDate: null,
      expiryDate: null,
    },
  ],
  landedCosts: { freight: money, loading: money, transport: money, other: money },
  purchaseTotal: money,
  paidTotal: money,
  payableTotal: money,
  payments: [
    {
      paymentId: 'pay-1',
      accountId: 'acc-1',
      accountNameSnapshot: 'Bank Alfalah',
      accountTypeSnapshot: 'bank',
      amount: money,
    },
  ],
  version: 1,
  createdBy: 'user-1',
  createdAt: '2026-09-04T00:00:00Z',
  updatedAt: null,
  postedAt: '2026-09-04T00:00:00Z',
};

const mockDraftPurchase: PurchaseRecord = {
  ...basePurchase,
  id: 'purchase-draft',
  status: 'draft',
  postedAt: null,
};

const mockCancelledPurchase: PurchaseRecord = {
  ...basePurchase,
  id: 'purchase-cancelled',
  status: 'cancelled',
  cancelledAt: '2026-09-04T02:00:00Z',
  cancellationReason: 'Supplier unable to fulfill agreed grade',
};

const mockCorrectedPurchase: PurchaseRecord = {
  ...basePurchase,
  id: 'purchase-orig',
  status: 'posted',
  replacementPurchaseId: 'purchase-rep-1',
  correctionReason: 'Incorrect unit cost entered',
  correctedAt: '2026-09-04T03:00:00Z',
};

const mockReplacementPurchase: PurchaseRecord = {
  ...basePurchase,
  id: 'purchase-rep-1',
  status: 'posted',
  originalPurchaseId: 'purchase-orig',
};

describe('PurchaseDetailPage', () => {
  let mockApi: {
    getPurchase: ReturnType<typeof vi.fn>;
    cancelPurchase: ReturnType<typeof vi.fn>;
    postPurchase: ReturnType<typeof vi.fn>;
    deletePurchaseDraft: ReturnType<typeof vi.fn>;
  };
  let mockReturnsApi: {
    createPurchaseReturn: ReturnType<typeof vi.fn>;
  };

  const setupTest = async (purchaseToLoad: PurchaseRecord = basePurchase) => {
    mockApi = {
      getPurchase: vi.fn().mockReturnValue(of(purchaseToLoad)),
      cancelPurchase: vi.fn().mockReturnValue(of({ ...purchaseToLoad, status: 'cancelled' })),
      postPurchase: vi.fn().mockReturnValue(of({ ...purchaseToLoad, status: 'posted' })),
      deletePurchaseDraft: vi.fn().mockReturnValue(of(undefined)),
    };
    mockReturnsApi = {
      createPurchaseReturn: vi.fn().mockReturnValue(of({ id: 'ret-1' })),
    };

    await TestBed.configureTestingModule({
      imports: [PurchaseDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: purchaseToLoad.id }) } },
        },
        { provide: PurchasesApi, useValue: mockApi },
        { provide: ReturnsApi, useValue: mockReturnsApi },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PurchaseDetailPage);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  };

  it('renders posted active purchase with Cancel, Correct, and Return actions', async () => {
    const { fixture } = await setupTest(basePurchase);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="purchase-return-items-btn"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-cancel-btn"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-correct-btn"]')).toBeTruthy();

    // Draft actions hidden
    expect(compiled.querySelector('[data-testid="purchase-edit-link"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="purchase-post-draft-link"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="purchase-delete-draft-btn"]')).toBeNull();
  });

  it('renders draft purchase with Edit Draft, Post Purchase, and Discard Draft actions', async () => {
    const { fixture } = await setupTest(mockDraftPurchase);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="purchase-edit-link"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-post-draft-link"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchase-delete-draft-btn"]')).toBeTruthy();

    // Posted correction/cancellation actions hidden
    expect(compiled.querySelector('[data-testid="purchase-return-items-btn"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="purchase-cancel-btn"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="purchase-correct-btn"]')).toBeNull();
  });

  it('renders cancelled purchase as view-only with cancellation reason banner and no action buttons', async () => {
    const { fixture } = await setupTest(mockCancelledPurchase);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="purchase-cancelled-banner"]')).toBeTruthy();
    expect(compiled.textContent).toContain('Supplier unable to fulfill agreed grade');

    // All mutating actions hidden
    expect(compiled.querySelector('[data-testid="purchase-cancel-btn"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="purchase-correct-btn"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="purchase-return-items-btn"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="purchase-edit-link"]')).toBeNull();
  });

  it('renders corrected purchase with CORRECTED badge, lineage banner and link to replacement', async () => {
    const { fixture } = await setupTest(mockCorrectedPurchase);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="purchase-corrected-banner"]')).toBeTruthy();
    expect(compiled.textContent).toContain('Incorrect unit cost entered');
    expect(compiled.querySelector('[data-testid="replacement-purchase-link"]')).toBeTruthy();

    // Actions hidden on corrected purchase
    expect(compiled.querySelector('[data-testid="purchase-cancel-btn"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="purchase-correct-btn"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="purchase-return-items-btn"]')).toBeNull();
  });

  it('renders replacement purchase with link to original purchase in lineage banner', async () => {
    const { fixture } = await setupTest(mockReplacementPurchase);
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="purchase-replacement-banner"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="original-purchase-link"]')).toBeTruthy();
  });

  it('opens cancel dialog and executes cancellation with expectedVersion and reason', async () => {
    const { fixture, component } = await setupTest(basePurchase);

    expect(component.cancelDialogOpen()).toBe(false);
    component.openCancelDialog();
    expect(component.cancelDialogOpen()).toBe(true);

    component.onCancelConfirmed({ reason: 'Incorrect product delivered by supplier' });

    expect(mockApi.cancelPurchase).toHaveBeenCalledWith(
      'purchase-1',
      {
        expectedVersion: 1,
        reason: 'Incorrect product delivered by supplier',
      },
      expect.any(String),
    );
  });

  it('maps backend 409 conflict errors to clear actionable messages during cancellation', async () => {
    const { fixture, component } = await setupTest(basePurchase);

    // Dependent returns error
    mockApi.cancelPurchase.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              error: {
                message:
                  'Purchase cannot be cancelled because posted purchase returns exist; reverse the dependent return first',
              },
            },
          }),
      ),
    );

    component.onCancelConfirmed({ reason: 'Cancellation reason' });
    expect(component.cancelError()).toBe(
      'This Purchase has dependent posted Purchase Returns. Reverse the dependent return before cancelling.',
    );

    // Dependent payments error
    mockApi.cancelPurchase.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              error: {
                message: 'Purchase has dependent Supplier Payment allocations; reverse or correct those payments first',
              },
            },
          }),
      ),
    );

    component.onCancelConfirmed({ reason: 'Cancellation reason' });
    expect(component.cancelError()).toBe(
      'This Purchase has a Supplier Payment allocated to it. Reverse or correct that payment before cancelling or correcting the Purchase.',
    );

    // Stock consumed error
    mockApi.cancelPurchase.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              error: {
                message: 'Cannot reverse original purchase stock because received inventory has already been consumed',
              },
            },
          }),
      ),
    );

    component.onCancelConfirmed({ reason: 'Cancellation reason' });
    expect(component.cancelError()).toBe(
      'Cannot reverse original purchase stock because received inventory has already been sold, consumed, or transferred.',
    );
  });

  it('correctly formats numbers, quantities, money amounts, and dates matching product module standard', async () => {
    const { component } = await setupTest(basePurchase);

    expect(component.formatQuantity('20.0000')).toBe('20');
    expect(component.formatQuantity('20.5000')).toBe('20.5');
    expect(component.formatQuantity('1250')).toBe('1,250');
    expect(component.formatQuantity(null)).toBe('0');

    expect(component.formatMoney({ amount: '56000.00', currency: 'PKR' })).toBe('PKR 56,000.00');
    expect(component.formatMoney(null)).toBe('—');

    expect(component.formatDate('2026-08-24')).toMatch(/24 Aug 2026/);
    expect(component.formatDate(null)).toBe('—');

    expect(component.formatDateTime('2026-08-30T21:52:56.000Z')).toContain('2026');
    expect(component.formatDateTime(null)).toBe('—');
  });
});
