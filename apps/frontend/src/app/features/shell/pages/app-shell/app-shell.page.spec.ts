import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AppShellPage } from './app-shell.page';
import { AuthApi } from '../../../auth/data-access/auth.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';

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
    expect(text).toContain('Reports');
    expect(text).toContain('Purchases');
    expect(text).toContain('Sales');
    expect(text).toContain('Audit');
    expect(text).toContain('Employees');
    expect(text).not.toContain('Backup status');
  });

  it('hides Owner-only and platform navigation for Manager', async () => {
    const fixture = await createShell(MANAGER_A);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Reports');
    expect(text).toContain('Purchases');
    expect(text).toContain('Sales');
    expect(text).not.toContain('Audit');
    expect(text).toContain('Employees');
    expect(text).not.toContain('Billing');
    expect(text).not.toContain('Backup status');
  });

  it('shows Cashier POS surfaces and hides purchases, reports, and accounts', async () => {
    const fixture = await createShell(CASHIER_A);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Sales');
    expect(text).toContain('Customers');
    expect(text).toContain('Customer payments');
    expect(text).toContain('Dashboard');
    expect(text).not.toContain('Purchases');
    expect(text).not.toContain('Reports');
    expect(text).not.toContain('Accounts');
    expect(text).not.toContain('Audit');
    expect(text).not.toContain('Employees');
  });

  it('shows Store Keeper inventory/purchases and hides sales and financial reports', async () => {
    const fixture = await createShell(STORE_KEEPER_A);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Purchases');
    expect(text).toContain('Inventory');
    expect(text).toContain('Suppliers');
    expect(text).not.toContain('Sales');
    expect(text).not.toContain('Customers');
    expect(text).not.toContain('Reports');
    expect(text).not.toContain('Accounts');
  });
});

async function createShell(permissions: string[]): Promise<ComponentFixture<AppShellPage>> {
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

  await TestBed.configureTestingModule({
    imports: [AppShellPage],
    providers: [
      provideRouter([]),
      { provide: AuthSessionStore, useValue: store },
      { provide: AuthApi, useValue: { logout: () => of({}) } },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AppShellPage);
  fixture.detectChanges();
  return fixture;
}
