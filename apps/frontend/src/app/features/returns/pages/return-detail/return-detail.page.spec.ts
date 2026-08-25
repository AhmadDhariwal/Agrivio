import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ReturnDetailPage } from './return-detail.page';
import { ReturnsApi } from '../../data-access/returns.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
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
  reason: 'Damaged bag during transport',
  resolution: 'account_refund',
  refundAccountId: 'acc-1',
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
  let mockAccountsApi: {
    listAccountOptions: ReturnType<typeof vi.fn>;
  };
  let mockCustomersApi: {
    searchCustomerOptions: ReturnType<typeof vi.fn>;
  };
  let mockSuppliersApi: {
    searchSupplierOptions: ReturnType<typeof vi.fn>;
  };
  let mockLocationsApi: {
    listWarehouseOptions: ReturnType<typeof vi.fn>;
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
    mockAccountsApi = {
      listAccountOptions: vi.fn().mockReturnValue(
        of([{ id: 'acc-1', name: 'Petty Cash Multan', accountType: 'cash' }]),
      ),
    };
    mockCustomersApi = {
      searchCustomerOptions: vi.fn().mockReturnValue(of([])),
    };
    mockSuppliersApi = {
      searchSupplierOptions: vi.fn().mockReturnValue(of([])),
    };
    mockLocationsApi = {
      listWarehouseOptions: vi.fn().mockReturnValue(
        of([{ id: 'wh-1', name: 'Central Warehouse Multan', code: 'CWH-01' }]),
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
        { provide: AccountsApi, useValue: mockAccountsApi },
        { provide: CustomersApi, useValue: mockCustomersApi },
        { provide: SuppliersApi, useValue: mockSuppliersApi },
        { provide: BranchesWarehousesApi, useValue: mockLocationsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ReturnDetailPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, component };
  }

  it('renders return header, status badge, and KPI cards', async () => {
    const { fixture } = await createComponent();
    const text = fixture.nativeElement.textContent as string;

    expect(fixture.nativeElement.querySelector('[data-testid="return-detail"]')).toBeTruthy();
    expect(text).toContain('Return #000123');
    expect(text).toContain('Central Warehouse Multan');
    expect(text).toContain('Walk-in Rasheed');
    expect(text).toContain('PKR 6,000.00');
    expect(text).not.toContain('wh-1');
  });

  it('renders returned product lines table with details', async () => {
    const { fixture } = await createComponent();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="return-line-row"]');
    expect(rows.length).toBe(1);

    const rowText = rows[0].textContent;
    expect(rowText).toContain('Engro Urea 50KG');
    expect(rowText).toContain('2 BAG');
    expect(rowText).toContain('Sellable');
    expect(rowText).toContain('ENG-UREA-2026');
  });

  it('opens reversal dialog and executes reverse with reason', async () => {
    const { component } = await createComponent();
    expect(component.reverseDialogOpen()).toBe(false);

    component.openReverseDialog();
    expect(component.reverseDialogOpen()).toBe(true);

    component.onConfirmReverse('Defective packaging verified by manager');
    expect(mockReturnsApi.reverseReturn).toHaveBeenCalledWith(
      'ret-000123',
      { reason: 'Defective packaging verified by manager', expectedVersion: 1 },
      expect.any(String),
    );

    expect(component.record()?.status).toBe('reversed');
    expect(component.successMessage()).toContain('Return reversed with a linked corrective transaction');
  });

  it('shows error if reversal reason is blank', async () => {
    const { component } = await createComponent();
    component.openReverseDialog();

    component.onConfirmReverse('   ');
    expect(component.errorMessage()).toBe('A reversal reason is required.');
    expect(mockReturnsApi.reverseReturn).not.toHaveBeenCalled();
  });

  it('renders permission warning if user lacks returns.view', async () => {
    mockSessionStore.hasPermission.mockReturnValue(false);
    const { fixture } = await createComponent();
    expect(fixture.nativeElement.textContent).toContain('You do not have permission to view returns.');
  });
});
