import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { SaleEditPage } from './sale-edit.page';
import { SalesApi } from '../../data-access/sales.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { SalesReturnsApi } from '../../data-access/sales-returns.api';
import { ReturnsApi } from '../../../returns/data-access/returns.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { SaleRecord } from '../../models/sales.models';

const postedSale: SaleRecord = {
  id: 'sale-posted',
  organizationId: 'org-1',
  branchId: 'br-1',
  branchNameSnapshot: 'P4 Branch',
  warehouseId: 'wh-1',
  warehouseNameSnapshot: 'P4 WH',
  customerId: null,
  customerNameSnapshot: 'Walk-in',
  saleDate: '2026-08-13',
  notes: '',
  status: 'posted',
  invoiceNumber: 'P4A-000001',
  saleTotal: { amount: '100.00', currency: 'PKR' },
  paidTotal: { amount: '100.00', currency: 'PKR' },
  receivableTotal: { amount: '0.00', currency: 'PKR' },
  payments: [],
  lines: [
    {
      productId: 'p1',
      productNameSnapshot: 'P4 Seed',
      packagingUnitId: null,
      unitCodeSnapshot: 'KG',
      conversionFactorSnapshot: '1',
      quantity: '2',
      quantityBase: '2',
      unitPrice: { amount: '50.00', currency: 'PKR' },
      lineProductAmount: { amount: '100.00', currency: 'PKR' },
    },
  ],
  version: 2,
  postedAt: '2026-08-13T10:00:00.000Z',
  createdAt: '2026-08-13T09:00:00.000Z',
  updatedAt: '2026-08-13T10:00:00.000Z',
};

function sessionStoreMock(permissions: string[]) {
  return {
    hasPermission: (permission: string) => permissions.includes(permission),
    filterBranches: <T>(items: T[]) => items,
    filterWarehouses: <T>(items: T[]) => items,
  };
}

