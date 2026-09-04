import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { SaleDetailPage } from './sale-detail.page';
import { SalesApi } from '../../data-access/sales.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { SaleRecord } from '../../models/sales.models';

const sale: SaleRecord = {
  id: 'sale-1', organizationId: 'org-1', branchId: 'branch-archived', warehouseId: 'warehouse-archived',
  branchNameSnapshot: 'Historic Branch', warehouseNameSnapshot: 'Historic Warehouse', customerId: null,
  customerNameSnapshot: null, priceTierSnapshot: 'retail', saleDate: '2026-09-04', notes: '', status: 'draft',
  invoiceNumber: null, saleTotal: { amount: '1200.00', currency: 'PKR' }, paidTotal: { amount: '0', currency: 'PKR' },
  receivableTotal: { amount: '1200', currency: 'PKR' }, lines: [{ productId: 'p1', productNameSnapshot: 'Seed',
    packagingUnitId: null, unitCodeSnapshot: 'bag', conversionFactorSnapshot: '1', quantity: '2', quantityBase: '2',
    unitPrice: { amount: '600', currency: 'PKR' }, lineProductAmount: { amount: '1200', currency: 'PKR' } }],
  version: 1, postedAt: null, createdAt: '2026-09-04T10:00:00.000Z', updatedAt: '2026-09-04T10:00:00.000Z',
};

describe('SaleDetailPage', () => {
  async function setup(options: { edit?: boolean; response?: Observable<SaleRecord> } = {}) {
    const api = { getSale: vi.fn().mockReturnValue(options.response ?? of(sale)) };
    await TestBed.configureTestingModule({
      imports: [SaleDetailPage],
      providers: [
        provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'sale-1' }) } } },
        { provide: SalesApi, useValue: api },
        { provide: AuthSessionStore, useValue: { hasPermission: (permission: string) => permission === 'sales.view' || (permission === 'sales.create' && options.edit === true) } },
        { provide: CapabilityService, useValue: { canUseModule: () => true, canPerformAction: () => true } },
      ],
    }).compileComponents();
    const fixture: ComponentFixture<SaleDetailPage> = TestBed.createComponent(SaleDetailPage);
    fixture.detectChanges();
    return { fixture, api };
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
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });

  it('keeps Edit hidden for a view-only user', async () => {
    const { fixture } = await setup();
    expect(fixture.nativeElement.querySelector('[data-testid="sale-edit-link"]')).toBeNull();
  });

  it('shows Edit only for an editable draft with edit authority', async () => {
    const { fixture } = await setup({ edit: true });
    expect(fixture.nativeElement.querySelector('[data-testid="sale-edit-link"]')?.getAttribute('href')).toBe('/app/sales/sale-1/edit');
  });

  it('renders the safe inquiry error from denied or cross-organization access', async () => {
    const response = throwError(
      () => new HttpErrorResponse({ status: 404, error: { error: { message: 'Sale not found' } } }),
    );
    const { fixture } = await setup({ response });
    expect(fixture.nativeElement.textContent).toContain('Sale not found');
  });
});
