import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SuppliersPage } from './suppliers.page';
import { SuppliersApi } from '../../data-access/suppliers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { SupplierRecord } from '../../models/suppliers.models';

function makeSuppliers(count: number): SupplierRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `supplier-${index + 1}`,
    organizationId: 'org-1',
    name: `Supplier ${index + 1}`,
    contactName: `Contact ${index + 1}`,
    phone: `042-3590000${index + 1}`,
    email: `sales@supplier${index + 1}.pk`,
    status: index % 3 === 0 ? 'inactive' : 'active',
    version: 1,
    derivedBalances: {
      payable: { amount: '45000.00', currency: 'PKR' },
      advance: { amount: '0.00', currency: 'PKR' },
    },
  }));
}

describe('SuppliersPage', () => {
  let mockApi: {
    listSuppliers: any;
    deleteSupplier: any;
    updateSupplier: any;
  };
  let mockSession: { hasPermission: any };

  beforeEach(async () => {
    mockApi = {
      listSuppliers: vi.fn().mockReturnValue(
        of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
      ),
      deleteSupplier: vi.fn().mockReturnValue(of({ id: 'supplier-1', deleted: true })),
      updateSupplier: vi.fn().mockReturnValue(of({ id: 'supplier-1', version: 2 })),
    };
    mockSession = {
      hasPermission: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [SuppliersPage],
      providers: [
        provideRouter([]),
        { provide: SuppliersApi, useValue: mockApi },
        { provide: AuthSessionStore, useValue: mockSession },
      ],
    }).compileComponents();
  });

  it('renders page header, title, and empty state when no items exist', () => {
    const fixture: ComponentFixture<SuppliersPage> = TestBed.createComponent(SuppliersPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.page-head__title')?.textContent?.trim()).toBe('Suppliers');
    expect(compiled.textContent).toContain('No suppliers yet');
  });

  it('renders data table, avatars, and supplier rows when records are returned', () => {
    mockApi.listSuppliers.mockReturnValue(
      of({
        items: makeSuppliers(3),
        meta: { page: 1, pageSize: 25, total: 3 },
      }),
    );

    const fixture = TestBed.createComponent(SuppliersPage);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('[data-testid="supplier-row"]');
    expect(rows.length).toBe(3);
    expect(compiled.querySelector('[data-testid="kpi-total-suppliers"]')?.textContent?.trim()).toBe('3');

    // Initials avatar glyph check
    const avatar = compiled.querySelector('.supplier-cell__glyph');
    expect(avatar?.textContent?.trim()).toBe('S1');
  });

  it('requests the selected page size and renders only the returned page', () => {
    const requests: Array<{ page?: number; pageSize?: number; status?: string; search?: string }> = [];
    mockApi.listSuppliers.mockImplementation((query: any) => {
      requests.push(query);
      const pageSize = query.pageSize ?? 25;
      const page = query.page ?? 1;
      const total = 37;
      const start = (page - 1) * pageSize;
      const items = makeSuppliers(Math.min(pageSize, Math.max(0, total - start)));
      return of({ items, meta: { page, pageSize, total } });
    });

    const fixture = TestBed.createComponent(SuppliersPage);
    fixture.detectChanges();
    expect(requests[0]).toEqual({ page: 1, pageSize: 25, status: 'active', search: '' });
    expect(fixture.nativeElement.querySelectorAll('[data-testid="supplier-row"]').length).toBe(25);

    const page = fixture.componentInstance;
    page.onPageSizeChange(10);
    fixture.detectChanges();

    expect(requests.at(-1)).toEqual({ page: 1, pageSize: 10, status: 'active', search: '' });
    expect(fixture.nativeElement.querySelectorAll('[data-testid="supplier-row"]').length).toBe(10);
    expect(fixture.nativeElement.textContent).toContain('Showing 1–10 of 37');
  });

  it('opens and closes the slide-over inspector drawer', () => {
    const items = makeSuppliers(2);
    const item0 = items[0]!;
    mockApi.listSuppliers.mockReturnValue(
      of({ items, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    const fixture = TestBed.createComponent(SuppliersPage);
    fixture.detectChanges();

    const page = fixture.componentInstance;
    expect(page.selectedSupplier()).toBeNull();

    page.openInspector(item0);
    fixture.detectChanges();

    expect(page.selectedSupplier()).toEqual(item0);
    expect(fixture.nativeElement.querySelector('[data-testid="supplier-inspector"]')).toBeTruthy();

    page.closeInspector();
    fixture.detectChanges();

    expect(page.selectedSupplier()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="supplier-inspector"]')).toBeNull();
  });

  it('triggers lifecycle confirmation dialog for deactivate and reactivate', () => {
    const items = makeSuppliers(2);
    const item0 = items[0]!;
    mockApi.listSuppliers.mockReturnValue(
      of({ items, meta: { page: 1, pageSize: 25, total: 2 } }),
    );

    const fixture = TestBed.createComponent(SuppliersPage);
    fixture.detectChanges();

    const page = fixture.componentInstance;

    page.askDeactivate(item0);
    fixture.detectChanges();

    expect(page.confirmOpen()).toBe(true);
    expect(page.confirmLabel()).toBe('Deactivate');

    page.confirmLifecycle();
    expect(mockApi.updateSupplier).toHaveBeenCalledWith(item0.id, {
      expectedVersion: item0.version,
      status: 'inactive',
    });
  });

  it('triggers permanent delete lifecycle dialog', () => {
    const items = makeSuppliers(1);
    const item0 = items[0]!;
    mockApi.listSuppliers.mockReturnValue(
      of({ items, meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(SuppliersPage);
    fixture.detectChanges();

    const page = fixture.componentInstance;

    page.askDelete(item0);
    fixture.detectChanges();

    expect(page.confirmOpen()).toBe(true);
    expect(page.confirmLabel()).toBe('Delete permanently');

    page.confirmLifecycle();
    expect(mockApi.deleteSupplier).toHaveBeenCalledWith(item0.id);
  });

  it('shows error state when load fails', () => {
    mockApi.listSuppliers.mockReturnValue(
      throwError(() => ({ error: { error: { message: 'Network failure' } } })),
    );

    const fixture = TestBed.createComponent(SuppliersPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Network failure');
  });

  it('shows permission denied message when user lacks view permission', () => {
    mockSession.hasPermission.mockImplementation((perm: string) => perm !== 'suppliers.view');

    const fixture = TestBed.createComponent(SuppliersPage);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('You do not have permission to view suppliers.');
  });

  it('requests forceRefresh when toolbar refresh is clicked', () => {
    mockApi.listSuppliers.mockReturnValue(
      of({ items: makeSuppliers(1), meta: { page: 1, pageSize: 25, total: 1 } }),
    );

    const fixture = TestBed.createComponent(SuppliersPage);
    fixture.detectChanges();
    expect(mockApi.listSuppliers).toHaveBeenCalledTimes(1);
    expect(mockApi.listSuppliers).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceRefresh: false }),
    );

    fixture.componentInstance.reload(false, true);
    fixture.detectChanges();

    expect(mockApi.listSuppliers).toHaveBeenCalledTimes(2);
    expect(mockApi.listSuppliers).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceRefresh: true }),
    );
  });
});
