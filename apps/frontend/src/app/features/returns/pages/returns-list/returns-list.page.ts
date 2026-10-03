import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ReturnsApi } from '../../data-access/returns.api';
import {
  MoneyAmount,
  ReturnResolution,
  SalesReturnRecord,
  returnTypeLabel,
} from '../../models/returns.models';
import {
  BranchesWarehousesApi,
  WarehouseRecord,
} from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiStatusBadgeComponent,
  UiBadgeTone,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiSearchableDropdownComponent } from '../../../../shared/ui/ui-searchable-dropdown/ui-searchable-dropdown.component';
import { formatWarehouseOption } from '../../../../shared/ui/ui-searchable-dropdown/entity-dropdown-formatters';
import { applyPaginationMeta } from '../../../../shared/data-access/pagination';
import { formatAppDate, formatAppDateTime } from '../../../../shared/format/date-time.util';

@Component({
  selector: 'agrivio-returns-list-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiPaginationComponent,
    UiEmptyStateComponent,
    UiModuleInfoComponent,
    UiConfirmDialogComponent,
    UiSearchableDropdownComponent,
  ],
  templateUrl: './returns-list.page.html',
  styleUrl: './returns-list.page.scss',
})
export class ReturnsListPage {
  private readonly api = inject(ReturnsApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly items = signal<SalesReturnRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly warehouseOptions = computed(() => this.warehouses().map(formatWarehouseOption));
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Capability + RBAC intersection
  readonly canUseReturns = computed(
    () => this.capabilityService?.canUseModule('returns') ?? true,
  );
  readonly canView = computed(
    () => this.sessionStore.hasPermission('returns.view') && this.canUseReturns(),
  );
  readonly canPost = computed(
    () =>
      this.sessionStore.hasPermission('returns.post') &&
      (this.capabilityService?.canPerformAction('returns.actions.post') ?? true),
  );
  readonly canApproveWithoutInvoice = computed(
    () =>
      this.sessionStore.hasPermission('returns.without-invoice.approve') &&
      (this.capabilityService?.canPerformAction('returns.actions.withoutInvoice') ?? true),
  );
  readonly canReverse = computed(
    () =>
      this.sessionStore.hasPermission('returns.reverse') &&
      (this.capabilityService?.canPerformAction('returns.actions.reverse') ?? true),
  );
  readonly canInspect = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canPerformAction('returns.actions.inspect') ?? true),
  );

  // Feature visibility (capability-gated)
  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseView('returns.features.moduleInfo') ?? true,
  );
  readonly showTypeFilter = computed(
    () => this.capabilityService?.canUseView('returns.features.typeFilter') ?? true,
  );
  readonly showStatusFilter = computed(
    () => this.capabilityService?.canUseView('returns.features.statusFilter') ?? true,
  );
  readonly showWarehouseFilter = computed(
    () => this.capabilityService?.canUseView('returns.features.warehouseFilter') ?? true,
  );

  // Server-authoritative filter signals
  readonly returnTypeFilter = signal<string>('');
  readonly statusFilter = signal<string>('');
  readonly warehouseFilter = signal<string>('');

  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);

  readonly hasActiveFilters = computed(
    () => !!this.returnTypeFilter() || !!this.statusFilter() || !!this.warehouseFilter(),
  );
  readonly activeFiltersCount = computed(
    () =>
      (this.returnTypeFilter() ? 1 : 0) +
      (this.statusFilter() ? 1 : 0) +
      (this.warehouseFilter() ? 1 : 0),
  );

  // Reversal dialog state
  readonly reverseDialogOpen = signal(false);
  readonly itemToReverse = signal<SalesReturnRecord | null>(null);
  readonly reversing = signal(false);

  // Draft discard dialog state
  readonly discardDialogOpen = signal(false);
  readonly itemToDiscard = signal<SalesReturnRecord | null>(null);
  readonly discarding = signal(false);
  readonly postingId = signal<string | null>(null);

  // Row action menu state
  readonly openMenuReturnId = signal<string | null>(null);

  // Module Information Section
  readonly infoTitle = 'About Returns & Corrections';
  readonly infoDescription =
    'Posted sales and purchase returns maintain complete auditability across financial ledgers, inventory balances, and tax positions. Originals remain immutable; corrections are performed through linked reversal transactions.';
  readonly infoItems = [
    'Linked Sales Returns: Restores customer balances and returned stock according to sellable or unsellable conditions.',
    'Returns Without Invoice: Processed under supervisor authorization with documented movements and approved refund effects.',
    'Purchase Returns: Returns received goods to suppliers and reduces accounts payable accordingly.',
    'Reversals & Immutability: Posted returns cannot be directly edited or deleted. Reversing creates a linked corrective transaction.',
  ];

  constructor() {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }
    this.locationsApi.listWarehouseOptions().subscribe({
      next: (warehouses) => this.warehouses.set(warehouses),
      error: () => this.warehouses.set([]),
    });
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.closeRowMenu();

    const params: {
      page: number;
      pageSize: number;
      returnType?: string;
      status?: string;
      warehouseId?: string;
      forceRefresh?: boolean;
    } = {
      page: this.page(),
      pageSize: this.pageSize(),
    };
    if (this.returnTypeFilter()) params.returnType = this.returnTypeFilter();
    if (this.statusFilter()) params.status = this.statusFilter();
    if (this.warehouseFilter()) params.warehouseId = this.warehouseFilter();

    this.api.listReturns(params).subscribe({
      next: (returnsResult) => {
        this.items.set(returnsResult.items);
        applyPaginationMeta(returnsResult.meta, { total: this.total, pageSize: this.pageSize });
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error, 'Unable to load returns.'));
        this.loading.set(false);
      },
    });
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.reload();
  }

  onPageSizeChange(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.page.set(1);
    this.reload();
  }

  onReturnTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.returnTypeFilter.set(target.value);
    this.page.set(1);
    this.reload();
  }

  onStatusChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.statusFilter.set(target.value);
    this.page.set(1);
    this.reload();
  }

  onWarehouseChange(eventOrValue: Event | string): void {
    const value =
      typeof eventOrValue === 'string'
        ? eventOrValue
        : ((eventOrValue.target as HTMLSelectElement | null)?.value ?? '');
    this.warehouseFilter.set(value);
    this.page.set(1);
    this.reload();
  }

  clearFilters(): void {
    this.returnTypeFilter.set('');
    this.statusFilter.set('');
    this.warehouseFilter.set('');
    this.page.set(1);
    this.reload();
  }

  typeLabel(returnType: string): string {
    return returnTypeLabel(returnType);
  }

  typeBadgeLabel(returnType: string): string {
    if (returnType === 'sales') return 'SALES RETURN';
    if (returnType === 'purchase') return 'PURCHASE RETURN';
    if (returnType === 'sales_without_invoice') return 'WITHOUT INVOICE';
    return returnType ? returnType.toUpperCase() : 'RETURN';
  }

  typeBadgeClass(returnType: string): string {
    if (returnType === 'sales') return 'type-badge type-badge--sales';
    if (returnType === 'purchase') return 'type-badge type-badge--purchase';
    if (returnType === 'sales_without_invoice') return 'type-badge type-badge--without-invoice';
    return 'type-badge';
  }

  warehouseName(item: SalesReturnRecord): string {
    if (item.warehouseNameSnapshot) {
      return item.warehouseNameSnapshot;
    }
    return this.warehouses().find((warehouse) => warehouse.id === item.warehouseId)?.name ?? 'Warehouse';
  }

  productSnapshotSummary(item: SalesReturnRecord): string {
    const first = item.lines?.[0];
    if (!first) return 'No items recorded';
    const name = first.productNameSnapshot || 'Product';
    const qty = first.quantity ? `${first.quantity} ${first.unitCodeSnapshot || ''}`.trim() : '';
    const main = qty ? `${name} (${qty})` : name;
    if (item.lines.length > 1) {
      return `${main} + ${item.lines.length - 1} more item${item.lines.length - 1 === 1 ? '' : 's'}`;
    }
    return main;
  }

  referenceSummary(item: SalesReturnRecord): {
    title: string;
    subtitle?: string | undefined;
    date?: string | undefined;
  } {
    let title = 'Direct return';
    let subtitle: string | undefined = undefined;

    if (item.returnType === 'sales') {
      title = item.saleId ? `Sale #${item.saleId.slice(-6).toUpperCase()}` : 'Linked sales return';
      if (item.customerIdentifyingName || item.customerNameSnapshot) {
        subtitle = `Customer: ${item.customerIdentifyingName ?? item.customerNameSnapshot}`;
      }
    } else if (item.returnType === 'purchase') {
      title = item.purchaseId
        ? `Purchase #${item.purchaseId.slice(-6).toUpperCase()}`
        : 'Purchase return';
    } else if (item.returnType === 'sales_without_invoice') {
      title = 'Return without invoice';
      if (item.customerIdentifyingName || item.customerNameSnapshot) {
        const phone = item.customerIdentifyingPhone ? ` (${item.customerIdentifyingPhone})` : '';
        subtitle = `Customer: ${item.customerIdentifyingName ?? item.customerNameSnapshot}${phone}`;
      }
    }

    const dateStr = item.postedAt || item.createdAt;
    const date: string | undefined = dateStr ? `Date: ${this.formatDate(dateStr)}` : undefined;

    return { title, subtitle, date };
  }

  statusTone(status: string): UiBadgeTone {
    if (status === 'posted') return 'success';
    if (status === 'reversed') return 'warning';
    return 'neutral';
  }

  formatDate(dateStr: string | null | undefined): string {
    return formatAppDate(dateStr);
  }

  formatDateTime(isoStr: string | null | undefined): string {
    return formatAppDateTime(isoStr);
  }

  formatMoney(total: MoneyAmount | null | undefined): string {
    if (!total || total.amount === null || total.amount === undefined || total.amount === '') {
      return '—';
    }
    const num = parseFloat(total.amount);
    if (isNaN(num)) return `${total.currency || 'PKR'} ${total.amount}`;
    return `${total.currency || 'PKR'} ${num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  openReverseDialog(item: SalesReturnRecord): void {
    if (!this.canReverse() || item.status !== 'posted' || this.reversing()) {
      return;
    }
    this.closeRowMenu();
    this.itemToReverse.set(item);
    this.reverseDialogOpen.set(true);
  }

  onDismissReverse(): void {
    this.reverseDialogOpen.set(false);
    this.itemToReverse.set(null);
  }

  onConfirmReverse(reason: string): void {
    const item = this.itemToReverse();
    if (!item || !this.canReverse() || item.status !== 'posted' || this.reversing()) {
      return;
    }
    const trimmed = reason.trim();
    if (trimmed === '') {
      this.errorMessage.set('A reversal reason is required.');
      return;
    }

    this.reversing.set(true);
    this.reverseDialogOpen.set(false);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.api
      .reverseReturn(
        item.id,
        { reason: trimmed, expectedVersion: item.version },
        `return-reverse-${item.id}-${Date.now()}`,
      )
      .subscribe({
        next: (updated) => {
          this.items.update((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
          this.reversing.set(false);
          this.itemToReverse.set(null);
          this.successMessage.set('Return reversed with a linked corrective transaction.');
        },
        error: (error: unknown) => {
          this.reversing.set(false);
          this.itemToReverse.set(null);
          this.errorMessage.set(this.mapError(error, 'Unable to reverse return.'));
        },
      });
  }

  openDiscardDialog(item: SalesReturnRecord): void {
    if (!this.canPost() || item.status !== 'draft' || this.discarding()) {
      return;
    }
    this.closeRowMenu();
    this.itemToDiscard.set(item);
    this.discardDialogOpen.set(true);
  }

  onDismissDiscard(): void {
    this.discardDialogOpen.set(false);
    this.itemToDiscard.set(null);
  }

  onConfirmDiscard(): void {
    const item = this.itemToDiscard();
    if (!item || !this.canPost() || item.status !== 'draft' || this.discarding()) {
      return;
    }
    this.discarding.set(true);
    this.discardDialogOpen.set(false);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.api.discardReturn(item.id, item.version).subscribe({
      next: () => {
        this.items.update((rows) => rows.filter((row) => row.id !== item.id));
        this.total.update((t) => Math.max(0, t - 1));
        this.discarding.set(false);
        this.itemToDiscard.set(null);
        this.successMessage.set('Draft return was discarded.');
      },
      error: (error: unknown) => {
        this.discarding.set(false);
        this.itemToDiscard.set(null);
        this.errorMessage.set(this.mapError(error, 'Unable to discard return draft.'));
      },
    });
  }

  postDraftReturn(item: SalesReturnRecord): void {
    if (!this.canPost() || item.status !== 'draft' || this.postingId() !== null) {
      return;
    }
    this.postingId.set(item.id);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const idempotencyKey = `return-post-${item.id}-${Date.now()}`;
    this.api
      .postReturn(
        item.id,
        {
          expectedVersion: item.version,
          resolution: (item.resolution as ReturnResolution) || 'ledger_adjustment',
          reason: item.reason || 'Post return draft',
        },
        idempotencyKey,
      )
      .subscribe({
        next: (updated) => {
          this.items.update((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
          this.postingId.set(null);
          this.successMessage.set('Return posted successfully.');
        },
        error: (error: unknown) => {
          this.postingId.set(null);
          this.errorMessage.set(this.mapError(error, 'Unable to post return.'));
        },
      });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeRowMenu();
  }

  toggleRowMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openMenuReturnId.update((curr) => (curr === id ? null : id));
  }

  closeRowMenu(): void {
    this.openMenuReturnId.set(null);
  }

  private mapError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) {
        return 'Return was modified or is no longer a draft.';
      }
      if (error.status === 403) {
        return error.error?.error?.message ?? 'You do not have permission for this action.';
      }
      return error.error?.error?.message ?? fallback;
    } else if (typeof error === 'object' && error !== null) {
      const errObj = error as { status?: number; error?: { error?: { message?: string } } };
      if (errObj.status === 409) {
        return 'Return was modified or is no longer a draft.';
      }
      if (errObj.error?.error?.message) {
        return errObj.error.error.message;
      }
    }
    return fallback;
  }
}
