import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ReturnWithoutInvoicePage } from './return-without-invoice.page';
import { ReturnsApi } from '../../data-access/returns.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { InventoryApi } from '../../../inventory/data-access/inventory.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';

describe('ReturnWithoutInvoicePage', () => {
  let fixture: ComponentFixture<ReturnWithoutInvoicePage>;
  let page: ReturnWithoutInvoicePage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReturnWithoutInvoicePage],
      providers: [
        provideRouter([]),
        { provide: ReturnsApi, useValue: { createWithoutInvoice: () => of({}), postReturn: () => of({}) } },
        { provide: CatalogApi, useValue: { listProducts: () => of([]) } },
        { provide: CustomersApi, useValue: { listCustomers: () => of([]) } },
        { provide: AccountsApi, useValue: { listAccounts: () => of([]) } },
        { provide: InventoryApi, useValue: { listBatches: () => of([]) } },
        {
          provide: BranchesWarehousesApi,
          useValue: { listWarehouses: () => of([]) },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: () => true,
            filterWarehouses: <T>(items: T[]) => items,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReturnWithoutInvoicePage);
    page = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders lookup form when both return and approval permissions are present', () => {
    expect(fixture.nativeElement.textContent).toContain('Return without invoice');
  });

  it('requires refund account and shows the required marker for account_refund', () => {
    expect(hasRequiredValidator(page.form.controls.refundAccountId)).toBe(false);
    const refundSelect = fixture.nativeElement.querySelector(
      '[data-testid="without-invoice-refund-account"]',
    ) as HTMLSelectElement;
    expect(refundSelect.getAttribute('aria-required')).toBeNull();

    page.form.controls.resolution.setValue('account_refund');
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.refundAccountId)).toBe(true);
    expect(refundSelect.getAttribute('aria-required')).toBe('true');
    expect(
      refundSelect.closest('.ag-field')?.querySelector('.ag-field__required')?.textContent,
    ).toBe('*');

    page.form.controls.resolution.setValue('ledger_adjustment');
    fixture.detectChanges();
    expect(hasRequiredValidator(page.form.controls.refundAccountId)).toBe(false);
    expect(refundSelect.getAttribute('aria-required')).toBeNull();
    expect(refundSelect.closest('.ag-field')?.querySelector('.ag-field__required')).toBeFalsy();
  });
});
