import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NavbarNotificationsComponent } from './navbar-notifications.component';
import { AlertsApi } from '../../../alerts/data-access/alerts.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

describe('NavbarNotificationsComponent', () => {
  const mockFeed = {
    items: [
      {
        id: 'notif-1',
        alertType: 'upcoming_expiry',
        title: 'Upcoming expiry',
        body: 'Batch LOT-001 expires on 2026-09-04.',
        subjectKey: 'batch-1',
        fingerprint: 'fp-1',
        targetRoute: '/app/inventory/expiry',
        isRead: false,
        acknowledgedAt: null,
        acknowledgedBy: null,
        createdAt: '2026-08-26T12:00:00.000Z',
      },
      {
        id: 'notif-2',
        alertType: 'customer_dues',
        title: 'Customer dues',
        body: 'Customer receivable balance 50,000 PKR.',
        subjectKey: 'cust-1',
        fingerprint: 'fp-2',
        targetRoute: '/app/customers',
        isRead: true,
        acknowledgedAt: null,
        acknowledgedBy: null,
        createdAt: '2026-08-26T10:00:00.000Z',
      },
    ],
    unreadCount: 1,
  };

  let fixture: ComponentFixture<NavbarNotificationsComponent>;
  let component: NavbarNotificationsComponent;
  let mockAlertsApi: {
    getNotificationFeed: ReturnType<typeof vi.fn>;
    markNotificationRead: ReturnType<typeof vi.fn>;
    markAllNotificationsRead: ReturnType<typeof vi.fn>;
  };
  let mockSessionStore: {
    hasPermission: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  beforeEach(async () => {
    mockAlertsApi = {
      getNotificationFeed: vi.fn().mockReturnValue(of(mockFeed)),
      markNotificationRead: vi.fn().mockReturnValue(of({ id: 'notif-1', isRead: true, unreadCount: 0 })),
      markAllNotificationsRead: vi.fn().mockReturnValue(of({ success: true, unreadCount: 0 })),
    };

    mockSessionStore = {
      hasPermission: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [NavbarNotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: AlertsApi, useValue: mockAlertsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(NavbarNotificationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders the bell icon and displays unread badge with authoritative count', () => {
    expect(component.canViewAlerts()).toBe(true);
    expect(component.unreadCount()).toBe(1);
    expect(component.hasUnread()).toBe(true);

    const badge = fixture.nativeElement.querySelector('[data-testid="navbar-unread-badge"]');
    expect(badge).toBeTruthy();
    expect(badge.textContent.trim()).toBe('1');
  });

  it('toggles the notification panel on bell button click', () => {
    expect(component.isOpen()).toBe(false);
    const bellBtn = fixture.nativeElement.querySelector('[data-testid="navbar-notification-bell"]');
    expect(bellBtn).toBeTruthy();
    bellBtn.click();
    fixture.detectChanges();

    expect(component.isOpen()).toBe(true);
    const panel = fixture.nativeElement.querySelector('[data-testid="navbar-notification-panel"]');
    expect(panel).toBeTruthy();

    const items = fixture.nativeElement.querySelectorAll('.ag-notification-item');
    expect(items.length).toBe(2);
  });

  it('marks unread notification as read and navigates to target route when clicked', () => {
    component.togglePanel();
    fixture.detectChanges();

    const unreadItem = component.feed()[0];
    expect(unreadItem).toBeDefined();
    if (!unreadItem) throw new Error('Expected unread item');
    expect(unreadItem.isRead).toBe(false);

    component.onNotificationClick(unreadItem);
    expect(mockAlertsApi.markNotificationRead).toHaveBeenCalledWith('notif-1');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/app/inventory/expiry');
    expect(component.isOpen()).toBe(false);
  });

  it('marks all notifications as read when Mark all as read is clicked', () => {
    component.togglePanel();
    fixture.detectChanges();

    const markAllBtn = fixture.nativeElement.querySelector('[data-testid="navbar-mark-all-read"]');
    expect(markAllBtn).toBeTruthy();
    markAllBtn.click();
    fixture.detectChanges();

    expect(mockAlertsApi.markAllNotificationsRead).toHaveBeenCalled();
    expect(component.unreadCount()).toBe(0);
    expect(component.feed().every((i) => i.isRead)).toBe(true);
  });

  it('navigates to /app/alerts on View all click', () => {
    component.togglePanel();
    fixture.detectChanges();

    const viewAllBtn = fixture.nativeElement.querySelector('[data-testid="navbar-view-all-alerts"]');
    expect(viewAllBtn).toBeTruthy();
    viewAllBtn.click();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/app/alerts');
    expect(component.isOpen()).toBe(false);
  });

  it('closes panel on Escape key', () => {
    component.togglePanel();
    fixture.detectChanges();
    expect(component.isOpen()).toBe(true);

    component.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.isOpen()).toBe(false);
  });

  it('hides bell trigger and skips feed fetch when alerts module is disabled', async () => {
    const feedSpy = vi.fn().mockReturnValue(of(mockFeed));
    const capabilityService = {
      canUseModule: vi.fn(() => false),
      canUseFeature: vi.fn(() => true),
      canPerformAction: vi.fn(() => true),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [NavbarNotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: AlertsApi, useValue: { getNotificationFeed: feedSpy } },
        { provide: AuthSessionStore, useValue: mockSessionStore },
        { provide: CapabilityService, useValue: capabilityService },
      ],
    }).compileComponents();

    const disabledFixture = TestBed.createComponent(NavbarNotificationsComponent);
    disabledFixture.detectChanges();

    expect(disabledFixture.componentInstance.canViewAlerts()).toBe(false);
    expect(disabledFixture.nativeElement.querySelector('[data-testid="navbar-notification-bell"]')).toBeNull();
    expect(feedSpy).not.toHaveBeenCalled();
  });

  it('hides bell trigger and skips feed fetch when navbarNotifications feature is disabled', async () => {
    const feedSpy = vi.fn().mockReturnValue(of(mockFeed));
    const capabilityService = {
      canUseModule: vi.fn(() => true),
      canUseFeature: vi.fn((key: string) => key !== 'alerts.features.navbarNotifications'),
      canPerformAction: vi.fn(() => true),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [NavbarNotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: AlertsApi, useValue: { getNotificationFeed: feedSpy } },
        { provide: AuthSessionStore, useValue: mockSessionStore },
        { provide: CapabilityService, useValue: capabilityService },
      ],
    }).compileComponents();

    const featureDisabledFixture = TestBed.createComponent(NavbarNotificationsComponent);
    featureDisabledFixture.detectChanges();

    expect(featureDisabledFixture.componentInstance.canViewAlerts()).toBe(false);
    expect(featureDisabledFixture.nativeElement.querySelector('[data-testid="navbar-notification-bell"]')).toBeNull();
    expect(feedSpy).not.toHaveBeenCalled();
  });

  it('hides Mark all as read button when markAllRead action capability is disabled', async () => {
    const capabilityService = {
      canUseModule: vi.fn(() => true),
      canUseFeature: vi.fn(() => true),
      canPerformAction: vi.fn((key: string) => key !== 'alerts.actions.markAllRead'),
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [NavbarNotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: AlertsApi, useValue: mockAlertsApi },
        { provide: AuthSessionStore, useValue: mockSessionStore },
        { provide: CapabilityService, useValue: capabilityService },
      ],
    }).compileComponents();

    const actionDisabledFixture = TestBed.createComponent(NavbarNotificationsComponent);
    const actionDisabledComponent = actionDisabledFixture.componentInstance;
    actionDisabledFixture.detectChanges();

    actionDisabledComponent.togglePanel();
    actionDisabledFixture.detectChanges();

    expect(actionDisabledComponent.canPerformMarkAllRead()).toBe(false);
    expect(actionDisabledFixture.nativeElement.querySelector('[data-testid="navbar-mark-all-read"]')).toBeNull();

    actionDisabledComponent.markAllAsRead();
    expect(mockAlertsApi.markAllNotificationsRead).not.toHaveBeenCalled();
  });
});
