import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AlertsApi } from '../../data-access/alerts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { AlertSummaries, NotificationItem } from '../../models/alerts.models';

@Component({
  selector: 'agrivio-notification-center-page',
  standalone: true,
  imports: [RouterLink, UiPageHeaderComponent, UiAlertComponent, UiLoadingStateComponent],
  templateUrl: './notification-center.page.html',
  styleUrl: './notification-center.page.scss',
})
export class NotificationCenterPage {
  private readonly alertsApi = inject(AlertsApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly items = signal<NotificationItem[]>([]);
  readonly summaries = signal<AlertSummaries | null>(null);
  readonly acknowledgingId = signal<string | null>(null);
  readonly canView = computed(() => this.sessionStore.hasPermission('alerts.view'));

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.alertsApi.listNotifications().subscribe({
      next: (data) => {
        this.items.set(data.items);
        this.summaries.set(data.summaries);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load notifications.')
            : 'Unable to load notifications.',
        );
      },
    });
  }

  acknowledge(item: NotificationItem): void {
    if (item.acknowledgedAt) {
      return;
    }
    this.acknowledgingId.set(item.id);
    this.alertsApi.acknowledgeNotification(item.id).subscribe({
      next: (updated) => {
        this.items.update((rows) =>
          rows.map((row) => (row.id === updated.id ? updated : row)),
        );
        this.acknowledgingId.set(null);
      },
      error: () => {
        this.acknowledgingId.set(null);
        this.errorMessage.set('Unable to acknowledge notification.');
      },
    });
  }
}
