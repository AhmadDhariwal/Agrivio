import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { SaleDetailPage } from './sale-detail.page';
import { SalesApi } from '../../data-access/sales.api';
import { SalesReturnsApi } from '../../data-access/sales-returns.api';
import { ReturnsApi } from '../../../returns/data-access/returns.api';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { SaleRecord } from '../../models/sales.models';

const sale: SaleRecord = {
  id: 'sale-1',
  organizationId: 'org-1',
  branchId: 'branch-archived',
  warehouseId: 'warehouse-archived',
  branchNameSnapshot: 'Historic Branch',
  warehouseNameSnapshot: 'Historic Warehouse',
  customerId: null,
  customerNameSnapshot: null,
  priceTierSnapshot: 'retail',
  saleDate: '2026-09-04',
  notes: '',
  status: 'draft',
  invoiceNumber: null,
  saleTotal: { amount: '1200.00', currency: 'PKR' },
  paidTotal: { amount: '0', currency: 'PKR' },
  receivableTotal: { amount: '1200', currency: 'PKR' },
  lines: [
    {
      productId: 'p1',
      productNameSnapshot: 'Seed',
      packagingUnitId: null,
      unitCodeSnapshot: 'bag',
      conversionFactorSnapshot: '1',
      quantity: '2',
      quantityBase: '2',
      unitPrice: { amount: '600', currency: 'PKR' },
      lineProductAmount: { amount: '1200', currency: 'PKR' },
    },
  ],
  version: 1,
  postedAt: null,
  createdAt: '2026-09-04T10:00:00.000Z',
  updatedAt: '2026-09-04T10:00:00.000Z',
};

const postedSale: SaleRecord = {
  ...sale,
  id: 'sale-posted-1',
  status: 'posted',
  invoiceNumber: 'INV-2026-0001',
  postedAt: '2026-09-04T11:00:00.000Z',
};

describe('SaleDetailPage', () => {
  async function setup(
    options: {
      edit?: boolean;
      post?: boolean;
      cancel?: boolean;
      returnPerm?: boolean;
      response?: Observable<SaleRecord>;
    } = {},
  ) {
    const api = {
      getSale: vi.fn().mockReturnValue(options.response ?? of(sale)),
      cancelSale: vi.fn().mockReturnValue(
        of({
          ...postedSale,
          status: 'cancelled',
          cancellationReason: 'Wrong order',
          cancelledAt: '2026-09-04T12:00:00.000Z',
        }),
      ),
    };
    const salesReturnsApi = {
      createLinkedReturn: vi.fn().mockReturnValue(of({ id: 'ret-1', version: 1 })),
      postReturn: vi.fn().mockReturnValue(of({ id: 'ret-1', status: 'posted' })),
    };
    const returnsApi = {
      listReturns: vi.fn().mockReturnValue(of({ items: [], total: 0 })),
    };
    const accountsApi = {
      listAccountOptions: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [SaleDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'sale-1' }) } },
        },
        { provide: SalesApi, useValue: api },
        { provide: SalesReturnsApi, useValue: salesReturnsApi },
        { provide: ReturnsApi, useValue: returnsApi },
        { provide: AccountsApi, useValue: accountsApi },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (permission: string) => {
              if (permission === 'sales.view') return true;
              if (permission === 'sales.create' && options.edit === true) return true;
              if (permission === 'sales.cancel' && options.cancel !== false) return true;
              if (permission === 'returns.post' && options.returnPerm !== false) return true;
              if (permission === 'returns.view') return true;
              return false;
            },
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => true,
            canPerformAction: () => true,
            canViewField: () => true,
          },
        },
      ],
    }).compileComponents();
    const fixture: ComponentFixture<SaleDetailPage> = TestBed.createComponent(SaleDetailPage);
    fixture.detectChanges();
    return { fixture, api, salesReturnsApi, returnsApi, accountsApi };
  }

  it('loads one authoritative sale and renders stored location snapshots without edit controls', async () => {
    const { fixture, api } = await setup();
    expect(api.getSale).toHaveBeenCalledWith('sale-1');
    expect(fixture.nativeElement.textContent).toContain('Sale Details');
    expect(fixture.nativeElement.textContent).toContain('Historic Branch');
    expect(fixture.nativeElement.textContent).toContain('Historic Warehouse');
    expect(fixture.nativeElement.textContent).not.toContain(
      "You don't have access to this branch or warehouse.",
    );
    expect(fixture.nativeElement.querySelector('[data-testid="sale-cancel-section"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="sales-return-section"]')).toBeNull();
  });

  it('keeps Edit hidden for a view-only user', async () => {
    const { fixture } = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-edit-link"]')).toBeNull();
  });

  it('shows Edit only for an editable draft with edit authority', async () => {
    const { fixture } = await setup({ edit: true });
    expect(
      fixture.nativeElement.querySelector('[data-testid="sale-edit-link"]')?.getAttribute('href'),
    ).toBe('/app/sales/sale-1/edit');
  });

  it('renders the safe inquiry error from denied or cross-organization access', async () => {
    const response = throwError(
      () => new HttpErrorResponse({ status: 404, error: { error: { message: 'Sale not found' } } }),
    );
    const { fixture } = await setup({ response });
    expect(fixture.nativeElement.textContent).toContain('Sale not found');
  });

  it('shows cancel section and return section for eligible posted sales', async () => {
    const { fixture } = await setup({ response: of(postedSale), cancel: true, returnPerm: true });
    expect(fixture.nativeElement.querySelector('[data-testid="sale-cancel-section"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="sales-return-section"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-posted-banner"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-edit-link"]')).toBeNull();
  });

  it('cancels sale through confirmation flow', async () => {
    const { fixture, api } = await setup({ response: of(postedSale), cancel: true });
    const component = fixture.componentInstance;
    component.cancelForm.controls.reason.setValue('E2E cancellation proof');
    component.cancel();
    expect(component.cancelConfirmOpen()).toBe(true);

    component.confirmCancel();
    expect(api.cancelSale).toHaveBeenCalledWith(
      'sale-posted-1',
      { reason: 'E2E cancellation proof', expectedVersion: 1 },
      expect.any(String),
    );
  });
});
