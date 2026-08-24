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
    expect(requests[0]).toEqual({ page: 1, pageSize: 25, status: 'active', search: '' });
    expect(fixture.nativeElement.querySelectorAll('[data-testid="customer-row"]').length).toBe(25);

    const page = fixture.componentInstance;
    page.onPageSizeChange(10);
    fixture.detectChanges();

    expect(requests.at(-1)).toEqual({ page: 1, pageSize: 10, status: 'active', search: '' });
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
});
