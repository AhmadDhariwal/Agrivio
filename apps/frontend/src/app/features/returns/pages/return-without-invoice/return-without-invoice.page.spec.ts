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
  let mockReturnsApi: {
    createWithoutInvoice: ReturnType<typeof vi.fn>;
    postReturn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockReturnsApi = {
      createWithoutInvoice: vi.fn().mockReturnValue(of({ id: 'ret-draft-1', version: 1 })),
      postReturn: vi.fn().mockReturnValue(of({ id: 'ret-draft-1', status: 'posted' })),
    };

    await TestBed.configureTestingModule({
      imports: [ReturnWithoutInvoicePage],
      providers: [
        provideRouter([]),
        { provide: ReturnsApi, useValue: mockReturnsApi },
        {
          provide: CatalogApi,
          useValue: {
            searchProductOptions: () =>
              of([
                { id: 'p1', name: 'Engro Urea 50KG', sku: 'ENG-UREA', status: 'active', trackingMode: 'batch' },
                { id: 'p2', name: 'NPK 20-20-20', sku: 'NPK-20', status: 'active', trackingMode: 'none' },
              ]),
            listProducts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
          },
        },
        {
          provide: CustomersApi,
          useValue: {
            searchCustomerOptions: () =>
              of([{ id: 'c1', name: 'Chaudhry Farms', phone: '03001234567' }]),
            listCustomers: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
          },
        },
        {
          provide: AccountsApi,
          useValue: {
            listAccountOptions: () => of([{ id: 'acc-1', name: 'Cash Register Multan', accountType: 'cash', status: 'active' }]),
            listAccounts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
          },
        },
        {
          provide: InventoryApi,
          useValue: {
            listBatches: () =>
              of({ items: [{ id: 'b1', batchNumber: 'BATCH-2026-A', currentStockBase: '50' }] }),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listWarehouseOptions: () =>
              of([{ id: 'wh-1', name: 'Central Warehouse Multan', code: 'CWH-01' }]),
            listWarehouses: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
          },
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
    expect(fixture.nativeElement.textContent).toContain('Return Without Invoice');
    expect(fixture.nativeElement.querySelector('[data-testid="without-invoice-form"]')).toBeTruthy();
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

  it('allows adding and removing product lines', () => {
    expect(page.lines.length).toBe(1);
    page.addLine();
    expect(page.lines.length).toBe(2);

    page.removeLine(1);
    expect(page.lines.length).toBe(1);
  });
});
