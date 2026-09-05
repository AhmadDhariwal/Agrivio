import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
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
import { CustomerRecord } from '../../../customers/models/customers.models';

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

  const draftRecord: SaleRecord = {
    id: 'draft-101',
    organizationId: 'org-1',
    branchId: 'br-1',
    branchNameSnapshot: 'Main Branch',
    warehouseId: 'wh-1',
    warehouseNameSnapshot: 'Main Warehouse',
    customerId: null,
    customerNameSnapshot: 'Walk-in',
    saleDate: '2026-08-13',
    notes: '',
    status: 'draft',
    invoiceNumber: null,
    saleTotal: { amount: '100.00', currency: 'PKR' },
    paidTotal: { amount: '0.00', currency: 'PKR' },
    receivableTotal: { amount: '100.00', currency: 'PKR' },
    payments: [],
    lines: [
      {
        productId: 'p1',
        productNameSnapshot: 'Wheat Seed 50kg',
        packagingUnitId: null,
        unitCodeSnapshot: 'KG',
        conversionFactorSnapshot: '1',
        quantity: '2',
        quantityBase: '2',
        unitPrice: { amount: '50.00', currency: 'PKR' },
        lineProductAmount: { amount: '100.00', currency: 'PKR' },
      },
    ],
    version: 1,
    postedAt: null,
    createdAt: '2026-08-13T09:00:00.000Z',
    updatedAt: '2026-08-13T09:00:00.000Z',
  };

  const mockCustomer: CustomerRecord = {
    id: 'c1',
    organizationId: 'org-1',
    name: 'Farmer Ali',
    phone: '03001234567',
    customerType: 'farmer',
    priceTier: 'retail',
    creditEnabled: true,
    creditLimit: { amount: '10000.00', currency: 'PKR' },
    creditLimitBehaviour: 'warning',
    status: 'active',
    version: 1,
  };

  function setupDraftTest(options?: {
    saleId?: string | null;
    sale?: SaleRecord | null;
    createSaleSpy?: ReturnType<typeof vi.fn>;
    updateSaleSpy?: ReturnType<typeof vi.fn>;
    postSaleSpy?: ReturnType<typeof vi.fn>;
    permissions?: string[];
  }) {
    const createSale =
      options?.createSaleSpy ??
      vi.fn().mockReturnValue(of({ ...draftRecord, id: 'created-draft-1', version: 1 }));
    const updateSale =
      options?.updateSaleSpy ??
      vi.fn().mockReturnValue(of({ ...draftRecord, version: 2 }));
    const postSale =
      options?.postSaleSpy ??
      vi.fn().mockReturnValue(
        of({
          ...draftRecord,
          id: options?.saleId ?? 'created-draft-1',
          status: 'posted',
          version: 2,
          invoiceNumber: 'INV-1001',
        }),
      );
    const getSale = vi.fn().mockReturnValue(of(options?.sale ?? null));

    return TestBed.configureTestingModule({
      imports: [SaleEditPage],
      providers: [
        provideRouter([{ path: '**', component: SaleEditPage }]),
        ...(options?.saleId
          ? [
              {
                provide: ActivatedRoute,
                useValue: {
                  snapshot: { paramMap: convertToParamMap({ id: options.saleId }) },
                },
              },
            ]
          : []),
        {
          provide: SalesApi,
          useValue: {
            getSale,
            createSale,
            updateSale,
            discardSale: () => of({}),
            postSale,
            cancelSale: () => of({}),
            listPosPaymentAccounts: () =>
              of([{ id: 'acc-1', name: 'Cash Register 1', accountType: 'cash' }]),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchProductOptions: () =>
              of([{ id: 'p1', name: 'Wheat Seed 50kg', sku: 'WS-50', status: 'active' }]),
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listWarehouses: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            listBranchOptions: () => of([{ id: 'br-1', name: 'Main Branch', status: 'active' }]),
            listWarehouseOptions: () => of([{ id: 'wh-1', name: 'Main Warehouse', status: 'active' }]),
          },
        },
        {
          provide: CustomersApi,
          useValue: {
            listCustomers: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
            searchCustomerOptions: () =>
              of([
                { id: 'c1', name: 'Farmer Ali', customerType: 'farmer', priceTier: 'retail', status: 'active' },
              ]),
            getCustomer: () =>
              of({ id: 'c1', name: 'Farmer Ali', customerType: 'farmer', priceTier: 'retail', status: 'active' }),
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
          useValue: sessionStoreMock(
            options?.permissions ?? ['sales.create', 'sales.view', 'sales.post'],
          ),
        },
      ],
    }).compileComponents();
  }

  describe('Save Draft Button and Validity Contract', () => {
    it('enables Save Draft for valid minimal draft and disables for invalid/empty inputs', async () => {
      await setupDraftTest();
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      // Initially incomplete (missing branch, warehouse, line details)
      expect(component.canSaveDraft()).toBe(false);

      // Provide valid branch, warehouse, date, line with qty & unitPrice
      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '5',
        unitPrice: '100.00',
      });
      fixture.detectChanges();

      expect(component.isDraftValid()).toBe(true);
      expect(component.canSaveDraft()).toBe(true);

      const compiled = fixture.nativeElement as HTMLElement;
      const saveButton = compiled.querySelector('[data-testid="sale-save"]') as HTMLButtonElement;
      expect(saveButton).toBeTruthy();
      expect(saveButton.disabled).toBe(false);

      // Invalidate by clearing branch
      component.form.controls.branchId.setValue('');
      fixture.detectChanges();
      expect(component.canSaveDraft()).toBe(false);
      expect(saveButton.disabled).toBe(true);

      // Restore branch, invalidate quantity to 0
      component.form.controls.branchId.setValue('br-1');
      component.lineGroup(0).get('quantity')!.setValue('0');
      fixture.detectChanges();
      expect(component.canSaveDraft()).toBe(false);

      // Invalidate quantity to negative
      component.lineGroup(0).get('quantity')!.setValue('-2');
      fixture.detectChanges();
      expect(component.canSaveDraft()).toBe(false);

      // Restore quantity, invalidate unitPrice to 0
      component.lineGroup(0).get('quantity')!.setValue('3');
      component.lineGroup(0).get('unitPrice')!.setValue('0');
      fixture.detectChanges();
      expect(component.canSaveDraft()).toBe(false);

      // Restore unitPrice -> valid again
      component.lineGroup(0).get('unitPrice')!.setValue('50.00');
      fixture.detectChanges();
      expect(component.canSaveDraft()).toBe(true);
    });

    it('allows saving draft with zero payment rows', async () => {
      const createSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, id: 'created-draft-1', version: 1 }));
      await setupDraftTest({ createSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '2',
        unitPrice: '50.00',
      });
      fixture.detectChanges();

      expect(component.payments.length).toBe(0);
      expect(component.canSaveDraft()).toBe(true);

      component.save();

      expect(createSaleSpy).toHaveBeenCalledWith({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        customerId: null,
        saleDate: '2026-08-13',
        notes: '',
        lines: [
          {
            productId: 'p1',
            quantity: '2',
            unitPrice: { amount: '50.00', currency: 'PKR' },
          },
        ],
      });
      expect(component.successMessage()).toContain('Sale draft saved');
    });

    it('allows saving draft even when payment rows are incomplete (payments decoupled from draft)', async () => {
      const createSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, id: 'created-draft-1', version: 1 }));
      await setupDraftTest({ createSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '2',
        unitPrice: '50.00',
      });

      // Add an unconfigured payment row
      component.addPayment();
      expect(component.payments.length).toBe(1);
      expect(component.payments.valid).toBe(false);

      // Draft validity must not be blocked by incomplete payment rows
      fixture.detectChanges();
      expect(component.isDraftValid()).toBe(true);
      expect(component.canSaveDraft()).toBe(true);

      component.save();
      expect(createSaleSpy).toHaveBeenCalled();
    });

    it('allows saving a credit sale draft for a non-walk-in customer', async () => {
      const createSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, id: 'credit-draft-1', customerId: 'c1', version: 1 }));
      await setupDraftTest({ createSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '4',
        unitPrice: '25.00',
      });

      // Switch to farmer customer type mode and select customer
      component.form.controls.customerTypeMode.setValue('farmer');
      component.selectCustomer({
        id: 'c1',
        name: 'Farmer Ali',
        customerType: 'farmer',
        priceTier: 'retail',
        status: 'active',
      } as any);

      component.clearPaymentsForCredit();
      expect(component.payments.length).toBe(0);

      fixture.detectChanges();
      expect(component.canSaveDraft()).toBe(true);

      component.save();
      expect(createSaleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'c1',
          branchId: 'br-1',
          warehouseId: 'wh-1',
        }),
      );
    });

    it('updates existing draft with expectedVersion and synchronizes local state', async () => {
      const updateSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, version: 2, notes: 'Updated note' }));
      await setupDraftTest({
        saleId: 'draft-101',
        sale: draftRecord,
        updateSaleSpy,
      });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.saleId()).toBe('draft-101');
      expect(component.canSaveDraft()).toBe(true);

      // Modify notes
      component.form.controls.notes.setValue('Updated note');
      fixture.detectChanges();

      component.save();

      expect(updateSaleSpy).toHaveBeenCalledWith(
        'draft-101',
        expect.objectContaining({
          expectedVersion: 1,
          notes: 'Updated note',
        }),
      );
      expect(component.sale()?.version).toBe(2);
      expect(component.successMessage()).toContain('Sale draft saved');
    });

    it('prevents duplicate save requests when save is triggered while saving', async () => {
      const createSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, id: 'draft-once', version: 1 }));
      await setupDraftTest({ createSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '1',
        unitPrice: '10.00',
      });
      fixture.detectChanges();

      // Simulate first save in flight
      component.saving.set(true);
      expect(component.canSaveDraft()).toBe(false);

      // Attempt second save while in flight
      component.save();
      expect(createSaleSpy).not.toHaveBeenCalled();

      // Reset saving and save normally
      component.saving.set(false);
      expect(component.canSaveDraft()).toBe(true);
      component.save();
      expect(createSaleSpy).toHaveBeenCalledTimes(1);
    });

    it('surfaces backend validation errors cleanly to the user', async () => {
      const createSaleSpy = vi.fn().mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 422,
              error: { error: { message: 'Line quantity exceeds allowable packaging constraints.' } },
            }),
        ),
      );
      await setupDraftTest({ createSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '999',
        unitPrice: '10.00',
      });
      fixture.detectChanges();

      component.save();

      expect(component.saving()).toBe(false);
      expect(component.errorMessage()).toBe(
        'Line quantity exceeds allowable packaging constraints.',
      );
    });
  });

  describe('Register and Post Sale Workflow', () => {
    it('sends draft create and postSale API requests on Register Sale click', async () => {
      const createSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, id: 'created-draft-1', version: 1 }));
      const postSaleSpy = vi.fn().mockReturnValue(
        of({
          ...draftRecord,
          id: 'created-draft-1',
          status: 'posted',
          version: 2,
          invoiceNumber: 'INV-1001',
        }),
      );

      await setupDraftTest({ createSaleSpy, postSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '2',
        unitPrice: '50.00',
      });
      fixture.detectChanges();

      expect(component.posting()).toBe(false);
      component.post();

      expect(createSaleSpy).toHaveBeenCalledTimes(1);
      expect(postSaleSpy).toHaveBeenCalledWith(
        'created-draft-1',
        expect.objectContaining({
          expectedVersion: 1,
          payments: [],
        }),
        expect.any(String),
      );
      expect(component.posting()).toBe(false);
      expect(component.successMessage()).toContain('Sale posted successfully. Invoice INV-1001.');
      expect(component.sale()?.status).toBe('posted');
    });

    it('resets loading state and surfaces error when validation fails before API call', async () => {
      const createSaleSpy = vi.fn();
      const postSaleSpy = vi.fn();

      await setupDraftTest({ createSaleSpy, postSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      // Form is empty (missing branch, warehouse, line details)
      expect(component.posting()).toBe(false);
      component.post();

      expect(component.posting()).toBe(false);
      expect(component.errorMessage()).toBe('Select a branch before continuing.');
      expect(createSaleSpy).not.toHaveBeenCalled();
      expect(postSaleSpy).not.toHaveBeenCalled();
    });

    it('resets loading state on draft creation API failure', async () => {
      const createSaleSpy = vi.fn().mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 422,
              error: { error: { message: 'Tenant storage quota exceeded' } },
            }),
        ),
      );
      const postSaleSpy = vi.fn();

      await setupDraftTest({ createSaleSpy, postSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '1',
        unitPrice: '20.00',
      });
      fixture.detectChanges();

      component.post();

      expect(component.posting()).toBe(false);
      expect(component.errorMessage()).toBe('Tenant storage quota exceeded');
      expect(postSaleSpy).not.toHaveBeenCalled();
    });

    it('resets loading state on postSale API failure', async () => {
      const createSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, id: 'created-draft-1', version: 1 }));
      const postSaleSpy = vi.fn().mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { error: { message: 'Stock conflict: insufficient inventory' } },
            }),
        ),
      );

      await setupDraftTest({ createSaleSpy, postSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '5',
        unitPrice: '10.00',
      });
      fixture.detectChanges();

      component.post();

      expect(component.posting()).toBe(false);
      expect(component.errorMessage()).toBe('Stock conflict: insufficient inventory');
    });

    it('posts full cash sale with payment row', async () => {
      const createSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, id: 'created-draft-cash', version: 1 }));
      const postSaleSpy = vi.fn().mockReturnValue(
        of({
          ...draftRecord,
          id: 'created-draft-cash',
          status: 'posted',
          version: 2,
          invoiceNumber: 'INV-CASH-1',
        }),
      );

      await setupDraftTest({ createSaleSpy, postSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '2',
        unitPrice: '50.00',
      });
      component.addPayment();
      component.paymentGroup(0).patchValue({
        accountId: 'acc-1',
        amount: '100.00',
      });
      fixture.detectChanges();

      component.post();

      expect(postSaleSpy).toHaveBeenCalledWith(
        'created-draft-cash',
        expect.objectContaining({
          payments: [{ accountId: 'acc-1', amount: { amount: '100.00', currency: 'PKR' } }],
        }),
        expect.any(String),
      );
      expect(component.posting()).toBe(false);
    });

    it('posts partial payment with remainder on credit for registered customer', async () => {
      const createSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, id: 'partial-credit-draft', version: 1 }));
      const postSaleSpy = vi.fn().mockReturnValue(
        of({
          ...draftRecord,
          id: 'partial-credit-draft',
          status: 'posted',
          version: 2,
          invoiceNumber: 'INV-PARTIAL-1',
        }),
      );

      await setupDraftTest({ createSaleSpy, postSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '2',
        unitPrice: '50.00',
      });
      component.form.controls.customerTypeMode.setValue('farmer');
      component.selectCustomer(mockCustomer);

      component.addPayment();
      component.paymentGroup(0).patchValue({
        accountId: 'acc-1',
        amount: '40.00',
      });
      fixture.detectChanges();

      component.post();

      expect(postSaleSpy).toHaveBeenCalledWith(
        'partial-credit-draft',
        expect.objectContaining({
          payments: [{ accountId: 'acc-1', amount: { amount: '40.00', currency: 'PKR' } }],
        }),
        expect.any(String),
      );
      expect(component.posting()).toBe(false);
    });

    it('posts full credit sale with ZERO payments', async () => {
      const createSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, id: 'full-credit-draft', version: 1 }));
      const postSaleSpy = vi.fn().mockReturnValue(
        of({
          ...draftRecord,
          id: 'full-credit-draft',
          status: 'posted',
          version: 2,
          invoiceNumber: 'INV-CREDIT-1',
        }),
      );

      await setupDraftTest({ createSaleSpy, postSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '2',
        unitPrice: '50.00',
      });
      component.form.controls.customerTypeMode.setValue('farmer');
      component.selectCustomer(mockCustomer);

      component.clearPaymentsForCredit();
      expect(component.payments.length).toBe(0);
      fixture.detectChanges();

      component.post();

      expect(createSaleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'c1',
        }),
      );
      expect(postSaleSpy).toHaveBeenCalledWith(
        'full-credit-draft',
        expect.objectContaining({
          expectedVersion: 1,
          payments: [],
        }),
        expect.any(String),
      );
      expect(component.posting()).toBe(false);
    });

    it('prevents double-click submission while posting is in flight', async () => {
      const createSaleSpy = vi.fn();
      const postSaleSpy = vi.fn();

      await setupDraftTest({ createSaleSpy, postSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '1',
        unitPrice: '10.00',
      });
      fixture.detectChanges();

      // Simulate posting in flight
      component.posting.set(true);

      component.post();

      expect(createSaleSpy).not.toHaveBeenCalled();
      expect(postSaleSpy).not.toHaveBeenCalled();
    });

    it('stops registering and displays error when backend rejects invalid credit', async () => {
      const createSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, id: 'invalid-credit-draft', version: 1 }));
      const postSaleSpy = vi.fn().mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 422,
              error: { error: { message: 'Customer credit is not enabled' } },
            }),
        ),
      );

      await setupDraftTest({ createSaleSpy, postSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '1',
        unitPrice: '100.00',
      });
      component.form.controls.customerTypeMode.setValue('farmer');
      component.selectCustomer(mockCustomer);

      component.clearPaymentsForCredit();
      fixture.detectChanges();

      component.post();

      expect(component.posting()).toBe(false);
      expect(component.errorMessage()).toBe('Customer credit is not enabled');
    });

    it('passes manager approval reasons when credit limit override reason is provided', async () => {
      const createSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, id: 'approval-draft-1', version: 1 }));
      const postSaleSpy = vi.fn().mockReturnValue(
        of({
          ...draftRecord,
          id: 'approval-draft-1',
          status: 'posted',
          version: 2,
          invoiceNumber: 'INV-APP-1',
        }),
      );

      await setupDraftTest({ createSaleSpy, postSaleSpy });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.patchValue({
        branchId: 'br-1',
        warehouseId: 'wh-1',
        saleDate: '2026-08-13',
      });
      component.lineGroup(0).patchValue({
        productId: 'p1',
        quantity: '1',
        unitPrice: '500.00',
      });
      component.form.controls.creditLimitApprovalReason.setValue('Approved for sowing season');
      fixture.detectChanges();

      component.post();

      expect(postSaleSpy).toHaveBeenCalledWith(
        'approval-draft-1',
        expect.objectContaining({
          approvals: { creditLimit: { reason: 'Approved for sowing season' } },
        }),
        expect.any(String),
      );
      expect(component.posting()).toBe(false);
    });

    it('updates existing draft before posting when posting from an edit route', async () => {
      const updateSaleSpy = vi
        .fn()
        .mockReturnValue(of({ ...draftRecord, id: 'draft-existing-1', version: 3 }));
      const postSaleSpy = vi.fn().mockReturnValue(
        of({
          ...draftRecord,
          id: 'draft-existing-1',
          status: 'posted',
          version: 4,
          invoiceNumber: 'INV-UPD-1',
        }),
      );

      await setupDraftTest({
        saleId: 'draft-existing-1',
        sale: { ...draftRecord, id: 'draft-existing-1', version: 2 },
        updateSaleSpy,
        postSaleSpy,
      });
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      component.form.controls.notes.setValue('Updated special instructions');
      fixture.detectChanges();

      component.post();

      expect(updateSaleSpy).toHaveBeenCalledWith(
        'draft-existing-1',
        expect.objectContaining({
          expectedVersion: 2,
          notes: 'Updated special instructions',
        }),
      );
      expect(postSaleSpy).toHaveBeenCalledWith(
        'draft-existing-1',
        expect.objectContaining({
          expectedVersion: 3,
        }),
        expect.any(String),
      );
      expect(component.posting()).toBe(false);
    });
  });

  describe('Credit Button and Tender Selection UI', () => {
    it('visually selects Credit button and displays Credit Settlement card when Credit is clicked', async () => {
      setupDraftTest();
      const fixture = TestBed.createComponent(SaleEditPage);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      const creditBtn = fixture.nativeElement.querySelector(
        '[data-testid="sale-fill-credit"]',
      ) as HTMLButtonElement;
      const cashBtn = fixture.nativeElement.querySelector(
        '[data-testid="sale-fill-cash"]',
      ) as HTMLButtonElement;

      // Initially neither button is selected
      expect(component.isCreditSelected()).toBe(false);
      expect(component.isCashSelected()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="sale-credit-selected-card"]')).toBeNull();

      // Click Credit (no payment)
      creditBtn.click();
      fixture.detectChanges();

      // Credit is now selected
      expect(component.isCreditSelected()).toBe(true);
      expect(component.isCashSelected()).toBe(false);
      expect(creditBtn.classList.contains('ag-btn--primary')).toBe(true);
      expect(creditBtn.getAttribute('aria-pressed')).toBe('true');
      expect(creditBtn.querySelector('svg')).toBeTruthy(); // Checkmark icon

      // Customer type was switched from walk-in to farmer to enable credit
      expect(component.form.controls.customerTypeMode.value).toBe('farmer');

      // Credit card is rendered
      const creditCard = fixture.nativeElement.querySelector(
        '[data-testid="sale-credit-selected-card"]',
      );
      expect(creditCard).toBeTruthy();
      expect(creditCard.textContent).toContain('Credit Sale Active');

      // Select registered customer and verify details in card
      component.selectCustomer(mockCustomer);
      fixture.detectChanges();

      expect(
        fixture.nativeElement.querySelector('[data-testid="sale-credit-customer-name"]')?.textContent,
      ).toContain('Farmer Ali');
      expect(
        fixture.nativeElement.querySelector('[data-testid="sale-credit-enabled-badge"]'),
      ).toBeTruthy();

      // Clicking Full cash switches selection to Cash
      cashBtn.click();
      fixture.detectChanges();

      expect(component.isCreditSelected()).toBe(false);
      expect(component.isCashSelected()).toBe(true);
      expect(cashBtn.classList.contains('ag-btn--primary')).toBe(true);
      expect(creditBtn.classList.contains('ag-btn--primary')).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="sale-credit-selected-card"]')).toBeNull();
      expect(component.payments.length).toBe(1);
    });
  });
});
