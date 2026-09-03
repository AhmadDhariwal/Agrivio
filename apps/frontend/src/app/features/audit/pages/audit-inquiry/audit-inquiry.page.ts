import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuditApi } from '../../data-access/audit.api';
import { AuditActorOption, AuditEventItem, AuditSummary } from '../../models/audit.models';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { OrganizationSettingsApi } from '../../../organization/data-access/organization-settings.api';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';

const KNOWN_ACTION_LABELS: Readonly<Record<string, string>> = {
  'subscription.status_transition': 'Subscription status changed',
  'subscription.plan_updated': 'Subscription plan updated',
  'subscription.billing_submitted': 'Billing evidence submitted',
  'subscription.billing_reviewed': 'Billing evidence reviewed',
  'sale.posted': 'Sale posted',
  'sale.draft_created': 'Sale draft created',
  'sale.cancelled': 'Sale cancelled',
  'purchase.posted': 'Purchase posted',
  'purchase.draft_created': 'Purchase draft created',
  'purchase.cancelled': 'Purchase cancelled',
  'inventory.opening_stock': 'Opening stock posted',
  'inventory.adjustment': 'Inventory adjusted',
  'inventory.adjustment_reversed': 'Inventory adjustment reversed',
  'inventory.transfer': 'Warehouse transfer posted',
  'inventory.transfer_reversed': 'Warehouse transfer reversed',
  'returns.posted': 'Return posted',
  'returns.reversed': 'Return reversed',
  'expenses.posted': 'Expense posted',
  'expenses.corrected': 'Expense corrected',
  'accounts.movement': 'Account movement posted',
  'accounts.movement_reversed': 'Account movement reversed',
  'accounts.transfer': 'Account transfer posted',
  'accounts.transfer_reversed': 'Account transfer reversed',
  'customer.created': 'Customer created',
  'customer.updated': 'Customer updated',
  'customer.deactivated': 'Customer deactivated',
  'supplier.created': 'Supplier created',
  'supplier.updated': 'Supplier updated',
  'supplier.deactivated': 'Supplier deactivated',
  'product.created': 'Product created',
  'product.updated': 'Product updated',
  'product.deactivated': 'Product deactivated',
  'category.created': 'Category created',
  'category.updated': 'Category updated',
  'warehouse.created': 'Warehouse created',
  'warehouse.updated': 'Warehouse updated',
  'branch.created': 'Branch created',
  'branch.updated': 'Branch updated',
  'employee.created': 'Employee created',
  'employee.updated': 'Employee updated',
  'imports.previewed': 'Import template previewed',
  'imports.executed': 'Import batch executed',
  'organization.settings_updated': 'Organization settings updated',
};

@Component({
  selector: 'agrivio-audit-inquiry-page',
  standalone: true,
  imports: [
    FormsModule,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiPaginationComponent,
    UiModuleInfoComponent,
  ],
  templateUrl: './audit-inquiry.page.html',
  styleUrl: './audit-inquiry.page.scss',
})
export class AuditInquiryPage {
  readonly infoTitle = 'About Audit History';
  readonly infoDescription =
    'Audit events provide immutable accountability and traceability across all organization operations.';
  readonly infoItems = [
    'Audit events are immutable and cannot be modified or deleted',
    'Records provide end-to-end operational accountability and user action traceability',
    'Retention depth and query history follow your organization subscription policy',
    'Inspect detailed event metadata, actor identity, and request correlation IDs',
  ];

