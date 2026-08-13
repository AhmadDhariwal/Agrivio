import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { SaleEditPage } from './sale-edit.page';
import { SalesApi } from '../../data-access/sales.api';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import { BranchesWarehousesApi } from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { SalesReturnsApi } from '../../data-access/sales-returns.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
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
  it('renders draft POS form with payment helpers', async () => {
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
            listPosPaymentAccounts: () => of([]),
          },
        },
        {
          provide: CatalogApi,
          useValue: {
            listProducts: () => of([]),
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () => of([]),
            listWarehouses: () => of([]),
          },
        },
        {
          provide: CustomersApi,
          useValue: { listCustomers: () => of([]) },
        },
        {
          provide: AccountsApi,
          useValue: { listAccounts: () => of([]) },
        },
        {
          provide: SalesReturnsApi,
          useValue: { createLinkedReturn: () => of({ id: 'r1', version: 1 }), postReturn: () => of({}) },
        },
        {
          provide: AuthSessionStore,
          useValue: sessionStoreMock(['sales.create', 'sales.view', 'sales.post']),
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<SaleEditPage> = TestBed.createComponent(SaleEditPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-form"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-draft-banner"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-payments"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-fill-cash"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-print-link"]')).toBeFalsy();
  });

  it('shows invoice number and print entry on a posted sale', async () => {
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
            listProducts: () => of([]),
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () => of([]),
            listWarehouses: () => of([]),
          },
        },
        {
          provide: CustomersApi,
          useValue: { listCustomers: () => of([]) },
        },
        {
          provide: AccountsApi,
          useValue: { listAccounts: () => of([]) },
        },
        {
          provide: SalesReturnsApi,
          useValue: { createLinkedReturn: () => of({ id: 'r1', version: 1 }), postReturn: () => of({}) },
        },
        {
          provide: AuthSessionStore,
          useValue: sessionStoreMock(['sales.view', 'sales.post', 'sales.cancel']),
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<SaleEditPage> = TestBed.createComponent(SaleEditPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-invoice-number"]')?.textContent).toContain(
      'P4A-000001',
    );
    expect(fixture.nativeElement.querySelector('[data-testid="sale-print-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-cancel-section"]')).toBeTruthy();
  });

  it('hides cancellation for cashiers without sales.cancel', async () => {
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
            listProducts: () => of([]),
            listPackagingUnits: () => of([]),
            listPrices: () => of([]),
          },
        },
        {
          provide: BranchesWarehousesApi,
          useValue: {
            listBranches: () => of([]),
            listWarehouses: () => of([]),
          },
        },
        {
          provide: CustomersApi,
          useValue: { listCustomers: () => of([]) },
        },
        {
          provide: AccountsApi,
          useValue: { listAccounts: () => of([]) },
        },
        {
          provide: SalesReturnsApi,
          useValue: { createLinkedReturn: () => of({ id: 'r1', version: 1 }), postReturn: () => of({}) },
        },
        {
          provide: AuthSessionStore,
          useValue: sessionStoreMock(['sales.view', 'sales.create', 'sales.post']),
        },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<SaleEditPage> = TestBed.createComponent(SaleEditPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-cancel-section"]')).toBeFalsy();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-print-link"]')).toBeTruthy();
  });
});
