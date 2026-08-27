import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { AlertsApi } from '../../../alerts/data-access/alerts.api';
import { NotificationItem } from '../../../alerts/models/alerts.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

@Component({
  selector: 'agrivio-navbar-notifications',
  standalone: true,
  templateUrl: './navbar-notifications.component.html',
  styleUrl: './navbar-notifications.component.scss',
})
export class NavbarNotificationsComponent {
  private readonly alertsApi = inject(AlertsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  readonly isOpen = signal(false);
  readonly loading = signal(false);
  readonly feed = signal<NotificationItem[]>([]);
  readonly unreadCount = signal(0);

  readonly isModuleEnabled = computed(
    () => this.capabilityService?.canUseModule('alerts') ?? true,
  );
  readonly isNavbarFeatureEnabled = computed(
    () =>
      this.capabilityService?.canUseFeature('alerts.features.navbarNotifications') ??
      true,
  );
  readonly canPerformMarkRead = computed(
    () => this.capabilityService?.canPerformAction('alerts.actions.markRead') ?? true,
  );
  readonly canPerformMarkAllRead = computed(
    () =>
      this.capabilityService?.canPerformAction('alerts.actions.markAllRead') ?? true,
  );

  readonly canViewAlerts = computed(
    () =>
      this.sessionStore.hasPermission('alerts.view') &&
      this.isModuleEnabled() &&
      this.isNavbarFeatureEnabled(),
  );
  readonly hasUnread = computed(() => this.unreadCount() > 0);

  constructor() {
    this.refreshBadge();
  }

  refreshBadge(): void {
    if (!this.canViewAlerts()) return;
    this.alertsApi.getNotificationFeed(6).subscribe({
      next: (payload) => {
        this.feed.set(payload.items);
        this.unreadCount.set(payload.unreadCount);
      },
      error: () => undefined,
    });
  }

  togglePanel(): void {
    if (!this.canViewAlerts()) return;
    const next = !this.isOpen();
    this.isOpen.set(next);
    if (next) {
      this.loading.set(true);
      this.alertsApi.getNotificationFeed(6).subscribe({
        next: (payload) => {
          this.feed.set(payload.items);
          this.unreadCount.set(payload.unreadCount);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
        },
      });
    }
  }

  closePanel(): void {
    this.isOpen.set(false);
  }

  onNotificationClick(item: NotificationItem): void {
    if (!item.isRead && this.canPerformMarkRead()) {
      this.feed.update((items) =>
        items.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)),
      );
      this.unreadCount.update((c) => Math.max(0, c - 1));
      this.alertsApi.markNotificationRead(item.id).subscribe({
        next: (res) => {
          this.unreadCount.set(res.unreadCount);
        },
        error: () => undefined,
      });
    }
    this.closePanel();
    const route = item.targetRoute || '/app/alerts';
    void this.router.navigateByUrl(route);
  }

  markAllAsRead(): void {
    if (!this.hasUnread() || !this.canPerformMarkAllRead()) return;
    this.feed.update((items) => items.map((i) => ({ ...i, isRead: true })));
    this.unreadCount.set(0);
    this.alertsApi.markAllNotificationsRead().subscribe({
      next: (res) => {
        this.unreadCount.set(res.unreadCount);
      },
      error: () => undefined,
    });
  }

  viewAll(): void {
    this.closePanel();
    void this.router.navigateByUrl('/app/alerts');
  }

  getAlertIcon(alertType: string): string {
    switch (alertType) {
      case 'upcoming_expiry':
        return 'calendar-green';
      case 'expired_stock':
        return 'calendar-red';
      case 'low_stock':
      case 'dead_stock':
        return 'box-amber';
      case 'customer_dues':
        return 'user-blue';
      case 'supplier_dues':
        return 'truck-orange';
      default:
        return 'bell';
    }
  }

  formatRelativeTime(dateStr?: string | null): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      if (isNaN(diffMs)) return '';
      const diffMinutes = Math.floor(diffMs / 60000);
      if (diffMinutes < 1) return 'just now';
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closePanel();
      const trigger = this.elementRef.nativeElement.querySelector(
        '.ag-notification-trigger',
      ) as HTMLElement | null;
      trigger?.focus();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.closePanel();
    }
  }
}