  private readonly api = inject(AuditApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly organizationApi = inject(OrganizationSettingsApi, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly actorSearchChanges = new Subject<string>();

  // 4 Authorized Filter Dropdowns
  readonly actorId = signal('');
  readonly action = signal('');
  readonly resourceType = signal('');
  readonly reason = signal('');

  // Dropdown server-backed options
  readonly actorOptionSearch = signal('');
  readonly actorOptions = signal<AuditActorOption[]>([]);
  readonly actionOptions = signal<string[]>([]);
  readonly resourceTypeOptions = signal<string[]>([]);
  readonly reasonOptions = signal<string[]>([]);

  // Actor Dropdown State
  readonly actorDropdownOpen = signal(false);
  readonly mobileActorDropdownOpen = signal(false);
  private readonly actorLabelMap = new Map<string, string>();

  readonly selectedActorLabel = computed(() => {
    const currentId = this.actorId();
    if (!currentId) {
      return 'All actors';
    }
    if (currentId.toLowerCase() === 'system') {
      return 'System';
    }
    const fromMap = this.actorLabelMap.get(currentId);
    if (fromMap) {
      return fromMap;
    }
    const found = this.actorOptions().find((opt) => opt.value === currentId);
    return found ? found.label : currentId;
  });

  readonly items = signal<AuditEventItem[]>([]);
  readonly loading = signal(false);
  readonly refreshing = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly organizationTimezoneValue = signal('Asia/Karachi');

  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);

  // Authoritative server-backed KPI Summary
  readonly summary = signal<AuditSummary>({
    totalEvents: 0,
    eventsToday: 0,
    uniqueActors: 0,
    resourceTypes: 0,
  });
  readonly kpis = computed(() => this.summary());

  // Inspector Drawer State
  readonly selectedEvent = signal<AuditEventItem | null>(null);
  readonly inspectorLoading = signal(false);
  readonly inspectorError = signal<string | null>(null);

  // Mobile Filter Drawer State
  readonly mobileFiltersOpen = signal(false);

  // Capabilities & Permissions
  readonly canUseModuleInfo = computed(
    () => this.capabilityService?.canUseFeature('audit.features.moduleInfo') ?? true,
  );
  readonly canUseSearch = computed(
    () => this.capabilityService?.canUseFeature('audit.features.search') ?? true,
  );
  readonly canUseFilters = computed(
    () => this.capabilityService?.canUseFeature('audit.features.filters') ?? true,
  );
  readonly canInspect = computed(
    () =>
      this.sessionStore.hasPermission('audit.view') &&
      (this.capabilityService?.canPerformAction('audit.actions.inspect') ?? true),
  );
  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('audit.view') &&
      (this.capabilityService?.canUseModule('audit') ?? true),
  );
  readonly suspended = computed(
    () => this.sessionStore.session()?.subscriptionAccessState?.status === 'suspended',
  );

  readonly hasActiveFilters = computed(() =>
    Boolean(this.actorId() || this.action() || this.resourceType() || this.reason()),
  );

  readonly activeFiltersCount = computed(
    () =>
      [this.actorId(), this.action(), this.resourceType(), this.reason()].filter(
        (v) => typeof v === 'string' && v.trim() !== '',
      ).length,
  );

