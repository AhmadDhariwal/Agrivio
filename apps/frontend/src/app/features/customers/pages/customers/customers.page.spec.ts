import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CustomersPage } from './customers.page';
import { CustomersApi } from '../../data-access/customers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CustomerRecord } from '../../models/customers.models';

function makeCustomers(count: number): CustomerRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `customer-${index + 1}`,
    organizationId: 'org-1',
    name: `Customer ${index + 1}`,
    customerType: index % 2 === 0 ? 'corporate' : 'individual',
    priceTier: index % 2 === 0 ? 'wholesale' : 'retail',
    status: index % 3 === 0 ? 'inactive' : 'active',
    version: 1,
    phone: `042-9900000${index + 1}`,
    creditEnabled: index % 2 === 0,
    creditLimit: { amount: '50000.00', currency: 'PKR' },
    creditLimitBehaviour: 'warning',
    derivedBalances: {
      receivable: { amount: '12500.00', currency: 'PKR' },
      advance: { amount: '0.00', currency: 'PKR' },
    },
  }));
}

describe('CustomersPage', () => {
  let mockApi: {
    listCustomers: any;
    deleteCustomer: any;
    updateCustomer: any;
  };
  let mockSession: { hasPermission: any };

  beforeEach(async () => {
    mockApi = {
      listCustomers: vi.fn().mockReturnValue(
        of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
      ),
      deleteCustomer: vi.fn().mockReturnValue(of({ id: 'customer-1', deleted: true })),
      updateCustomer: vi.fn().mockReturnValue(of({ id: 'customer-1', version: 2 })),
    };
    mockSession = {
      hasPermission: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [CustomersPage],
      providers: [
        provideRouter([]),
        { provide: CustomersApi, useValue: mockApi },
        { provide: AuthSessionStore, useValue: mockSession },
      ],
    }).compileComponents();
  });

  it('renders page header, title, and empty state when no items exist', () => {
    const fixture: ComponentFixture<CustomersPage> = TestBed.createComponent(CustomersPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.page-head__title')?.textContent?.trim()).toBe('Customers');
    expect(compiled.textContent).toContain('No customers yet');
  });

  it('renders data table, avatars, and customer rows when records are returned', () => {
    mockApi.listCustomers.mockReturnValue(
      of({
        items: makeCustomers(3),
        meta: { page: 1, pageSize: 25, total: 3 },
      }),
    );

    const fixture = TestBed.createComponent(CustomersPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('[data-testid="customer-row"]');
    expect(rows.length).toBe(3);
    expect(compiled.querySelector('[data-testid="kpi-total-customers"]')?.textContent?.trim()).toBe('3');

    // Initials avatar glyph check
    const avatar = compiled.querySelector('.customer-cell__glyph');
    expect(avatar?.textContent?.trim()).toBe('C1');
  });

  it('requests the selected page size and renders only the returned page', () => {
    const requests: Array<{ page?: number; pageSize?: number; status?: string; search?: string }> = [];
    mockApi.listCustomers.mockImplementation((query: any) => {
      requests.push(query);
      const pageSize = query.pageSize ?? 25;
      const page = query.page ?? 1;
      const total = 37;
      const start = (page - 1) * pageSize;
      const items = makeCustomers(Math.min(pageSize, Math.max(0, total - start)));
      return of({ items, meta: { page, pageSize, total } });
    });

    const fixture = TestBed.createComponent(CustomersPage);
    fixture.detectChanges();
    expect(requests[0]).toEqual({
      page: 1,
      pageSize: 25,
      status: 'active',
      search: '',
      forceRefresh: false,
    });
    expect(fixture.nativeElement.querySelectorAll('[data-testid="customer-row"]').length).toBe(25);

    const page = fixture.componentInstance;
    page.onPageSizeChange(10);
    fixture.detectChanges();

    expect(requests.at(-1)).toEqual({
      page: 1,
      pageSize: 10,
      status: 'active',
      search: '',
      forceRefresh: false,
    });
    expect(fixture.nativeElement.querySelectorAll('[data-testid="customer-row"]').length).toBe(10);
    expect(fixture.nativeElement.textContent).toContain('Showing 1–10 of 37');
  });

  it('opens and closes the slide-over inspector drawer', () => {
    const items = makeCustomers(2);
    const item0 = items[0]!;
    mockApi.listCustomers.mockReturnValue(
      of({ items, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    const fixture = TestBed.createComponent(CustomersPage);
    fixture.detectChanges();

    const page = fixture.componentInstance;
    expect(page.selectedCustomer()).toBeNull();

    // Click customer inspect
    page.openInspector(item0);
    fixture.detectChanges();

    expect(page.selectedCustomer()).toEqual(item0);
    expect(fixture.nativeElement.querySelector('[data-testid="customer-inspector"]')).toBeTruthy();

    // Close inspector
    page.closeInspector();
    fixture.detectChanges();

    expect(page.selectedCustomer()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="customer-inspector"]')).toBeNull();
  });

  it('triggers lifecycle confirmation dialog for deactivate and reactivate', () => {
    const items = makeCustomers(2);
    const item0 = items[0]!;
    mockApi.listCustomers.mockReturnValue(
      of({ items, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    const fixture = TestBed.createComponent(CustomersPage);
    fixture.detectChanges();

    const page = fixture.componentInstance;

    // Ask deactivate
    page.askDeactivate(item0);
    fixture.detectChanges();

    expect(page.confirmOpen()).toBe(true);
    expect(page.confirmLabel()).toBe('Deactivate');

    page.confirmLifecycle();
    expect(mockApi.updateCustomer).toHaveBeenCalledWith(item0.id, {
      expectedVersion: item0.version,
      status: 'inactive',
    });
  });

  it('triggers permanent delete lifecycle dialog', () => {
    const items = makeCustomers(1);
    const item0 = items[0]!;
    mockApi.listCustomers.mockReturnValue(
      of({ items, meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomersPage);
    fixture.detectChanges();

    const page = fixture.componentInstance;

    page.askDelete(item0);
    fixture.detectChanges();

    expect(page.confirmOpen()).toBe(true);
    expect(page.confirmLabel()).toBe('Delete permanently');

    page.confirmLifecycle();
    expect(mockApi.deleteCustomer).toHaveBeenCalledWith(item0.id);
  });

  it('shows error state when load fails', () => {
    mockApi.listCustomers.mockReturnValue(
      throwError(() => ({ error: { error: { message: 'Network failure' } } })),
    );

    const fixture = TestBed.createComponent(CustomersPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Network failure');
  });

  it('shows permission denied message when user lacks view permission', () => {
    mockSession.hasPermission.mockImplementation((perm: string) => perm !== 'customers.view');

    const fixture = TestBed.createComponent(CustomersPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('You do not have permission to view customers.');
  });

  describe('Capability Integration', () => {
    it('hides create button when customers.actions.create capability is disabled', async () => {
      mockApi.listCustomers.mockReturnValue(
        of({ items: makeCustomers(1), meta: { page: 1, pageSize: 25, total: 1 } }),
      );

      const mockCapability = {
        canUseModule: vi.fn().mockReturnValue(true),
        canUseView: vi.fn().mockReturnValue(true),
        canViewField: vi.fn().mockReturnValue(true),
        canEditField: vi.fn().mockReturnValue(true),
        canPerformAction: vi.fn().mockImplementation((key: string) => key !== 'customers.actions.create'),
      };

      const fixture = TestBed.createComponent(CustomersPage);
      (fixture.componentInstance as any).capabilityService = mockCapability;
      fixture.detectChanges();

      expect(fixture.componentInstance.canCreate()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="customer-create-link"]')).toBeNull();
    });

    it('hides edit and inspect buttons when capability actions are disabled', () => {
      mockApi.listCustomers.mockReturnValue(
        of({ items: makeCustomers(1), meta: { page: 1, pageSize: 25, total: 1 } }),
      );

      const mockCapability = {
        canUseModule: vi.fn().mockReturnValue(true),
        canUseView: vi.fn().mockReturnValue(true),
        canViewField: vi.fn().mockReturnValue(true),
        canEditField: vi.fn().mockReturnValue(true),
        canPerformAction: vi.fn().mockImplementation((key: string) => {
          if (key === 'customers.actions.inspect' || key === 'customers.actions.edit') return false;
          return true;
        }),
      };

      const fixture = TestBed.createComponent(CustomersPage);
      (fixture.componentInstance as any).capabilityService = mockCapability;
      fixture.detectChanges();

      expect(fixture.componentInstance.canInspect()).toBe(false);
      expect(fixture.componentInstance.canEdit()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="customer-inspect"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="customer-edit"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('.customer-cell__name--plain')).toBeTruthy();
    });

    it('conditionally hides priceTier and phone columns when capability fields are not visible', () => {
      mockApi.listCustomers.mockReturnValue(
        of({ items: makeCustomers(2), meta: { page: 1, pageSize: 25, total: 2 } }),
      );

      const mockCapability = {
        canUseModule: vi.fn().mockReturnValue(true),
        canUseView: vi.fn().mockReturnValue(true),
        canViewField: vi.fn().mockImplementation((key: string) => {
          if (key === 'customers.fields.priceTier' || key === 'customers.fields.phone') return false;
          return true;
        }),
        canEditField: vi.fn().mockReturnValue(true),
        canPerformAction: vi.fn().mockReturnValue(true),
      };

      const fixture = TestBed.createComponent(CustomersPage);
      (fixture.componentInstance as any).capabilityService = mockCapability;
      fixture.detectChanges();

      expect(fixture.componentInstance.showPriceTier()).toBe(false);
      expect(fixture.componentInstance.showPhone()).toBe(false);
      expect(fixture.nativeElement.querySelector('.col-tier')).toBeNull();
      expect(fixture.nativeElement.querySelector('.col-phone')).toBeNull();
      expect(fixture.nativeElement.querySelector('.cust-table__th--tier')).toBeNull();
      expect(fixture.nativeElement.querySelector('.cust-table__th--phone')).toBeNull();
    });

    it('enforces RBAC + Capability intersection for manage and view operations', () => {
      // Capability allows create, but user lacks permission
      mockSession.hasPermission.mockImplementation((perm: string) => perm !== 'customers.manage');
      const mockCapability = {
        canUseModule: vi.fn().mockReturnValue(true),
        canUseView: vi.fn().mockReturnValue(true),
        canViewField: vi.fn().mockReturnValue(true),
        canEditField: vi.fn().mockReturnValue(true),
        canPerformAction: vi.fn().mockReturnValue(true),
      };

      const fixture = TestBed.createComponent(CustomersPage);
      (fixture.componentInstance as any).capabilityService = mockCapability;
      fixture.detectChanges();

      expect(fixture.componentInstance.canManage()).toBe(false);
      expect(fixture.componentInstance.canCreate()).toBe(false);
      expect(fixture.componentInstance.canEdit()).toBe(false);
      expect(fixture.componentInstance.canDeactivate()).toBe(false);
      expect(fixture.componentInstance.canDelete()).toBe(false);
    });

    it('hides refresh button when customers.actions.refresh is disabled', () => {
      mockApi.listCustomers.mockReturnValue(
        of({ items: makeCustomers(1), meta: { page: 1, pageSize: 25, total: 1 } }),
      );

      const mockCapability = {
        canUseModule: vi.fn().mockReturnValue(true),
        canUseView: vi.fn().mockReturnValue(true),
        canViewField: vi.fn().mockReturnValue(true),
        canEditField: vi.fn().mockReturnValue(true),
        canPerformAction: vi.fn().mockImplementation((key: string) => key !== 'customers.actions.refresh'),
      };

      const fixture = TestBed.createComponent(CustomersPage);
      (fixture.componentInstance as any).capabilityService = mockCapability;
      fixture.detectChanges();

      expect(fixture.componentInstance.canRefresh()).toBe(false);
      expect(fixture.nativeElement.querySelector('.toolbar-refresh-btn')).toBeNull();
    });

    it('hides module info, search, status filter, and KPI cards when corresponding feature capabilities are disabled', () => {
      mockApi.listCustomers.mockReturnValue(
        of({ items: makeCustomers(1), meta: { page: 1, pageSize: 25, total: 1 } }),
      );

      const mockCapability = {
        canUseModule: vi.fn().mockReturnValue(true),
        canUseView: vi.fn().mockImplementation((key: string) => {
          if (
            key === 'customers.features.moduleInfo' ||
            key === 'customers.features.search' ||
            key === 'customers.features.statusFilter' ||
            key === 'customers.features.kpiCards'
          ) {
            return false;
          }
          return true;
        }),
        canViewField: vi.fn().mockReturnValue(true),
        canEditField: vi.fn().mockReturnValue(true),
        canPerformAction: vi.fn().mockReturnValue(true),
      };

      const fixture = TestBed.createComponent(CustomersPage);
      (fixture.componentInstance as any).capabilityService = mockCapability;
      fixture.detectChanges();

      expect(fixture.componentInstance.showModuleInfo()).toBe(false);
      expect(fixture.componentInstance.showSearch()).toBe(false);
      expect(fixture.componentInstance.showStatusFilter()).toBe(false);
      expect(fixture.componentInstance.showKpiCards()).toBe(false);
      expect(fixture.nativeElement.querySelector('agrivio-ui-module-info')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="customers-search-input"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="customers-status-filter"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="kpi-total-customers"]')).toBeNull();
    });

    it('hides credit limit and credit behaviour when fields are disabled in capability', () => {
      mockApi.listCustomers.mockReturnValue(
        of({ items: makeCustomers(1), meta: { page: 1, pageSize: 25, total: 1 } }),
      );

      const mockCapability = {
        canUseModule: vi.fn().mockReturnValue(true),
        canUseView: vi.fn().mockReturnValue(true),
        canViewField: vi.fn().mockImplementation((key: string) => {
          if (key === 'customers.fields.creditLimit' || key === 'customers.fields.creditLimitBehaviour') {
            return false;
          }
          return true;
        }),
        canEditField: vi.fn().mockReturnValue(true),
        canPerformAction: vi.fn().mockReturnValue(true),
      };

      const fixture = TestBed.createComponent(CustomersPage);
      (fixture.componentInstance as any).capabilityService = mockCapability;
      fixture.detectChanges();

      expect(fixture.componentInstance.showCreditLimit()).toBe(false);
      expect(fixture.componentInstance.showCreditLimitBehaviour()).toBe(false);
      expect(fixture.nativeElement.querySelector('.credit-limit')).toBeNull();
      expect(fixture.nativeElement.querySelector('.credit-sub')).toBeNull();
    });
  });

  it('requests forceRefresh when toolbar refresh is clicked', () => {
    mockApi.listCustomers.mockReturnValue(
      of({ items: makeCustomers(1), meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(CustomersPage);
    fixture.detectChanges();
    expect(mockApi.listCustomers).toHaveBeenCalledTimes(1);
    expect(mockApi.listCustomers).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceRefresh: false }),
    );

    fixture.componentInstance.reload(false, true);
    fixture.detectChanges();

    expect(mockApi.listCustomers).toHaveBeenCalledTimes(2);
    expect(mockApi.listCustomers).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceRefresh: true }),
    );
  });

  describe('Inspector drawer — loan receivable discoverability', () => {
    function openInspectorWith(fixture: any, customer: CustomerRecord) {
      fixture.componentInstance.openInspector(customer);
      fixture.detectChanges();
    }

    it('shows Loan Receivable row in inspector when customer has non-zero loanReceivable', () => {
      const loanCustomer: CustomerRecord = {
        id: 'loan-cust-1',
        organizationId: 'org-1',
        name: 'Loan Only Customer',
        customerType: 'individual',
        priceTier: 'retail',
        status: 'active',
        version: 1,
        phone: '042-0000001',
        creditEnabled: false,
        creditLimit: { amount: '0.00', currency: 'PKR' },
        creditLimitBehaviour: 'warning',
        derivedBalances: {
          receivable: { amount: '0.00', currency: 'PKR' },
          loanReceivable: { amount: '50000.00', currency: 'PKR' },
          advance: { amount: '0.00', currency: 'PKR' },
        },
      };

      mockApi.listCustomers.mockReturnValue(
        of({ items: [loanCustomer], meta: { page: 1, pageSize: 25, total: 1 } }),
      );

      const fixture = TestBed.createComponent(CustomersPage);
      fixture.detectChanges();
      openInspectorWith(fixture, loanCustomer);

      const drawer = fixture.nativeElement.querySelector('[data-testid="customer-inspector"]');
      expect(drawer).toBeTruthy();
      expect(drawer.querySelector('[data-testid="inspector-loan-receivable-row"]')).toBeTruthy();
      expect(drawer.textContent).toContain('Loan Receivable');
      expect(drawer.textContent).toContain('50,000');
    });

    it('does NOT show Loan Receivable row when loanReceivable is zero', () => {
      const tradeCustomer: CustomerRecord = {
        id: 'trade-cust-1',
        organizationId: 'org-1',
        name: 'Trade Only Customer',
        customerType: 'corporate',
        priceTier: 'wholesale',
        status: 'active',
        version: 1,
        phone: '042-0000002',
        creditEnabled: true,
        creditLimit: { amount: '100000.00', currency: 'PKR' },
        creditLimitBehaviour: 'warning',
        derivedBalances: {
          receivable: { amount: '25000.00', currency: 'PKR' },
          loanReceivable: { amount: '0.00', currency: 'PKR' },
          advance: { amount: '0.00', currency: 'PKR' },
        },
      };

      mockApi.listCustomers.mockReturnValue(
        of({ items: [tradeCustomer], meta: { page: 1, pageSize: 25, total: 1 } }),
      );

      const fixture = TestBed.createComponent(CustomersPage);
      fixture.detectChanges();
      openInspectorWith(fixture, tradeCustomer);

      const drawer = fixture.nativeElement.querySelector('[data-testid="customer-inspector"]');
      expect(drawer).toBeTruthy();
      expect(drawer.querySelector('[data-testid="inspector-loan-receivable-row"]')).toBeNull();
    });

    it('does NOT show Loan Receivable row when loanReceivable is absent', () => {
      const noLoanCustomer: CustomerRecord = {
        id: 'no-loan-cust-1',
        organizationId: 'org-1',
        name: 'No Loan Customer',
        customerType: 'corporate',
        priceTier: 'retail',
        status: 'active',
        version: 1,
        phone: '042-0000003',
        creditEnabled: true,
        creditLimit: { amount: '50000.00', currency: 'PKR' },
        creditLimitBehaviour: 'block',
        derivedBalances: {
          receivable: { amount: '12000.00', currency: 'PKR' },
          advance: { amount: '0.00', currency: 'PKR' },
        },
      };

      mockApi.listCustomers.mockReturnValue(
        of({ items: [noLoanCustomer], meta: { page: 1, pageSize: 25, total: 1 } }),
      );

      const fixture = TestBed.createComponent(CustomersPage);
      fixture.detectChanges();
      openInspectorWith(fixture, noLoanCustomer);

      const drawer = fixture.nativeElement.querySelector('[data-testid="customer-inspector"]');
      expect(drawer).toBeTruthy();
      expect(drawer.querySelector('[data-testid="inspector-loan-receivable-row"]')).toBeNull();
    });

    it('shows Total Exposure row in inspector when totalExposure is present', () => {
      const exposureCustomer: CustomerRecord = {
        id: 'exp-cust-1',
        organizationId: 'org-1',
        name: 'Exposure Customer',
        customerType: 'corporate',
        priceTier: 'wholesale',
        status: 'active',
        version: 1,
        phone: '042-0000004',
        creditEnabled: true,
        creditLimit: { amount: '200000.00', currency: 'PKR' },
        creditLimitBehaviour: 'warning',
        derivedBalances: {
          receivable: { amount: '30000.00', currency: 'PKR' },
          loanReceivable: { amount: '20000.00', currency: 'PKR' },
          advance: { amount: '5000.00', currency: 'PKR' },
          totalExposure: { amount: '45000.00', currency: 'PKR' },
        },
      };

      mockApi.listCustomers.mockReturnValue(
        of({ items: [exposureCustomer], meta: { page: 1, pageSize: 25, total: 1 } }),
      );

      const fixture = TestBed.createComponent(CustomersPage);
      fixture.detectChanges();
      openInspectorWith(fixture, exposureCustomer);

      const drawer = fixture.nativeElement.querySelector('[data-testid="customer-inspector"]');
      expect(drawer).toBeTruthy();
      expect(drawer.querySelector('[data-testid="inspector-total-exposure-row"]')).toBeTruthy();
      expect(drawer.textContent).toContain('Total Exposure');
      expect(drawer.textContent).toContain('45,000');
    });

    it('does NOT show Total Exposure row when totalExposure is absent', () => {
      const noExposureCustomer: CustomerRecord = {
        id: 'no-exp-cust-1',
        organizationId: 'org-1',
        name: 'No Exposure Customer',
        customerType: 'individual',
        priceTier: 'retail',
        status: 'active',
        version: 1,
        phone: '042-0000005',
        creditEnabled: false,
        creditLimit: { amount: '0.00', currency: 'PKR' },
        creditLimitBehaviour: 'warning',
        derivedBalances: {
          receivable: { amount: '8000.00', currency: 'PKR' },
          advance: { amount: '0.00', currency: 'PKR' },
        },
      };

      mockApi.listCustomers.mockReturnValue(
        of({ items: [noExposureCustomer], meta: { page: 1, pageSize: 25, total: 1 } }),
      );

      const fixture = TestBed.createComponent(CustomersPage);
      fixture.detectChanges();
      openInspectorWith(fixture, noExposureCustomer);

      const drawer = fixture.nativeElement.querySelector('[data-testid="customer-inspector"]');
      expect(drawer).toBeTruthy();
      expect(drawer.querySelector('[data-testid="inspector-total-exposure-row"]')).toBeNull();
    });

    it('trade receivable row is always shown and labelled "Trade Receivable" in inspector', () => {
      const item = makeCustomers(1)[0]!;
      mockApi.listCustomers.mockReturnValue(
        of({ items: [item], meta: { page: 1, pageSize: 25, total: 1 } }),
      );

      const fixture = TestBed.createComponent(CustomersPage);
      fixture.detectChanges();
      openInspectorWith(fixture, item);

      const drawer = fixture.nativeElement.querySelector('[data-testid="customer-inspector"]');
      expect(drawer).toBeTruthy();
      // The first spec-row__k in the Financial Balances section must say 'Trade Receivable'
      const keys = Array.from(drawer.querySelectorAll('.drawer-sec .spec-row__k')).map(
        (el: any) => el.textContent.trim(),
      );
      expect(keys[0]).toBe('Trade Receivable');
    });
  });
});
