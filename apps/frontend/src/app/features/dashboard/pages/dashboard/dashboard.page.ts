import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { DashboardApi } from '../../data-access/dashboard.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { DashboardPayload } from '../../models/dashboard.models';

@Component({
  selector: 'agrivio-dashboard-page',
  standalone: true,
  imports: [RouterLink, UiPageHeaderComponent, UiAlertComponent, UiLoadingStateComponent],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly dashboardApi = inject(DashboardApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly dashboard = signal<DashboardPayload | null>(null);
  readonly canView = computed(() => this.sessionStore.hasPermission('dashboard.view'));
  readonly suspended = computed(
    () => this.sessionStore.session()?.subscriptionAccessState?.status === 'suspended',
  );

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }
    if (this.suspended()) {
      this.loading.set(false);
      this.dashboard.set(null);
      this.errorMessage.set(
        'Subscription is suspended. The operational dashboard is blocked until reactivation. Historical reports and entitled exports remain available.',
      );
      return;
    }
    this.loading.set(true);
    this.dashboardApi.getDashboard().subscribe({
      next: (data) => {
        this.dashboard.set(data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load dashboard.')
            : 'Unable to load dashboard.',
        );
      },
    });
  }
}