  constructor() {
    this.actorSearchChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((search) => this.api.getActorOptions(search, 50)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((response) => {
        this.actorOptions.set(response.items);
        response.items.forEach((item) => this.actorLabelMap.set(item.value, item.label));
      });
    if (this.canView()) {
      this.loadFilterOptions();
      this.loadSummary();
      this.organizationApi?.getOrganization().subscribe({
        next: (organization) => {
          if (typeof organization.timezone === 'string' && organization.timezone.trim() !== '') {
            this.organizationTimezoneValue.set(organization.timezone);
          }
        },
      });
    }
    this.search();
  }

  @HostListener('window:keydown.escape')
  handleEscape(): void {
    if (this.actorDropdownOpen()) {
      this.closeActorDropdown();
    } else if (this.mobileActorDropdownOpen()) {
      this.mobileActorDropdownOpen.set(false);
    } else if (this.selectedEvent()) {
      this.closeInspector();
    } else if (this.mobileFiltersOpen()) {
      this.closeMobileFilters();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (this.actorDropdownOpen()) {
      const actorDropdownEl = document.getElementById('audit-actor-dropdown');
      if (!actorDropdownEl?.contains(target)) {
        this.closeActorDropdown();
      }
    }
    if (this.mobileActorDropdownOpen()) {
      const mobileDropdownEl = document.getElementById('mobile-audit-actor-dropdown');
      if (!mobileDropdownEl?.contains(target)) {
        this.mobileActorDropdownOpen.set(false);
      }
    }
  }

  toggleActorDropdown(event?: Event): void {
    event?.stopPropagation();
    const willOpen = !this.actorDropdownOpen();
    this.actorDropdownOpen.set(willOpen);
    if (willOpen) {
      if (this.actorOptionSearch()) {
        this.actorOptionSearch.set('');
        this.loadActorOptions('');
      }
      setTimeout(() => {
        const input = document.getElementById('audit-actor-search') as HTMLInputElement | null;
        input?.focus();
      }, 0);
    }
  }

  closeActorDropdown(): void {
    this.actorDropdownOpen.set(false);
  }

  selectActor(value: string): void {
    this.onActorChange(value);
    this.closeActorDropdown();
  }

  toggleMobileActorDropdown(event?: Event): void {
    event?.stopPropagation();
    const willOpen = !this.mobileActorDropdownOpen();
    this.mobileActorDropdownOpen.set(willOpen);
    if (willOpen && this.actorOptionSearch()) {
      this.actorOptionSearch.set('');
      this.loadActorOptions('');
    }
  }

  selectMobileActor(value: string): void {
    this.onActorChange(value);
    this.mobileActorDropdownOpen.set(false);
  }

  loadFilterOptions(): void {
    if (!this.canView() || !this.canUseFilters()) {
      return;
    }

    this.loadActorOptions(this.actorOptionSearch());

    this.api.getFilterOptions('action', '', 50).subscribe({
      next: (res) => this.actionOptions.set(res.items),
    });

    this.api.getFilterOptions('resourceType', '', 50).subscribe({
      next: (res) => this.resourceTypeOptions.set(res.items),
    });
  }

  loadActorOptions(search = ''): void {
    if (!this.canView() || !this.canUseFilters()) {
      return;
    }
    this.api.getActorOptions(search, 50).subscribe({
      next: (res) => {
        this.actorOptions.set(res.items);
        res.items.forEach((item) => this.actorLabelMap.set(item.value, item.label));
      },
    });
  }

  onActorOptionSearch(value: string): void {
    this.actorOptionSearch.set(value);
    this.actorSearchChanges.next(value.trim());
  }

  search(forceRefresh = false): void {
    if (!this.canView()) {
      return;
    }

    if (forceRefresh) {
      this.refreshing.set(true);
    } else {
      this.loading.set(true);
    }
    this.errorMessage.set(null);

    this.api
      .query(
        {
          actorId: this.actorId(),
          action: this.action(),
          resourceType: this.resourceType(),
          reason: this.reason(),
          page: this.page(),
          pageSize: this.pageSize(),
        },
        forceRefresh,
      )
      .subscribe({
        next: ({ items, meta }) => {
          this.items.set(items);
          this.total.set(meta.total);
          this.loading.set(false);
          this.refreshing.set(false);

          if (items.length > 0) {
            const distinctReasons = new Set(this.reasonOptions());
            items.forEach((item) => {
              if (item.reason && item.reason.trim()) {
                distinctReasons.add(item.reason.trim());
              }
            });
            this.reasonOptions.set(Array.from(distinctReasons).sort());
          }
        },

        error: (error: unknown) => {
          this.loading.set(false);
          this.refreshing.set(false);
          this.errorMessage.set(this.readError(error, 'Unable to load audit history.'));
        },
      });
  }

  loadSummary(forceRefresh = false): void {
    if (!this.canView()) {
      return;
    }
    this.api.getSummary(forceRefresh).subscribe({
      next: (summary) => this.summary.set(summary),
      error: () => {
        // Keep current summary on transient error
      },
    });
  }

  refresh(): void {
    this.loadFilterOptions();
    this.loadSummary(true);
    this.search(true);
  }

  onSearchSubmit(): void {
    if (!this.canUseSearch()) {
      return;
    }
    this.page.set(1);
    this.search();
  }

  onActorChange(value: string): void {
    this.actorId.set(value);
    const found = this.actorOptions().find((opt) => opt.value === value);
    if (found) {
      this.actorLabelMap.set(value, found.label);
    }
    this.page.set(1);
    if (this.canUseSearch()) {
      this.search();
    }
  }

  onActionChange(value: string): void {
    this.action.set(value);
  }

  onResourceTypeChange(value: string): void {
    this.resourceType.set(value);
  }

  onReasonChange(value: string): void {
    this.reason.set(value);
  }

  clearFilters(): void {
    this.actorId.set('');
    this.actorOptionSearch.set('');
    this.loadActorOptions('');
    this.closeActorDropdown();
    this.mobileActorDropdownOpen.set(false);
    this.action.set('');
    this.resourceType.set('');
    this.reason.set('');
    this.page.set(1);
    if (this.canUseSearch()) {
      this.search();
    }
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.search();
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.page.set(1);
    this.search();
  }

  // Inspector Drawer Actions
  openInspector(item: AuditEventItem): void {
    if (!this.canInspect()) {
      return;
    }
    this.selectedEvent.set(item);
    this.inspectorLoading.set(true);
    this.inspectorError.set(null);

    this.api.getById(item.id).subscribe({
      next: (fullEvent) => {
        this.selectedEvent.set(fullEvent);
        this.inspectorLoading.set(false);
      },
      error: (error: unknown) => {
        this.inspectorLoading.set(false);
        this.inspectorError.set(this.readError(error, 'Unable to load event details.'));
      },
    });
  }

  closeInspector(): void {
    this.selectedEvent.set(null);
    this.inspectorLoading.set(false);
    this.inspectorError.set(null);
  }

  // Mobile Filter Drawer Actions
  openMobileFilters(): void {
    if (!this.canUseFilters()) {
      return;
    }
    this.mobileFiltersOpen.set(true);
  }

  closeMobileFilters(): void {
    this.mobileFiltersOpen.set(false);
    this.mobileActorDropdownOpen.set(false);
  }

  applyMobileFilters(): void {
    if (!this.canUseFilters() || !this.canUseSearch()) {
      this.closeMobileFilters();
      return;
    }
    this.closeMobileFilters();
    this.onSearchSubmit();
  }

  // Formatting Helpers
  formatDateTime(dateVal: unknown): string {
    if (!dateVal) return '—';
    try {
      const date = new Date(String(dateVal));
      if (Number.isNaN(date.getTime())) return String(dateVal);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: this.organizationTimezone(),
      });
    } catch {
      return String(dateVal);
    }
  }

  formatActor(actorId: string | null | undefined): string {
    if (!actorId) return '—';
    if (actorId.toLowerCase() === 'system') {
      return 'System';
    }
    return this.actorOptions().find((option) => option.value === actorId)?.label ?? actorId;
  }

  isSystemActor(actorId: string | null | undefined): boolean {
    return actorId?.toLowerCase() === 'system';
  }

  formatAction(action: string | null | undefined): string {
    if (!action) return '—';
    return KNOWN_ACTION_LABELS[action] ?? action;
  }

  hasMetadata(metadata: unknown): boolean {
    return Boolean(metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0);
  }

  formatMetadataJson(metadata: unknown): string {
    if (!metadata) return '';
    try {
      return JSON.stringify(metadata, null, 2);
    } catch {
      return String(metadata);
    }
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.error?.message ?? fallback;
    }
    return fallback;
  }

  private organizationTimezone(): string {
    return this.organizationTimezoneValue();
  }
}
