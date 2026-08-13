import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { AuthApi } from '../../../auth/data-access/auth.api';
import { SubscriptionStatusBannerComponent } from '../../../subscriptions/components/subscription-status-banner/subscription-status-banner.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-app-shell-page',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    SubscriptionStatusBannerComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './app-shell.page.html',
  styleUrl: './app-shell.page.scss',
})
export class AppShellPage {
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);

  readonly signingOut = signal(false);
  readonly sessionRestoring = signal(false);
  readonly navOpen = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly session = this.sessionStore.session;
  readonly activeContext = this.sessionStore.activeContext;
  readonly subscriptionAccessState = computed(
    () => this.sessionStore.session()?.subscriptionAccessState ?? null,
  );
  readonly canManagePlatformOrgs = computed(() =>
    this.sessionStore.hasPermission('platform.organizations.view'),
  );
  readonly canManagePlans = computed(() =>
    this.sessionStore.hasPermission('platform.subscriptions.manage'),
  );
  readonly canReviewBilling = computed(() =>
    this.sessionStore.hasPermission('platform.billing.verify'),
  );
  readonly canSubmitBilling = computed(() =>
    this.sessionStore.hasPermission('subscription.billing-evidence.submit'),
  );
  readonly canViewSettings = computed(() => this.sessionStore.hasPermission('settings.view'));
  readonly canViewBranches = computed(() => this.sessionStore.hasPermission('branches.view'));
  readonly canViewWarehouses = computed(() => this.sessionStore.hasPermission('warehouses.view'));
  readonly canViewEmployees = computed(() => this.sessionStore.hasPermission('users.view'));
  readonly canViewCatalog = computed(() => this.sessionStore.hasPermission('catalog.view'));
  readonly canViewCustomers = computed(() => this.sessionStore.hasPermission('customers.view'));
  readonly canViewSuppliers = computed(() => this.sessionStore.hasPermission('suppliers.view'));
  readonly canViewAccounts = computed(() => this.sessionStore.hasPermission('accounts.view'));
  readonly canViewExpenses = computed(() => this.sessionStore.hasPermission('expenses.view'));
  readonly canViewPurchases = computed(() => this.sessionStore.hasPermission('purchases.view'));
  readonly canViewSupplierPayments = computed(() =>
    this.sessionStore.hasPermission('supplier-payments.view'),
  );
  readonly canViewSales = computed(() => this.sessionStore.hasPermission('sales.view'));
  readonly canViewReturns = computed(() => this.sessionStore.hasPermission('returns.view'));
  readonly canViewCustomerPayments = computed(() =>
    this.sessionStore.hasPermission('customer-payments.view'),
  );
  readonly canViewInventory = computed(() => this.sessionStore.hasPermission('inventory.view'));


  constructor() {
    if (this.sessionStore.session() === null) {
      this.sessionRestoring.set(true);
      this.sessionStore.loadSession().subscribe({
        next: () => this.sessionRestoring.set(false),
        error: () => {
          this.sessionRestoring.set(false);
          void this.router.navigateByUrl('/login');
        },
      });
    }
  }

  contextLabel(): string {
    const active = this.activeContext();
    if (active === null) {
      return 'No active context';
    }
    if (active.contextType === 'platform') {
      return `Platform · ${active.role}`;
    }
    const parts = [`Organization ${active.organizationId}`, active.role];
    if (active.branchId) {
      parts.push(`Branch ${active.branchId}`);
    }
    if (active.warehouseId) {
      parts.push(`Warehouse ${active.warehouseId}`);
    }
    return parts.join(' · ');
  }

  signOut(): void {
    this.signingOut.set(true);
    this.errorMessage.set(null);
    this.authApi.logout().subscribe({
      next: () => {
        this.sessionStore.clear();
        this.signingOut.set(false);
        void this.router.navigateByUrl('/');
      },
      error: () => {
        this.signingOut.set(false);
        this.errorMessage.set('Sign-out failed.');
      },
    });
  }
}
