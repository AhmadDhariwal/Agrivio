import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { PurchasesPage } from './purchases.page';
import { PurchasesApi } from '../../data-access/purchases.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { PurchaseRecord } from '../../models/purchases.models';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

const mockDraftPurchase: PurchaseRecord = {
  id: 'pur-1',
  organizationId: 'org-1',
  branchId: null,
  warehouseId: 'wh-1',
  warehouseNameSnapshot: 'Main Warehouse',
  supplierId: 'sup-1',
  supplierNameSnapshot: 'Ali Fertilizers',
  supplierInvoiceReference: 'ENG-901',
  purchaseDate: '2026-03-01',
  notes: 'First batch',
  status: 'draft',
  lines: [],
  landedCosts: {
    freight: { amount: '0.00', currency: 'PKR' },
    loading: { amount: '0.00', currency: 'PKR' },
    transport: { amount: '0.00', currency: 'PKR' },
    other: { amount: '0.00', currency: 'PKR' },
  },
  purchaseTotal: { amount: '50000.00', currency: 'PKR' },
  paidTotal: { amount: '0.00', currency: 'PKR' },
  payableTotal: { amount: '50000.00', currency: 'PKR' },
  version: 1,
  createdBy: 'usr-1',
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  postedAt: null,
};

const mockPostedPurchase: PurchaseRecord = {
  id: 'pur-2',
  organizationId: 'org-1',
  branchId: null,
  warehouseId: 'wh-2',
  warehouseNameSnapshot: 'North Depot',
  supplierId: 'sup-2',
  supplierNameSnapshot: 'Fauji Fertilizer Co',
  supplierInvoiceReference: 'FFC-441',
  purchaseDate: '2026-03-02',
  notes: '',
  status: 'posted',
  lines: [],
  landedCosts: {
    freight: { amount: '1000.00', currency: 'PKR' },
    loading: { amount: '500.00', currency: 'PKR' },
    transport: { amount: '0.00', currency: 'PKR' },
    other: { amount: '0.00', currency: 'PKR' },
  },
  purchaseTotal: { amount: '120000.00', currency: 'PKR' },
  paidTotal: { amount: '60000.00', currency: 'PKR' },
  payableTotal: { amount: '60000.00', currency: 'PKR' },
  version: 2,
  createdBy: 'usr-1',
  createdAt: '2026-03-02T10:00:00.000Z',
  updatedAt: '2026-03-02T11:00:00.000Z',
  postedAt: '2026-03-02T11:00:00.000Z',
  postedBy: 'usr-admin',
};

const mockCancelledPurchase: PurchaseRecord = {
  id: 'pur-3',
  organizationId: 'org-1',
  branchId: null,
  warehouseId: 'wh-1',
  warehouseNameSnapshot: 'Main Warehouse',
  supplierId: 'sup-1',
  supplierNameSnapshot: 'Ali Fertilizers',
  supplierInvoiceReference: 'ENG-902',
  purchaseDate: '2026-03-03',
  notes: 'Cancelled order',
  status: 'cancelled',
  lines: [],
  landedCosts: {
    freight: { amount: '0.00', currency: 'PKR' },
    loading: { amount: '0.00', currency: 'PKR' },
    transport: { amount: '0.00', currency: 'PKR' },
    other: { amount: '0.00', currency: 'PKR' },
  },
  purchaseTotal: { amount: '30000.00', currency: 'PKR' },
  paidTotal: { amount: '0.00', currency: 'PKR' },
  payableTotal: { amount: '0.00', currency: 'PKR' },
  version: 3,
  createdBy: 'usr-1',
  createdAt: '2026-03-03T10:00:00.000Z',
  updatedAt: '2026-03-03T12:00:00.000Z',
  postedAt: '2026-03-03T11:00:00.000Z',
  cancelledAt: '2026-03-03T12:00:00.000Z',
  cancellationReason: 'Supplier damaged packaging',
};

