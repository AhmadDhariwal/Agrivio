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

describe('ReturnWithoutInvoicePage', () => {
  it('renders lookup form when both return and approval permissions are present', async () => {
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

    const fixture: ComponentFixture<ReturnWithoutInvoicePage> =
      TestBed.createComponent(ReturnWithoutInvoicePage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Return without invoice');
  });
});
