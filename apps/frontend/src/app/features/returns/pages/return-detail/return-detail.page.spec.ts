import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { ReturnDetailPage } from './return-detail.page';
import { ReturnsApi } from '../../data-access/returns.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { SalesReturnRecord } from '../../models/returns.models';

const postedReturn: SalesReturnRecord = {
  id: 'ret-1',
  organizationId: 'org-1',
  returnType: 'sales',
  purchaseId: null,
  saleId: 'sale-1',
  supplierId: null,
  customerId: null,
  customerIdentifyingName: 'Walk-in Rasheed',
  customerIdentifyingPhone: '03001112233',
  warehouseId: 'wh-1',
  reason: 'Damaged bag',
  resolution: 'account_refund',
  refundAccountId: 'acc-1',
  approvedReturnValue: null,
  withoutInvoiceApproval: null,
  status: 'posted',
  lines: [
    {
      productId: 'p1',
      productNameSnapshot: 'F07 Product',
      packagingUnitId: null,
      unitCodeSnapshot: 'EA',
      conversionFactorSnapshot: '1',
      quantity: '1',
      quantityBase: '1',
      batchId: null,
      batchNumber: null,
      originalLineIndex: 0,
      stockCondition: 'sellable',
      unsellableReason: null,
      returnInventoryValue: null,
      returnRevenue: { amount: '100.00', currency: 'PKR' },
    },
  ],
  returnTotal: { amount: '100.00', currency: 'PKR' },
  currency: 'PKR',
  version: 2,
  postedAt: '2026-08-13T10:00:00.000Z',
  postedBy: 'user-1',
  reversedByCorrectiveTransactionId: null,
  reversedAt: null,
  reversedBy: null,
};

describe('ReturnDetailPage', () => {
  it('shows posted return status and type without exposing warehouse ids', async () => {
    await TestBed.configureTestingModule({
      imports: [ReturnDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'ret-1' }) } },
        },
        {
          provide: ReturnsApi,
          useValue: { getReturn: () => of(postedReturn), reverseReturn: () => of(postedReturn) },
        },
        {
          provide: AccountsApi,
          useValue: {
            listAccounts: () => of([{ id: 'acc-1', name: 'F07 Cash', accountType: 'cash' }]),
          },
        },
        { provide: CustomersApi, useValue: { listCustomers: () => of([]) } },
        {
          provide: BranchesWarehousesApi,
          useValue: { listWarehouses: () => of([{ id: 'wh-1', name: 'F07 WH' }]) },
        },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<ReturnDetailPage> = TestBed.createComponent(ReturnDetailPage);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelector('[data-testid="return-detail"]')).toBeTruthy();
    expect(text).toContain('Linked sales return');
    expect(text).toContain('F07 WH');
    expect(text).toContain('F07 Cash');
    expect(text).not.toContain('wh-1');
  });
});
