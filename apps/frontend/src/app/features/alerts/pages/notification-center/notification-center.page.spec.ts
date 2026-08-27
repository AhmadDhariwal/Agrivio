import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NotificationCenterPage } from './notification-center.page';
import { AlertsApi } from '../../data-access/alerts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('NotificationCenterPage', () => {
  const mockPayload = {
    items: [
      {
        id: 'notif-1',
        alertType: 'low_stock',
        title: 'Low stock',
        body: 'Sellable quantity 2.0000 is at or below threshold 10.0000.',
        subjectKey: 'prod-1::wh-1',
        fingerprint: 'low_stock:prod-1:wh-1',
        targetRoute: '/app/inventory/stock',
        isRead: false,
        acknowledgedAt: null,
        acknowledgedBy: null,
        createdAt: '2026-08-26T12:00:00.000Z',
      },
      {
        id: 'notif-2',
        alertType: 'upcoming_expiry',
        title: 'Upcoming expiry',
        body: 'Batch LOT-001 expires on 2026-09-04.',
        subjectKey: 'batch-1',
        fingerprint: 'upcoming_expiry:batch-1',
        targetRoute: '/app/inventory/expiry',
        isRead: true,
        acknowledgedAt: '2026-08-26T11:00:00.000Z',
        acknowledgedBy: 'user-1',
        createdAt: '2026-08-26T10:00:00.000Z',
      },
      {
        id: 'notif-3',
        alertType: 'customer_dues',
        title: 'Customer dues',
        body: 'Customer receivable balance 50,000 PKR.',
        subjectKey: 'cust-1',
        fingerprint: 'customer_dues:cust-1',
        targetRoute: '/app/customers',
        isRead: false,
        acknowledgedAt: null,
        acknowledgedBy: null,
        createdAt: '2026-08-26T09:00:00.000Z',
      },
    ],
    summaries: {
      lowStockCount: 1,
      upcomingExpiryCount: 1,
      expiredStockCount: 0,
      deadStockCount: 0,
      customerDuesCount: 1,
      customerDuesAmount: { amount: '50,000.00', currency: 'PKR' },
      supplierDuesCount: 0,
      supplierDuesAmount: { amount: '0.00', currency: 'PKR' },
    },
    unreadCount: 2,
    businessDate: '2026-08-26',
  };

  let fixture: ComponentFixture<NotificationCenterPage>;
  let component: NotificationCenterPage;
  let mockAlertsApi: {
    listNotifications: ReturnType<typeof vi.fn>;
    acknowledgeNotification: ReturnType<typeof vi.fn>;
    markNotificationRead: ReturnType<typeof vi.fn>;
  };
  let mockSessionStore: { hasPermission: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockAlertsApi = {
      listNotifications: vi.fn().mockReturnValue(of(mockPayload)),
      acknowledgeNotification: vi.fn().mockImplementation((id: string) =>
        of({
          id,
          alertType: 'low_stock',
          title: 'Low stock',
          body: 'Sellable quantity 2.0000 is at or below threshold 10.0000.',
          subjectKey: 'prod-1::wh-1',
          fingerprint: 'low_stock:prod-1:wh-1',
          targetRoute: '/app/inventory/stock',
          isRead: false,
          acknowledgedAt: '2026-08-26T13:00:00.000Z',
          acknowledgedBy: 'user-1',
          createdAt: '2026-08-26T12:00:00.000Z',
        }),
      ),
      markNotificationRead: vi.fn().mockReturnValue(of({ id: 'notif-1', isRead: true, unreadCount: 1 })),
    };

    mockSessionStore = {
      hasPermission: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [NotificationCenterPage],
      providers: [
        provideRouter([]),
        { provide: AlertsApi, useValue: mockAlertsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationCenterPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders page header and authoritative KPI summary cards', () => {
    expect(component.canView()).toBe(true);
    expect(component.loading()).toBe(false);

    const titleEl = fixture.nativeElement.querySelector('.page-head__title');
    expect(titleEl.textContent.trim()).toBe('Notification center');

    const countPill = fixture.nativeElement.querySelector('[data-testid="alerts-count-pill"]');
    expect(countPill.textContent.trim()).toBe('3 alerts');

    // KPI values match authoritative backend summary
    const lowStockVal = fixture.nativeElement.querySelector('[data-testid="alert-summary-low-stock"]');
    expect(lowStockVal.textContent.trim()).toBe('1');

    const upcomingVal = fixture.nativeElement.querySelector('[data-testid="alert-summary-upcoming-expiry"]');
    expect(upcomingVal.textContent.trim()).toBe('1');

    const customerDuesVal = fixture.nativeElement.querySelector('[data-testid="alert-summary-customer-dues"]');
    expect(customerDuesVal.textContent.trim()).toBe('1');
  });

  it('renders desktop table rows for notifications', () => {
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);

    const firstRow = rows[0];
    expect(firstRow.textContent).toContain('Low stock');
    expect(firstRow.textContent).toContain('prod-1::wh-1');
  });

  it('filters notifications by search query', () => {
    component.onSearchChange('customer');
    fixture.detectChanges();

    expect(component.totalFilteredCount()).toBe(1);
    expect(component.filteredItems()[0]?.alertType).toBe('customer_dues');
  });

  it('filters notifications by alert type', () => {
    component.onTypeChange('upcoming_expiry');
    fixture.detectChanges();

    expect(component.totalFilteredCount()).toBe(1);
    expect(component.filteredItems()[0]?.id).toBe('notif-2');
  });

  it('filters notifications by unacknowledged status', () => {
    component.onStatusChange('unacknowledged');
    fixture.detectChanges();

    expect(component.totalFilteredCount()).toBe(2);
    expect(component.filteredItems().every((i) => !i.acknowledgedAt)).toBe(true);
  });

  it('acknowledges an alert and updates item state', () => {
    const unacknowledgedItem = component.items()[0];
    expect(unacknowledgedItem).toBeDefined();
    if (!unacknowledgedItem) return;
    expect(unacknowledgedItem.acknowledgedAt).toBeNull();

    component.acknowledge(unacknowledgedItem);
    expect(mockAlertsApi.acknowledgeNotification).toHaveBeenCalledWith('notif-1');

    const updatedItem = component.items().find((i) => i.id === 'notif-1');
    expect(updatedItem?.acknowledgedAt).toBeTruthy();
  });

  it('displays empty state when no items match filters', () => {
    component.onSearchChange('nonexistent-term-xyz');
    fixture.detectChanges();

    expect(component.totalFilteredCount()).toBe(0);
    const emptyState = fixture.nativeElement.querySelector('[data-testid="alerts-empty-state"]');
    expect(emptyState).toBeTruthy();
  });

  it('shows permission warning when user lacks alerts.view permission', async () => {
    mockSessionStore.hasPermission.mockReturnValue(false);
    const permFixture = TestBed.createComponent(NotificationCenterPage);
    permFixture.detectChanges();

    expect(permFixture.componentInstance.canView()).toBe(false);
    const alertEl = permFixture.nativeElement.querySelector('[data-testid="alerts-permission-alert"]');
    expect(alertEl).toBeTruthy();
  });

  it('enforces module, features, alert family, and acknowledge action capability gates', async () => {
    const capabilityService = {
      canUseModule: vi.fn((key: string) => key === 'alerts'),
      canUseFeature: vi.fn((key: string) => {
        if (key === 'alerts.features.moduleInfo') return false;
        if (key === 'alerts.features.summaryCards') return true;
        if (key === 'alerts.alertTypeAvailability.lowStock') return false;
        return true;
      }),
      canPerformAction: vi.fn((key: string) => {
        if (key === 'alerts.actions.acknowledge') return false;
        return true;
      }),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [NotificationCenterPage],
      providers: [
        provideRouter([]),
        { provide: AlertsApi, useValue: mockAlertsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
        { provide: CapabilityService, useValue: capabilityService },
      ],
    }).compileComponents();

    const capFixture = TestBed.createComponent(NotificationCenterPage);
    const capComponent = capFixture.componentInstance;
    capFixture.detectChanges();

    // Module is enabled
    expect(capComponent.canView()).toBe(true);

    // moduleInfo feature is disabled
    expect(capComponent.showModuleInfo()).toBe(false);
    expect(capFixture.nativeElement.querySelector('agrivio-ui-module-info')).toBeNull();

    // low_stock alert family is disabled -> filtered out from list and KPI card hidden
    expect(capComponent.isFamilyEnabled('low_stock')).toBe(false);
    expect(capComponent.isFamilyEnabled('upcoming_expiry')).toBe(true);
    expect(capComponent.filteredItems().some((i) => i.alertType === 'low_stock')).toBe(false);
    expect(capComponent.totalFilteredCount()).toBe(2);
    expect(capFixture.nativeElement.querySelector('[data-testid="kpi-low-stock"]')).toBeNull();
    expect(capFixture.nativeElement.querySelector('[data-testid="kpi-upcoming-expiry"]')).toBeTruthy();

    // Acknowledge action is disabled -> acknowledge button hidden and action guarded
    expect(capComponent.canPerformAcknowledge()).toBe(false);
    expect(capFixture.nativeElement.querySelector('[data-testid="acknowledge-notification"]')).toBeNull();

    const notif3 = capComponent.items().find((i) => i.id === 'notif-3');
    expect(notif3).toBeDefined();
    if (notif3) {
      capComponent.acknowledge(notif3);
      expect(mockAlertsApi.acknowledgeNotification).not.toHaveBeenCalled();
    }
  });

  it('hides page content when alerts module capability is disabled', async () => {
    const capabilityService = {
      canUseModule: vi.fn(() => false),
      canUseFeature: vi.fn(() => true),
      canPerformAction: vi.fn(() => true),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [NotificationCenterPage],
      providers: [
        provideRouter([]),
        { provide: AlertsApi, useValue: mockAlertsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
        { provide: CapabilityService, useValue: capabilityService },
      ],
    }).compileComponents();

    const disabledFixture = TestBed.createComponent(NotificationCenterPage);
    disabledFixture.detectChanges();

    expect(disabledFixture.componentInstance.canView()).toBe(false);
    expect(disabledFixture.nativeElement.querySelector('[data-testid="alerts-permission-alert"]')).toBeTruthy();
    expect(disabledFixture.nativeElement.querySelector('[data-testid="alerts-table"]')).toBeNull();
  });
});
