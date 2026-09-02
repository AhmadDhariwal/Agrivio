import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuditApi } from '../../data-access/audit.api';
import { AuditEventItem } from '../../models/audit.models';
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

  readonly actorId = signal('');
  readonly action = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly resourceType = signal('');
  readonly resourceId = signal('');
  readonly reason = signal('');

  readonly items = signal<AuditEventItem[]>([]);
  readonly loading = signal(false);
  readonly refreshing = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly dateRangeError = signal<string | null>(null);
  readonly organizationTimezoneValue = signal('Asia/Karachi');

  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);

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
    Boolean(
      this.actorId() ||
        this.action() ||
        this.from() ||
        this.to() ||
        this.resourceType() ||
        this.resourceId() ||
        this.reason(),
    ),
  );

  readonly activeFiltersCount = computed(
    () =>
      [
        this.actorId(),
        this.action(),
        this.from(),
        this.to(),
        this.resourceType(),
        this.resourceId(),
        this.reason(),
      ].filter((v) => typeof v === 'string' && v.trim() !== '').length,
  );

  constructor() {
    if (this.canView()) {
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
    if (this.selectedEvent()) {
      this.closeInspector();
    } else if (this.mobileFiltersOpen()) {
      this.closeMobileFilters();
    }
  }

  search(forceRefresh = false): void {
    if (!this.canView()) {
      return;
    }
    if (!this.isDateRangeValid()) {
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
          from: this.from(),
          to: this.to(),
          resourceType: this.resourceType(),
          resourceId: this.resourceId(),
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
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.refreshing.set(false);
          this.errorMessage.set(this.readError(error, 'Unable to load audit history.'));
        },
      });
  }

  refresh(): void {
    this.search(true);
  }

  onSearchSubmit(): void {
    if (!this.canUseSearch()) {
      return;
    }
    this.page.set(1);
    this.search();
  }

  clearFilters(): void {
    this.actorId.set('');
    this.action.set('');
    this.from.set('');
    this.to.set('');
    this.resourceType.set('');
    this.resourceId.set('');
    this.reason.set('');
    this.dateRangeError.set(null);
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
    return actorId;
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

  private isDateRangeValid(): boolean {
    const from = this.from().trim();
    const to = this.to().trim();
    if (!from || !to) {
      this.dateRangeError.set(null);
      return true;
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      this.dateRangeError.set('Enter valid From and To date-times.');
      return false;
    }
    if (fromDate > toDate) {
      this.dateRangeError.set('From date-time must be earlier than or equal to To date-time.');
      return false;
    }
    this.dateRangeError.set(null);
    return true;
  }

  private organizationTimezone(): string {
    return this.organizationTimezoneValue();
  }
}
