import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SupplierLedgerPage } from './supplier-ledger.page';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import {
  SupplierLedgerEffectRecord,
  SupplierReconciliationRecord,
} from '../../models/supplier-payments.models';
import { SupplierRecord } from '../../../suppliers/models/suppliers.models';

const MOCK_SUPPLIERS: SupplierRecord[] = [
  {
    id: 'sup-1',
    organizationId: 'org-1',
    name: 'GreenGrow Agro Solutions',
    phone: '+92 300 1234567',
    contactName: 'Tariq Malik',
    email: 'tariq@greengrow.test',
    status: 'active',
    version: 1,
  },
  {
    id: 'sup-2',
    organizationId: 'org-1',
    name: 'Engro Fertilizers',
    phone: '+92 300 7654321',
    contactName: 'Zahid Khan',
    email: 'zahid@engro.test',
    status: 'active',
    version: 1,
  },
];

const MOCK_RECONCILIATION: SupplierReconciliationRecord = {
  supplierId: 'sup-1',
  ok: true,
  payable: { amount: '458,200.00', currency: 'PKR' },
  advance: { amount: '125,400.00', currency: 'PKR' },
  allocationTotal: { amount: '320,000.00', currency: 'PKR' },
  accountMovementTotal: { amount: '320,000.00', currency: 'PKR' },
  findings: [],
};

const MOCK_LEDGER_ITEMS: SupplierLedgerEffectRecord[] = [
  {
    id: 'eff-1',
    organizationId: 'org-1',
    partyType: 'supplier',
    customerId: null,
    supplierId: 'sup-1',
    effectKind: 'payable',
    signedAmount: { amount: '158,000.00', currency: 'PKR' },
    currency: 'PKR',
    sourceType: 'purchase_payable',
    sourceId: 'PINV-250516-0042',
    status: 'posted',
    postedAt: '2026-05-16T10:00:00.000Z',
    postedBy: 'user-1',
  },
  {
    id: 'eff-2',
    organizationId: 'org-1',
    partyType: 'supplier',
    customerId: null,
    supplierId: 'sup-1',
    effectKind: 'payable',
    signedAmount: { amount: '-120,000.00', currency: 'PKR' },
    currency: 'PKR',
    sourceType: 'supplier_payment_allocation',
    sourceId: 'SPAY-250514-0021',
    status: 'posted',
    postedAt: '2026-05-14T14:30:00.000Z',
    postedBy: 'user-1',
  },
  {
    id: 'eff-3',
    organizationId: 'org-1',
    partyType: 'supplier',
    customerId: null,
    supplierId: 'sup-1',
    effectKind: 'supplier_advance',
    signedAmount: { amount: '75,400.00', currency: 'PKR' },
    currency: 'PKR',
    sourceType: 'supplier_payment_advance',
    sourceId: 'SPAY-250510-0012',
    status: 'posted',
    postedAt: '2026-05-10T09:15:00.000Z',
    postedBy: 'user-1',
  },
];

