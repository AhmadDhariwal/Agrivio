import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EMPTY, Subject } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AlertsApi } from '../../data-access/alerts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { AlertSummaries, NotificationItem } from '../../models/alerts.models';

export type AlertStatusFilter = 'all' | 'unacknowledged' | 'acknowledged' | 'unread' | 'read';
export type AlertTypeFilter =
  | 'all'
  | 'low_stock'
  | 'upcoming_expiry'
  | 'expired_stock'
  | 'dead_stock'
  | 'customer_dues'
  | 'supplier_dues';

@Component({
  selector: 'agrivio-notification-center-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiModuleInfoComponent,
    UiPaginationComponent,
  ],
  templateUrl: './notification-center.page.html',
  styleUrl: './notification-center.page.scss',
})
export class NotificationCenterPage {
  private readonly alertsApi = inject(AlertsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadRequests = new Subject<boolean>();

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly items = signal<NotificationItem[]>([]);
  readonly summaries = signal<AlertSummaries | null>(null);
  readonly acknowledgingId = signal<string | null>(null);

  // Filters & Pagination State
  readonly searchFilter = signal('');
  readonly typeFilter = signal<AlertTypeFilter>('all');
  readonly statusFilter = signal<AlertStatusFilter>('all');
  readonly sortDirection = signal<'newest' | 'oldest'>('newest');
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);

