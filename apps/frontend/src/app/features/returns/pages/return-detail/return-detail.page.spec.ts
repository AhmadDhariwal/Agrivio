import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { ReturnDetailPage } from './return-detail.page';
import { ReturnsApi } from '../../data-access/returns.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { SalesReturnRecord } from '../../models/returns.models';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';

const mockPostedReturn: SalesReturnRecord = {
  id: 'ret-000123',
  organizationId: 'org-1',
  returnType: 'sales',
  purchaseId: null,
  saleId: 'sale-000456',
  supplierId: null,
  customerId: null,
  customerIdentifyingName: 'Walk-in Rasheed',
  customerIdentifyingPhone: '03001112233',
  warehouseId: 'wh-1',
  warehouseNameSnapshot: 'Central Warehouse Multan',
  reason: 'Damaged bag during transport',
  resolution: 'account_refund',
  refundAccountId: 'acc-1',
  refundAccountNameSnapshot: 'Petty Cash Multan',
  refundAccountTypeSnapshot: 'cash',
  approvedReturnValue: null,
  withoutInvoiceApproval: null,
  status: 'posted',
  lines: [
    {
      productId: 'p1',
      productNameSnapshot: 'Engro Urea 50KG',
      packagingUnitId: null,
      unitCodeSnapshot: 'BAG',
      conversionFactorSnapshot: '50',
      quantity: '2',
      quantityBase: '100',
      batchId: 'b-1',
      batchNumber: 'ENG-UREA-2026',
      originalLineIndex: 0,
      stockCondition: 'sellable',
      unsellableReason: null,
      returnInventoryValue: { amount: '6000.00', currency: 'PKR' },
      returnRevenue: { amount: '6000.00', currency: 'PKR' },
    },
  ],
  returnTotal: { amount: '6000.00', currency: 'PKR' },
  currency: 'PKR',
  version: 1,
  postedAt: '2026-08-13T10:00:00.000Z',
  postedBy: 'user-1',
  reversedByCorrectiveTransactionId: null,
  reversedAt: null,
  reversedBy: null,
};

const mockDraftReturn: SalesReturnRecord = {
  ...mockPostedReturn,
  id: 'ret-draft-1',
  status: 'draft',
  postedAt: null,
  postedBy: null,
  version: 1,
};

