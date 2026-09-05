import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { PurchaseDetailPage } from './purchase-detail.page';
import { PurchasesApi } from '../../data-access/purchases.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { PurchaseRecord } from '../../models/purchases.models';

const money = { amount: '100.00', currency: 'PKR' };
const purchase: PurchaseRecord = {
  id: 'purchase-1',
  organizationId: 'org-1',
  branchId: null,
  warehouseId: 'warehouse-old',
  warehouseNameSnapshot: 'Historic Store',
  supplierId: 'supplier-1',
  supplierNameSnapshot: 'Farm Supply',
  supplierInvoiceReference: 'INV-1',
  purchaseDate: '2026-09-04',
  notes: '',
  status: 'posted',
  lines: [
    {
      productId: 'p1',
      productNameSnapshot: 'Seed',
      trackingModeSnapshot: 'none',
      packagingUnitId: null,
      unitCodeSnapshot: 'bag',
      conversionFactorSnapshot: '1',
      quantity: '1',
      quantityBase: '1',
      unitCost: money,
      lineProductAmount: money,
      batchNumber: null,
      manufacturingDate: null,
      expiryDate: null,
    },
  ],
  landedCosts: { freight: money, loading: money, transport: money, other: money },
  purchaseTotal: money,
  paidTotal: money,
  payableTotal: money,
  version: 1,
  createdBy: 'user-1',
  createdAt: '2026-09-04T00:00:00Z',
  updatedAt: null,
  postedAt: '2026-09-04T00:00:00Z',
};

describe('PurchaseDetailPage', () => {
  it('uses only the authoritative purchase inquiry and has no editable controls', async () => {
    const api = { getPurchase: vi.fn().mockReturnValue(of(purchase)) };
    await TestBed.configureTestingModule({
      imports: [PurchaseDetailPage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'purchase-1' }) } },
        },
        { provide: PurchasesApi, useValue: api },
        { provide: AuthSessionStore, useValue: { hasPermission: () => true } },
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
    const fixture = TestBed.createComponent(PurchaseDetailPage);
    fixture.detectChanges();
    expect(api.getPurchase).toHaveBeenCalledWith('purchase-1');
    expect(fixture.nativeElement.textContent).toContain('Purchase Details');
    expect(fixture.nativeElement.textContent).toContain('Historic Store');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="purchase-edit-link"]')).toBeNull();
  });
});