  readonly isModuleEnabled = computed(
    () => this.capabilityService?.canUseModule('alerts') ?? true,
  );
  readonly canView = computed(
    () => this.sessionStore.hasPermission('alerts.view') && this.isModuleEnabled(),
  );
  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseFeature('alerts.features.moduleInfo') ?? true,
  );
  readonly showSummaryCards = computed(
    () => this.capabilityService?.canUseFeature('alerts.features.summaryCards') ?? true,
  );
  readonly canPerformAcknowledge = computed(
    () => this.capabilityService?.canPerformAction('alerts.actions.acknowledge') ?? true,
  );
  readonly canPerformMarkRead = computed(
    () => this.capabilityService?.canPerformAction('alerts.actions.markRead') ?? true,
  );

  readonly moduleInfoItems = [
    'Stay informed about critical inventory, expiry, and dues events across your organization.',
    'Business acknowledgement records that explicit operational action has been taken on an alert.',
    'Marking notifications as read controls your personal navbar badge without affecting business acknowledgement or other users.',
  ];

  isFamilyEnabled(alertType: string): boolean {
    if (!this.capabilityService) return true;
    switch (alertType) {
      case 'low_stock':
        return this.capabilityService.canUseFeature('alerts.alertTypeAvailability.lowStock');
      case 'upcoming_expiry':
        return this.capabilityService.canUseFeature('alerts.alertTypeAvailability.upcomingExpiry');
      case 'expired_stock':
        return this.capabilityService.canUseFeature('alerts.alertTypeAvailability.expiredStock');
      case 'dead_stock':
        return this.capabilityService.canUseFeature('alerts.alertTypeAvailability.deadStock');
      case 'customer_dues':
        return this.capabilityService.canUseFeature('alerts.alertTypeAvailability.customerDues');
      case 'supplier_dues':
        return this.capabilityService.canUseFeature('alerts.alertTypeAvailability.supplierDues');
      default:
        return true;
    }
  }

  readonly filteredItems = computed(() => {
    let list = this.items().filter((item) => this.isFamilyEnabled(item.alertType));
    const search = this.searchFilter().trim().toLowerCase();
    const type = this.typeFilter();
    const status = this.statusFilter();
    const sort = this.sortDirection();

    if (search) {
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(search) ||
          item.body.toLowerCase().includes(search) ||
          item.subjectKey.toLowerCase().includes(search) ||
          item.alertType.toLowerCase().includes(search),
      );
    }

    if (type !== 'all') {
      list = list.filter((item) => item.alertType === type);
    }

    if (status !== 'all') {
      if (status === 'unacknowledged') {
        list = list.filter((item) => !item.acknowledgedAt);
      } else if (status === 'acknowledged') {
        list = list.filter((item) => !!item.acknowledgedAt);
      } else if (status === 'unread') {
        list = list.filter((item) => !item.isRead);
      } else if (status === 'read') {
        list = list.filter((item) => item.isRead);
      }
    }

    return [...list].sort((a, b) => {
      const dateStrA = a.createdAt || a.activatedAt;
      const dateStrB = b.createdAt || b.activatedAt;
      const rawA = dateStrA ? new Date(dateStrA).getTime() : 0;
      const rawB = dateStrB ? new Date(dateStrB).getTime() : 0;
      const timeA = Number.isFinite(rawA) ? rawA : 0;
      const timeB = Number.isFinite(rawB) ? rawB : 0;
      const timeDiff = sort === 'newest' ? timeB - timeA : timeA - timeB;

      if (timeDiff !== 0) {
        return timeDiff;
      }

      // Deterministic tie-breaker by id: ensures strict order reversal when timestamps are identical
      return sort === 'newest'
        ? String(b.id).localeCompare(String(a.id))
        : String(a.id).localeCompare(String(b.id));
    });
  });

  readonly totalFilteredCount = computed(() => this.filteredItems().length);

  readonly paginatedItems = computed(() => {
    const list = this.filteredItems();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  });

  constructor() {
    this.reloadRequests
      .pipe(
        switchMap((forceRefresh) => {
          if (!this.canView()) {
            this.loading.set(false);
            return EMPTY;
          }
          this.loading.set(true);
          this.errorMessage.set(null);
          return this.alertsApi.listNotifications({ forceRefresh: forceRefresh === true });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
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
    this.reload();
  }

  reload(forceRefresh = false): void {
    this.reloadRequests.next(forceRefresh);
  }

  acknowledge(item: NotificationItem): void {
    if (item.acknowledgedAt || !this.canPerformAcknowledge()) {
      return;
    }
    this.acknowledgingId.set(item.id);
    this.alertsApi.acknowledgeNotification(item.id).subscribe({
      next: (updated) => {
        this.items.update((rows) =>
          rows.map((row) =>
            row.id === updated.id
              ? { ...row, acknowledgedAt: updated.acknowledgedAt, acknowledgedBy: updated.acknowledgedBy }
              : row,
          ),
        );
        this.acknowledgingId.set(null);
      },
      error: () => {
        this.acknowledgingId.set(null);
        this.errorMessage.set('Unable to acknowledge notification.');
      },
    });
  }

  markRead(item: NotificationItem): void {
    if (item.isRead || !this.canPerformMarkRead()) return;
    this.items.update((rows) =>
      rows.map((row) => (row.id === item.id ? { ...row, isRead: true } : row)),
    );
    this.alertsApi.markNotificationRead(item.id).subscribe({
      error: () => undefined,
    });
  }

  onSearchChange(value: string): void {
    this.searchFilter.set(value);
    this.currentPage.set(1);
  }

  onTypeChange(value: AlertTypeFilter): void {
    this.typeFilter.set(value);
    this.currentPage.set(1);
  }

  onStatusChange(value: AlertStatusFilter): void {
    this.statusFilter.set(value);
    this.currentPage.set(1);
  }

  onSortChange(value: 'newest' | 'oldest'): void {
    this.sortDirection.set(value);
    this.currentPage.set(1);
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  formatRelativeDate(dateStr?: string | null): string {
    if (!dateStr) return '—';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      if (isNaN(diffMs)) return dateStr;

      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;

      if (diffMs < 0) {
        return `Today, ${timeStr}`;
      }
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffDays === 0) {
        return `Today, ${timeStr}`;
      }
      if (diffDays === 1) {
        return `Yesterday, ${timeStr}`;
      }
      if (diffDays > 1 && diffDays < 30) {
        return `${diffDays}d ago (${timeStr})`;
      }
      return `${date.toISOString().slice(0, 10)} ${timeStr}`;
    } catch {
      return dateStr;
    }
  }

  formatFullTimestamp(dateStr?: string | null): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleString();
    } catch {
      return dateStr ?? '';
    }
  }

  getSeverity(alertType: string): 'High' | 'Medium' | 'Low' {
    switch (alertType) {
      case 'expired_stock':
      case 'customer_dues':
        return 'High';
      case 'low_stock':
      case 'upcoming_expiry':
      case 'supplier_dues':
        return 'Medium';
      case 'dead_stock':
      default:
        return 'Low';
    }
  }

  getHumanAlertType(alertType: string): string {
    switch (alertType) {
      case 'low_stock':
        return 'Low stock';
      case 'upcoming_expiry':
        return 'Upcoming expiry';
      case 'expired_stock':
        return 'Expired stock';
      case 'dead_stock':
        return 'Dead stock';
      case 'customer_dues':
        return 'Customer dues';
      case 'supplier_dues':
        return 'Supplier dues';
      default:
        return alertType;
    }
  }
}