describe('SupplierLedgerPage', () => {
  let mockPermission = true;
  let mockCapabilityEnabled = true;
  let supplierSearches: string[] = [];

  beforeEach(async () => {
    mockPermission = true;
    mockCapabilityEnabled = true;
    supplierSearches = [];

    await TestBed.configureTestingModule({
      imports: [SupplierLedgerPage],
      providers: [
        provideRouter([]),
        {
          provide: SupplierPaymentsApi,
          useValue: {
            listSupplierLedger: () => of(MOCK_LEDGER_ITEMS),
            reconcileSupplier: () => of(MOCK_RECONCILIATION),
            listUnpaidPurchases: () => of([]),
            listSupplierLedgerSuppliers: (search = '') => {
              supplierSearches.push(search);
              return of(MOCK_SUPPLIERS);
            },
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (perm: string) => (perm === 'supplier-payments.view' ? mockPermission : true),
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => mockCapabilityEnabled,
            canUseFeature: () => mockCapabilityEnabled,
            canViewField: () => mockCapabilityEnabled,
            canPerformAction: () => mockCapabilityEnabled,
          },
        },
      ],
    }).compileComponents();
  });

  it('renders page header, title, module info, and supplier selector', () => {
    const fixture: ComponentFixture<SupplierLedgerPage> = TestBed.createComponent(SupplierLedgerPage);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.page-head__title')?.textContent).toContain('Supplier ledger & reconciliation');
    expect(compiled.querySelector('[data-testid="back-to-payments-btn"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="ledger-supplier-form"]')).toBeTruthy();
    expect(compiled.querySelector('[data-testid="ledger-supplier-select"]')).toBeTruthy();
  });

  it('uses the ledger-owned server-backed supplier search', () => {
    const fixture = TestBed.createComponent(SupplierLedgerPage);
    fixture.detectChanges();
    expect(supplierSearches).toEqual(['']);

    const input = fixture.nativeElement.querySelector('#searchSupplierInput') as HTMLInputElement;
    input.value = 'Engro';
    input.dispatchEvent(new Event('input'));

    expect(supplierSearches.at(-1)).toBe('Engro');
  });

  it('renders initial prompt when no supplier is selected', () => {
    const fixture: ComponentFixture<SupplierLedgerPage> = TestBed.createComponent(SupplierLedgerPage);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.prompt-card')).toBeTruthy();
    expect(compiled.textContent).toContain('Select a supplier to view ledger');
  });

  it('loads and renders authoritative reconciliation values and context card when supplier is selected', () => {
    const fixture: ComponentFixture<SupplierLedgerPage> = TestBed.createComponent(SupplierLedgerPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.form.controls.supplierId.setValue('sup-1');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Supplier context card
    expect(compiled.querySelector('.supplier-context-card__name')?.textContent).toContain('GreenGrow Agro Solutions');
    expect(compiled.querySelector('.supplier-context-card__avatar')?.textContent?.trim()).toBe('GA');

    // Authoritative KPI values
    expect(compiled.textContent).toContain('458,200.00'); // Payable
    expect(compiled.textContent).toContain('125,400.00'); // Advance
    expect(compiled.textContent).toContain('320,000.00'); // Allocations

    // Reconciliation status badge
    const reconStatus = compiled.querySelector('[data-testid="supplier-ledger-reconciliation-status"]');
    expect(reconStatus).toBeTruthy();
    expect(reconStatus?.textContent).toContain('Healthy');
  });

  it('renders desktop table rows and mobile cards for ledger effects', () => {
    const fixture: ComponentFixture<SupplierLedgerPage> = TestBed.createComponent(SupplierLedgerPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.form.controls.supplierId.setValue('sup-1');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Desktop table
    const rows = compiled.querySelectorAll('.dense-table tbody tr');
    expect(rows.length).toBe(3);
    expect(compiled.textContent).toContain('PINV-250516-0042');
    expect(compiled.textContent).toContain('SPAY-250514-0021');
    expect(compiled.textContent).toContain('SPAY-250510-0012');

    // Mobile cards
    const mobileCards = compiled.querySelectorAll('.mobile-ledger-card');
    expect(mobileCards.length).toBe(3);
  });

  it('filters ledger items by search query and effect kind', () => {
    const fixture: ComponentFixture<SupplierLedgerPage> = TestBed.createComponent(SupplierLedgerPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.form.controls.supplierId.setValue('sup-1');
    fixture.detectChanges();

    expect(component.filteredLedgerItems().length).toBe(3);

    // Filter by type
    component.typeFilter.set('supplier_advance');
    expect(component.filteredLedgerItems().length).toBe(1);
    expect(component.filteredLedgerItems()[0]?.sourceId).toBe('SPAY-250510-0012');

    // Clear filter
    component.clearTableFilters();
    expect(component.filteredLedgerItems().length).toBe(3);

    // Search by reference
    component.searchTerm.set('PINV');
    expect(component.filteredLedgerItems().length).toBe(1);
    expect(component.filteredLedgerItems()[0]?.sourceId).toBe('PINV-250516-0042');
  });

  it('shows permission warning when user lacks view permission or module capability is disabled', () => {
    mockPermission = false;

    const fixture: ComponentFixture<SupplierLedgerPage> = TestBed.createComponent(SupplierLedgerPage);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('[data-testid="supplier-ledger-permission-alert"]')).toBeTruthy();
    expect(compiled.textContent).toContain('You do not have permission to view supplier ledger');
  });

  it('respects feature and action capability flags', () => {
    const disabledCapabilities = new Set<string>();
    mockCapabilityEnabled = true;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SupplierLedgerPage],
      providers: [
        provideRouter([]),
        {
          provide: SupplierPaymentsApi,
          useValue: {
            listSupplierLedger: () => of(MOCK_LEDGER_ITEMS),
            reconcileSupplier: () => of(MOCK_RECONCILIATION),
            listUnpaidPurchases: () => of([]),
            listSupplierLedgerSuppliers: (search = '') => {
              supplierSearches.push(search);
              return of(MOCK_SUPPLIERS);
            },
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (perm: string) => (perm === 'purchases.view' ? false : true),
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: (key: string) => !disabledCapabilities.has(key),
            canUseFeature: (key: string) => !disabledCapabilities.has(key),
            canViewField: (key: string) => !disabledCapabilities.has(key),
            canPerformAction: (key: string) => !disabledCapabilities.has(key),
          },
        },
      ],
    });

    disabledCapabilities.add('payments.supplierLedger.features.moduleInfo');
    disabledCapabilities.add('payments.supplierLedger.features.supplierSearch');
    disabledCapabilities.add('payments.supplierLedger.features.reconciliationSummary');
    disabledCapabilities.add('payments.supplierLedger.features.ledgerFilters');

    const fixture = TestBed.createComponent(SupplierLedgerPage);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.form.controls.supplierId.setValue('sup-1');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Features hidden
    expect(compiled.querySelector('agrivio-ui-module-info')).toBeFalsy();
    expect(compiled.querySelector('#searchSupplierInput')).toBeTruthy();
    expect(compiled.querySelector('.kpi-row')).toBeFalsy();
    expect(compiled.querySelector('.toolbar__search-input')).toBeFalsy();

    // Source link for purchases is null because user lacks purchases.view permission
    const firstItem = MOCK_LEDGER_ITEMS[0];
    if (firstItem) {
      expect(component.sourceRoute(firstItem)).toBeNull();
    }
  });
});