describe('PurchasesPage', () => {
  let mockListPurchases: (
    query?: unknown,
  ) => Observable<{
    items: PurchaseRecord[];
    meta: { page: number; pageSize: number; total: number };
  }>;
  let mockHasPermission: (perm: string) => boolean;
  let disabledCapabilities: Set<string>;

  beforeEach(async () => {
    mockListPurchases = () =>
      of({
        items: [mockDraftPurchase, mockPostedPurchase, mockCancelledPurchase],
        meta: { page: 1, pageSize: 25, total: 3 },
      });
    mockHasPermission = () => true;
    disabledCapabilities = new Set();

    await TestBed.configureTestingModule({
      imports: [PurchasesPage],
      providers: [
        provideRouter([]),
        {
          provide: PurchasesApi,
          useValue: {
            listPurchases: (q: unknown) => mockListPurchases(q),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (p: string) => mockHasPermission(p),
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: (key: string) => !disabledCapabilities.has(key),
            canUseFeature: (key: string) => !disabledCapabilities.has(key),
            canPerformAction: (key: string) => !disabledCapabilities.has(key),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders products-aligned table with real purchase data on desktop', () => {
    const fixture: ComponentFixture<PurchasesPage> = TestBed.createComponent(PurchasesPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="purchases-page"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="purchases-count-pill"]')?.textContent).toContain(
      '3',
    );
    expect(compiled.querySelector('[data-testid="purchases-table"]')).toBeTruthy();

    const rows = compiled.querySelectorAll('[data-testid="purchase-row"]');
    expect(rows.length).toBe(3);

    // Verify row contents
    expect(rows[0]?.textContent).toContain('ENG-901');
    expect(rows[0]?.textContent).toContain('Ali Fertilizers');
    expect(rows[0]?.textContent).toContain('Draft (unposted)');

    expect(rows[1]?.textContent).toContain('FFC-441');
    expect(rows[1]?.textContent).toContain('Fauji Fertilizer Co');
    expect(rows[1]?.textContent).toContain('Posted');
  });

  it('renders mobile cards with metadata, status, and financial snapshot', () => {
    const fixture: ComponentFixture<PurchasesPage> = TestBed.createComponent(PurchasesPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const cards = compiled.querySelectorAll('[data-testid="purchase-mobile-card"]');
    expect(cards.length).toBe(3);

    expect(cards[0]?.textContent).toContain('ENG-901');
    expect(cards[0]?.textContent).toContain('Ali Fertilizers');
    expect(cards[0]?.textContent).toContain('PKR 50000.00');

    expect(cards[1]?.textContent).toContain('FFC-441');
    expect(cards[1]?.textContent).toContain('PKR 120000.00');
  });

  it('provides create action when authorized with purchases.create', () => {
    const fixture: ComponentFixture<PurchasesPage> = TestBed.createComponent(PurchasesPage);
    fixture.detectChanges();

    const createBtn = fixture.nativeElement.querySelector('[data-testid="purchase-create-link"]');
    expect(createBtn).toBeTruthy();
    expect(createBtn?.getAttribute('href')).toBe('/app/purchases/new');
  });

  it('routes View to detail and Edit draft to the explicit edit route', () => {
    const fixture: ComponentFixture<PurchasesPage> = TestBed.createComponent(PurchasesPage);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('[data-testid="purchase-row"]');
    const action0 = rows[0]?.querySelector('[data-testid="purchase-action-btn"]');
    const action1 = rows[1]?.querySelector('[data-testid="purchase-action-btn"]');
    const action2 = rows[2]?.querySelector('[data-testid="purchase-action-btn"]');

    expect(action0?.textContent?.trim()).toBe('View');
    expect(action0?.getAttribute('href')).toBe('/app/purchases/pur-1');
    expect(rows[0]?.textContent).toContain('Edit draft');
    expect(rows[0]?.querySelector('a[href="/app/purchases/pur-1/edit"]')).toBeTruthy();
    expect(action1?.textContent?.trim()).toBe('View');
    expect(action2?.textContent?.trim()).toBe('View');
    expect(rows[1]?.textContent).not.toContain('Edit draft');
    expect(rows[2]?.textContent).not.toContain('Edit draft');
  });

  it('handles search and status query filtering and clear action', () => {
    const fixture: ComponentFixture<PurchasesPage> = TestBed.createComponent(PurchasesPage);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.onStatusChange('posted');
    expect(component.status()).toBe('posted');

    component.clearFilters();
    expect(component.search()).toBe('');
    expect(component.status()).toBe('');
  });

  it('renders empty state when no purchases exist', () => {
    mockListPurchases = () =>
      of({ items: [] as PurchaseRecord[], meta: { page: 1, pageSize: 25, total: 0 } });
    const fixture: ComponentFixture<PurchasesPage> = TestBed.createComponent(PurchasesPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="purchases-empty"]')).toBeTruthy();
  });

  it('shows permission alert when purchases.view is not granted', () => {
    mockHasPermission = () => false;
    const fixture: ComponentFixture<PurchasesPage> = TestBed.createComponent(PurchasesPage);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="purchases-permission-alert"]'),
    ).toBeTruthy();
  });

  it('intersects module, feature, and lifecycle action capabilities', () => {
    disabledCapabilities.add('purchases.features.moduleInfo');
    disabledCapabilities.add('purchases.features.search');
    disabledCapabilities.add('purchases.actions.createDraft');
    disabledCapabilities.add('purchases.actions.editDraft');
    const fixture = TestBed.createComponent(PurchasesPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('agrivio-ui-module-info')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="purchases-search-input"]')).toBeFalsy();
    expect(compiled.querySelector('[data-testid="purchase-create-link"]')).toBeFalsy();
    expect(
      compiled.querySelectorAll('[data-testid="purchase-action-btn"]')[0]?.textContent,
    ).toContain('View');

    disabledCapabilities.add('purchases');
    const disabledFixture = TestBed.createComponent(PurchasesPage);
    disabledFixture.detectChanges();
    expect(
      disabledFixture.nativeElement.querySelector('[data-testid="purchases-permission-alert"]'),
    ).toBeTruthy();
  });
});