describe('SaleEditPage', () => {
  it('renders draft POS form with Products-aligned page header, structured cards, and payment helpers', async () => {
    await TestBed.configureTestingModule({
      imports: [SaleEditPage],
      providers: [
        provideRouter([]),
        {
          provide: SalesApi,
          useValue: {
            getSale: () => of(null),
            createSale: () => of({}),
            updateSale: () => of({}),
            discardSale: () => of({}),
            postSale: () => of({}),
            cancelSale: () => of({}),
            listPosPaymentAccounts: () =>
              of([{ id: 'acc-1', name: 'Cash Register 1', accountType: 'cash' }]),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchProductOptions: () => of([{ id: 'p1', name: 'Wheat Seed 50kg', sku: 'WS-50' }]),
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listWarehouses: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listBranchOptions: () => of([{ id: 'br-1', name: 'Main Branch' }]),
            listWarehouseOptions: () => of([{ id: 'wh-1', name: 'Main Warehouse' }]),
          },
        },
        {
          provide: CustomersApi,
          useValue: {
            listCustomers: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchCustomerOptions: () => of([]),
          },
        },
        {
          provide: AccountsApi,
          useValue: {
            listAccounts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listAccountOptions: () => of([]),
          },
        },
        {
          provide: SalesReturnsApi,
          useValue: {
            createLinkedReturn: () => of({ id: 'r1', version: 1 }),
            postReturn: () => of({}),
          },
        },
        {
          provide: ReturnsApi,
          useValue: {
            listReturns: () => of({ items: [], meta: { page: 1, pageSize: 100, total: 0 } }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: sessionStoreMock([
            'sales.create',
            'sales.view',
            'sales.post',
            'pricing.override',
          ]),
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<SaleEditPage> = TestBed.createComponent(SaleEditPage);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    // Header assertions
    expect(compiled.querySelector('.page-head__eyebrow')?.textContent).toContain('SALES');
    expect(compiled.querySelector('.page-head__title')?.textContent).toContain('Create sale draft');
    expect(compiled.querySelector('[data-testid="sale-status-badge"]')?.textContent).toContain(
      'Draft',
    );
    expect(compiled.querySelector('[data-testid="back-to-sales"]')).toBeTruthy();

    // Draft banner
    expect(compiled.querySelector('[data-testid="sale-draft-banner"]')?.textContent).toContain(
      'Draft (unposted)',
    );

    // Structured Cards
    expect(compiled.querySelector('[data-testid="sale-info-card"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-branch"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-warehouse"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-customer-type"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-customer-picker"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-customer"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-date"]')).toBeTruthy();

    // Sale Lines Card
    expect(compiled.querySelector('[data-testid="sale-lines-form-card"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-add-line"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-line-product"]')).toBeTruthy();

    // Payments Card
    expect(compiled.querySelector('[data-testid="sale-payments"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-fill-cash"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-fill-credit"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-cart-estimate"]')).toBeTruthy();

    // Footer actions
    expect(compiled.querySelector('[data-testid="sale-save"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-post"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="sale-post"]')?.textContent).toContain(
      'Register Sale',
    );
    expect(compiled.querySelector('[data-testid="sale-print-link"]')).toBeFalsy();
  });

  it('supports adding and removing sale lines and filling payments', async () => {
    await TestBed.configureTestingModule({
      imports: [SaleEditPage],
      providers: [
        provideRouter([]),
        {
          provide: SalesApi,
          useValue: {
            getSale: () => of(null),
            createSale: () => of({}),
            updateSale: () => of({}),
            discardSale: () => of({}),
            postSale: () => of({}),
            cancelSale: () => of({}),
            listPosPaymentAccounts: () =>
              of([{ id: 'acc-1', name: 'Cash Register 1', accountType: 'cash' }]),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchProductOptions: () => of([{ id: 'p1', name: 'Wheat Seed 50kg', sku: 'WS-50' }]),
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listWarehouses: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listBranchOptions: () => of([]),
            listWarehouseOptions: () => of([]),
          },
        },
        {
          provide: CustomersApi,
          useValue: {
            listCustomers: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchCustomerOptions: () => of([]),
          },
        },
        {
          provide: AccountsApi,
          useValue: {
            listAccounts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listAccountOptions: () => of([]),
          },
        },
        {
          provide: SalesReturnsApi,
          useValue: {
            createLinkedReturn: () => of({ id: 'r1', version: 1 }),
            postReturn: () => of({}),
          },
        },
        {
          provide: ReturnsApi,
          useValue: {
            listReturns: () => of({ items: [], meta: { page: 1, pageSize: 100, total: 0 } }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: sessionStoreMock(['sales.create', 'sales.view', 'sales.post']),
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SaleEditPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.lines.length).toBe(1);

    component.addLine();
    expect(component.lines.length).toBe(2);

    component.removeLine(1);
    expect(component.lines.length).toBe(1);

    component.addPayment();
    expect(component.payments.length).toBe(1);

    component.clearPaymentsForCredit();
    expect(component.payments.length).toBe(0);

    component.fillFullCash();
    expect(component.payments.length).toBe(1);
    expect(component.paymentGroup(0).get('accountId')?.value).toBe('acc-1');
  });

  it('redirects an immutable sale away from the edit route', async () => {
    await TestBed.configureTestingModule({
      imports: [SaleEditPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'sale-posted' }) } },
        },
        {
          provide: SalesApi,
          useValue: {
            getSale: () => of(postedSale),
            listPosPaymentAccounts: () => of([]),
            postSale: () => of(postedSale),
            cancelSale: () => of(postedSale),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchProductOptions: () => of([]),
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listWarehouses: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listBranchOptions: () => of([]),
            listWarehouseOptions: () => of([]),
          },
        },
        {
          provide: CustomersApi,
          useValue: {
            listCustomers: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchCustomerOptions: () => of([]),
          },
        },
        {
          provide: AccountsApi,
          useValue: {
            listAccounts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listAccountOptions: () => of([]),
          },
        },
        {
          provide: SalesReturnsApi,
          useValue: {
            createLinkedReturn: () => of({ id: 'r1', version: 1 }),
            postReturn: () => of({}),
          },
        },
        {
          provide: ReturnsApi,
          useValue: {
            listReturns: () => of({ items: [], meta: { page: 1, pageSize: 100, total: 0 } }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: sessionStoreMock(['sales.view', 'sales.post', 'sales.cancel']),
        },
      ],
    }).compileComponents();

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture: ComponentFixture<SaleEditPage> = TestBed.createComponent(SaleEditPage);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(navigate).toHaveBeenCalledWith('/app/sales/sale-posted', { replaceUrl: true });
    expect(compiled.querySelector('[data-testid="sale-posted-view"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="sale-form"]')).toBeNull();
  });

  it('does not expose immutable lifecycle controls from the edit route', async () => {
    await TestBed.configureTestingModule({
      imports: [SaleEditPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'sale-posted' }) } },
        },
        {
          provide: SalesApi,
          useValue: {
            getSale: () => of(postedSale),
            listPosPaymentAccounts: () => of([]),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchProductOptions: () => of([]),
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listWarehouses: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listBranchOptions: () => of([]),
            listWarehouseOptions: () => of([]),
          },
        },
        {
          provide: CustomersApi,
          useValue: {
            listCustomers: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchCustomerOptions: () => of([]),
          },
        },
        {
          provide: AccountsApi,
          useValue: {
            listAccounts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listAccountOptions: () => of([]),
          },
        },
        {
          provide: SalesReturnsApi,
          useValue: {
            createLinkedReturn: () => of({ id: 'r1', version: 1 }),
            postReturn: () => of({}),
          },
        },
        {
          provide: ReturnsApi,
          useValue: {
            listReturns: () => of({ items: [], meta: { page: 1, pageSize: 100, total: 0 } }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: sessionStoreMock(['sales.view', 'sales.create', 'sales.post']),
        },
      ],
    }).compileComponents();

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture: ComponentFixture<SaleEditPage> = TestBed.createComponent(SaleEditPage);
    fixture.detectChanges();
    expect(navigate).toHaveBeenCalledWith('/app/sales/sale-posted', { replaceUrl: true });
    expect(fixture.nativeElement.querySelector('[data-testid="sale-cancel-section"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-print-link"]')).toBeFalsy();
  });

  it('respects capability gating for customer, notes, packagingUnit, and payment actions', async () => {
    await TestBed.configureTestingModule({
      imports: [SaleEditPage],
      providers: [
        provideRouter([]),
        {
          provide: SalesApi,
          useValue: {
            getSale: () => of(null),
            listPosPaymentAccounts: () =>
              of([{ id: 'acc-1', name: 'Cash Register 1', accountType: 'cash' }]),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchProductOptions: () => of([{ id: 'p1', name: 'Wheat Seed 50kg' }]),
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listWarehouses: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listBranchOptions: () => of([]),
            listWarehouseOptions: () => of([]),
          },
        },
        {
          provide: CustomersApi,
          useValue: {
            listCustomers: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchCustomerOptions: () => of([]),
          },
        },
        {
          provide: AccountsApi,
          useValue: {
            listAccounts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listAccountOptions: () => of([]),
          },
        },
        {
          provide: SalesReturnsApi,
          useValue: {
            createLinkedReturn: () => of({ id: 'r1', version: 1 }),
            postReturn: () => of({}),
          },
        },
        {
          provide: ReturnsApi,
          useValue: {
            listReturns: () => of({ items: [], meta: { page: 1, pageSize: 100, total: 0 } }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: sessionStoreMock(['sales.create', 'sales.view', 'sales.post']),
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canPerformAction: (action: string) => {
              if (action === 'sales.actions.addPaymentAtPost') return false;
              if (action === 'sales.actions.sellOnCredit') return false;
              return true;
            },
            canViewField: (field: string) => {
              if (field === 'sales.fields.customer') return false;
              if (field === 'sales.fields.notes') return false;
              if (field === 'sales.fields.packagingUnit') return false;
              return true;
            },
            canEditField: () => true,
            canUseFeature: () => true,
          },
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<SaleEditPage> = TestBed.createComponent(SaleEditPage);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="sale-customer-type"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="sale-customer-picker"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="sale-customer-search"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="sale-notes"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="sale-line-packaging"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="sale-add-payment"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="sale-fill-cash"]')).toBeNull();
    expect(compiled.querySelector('[data-testid="sale-fill-credit"]')).toBeNull();
  });

  it('loads customers when the picker opens without requiring branch or warehouse first', async () => {
    const searchCustomerOptions = vi.fn().mockReturnValue(
      of([
        {
          id: 'cust-1',
          organizationId: 'org-1',
          name: 'Kisan Ali',
          phone: '03001234567',
          customerType: 'farmer',
          priceTier: 'retail',
          creditEnabled: false,
          creditLimit: { amount: '0', currency: 'PKR' },
          creditLimitBehaviour: 'warning',
          status: 'active',
          version: 1,
        },
      ]),
    );

    await TestBed.configureTestingModule({
      imports: [SaleEditPage],
      providers: [
        provideRouter([]),
        {
          provide: SalesApi,
          useValue: {
            getSale: () => of(null),
            listPosPaymentAccounts: () => of([]),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            searchProductOptions: () => of([]),
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranchOptions: () => of([]),
            listWarehouseOptions: () => of([]),
          },
        },
        {
          provide: CustomersApi,
          useValue: {
            searchCustomerOptions,
            listCustomers: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            getCustomer: () => of(null),
          },
        },
        {
          provide: AccountsApi,
          useValue: { listAccountOptions: () => of([]) },
        },
        { provide: SalesReturnsApi, useValue: {} },
        {
          provide: ReturnsApi,
          useValue: {
            listReturns: () => of({ items: [], meta: { page: 1, pageSize: 100, total: 0 } }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: sessionStoreMock(['sales.create', 'sales.view']),
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SaleEditPage);
    fixture.detectChanges();
    await fixture.whenStable();

    const page = fixture.componentInstance;
    page.form.controls.customerTypeMode.setValue('farmer');
    page.toggleCustomerDropdown();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(searchCustomerOptions).toHaveBeenCalledWith('');
    expect(searchCustomerOptions).toHaveBeenCalledTimes(1);
    expect(page.filteredCustomers().some((customer) => customer.name === 'Kisan Ali')).toBe(true);
  });

  it('does not preload customers on init', async () => {
    const searchProductOptions = vi
      .fn()
      .mockReturnValue(of([{ id: 'p1', name: 'Wheat Seed 50kg', sku: 'WS-50', status: 'active' }]));
    const listCustomers = vi
      .fn()
      .mockReturnValue(of({ items: [], meta: { page: 1, pageSize: 500, total: 0 } }));
    const searchCustomerOptions = vi.fn().mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [SaleEditPage],
      providers: [
        provideRouter([]),
        {
          provide: SalesApi,
          useValue: {
            getSale: () => of(null),
            listPosPaymentAccounts: () => of([]),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            searchProductOptions,
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranchOptions: () => of([]),
            listWarehouseOptions: () => of([]),
          },
        },
        {
          provide: CustomersApi,
          useValue: {
            searchCustomerOptions,
            listCustomers,
            getCustomer: () => of(null),
          },
        },
        {
          provide: AccountsApi,
          useValue: { listAccountOptions: () => of([]) },
        },
        {
          provide: SalesReturnsApi,
          useValue: {},
        },
        {
          provide: ReturnsApi,
          useValue: {
            listReturns: () => of({ items: [], meta: { page: 1, pageSize: 100, total: 0 } }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: sessionStoreMock(['sales.create', 'sales.view']),
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<SaleEditPage> = TestBed.createComponent(SaleEditPage);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(searchProductOptions).toHaveBeenCalledWith('', 25, 'active');
    expect(listCustomers).not.toHaveBeenCalled();
    expect(searchCustomerOptions).not.toHaveBeenCalled();
    expect(fixture.componentInstance.products().length).toBe(1);
  });
});
