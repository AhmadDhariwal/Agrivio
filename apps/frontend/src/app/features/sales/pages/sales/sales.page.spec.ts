import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SalesPage } from './sales.page';
import { SalesApi } from '../../data-access/sales.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('SalesPage', () => {
  function createPage(options: {
    canUseModule?: boolean;
    canCreateDraft?: boolean;
    canSearch?: boolean;
    canFilterStatus?: boolean;
  } = {}) {
    TestBed.configureTestingModule({
      imports: [SalesPage],
      providers: [
        provideRouter([]),
        {
          provide: SalesApi,
          useValue: {
            listSales: () => of({ items: [], meta: { page: 1, pageSize: 25, total: 0 } }),
          },
        },
        {
          provide: AuthSessionStore,
          useValue: { hasPermission: () => true },
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
    expect(fixture.nativeElement.textContent).toContain('You do not have permission to view sales.');
  });
});
