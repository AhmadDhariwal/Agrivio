import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ReturnDetailPage } from './return-detail.page';
import { ReturnsApi } from '../../data-access/returns.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { SalesReturnRecord } from '../../models/returns.models';

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

describe('ReturnDetailPage', () => {
  let mockReturnsApi: {
    getReturn: ReturnType<typeof vi.fn>;
    reverseReturn: ReturnType<typeof vi.fn>;
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

  it('executes reverse return with reason', async () => {
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
});
