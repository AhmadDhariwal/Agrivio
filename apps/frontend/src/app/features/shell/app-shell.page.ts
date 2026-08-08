import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthSessionStore } from '../auth/auth-session.store';
import { AuthApi } from '../auth/auth.api';
import { SubscriptionStatusBannerComponent } from '../subscriptions/subscription-status-banner.component';

@Component({
  selector: 'agrivio-app-shell-page',
  standalone: true,
  imports: [RouterOutlet, RouterLink, SubscriptionStatusBannerComponent],
  templateUrl: './app-shell.page.html',
  styleUrl: './app-shell.page.scss',
})
export class AppShellPage {
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);

  readonly signingOut = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly session = this.sessionStore.session;
  readonly activeContext = this.sessionStore.activeContext;
  readonly subscriptionAccessState = computed(
    () => this.sessionStore.session()?.subscriptionAccessState ?? null,
  );
  readonly canViewOrganization = computed(() =>
    this.sessionStore.hasPermission('organization.view'),
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

  constructor() {
    if (this.sessionStore.session() === null) {
      this.sessionStore.loadSession().subscribe({
        error: () => {
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
    return `Organization ${active.organizationId} · ${active.role}`;
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
