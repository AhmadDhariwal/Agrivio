import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupplierLedgerPage } from './supplier-ledger.page';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

describe('SupplierLedgerPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupplierLedgerPage],
      providers: [
        provideRouter([]),
        {
          provide: SupplierPaymentsApi,
          useValue: {
            listSupplierLedger: () => of([]),
            reconcileSupplier: () => of({ status: 'ok', ledgerBalance: { amount: '0.00', currency: 'PKR' }, payableBalance: { amount: '0.00', currency: 'PKR' }, advanceBalance: { amount: '0.00', currency: 'PKR' }, findings: [] }),
            listUnpaidPurchases: () => of([]),
          },
        },
        {
          provide: SuppliersApi,
          useValue: {
            listSuppliers: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchSupplierOptions: () => of([]),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
        },
      ],
    }).compileComponents();
  });

  it('renders supplier selector', () => {
    const fixture: ComponentFixture<SupplierLedgerPage> = TestBed.createComponent(SupplierLedgerPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="ledger-supplier-form"]')).toBeTruthy();
  });
});
