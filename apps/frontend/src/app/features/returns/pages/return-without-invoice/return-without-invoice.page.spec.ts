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
  let mockCatalogApi: { searchProductOptions: ReturnType<typeof vi.fn> };
  let mockCustomersApi: { searchCustomerOptions: ReturnType<typeof vi.fn> };
  let mockAccountsApi: { listAccountOptions: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockReturnsApi = {
      createWithoutInvoice: vi.fn().mockReturnValue(of({ id: 'ret-draft-1', version: 1 })),
      postReturn: vi.fn().mockReturnValue(of({ id: 'ret-draft-1', status: 'posted' })),
    };
    mockCatalogApi = {
      searchProductOptions: vi.fn().mockReturnValue(
        of([
          { id: 'p1', name: 'Engro Urea 50KG', sku: 'ENG-UREA', status: 'active', trackingMode: 'batch' },
        ]),
      ),
    };
    mockCustomersApi = {
      searchCustomerOptions: vi.fn().mockReturnValue(
        of([{ id: 'c1', name: 'Chaudhry Farms', phone: '03001234567', status: 'active' }]),
      ),
    };
    mockAccountsApi = {
      listAccountOptions: vi.fn().mockReturnValue(
        of([{ id: 'acc-1', name: 'Cash Register Multan', accountType: 'cash', status: 'active' }]),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [ReturnWithoutInvoicePage],
      providers: [
        provideRouter([{ path: 'app/returns', component: ReturnWithoutInvoicePage }]),
        { provide: ReturnsApi, useValue: mockReturnsApi },
        { provide: CatalogApi, useValue: mockCatalogApi },
        { provide: CustomersApi, useValue: mockCustomersApi },
        { provide: AccountsApi, useValue: mockAccountsApi },
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

  it('preloads product and customer selector options on init', async () => {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();

    expect(mockCatalogApi.searchProductOptions).toHaveBeenCalledWith('', 25, 'active');
    expect(mockCustomersApi.searchCustomerOptions).toHaveBeenCalledWith('');
    expect(mockAccountsApi.listAccountOptions).toHaveBeenCalledTimes(1);
  });

  it('searches products through the debounced server-backed selector', async () => {
    const searchInput = fixture.nativeElement.querySelector(
      '[data-testid="without-invoice-product-search"]',
    ) as HTMLInputElement;
    searchInput.value = 'Urea';
    searchInput.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();

    expect(mockCatalogApi.searchProductOptions).toHaveBeenCalledWith('Urea', 25, 'active');
  });

  it('searches customers through the debounced server-backed selector', async () => {
    const searchInput = fixture.nativeElement.querySelector(
      '[data-testid="without-invoice-customer-search"]',
    ) as HTMLInputElement;
    searchInput.value = 'Chaudhry';
    searchInput.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();

    expect(mockCustomersApi.searchCustomerOptions).toHaveBeenCalledWith('Chaudhry');
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

  it('blocks submit without API call and surfaces validation errors when form is invalid', () => {
    page.submit();
    fixture.detectChanges();

    expect(mockReturnsApi.createWithoutInvoice).not.toHaveBeenCalled();
    expect(mockReturnsApi.postReturn).not.toHaveBeenCalled();
    expect(page.formSubmitAttempted()).toBe(true);
    expect(page.canSubmit()).toBe(false);
    expect(
      (fixture.nativeElement.querySelector('[data-testid="without-invoice-submit"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      page.fieldError(page.form.controls.warehouseId, 'Warehouse / Facility', true),
    ).toContain('required');
  });

  it('enables the submit button and successfully posts return when all required fields are filled', async () => {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();

    page.form.patchValue({
      warehouseId: 'wh-1',
      customerId: 'c1',
      reason: 'Customer returned sealed fertilizer bag without receipt; manager approved',
      approvedReturnValue: '5000.00',
    });

    const lineGroup = page.lineGroup(0);
    lineGroup.patchValue({
      productId: 'p1',
      quantity: '5',
    });
    page.onProductChange(0);
    lineGroup.patchValue({
      batchId: 'b1',
    });

    fixture.detectChanges();

    expect(page.canSubmit()).toBe(true);
    const submitBtn = fixture.nativeElement.querySelector(
      '[data-testid="without-invoice-submit"]',
    ) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    page.submit();
    fixture.detectChanges();

    expect(mockReturnsApi.createWithoutInvoice).toHaveBeenCalledWith({
      warehouseId: 'wh-1',
      customerId: 'c1',
      customerIdentifyingName: null,
      customerIdentifyingPhone: null,
      lines: [
        {
          productId: 'p1',
          quantity: '5',
          batchId: 'b1',
          stockCondition: 'sellable',
          unsellableReason: null,
        },
      ],
    });
    expect(mockReturnsApi.postReturn).toHaveBeenCalled();
  });

  it('requires account_refund when walk-in customer is specified without registered customer ledger', async () => {
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();

    page.form.patchValue({
      warehouseId: 'wh-1',
      customerId: '',
      customerIdentifyingName: 'Rasheed Ahmed',
      customerIdentifyingPhone: '03001234567',
      reason: 'Walk-in return approved by supervisor',
      approvedReturnValue: '2500.00',
      resolution: 'ledger_adjustment',
    });

    const lineGroup = page.lineGroup(0);
    lineGroup.patchValue({
      productId: 'p1',
      quantity: '2',
    });
    page.onProductChange(0);
    lineGroup.patchValue({
      batchId: 'b1',
    });

    fixture.detectChanges();

    // ledger_adjustment is not valid for walk-in (no customer ledger)
    expect(page.canSubmit()).toBe(false);

    // Switch to account_refund with a selected refund account
    page.form.patchValue({
      resolution: 'account_refund',
      refundAccountId: 'acc-1',
    });
    fixture.detectChanges();

    expect(page.canSubmit()).toBe(true);
  });
});