describe('ReturnDetailPage', () => {
  let mockReturnsApi: {
    getReturn: ReturnType<typeof vi.fn>;
    reverseReturn: ReturnType<typeof vi.fn>;
    discardReturn: ReturnType<typeof vi.fn>;
    postReturn: ReturnType<typeof vi.fn>;
  };
  let mockSessionStore: {
    hasPermission: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockReturnsApi = {
      getReturn: vi.fn().mockReturnValue(of(mockPostedReturn)),
      reverseReturn: vi.fn().mockReturnValue(
        of({ ...mockPostedReturn, status: 'reversed', version: 2, reversedAt: '2026-08-14T09:00:00.000Z' }),
      ),
      discardReturn: vi.fn().mockReturnValue(of({ id: 'ret-draft-1', discarded: true })),
      postReturn: vi.fn().mockReturnValue(
        of({ ...mockDraftReturn, status: 'posted', version: 2, postedAt: '2026-08-15T12:00:00.000Z' }),
      ),
    };
    mockSessionStore = {
      hasPermission: vi.fn().mockReturnValue(true),
    };
  });

  async function createComponent(returnId = 'ret-000123'): Promise<{
    fixture: ComponentFixture<ReturnDetailPage>;
    component: ReturnDetailPage;
  }> {
    await TestBed.configureTestingModule({
      imports: [ReturnDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: returnId }) } },
        },
        { provide: ReturnsApi, useValue: mockReturnsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ReturnDetailPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, component };
  }

  it('loads detail from one authoritative return request', async () => {
    await createComponent();
    expect(mockReturnsApi.getReturn).toHaveBeenCalledTimes(1);
    expect(mockReturnsApi.getReturn).toHaveBeenCalledWith('ret-000123');
  });

  it('renders return header and snapshots without raw id enrichment', async () => {
    const { fixture } = await createComponent();
    const text = fixture.nativeElement.textContent as string;

    expect(fixture.nativeElement.querySelector('[data-testid="return-detail"]')).toBeTruthy();
    expect(text).toContain('Return #000123');
    expect(text).toContain('Central Warehouse Multan');
    expect(text).toContain('Walk-in Rasheed');
    expect(text).toContain('Petty Cash Multan (cash)');
    expect(text).not.toContain('wh-1');
  });

  it('executes reverse return with reason on posted return', async () => {
    const { component } = await createComponent();
    component.openReverseDialog();
    component.onConfirmReverse('Defective packaging verified by manager');

    expect(mockReturnsApi.reverseReturn).toHaveBeenCalledWith(
      'ret-000123',
      { reason: 'Defective packaging verified by manager', expectedVersion: 1 },
      expect.any(String),
    );
    expect(component.record()?.status).toBe('reversed');
  });

  it('hides delete and discard actions on posted returns (shows only reverse if permitted)', async () => {
    const { fixture } = await createComponent();
    const discardBtn = fixture.nativeElement.querySelector('[data-testid="return-discard-action-btn"]');
    const postBtn = fixture.nativeElement.querySelector('[data-testid="return-post-action-btn"]');
    const reverseBtn = fixture.nativeElement.querySelector('[data-testid="return-reverse-action-btn"]');

    expect(discardBtn).toBeNull();
    expect(postBtn).toBeNull();
    expect(reverseBtn).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('Delete');
    expect(fixture.nativeElement.textContent).not.toContain('Discard Draft');
  });

  it('shows [ Discard Draft ] and [ Post Return ] buttons for draft returns and hides reverse', async () => {
    mockReturnsApi.getReturn.mockReturnValue(of(mockDraftReturn));
    const { fixture } = await createComponent('ret-draft-1');

    const discardBtn = fixture.nativeElement.querySelector('[data-testid="return-discard-action-btn"]');
    const postBtn = fixture.nativeElement.querySelector('[data-testid="return-post-action-btn"]');
    const reverseBtn = fixture.nativeElement.querySelector('[data-testid="return-reverse-action-btn"]');

    expect(discardBtn).toBeTruthy();
    expect(discardBtn.textContent).toContain('Discard Draft');
    expect(postBtn).toBeTruthy();
    expect(postBtn.textContent).toContain('Post Return');
    expect(reverseBtn).toBeNull();
  });

  it('opens confirmation dialog on discard draft with danger=true and confirmLabel="Discard Draft"', async () => {
    mockReturnsApi.getReturn.mockReturnValue(of(mockDraftReturn));
    const { fixture, component } = await createComponent('ret-draft-1');

    expect(component.discardDialogOpen()).toBe(false);
    const discardBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="return-discard-action-btn"]',
    );
    discardBtn.click();
    fixture.detectChanges();

    expect(component.discardDialogOpen()).toBe(true);

    const dialogDebug = fixture.debugElement.query(By.directive(UiConfirmDialogComponent));
    expect(dialogDebug).toBeTruthy();
    expect(dialogDebug.componentInstance.confirmLabel()).toBe('Discard Draft');
    expect(dialogDebug.componentInstance.danger()).toBe(true);
    expect(dialogDebug.componentInstance.title()).toBe('Discard draft return?');
  });

  it('executes discard draft and navigates to /app/returns', async () => {
    mockReturnsApi.getReturn.mockReturnValue(of(mockDraftReturn));
    const { fixture, component } = await createComponent('ret-draft-1');
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    component.openDiscardDialog();
    component.onConfirmDiscard();

    expect(mockReturnsApi.discardReturn).toHaveBeenCalledWith('ret-draft-1', 1);
    expect(navigateSpy).toHaveBeenCalledWith(['/app/returns']);
  });

  it('handles 409 conflict when discarding with standard message', async () => {
    mockReturnsApi.getReturn.mockReturnValue(of(mockDraftReturn));
    mockReturnsApi.discardReturn.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 409, statusText: 'Conflict' })),
    );
    const { component } = await createComponent('ret-draft-1');

    component.openDiscardDialog();
    component.onConfirmDiscard();

    expect(component.errorMessage()).toBe('Return was modified or is no longer a draft.');
  });

  it('posts draft return when Post Return is confirmed', async () => {
    mockReturnsApi.getReturn.mockReturnValue(of(mockDraftReturn));
    const { fixture, component } = await createComponent('ret-draft-1');

    const postBtn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="return-post-action-btn"]',
    );
    postBtn.click();
    fixture.detectChanges();

    expect(mockReturnsApi.postReturn).toHaveBeenCalledWith(
      'ret-draft-1',
      { expectedVersion: 1, resolution: 'account_refund', reason: 'Damaged bag during transport' },
      expect.any(String),
    );
    expect(component.record()?.status).toBe('posted');
    expect(component.successMessage()).toBe('Return posted successfully.');
  });

  it('hides Post Return button when returns.post permission is missing', async () => {
    mockReturnsApi.getReturn.mockReturnValue(of(mockDraftReturn));
    mockSessionStore.hasPermission.mockImplementation((perm: string) => perm !== 'returns.post');
    const { fixture } = await createComponent('ret-draft-1');

    const postBtn = fixture.nativeElement.querySelector('[data-testid="return-post-action-btn"]');
    expect(postBtn).toBeNull();
  });
});
