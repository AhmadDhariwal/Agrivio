import { describe, expect, it } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AppShellPage } from './app-shell.page';
import { AuthApi } from '../../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { NavigationApi } from '../../data-access/navigation.api';
import { NavigationService } from '../../data-access/navigation.service';

import { CatalogApi } from '../../../catalog/data-access/catalog.api';

const OWNER_A = [
  'settings.view',
  'users.view',
  'catalog.view',
  'customers.view',
  'suppliers.view',
  'accounts.view',
  'expenses.view',
  'purchases.view',
  'supplier-payments.view',
  'sales.view',
  'returns.view',
  'customer-payments.view',
  'inventory.view',
  'dashboard.view',
  'alerts.view',
  'reports.view',
  'imports.preview',
  'audit.view',
  'subscription.billing-evidence.submit',
];

const MANAGER_A = OWNER_A.filter(
  (permission) =>
    permission !== 'audit.view' && permission !== 'subscription.billing-evidence.submit',
);

const CASHIER_A = [
  'catalog.view',
  'customers.view',
  'sales.view',
  'customer-payments.view',
  'inventory.view',
  'dashboard.view',
  'alerts.view',
];

const STORE_KEEPER_A = [
  'catalog.view',
  'suppliers.view',
  'purchases.view',
  'inventory.view',
  'alerts.view',
];

describe('R1-F09-003 Angular role UX spot check', () => {
  it('shows Owner operational navigation including reports, purchases, sales, and audit', async () => {
    const fixture = await createShell(OWNER_A);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Reports & Insights');
    expect(text).toContain('Purchases');
    expect(text).toContain('Sales');
    expect(text).toContain('Customers & Suppliers');
    expect(text).toContain('Data & Operations');
    expect(text).not.toContain('Platform Administration');
    expect(text).not.toContain('Backup status');
  });

  it('hides Owner-only and platform navigation for Manager', async () => {
    const fixture = await createShell(MANAGER_A);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Reports & Insights');
    expect(text).toContain('Purchases');
    expect(text).toContain('Sales');
    expect(text).toContain('Imports');
    expect(text).not.toContain('Audit');
    expect(text).not.toContain('Platform Administration');
    expect(text).not.toContain('Backup status');
  });

  it('shows Cashier POS surfaces and hides purchases, reports, and accounts', async () => {
    const fixture = await createShell(CASHIER_A);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Sales');
    expect(text).toContain('Customers & Suppliers');
    expect(text).toContain('Dashboard');
    expect(text).not.toContain('Purchases');
    expect(text).not.toContain('Finance');
    expect(text).not.toContain('Accounts');
    expect(text).not.toContain('Audit');
    expect(text).not.toContain('Employees');
  });

  it('shows Store Keeper inventory/purchases and hides sales and financial reports', async () => {
    const fixture = await createShell(STORE_KEEPER_A);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Purchases');
    expect(text).toContain('Inventory');
    expect(text).toContain('Customers & Suppliers');
    expect(text).not.toContain('Sales');
    expect(text).not.toContain('Finance');
    expect(text).not.toContain('Accounts');
  });

  it('filters navigation via search input', async () => {
    const fixture = await createShell(OWNER_A);
    const component = fixture.componentInstance;
    component.navService.setSearchTerm('audit');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Audit');
    expect(text).not.toContain('Purchases');
  });

  it('opens customization dialog when Customize button is clicked', async () => {
    const fixture = await createShell(OWNER_A);
    const component = fixture.componentInstance;
    expect(component.navService.isCustomizerOpen()).toBe(false);

    component.navService.openCustomizer();
    fixture.detectChanges();

    expect(component.navService.isCustomizerOpen()).toBe(true);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Customize Navigation');
  });
});

async function createShell(
  permissions: string[],
  hiddenItemIds: string[] = [],
): Promise<ComponentFixture<AppShellPage>> {
  const store = {
    session: () => ({
      user: { id: 'u1', email: 'role@example.com', displayName: 'Role User', status: 'active' },
      activeContext: {
        contextType: 'organization',
        organizationId: 'org-1',
        role: 'Owner',
        permissions,
      },
      availableContexts: [],
      subscriptionAccessState: null,
    }),
    activeContext: () => ({
      contextType: 'organization',
      organizationId: 'org-1',
      role: 'Owner',
      permissions,
    }),
    hasPermission: (permission: string) => permissions.includes(permission),
    loadSession: () => of({}),
  };

  const navApi = {
    getPreferences: () => of({ hiddenItemIds }),
    updatePreferences: (ids: string[]) => of({ hiddenItemIds: ids }),
  };

  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [AppShellPage],
    providers: [
      provideRouter([]),
      { provide: AuthSessionStore, useValue: store },
      { provide: AuthApi, useValue: { logout: () => of({}) } },
      { provide: NavigationApi, useValue: navApi },
      { provide: CatalogApi, useValue: { listProducts: () => of([]) } },
      NavigationService,
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AppShellPage);
  fixture.detectChanges();
  return fixture;
}

function navLinks(fixture: ComponentFixture<AppShellPage>): string[] {
  const anchors = Array.from(
    fixture.nativeElement.querySelectorAll('nav a.ag-shell__nav-link'),
  ) as HTMLAnchorElement[];
  return anchors.map((a) => a.textContent?.trim() ?? '');
}
