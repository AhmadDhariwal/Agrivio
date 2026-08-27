import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { AuthApi } from '../../../auth/data-access/auth.api';
import { NavigationService } from '../../data-access/navigation.service';
import { NavCustomizerDialogComponent } from '../../components/nav-customizer-dialog/nav-customizer-dialog.component';
import { NavbarSearchComponent } from '../../components/navbar-search/navbar-search.component';
import { NavbarNotificationsComponent } from '../../components/navbar-notifications/navbar-notifications.component';
import { UserProfileMenuComponent } from '../../components/user-profile-menu/user-profile-menu.component';
import { SubscriptionStatusBannerComponent } from '../../../subscriptions/components/subscription-status-banner/subscription-status-banner.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiSearchInputComponent } from '../../../../shared/ui/ui-search-input/ui-search-input.component';
import { lockBodyScroll, unlockBodyScroll } from '../../../../shared/ui/body-scroll-lock';
import { VisibleNavGroup } from '../../data-access/navigation.model';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

const SIDEBAR_COLLAPSED_KEY = 'agrivio_sidebar_collapsed';

export interface TooltipState {
  readonly text: string;
  readonly top: number;
}

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
    UiSearchInputComponent,
    NavCustomizerDialogComponent,
    NavbarSearchComponent,
    NavbarNotificationsComponent,
    UserProfileMenuComponent,
  ],
  templateUrl: './app-shell.page.html',
  styleUrl: './app-shell.page.scss',
})
export class AppShellPage {
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly authApi = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef);
  readonly navService = inject(NavigationService);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly signingOut = signal(false);
  readonly sessionRestoring = signal(false);
  readonly navOpen = signal(false);
  readonly sidebarCollapsed = signal(false);
  readonly errorMessage = signal<string | null>(null);

  // Collapsed icon-rail interactive states
  readonly activeFlyoutGroupId = signal<string | null>(null);
  readonly flyoutTop = signal<number>(0);
  readonly searchPopupTop = signal<number>(0);
  readonly collapsedSearchOpen = signal<boolean>(false);
  readonly activeTooltip = signal<TooltipState | null>(null);

  private flyoutCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTriggerElement: HTMLElement | null = null;

  skipToMain(event: Event): void {
    event.preventDefault();
    const main = document.getElementById('ag-main');
    main?.focus();
  }

  readonly session = this.sessionStore.session;
  readonly activeContext = this.sessionStore.activeContext;
  readonly subscriptionAccessState = computed(
    () => this.sessionStore.session()?.subscriptionAccessState ?? null,
  );

  // Expose filtered navigation items for template rendering
  readonly navigationEntries = this.navService.filteredEntries;

  // Active flyout group computed
  readonly activeFlyoutGroup = computed<VisibleNavGroup | null>(() => {
    const activeId = this.activeFlyoutGroupId();
    if (!activeId) return null;
    for (const entry of this.navigationEntries()) {
      if (entry.type === 'group' && entry.group.id === activeId) {
        return entry.group;
      }
    }
    return null;
  });

  // Preserve individual permission computeds for backward compatibility & tests
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
  readonly canViewDashboard = computed(() => this.sessionStore.hasPermission('dashboard.view'));
  readonly canViewAlerts = computed(() => this.sessionStore.hasPermission('alerts.view'));
  readonly canViewReports = computed(() => this.sessionStore.hasPermission('reports.view'));
  readonly canPreviewImports = computed(() => this.sessionStore.hasPermission('imports.preview'));
  readonly canViewAudit = computed(() => this.sessionStore.hasPermission('audit.view'));
  readonly canViewBackups = computed(() =>
    this.sessionStore.hasPermission('operations.backups.view'),
  );

  constructor() {
    // 1. Initialize desktop/tablet sidebar collapse state
    try {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
        if (saved !== null) {
          this.sidebarCollapsed.set(saved === 'true');
        } else if (window.innerWidth >= 768 && window.innerWidth < 992) {
          // Default to compact rail on tablet landscape
          this.sidebarCollapsed.set(true);
        }
      }
    } catch {
      // Storage can be unavailable in hardened browser contexts.
    }

    // 2. Reference-counted scroll lock for mobile navigation drawer
    effect((onCleanup) => {
      if (this.navOpen()) {
        lockBodyScroll();
        onCleanup(() => {
          unlockBodyScroll();
        });
      }
    });

    // 3. Auto-close mobile drawer and rail flyouts on route navigation
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.refreshCapabilities();
        if (this.navOpen()) {
          this.closeMobileDrawer();
        }
        this.closeFlyout();
        this.closeCollapsedSearch();
        this.hideTooltip();
      });

    // 4. Session restoration / navigation bootstrap
    if (this.sessionStore.session() === null) {
      this.sessionRestoring.set(true);
      this.sessionStore.loadSession().subscribe({
        next: () => {
          this.sessionRestoring.set(false);
          this.refreshCapabilities();
          this.navService.loadPreferences();
          this.navService.initFromCurrentRoute();
        },
        error: () => {
          this.sessionRestoring.set(false);
          void this.router.navigateByUrl('/login');
        },
      });
    } else {
      this.refreshCapabilities();
      this.navService.loadPreferences();
      this.navService.initFromCurrentRoute();
    }
  }

  private refreshCapabilities(): void {
    if (this.sessionStore.activeContext()?.contextType !== 'organization') {
      this.capabilityService?.clear();
      return;
    }
    this.capabilityService?.refresh().subscribe({ error: () => undefined });
  }

  toggleSidebar(): void {
    const next = !this.sidebarCollapsed();
    this.sidebarCollapsed.set(next);
    this.closeFlyout();
    this.closeCollapsedSearch();
    this.hideTooltip();
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    } catch {
      // Keep the in-memory preference when storage is unavailable.
    }
  }

  openMobileDrawer(trigger?: HTMLElement): void {
    if (trigger) {
      this.lastTriggerElement = trigger;
    }
    this.navOpen.set(true);
    setTimeout(() => {
      const closeBtn = this.elementRef.nativeElement.querySelector(
        '.ag-shell__drawer-close',
      ) as HTMLElement | null;
      if (closeBtn) {
        closeBtn.focus();
      } else {
        const firstLink = this.elementRef.nativeElement.querySelector(
          '.ag-shell__nav a',
        ) as HTMLElement | null;
        firstLink?.focus();
      }
    }, 50);
  }

  closeMobileDrawer(): void {
    if (!this.navOpen()) return;
    this.navOpen.set(false);
    if (this.lastTriggerElement) {
      this.lastTriggerElement.focus();
      this.lastTriggerElement = null;
    }
  }

  onNavLinkClick(): void {
    if (typeof window !== 'undefined' && window.innerWidth < 768 && this.navOpen()) {
      this.closeMobileDrawer();
    }
    this.closeFlyout();
    this.hideTooltip();
  }

  // --- Collapsed Rail Group Flyout Handlers ---

  isGroupActive(group: VisibleNavGroup): boolean {
    const currentUrl = this.router.url;
    return group.children.some((child) =>
      child.exact
        ? currentUrl === child.route
        : currentUrl === child.route || currentUrl.startsWith(child.route + '/'),
    );
  }

  onGroupClick(group: VisibleNavGroup, triggerEl: EventTarget | null): void {
    if (!this.sidebarCollapsed()) {
      this.navService.toggleGroup(group.id);
      return;
    }

    if (this.activeFlyoutGroupId() === group.id) {
      this.closeFlyout();
    } else {
      if (triggerEl instanceof HTMLElement) {
        const rect = triggerEl.getBoundingClientRect();
        this.flyoutTop.set(Math.max(12, Math.min(rect.top, window.innerHeight - 340)));
      }
      this.activeFlyoutGroupId.set(group.id);
      this.hideTooltip();
    }
  }

  onGroupHover(group: VisibleNavGroup, triggerEl: EventTarget | null): void {
    if (!this.sidebarCollapsed()) return;
    if (this.flyoutCloseTimer) {
      clearTimeout(this.flyoutCloseTimer);
      this.flyoutCloseTimer = null;
    }
    if (triggerEl instanceof HTMLElement) {
      const rect = triggerEl.getBoundingClientRect();
      this.flyoutTop.set(Math.max(12, Math.min(rect.top, window.innerHeight - 340)));
    }
    this.activeFlyoutGroupId.set(group.id);
    this.hideTooltip();
  }

  onGroupMouseLeave(): void {
    if (!this.sidebarCollapsed()) return;
    this.flyoutCloseTimer = setTimeout(() => {
      this.activeFlyoutGroupId.set(null);
    }, 220);
  }

  onGroupBlur(): void {
    if (!this.sidebarCollapsed()) return;
    this.flyoutCloseTimer = setTimeout(() => {
      this.activeFlyoutGroupId.set(null);
    }, 220);
  }

  keepFlyoutOpen(): void {
    if (this.flyoutCloseTimer) {
      clearTimeout(this.flyoutCloseTimer);
      this.flyoutCloseTimer = null;
    }
  }

  closeFlyout(): void {
    if (this.flyoutCloseTimer) {
      clearTimeout(this.flyoutCloseTimer);
      this.flyoutCloseTimer = null;
    }
    this.activeFlyoutGroupId.set(null);
  }

  onFlyoutItemClick(): void {
    this.closeFlyout();
    this.hideTooltip();
  }

  // --- Collapsed Rail Search Popup Handlers ---

  toggleCollapsedSearch(triggerEl: EventTarget | null): void {
    const next = !this.collapsedSearchOpen();
    this.collapsedSearchOpen.set(next);
    if (next && triggerEl instanceof HTMLElement) {
      const rect = triggerEl.getBoundingClientRect();
      this.searchPopupTop.set(Math.max(12, rect.top));
    }
    this.hideTooltip();
    this.closeFlyout();
  }

  keepSearchPopupOpen(): void {
    // Keep open during interaction
  }

  closeCollapsedSearch(): void {
    this.collapsedSearchOpen.set(false);
  }

  // --- Collapsed Rail Tooltip Handlers ---

  onNavHover(label: string, triggerEl: EventTarget | null): void {
    if (!this.sidebarCollapsed()) return;
    if (this.activeFlyoutGroupId()) return;
    if (triggerEl instanceof HTMLElement) {
      const rect = triggerEl.getBoundingClientRect();
      this.activeTooltip.set({
        text: label,
        top: rect.top + rect.height / 2 - 14,
      });
    }
  }

  onControlHover(label: string, triggerEl: EventTarget | null): void {
    if (!this.sidebarCollapsed()) return;
    if (triggerEl instanceof HTMLElement) {
      const rect = triggerEl.getBoundingClientRect();
      this.activeTooltip.set({
        text: label,
        top: rect.top + rect.height / 2 - 14,
      });
    }
  }

  hideTooltip(): void {
    this.activeTooltip.set(null);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as Node | null;
    if (!target) return;
    const sidebar = this.elementRef.nativeElement.querySelector('.ag-shell__sidebar');
    const flyout = document.querySelector('.ag-rail-flyout');
    const searchPopup = document.querySelector('.ag-rail-search-popup');

    if (
      (!sidebar || !sidebar.contains(target)) &&
      (!flyout || !flyout.contains(target)) &&
      (!searchPopup || !searchPopup.contains(target))
    ) {
      this.closeFlyout();
      this.closeCollapsedSearch();
      this.hideTooltip();
    }
  }

  @HostListener('window:keydown.escape', ['$event'])
  onEscapeKey(event: Event): void {
    if (this.activeFlyoutGroupId() || this.collapsedSearchOpen()) {
      event.preventDefault();
      this.closeFlyout();
      this.closeCollapsedSearch();
      this.hideTooltip();
      return;
    }
    if (this.navOpen()) {
      event.preventDefault();
      this.closeMobileDrawer();
    }
  }

  @HostListener('window:keydown', ['$event'])
  onDrawerKeydown(event: Event): void {
    if (!this.navOpen() || typeof window === 'undefined' || window.innerWidth >= 768) {
      return;
    }
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.key === 'Tab') {
      const drawer = this.elementRef.nativeElement.querySelector(
        '.ag-shell__sidebar',
      ) as HTMLElement | null;
      if (!drawer) return;
      const focusable = drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (keyboardEvent.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
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
    const parts = ['Organization', active.role];
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
