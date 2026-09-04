import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SalesPage } from './sales.page';
import { SalesApi } from '../../data-access/sales.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { SaleRecord } from '../../models/sales.models';

const draftSale: SaleRecord = {
  id: 'sale-1',
  organizationId: 'org-1',
  branchId: 'b1',
  warehouseId: 'w1',
  customerId: null,
  saleDate: '2026-09-04',
  notes: '',
  status: 'draft',
  invoiceNumber: null,
  lines: [],
  version: 1,
  postedAt: null,
  createdAt: '2026-09-04T00:00:00Z',
  updatedAt: '2026-09-04T00:00:00Z',
};

describe('SalesPage', () => {
  function createPage(
    options: {
      canUseModule?: boolean;
      canCreateDraft?: boolean;
      canSearch?: boolean;
      canFilterStatus?: boolean;
      items?: SaleRecord[];
      permissions?: string[];
    } = {},
  ) {
    TestBed.configureTestingModule({
      imports: [SalesPage],
      providers: [
        provideRouter([]),
        {
          provide: SalesApi,
          useValue: {
            listSales: () =>
              of({
                items: options.items ?? [],
                meta: { page: 1, pageSize: 25, total: options.items?.length ?? 0 },
              }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: {
            hasPermission: (permission: string) =>
              options.permissions?.includes(permission) ?? true,
          },
        },
        {
          provide: CapabilityService,
          useValue: {
            canUseModule: () => options.canUseModule ?? true,
            canPerformAction: (action: string) => {
              if (action === 'sales.actions.createDraft') return options.canCreateDraft ?? true;
              return true;
            },
            canUseFeature: (feature: string) => {
              if (feature === 'sales.features.search') return options.canSearch ?? true;
              if (feature === 'sales.features.statusFilter') return options.canFilterStatus ?? true;
              return true;
            },
          },
        },
      ],
    });
    const fixture: ComponentFixture<SalesPage> = TestBed.createComponent(SalesPage);
    fixture.detectChanges();
    return fixture;
  }

  it('shows empty state when sales are available', () => {
    const fixture = createPage();
    expect(fixture.nativeElement.textContent).toContain('No sales');
    expect(fixture.nativeElement.querySelector('[data-testid="sale-create-link"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('agrivio-ui-search-input')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('select')).toBeTruthy();
  });

  it('hides create draft button when sales.actions.createDraft is disabled', () => {
    const fixture = createPage({ canCreateDraft: false });
    expect(fixture.nativeElement.querySelector('[data-testid="sale-create-link"]')).toBeNull();
  });

  it('hides search input when sales.features.search is disabled', () => {
    const fixture = createPage({ canSearch: false });
    expect(fixture.nativeElement.querySelector('agrivio-ui-search-input')).toBeNull();
  });

  it('hides status filter when sales.features.statusFilter is disabled', () => {
    const fixture = createPage({ canFilterStatus: false });
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
  });

  it('shows blocked alert when sales module is disabled', () => {
    const fixture = createPage({ canUseModule: false });
    expect(fixture.nativeElement.textContent).toContain(
      'You do not have permission to view sales.',
    );
  });

  it('routes View to detail and Edit draft to the explicit edit route', () => {
    const fixture = createPage({ items: [draftSale] });
    const row = fixture.nativeElement.querySelector('[data-testid="sale-row"]') as HTMLElement;
    expect(row.querySelector('a[href="/app/sales/sale-1"]')?.textContent).toContain('View');
    expect(row.querySelector('a[href="/app/sales/sale-1/edit"]')?.textContent).toContain(
      'Edit draft',
    );
  });

  it('keeps View visible and Edit hidden for a view-only user', () => {
    const fixture = createPage({ items: [draftSale], permissions: ['sales.view'] });
    const row = fixture.nativeElement.querySelector('[data-testid="sale-row"]') as HTMLElement;
    expect(row.querySelector('a[href="/app/sales/sale-1"]')).toBeTruthy();
    expect(row.querySelector('a[href="/app/sales/sale-1/edit"]')).toBeNull();
  });
});
