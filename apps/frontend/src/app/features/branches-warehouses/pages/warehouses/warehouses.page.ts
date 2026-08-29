import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BranchesWarehousesApi, WarehouseRecord } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import {
  deactivateCopy,
  deletePermanentlyCopy,
  reactivateCopy,
  recordInUseMessage,
} from '../../../../shared/lifecycle/master-lifecycle';

@Component({
  selector: 'agrivio-warehouses-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiConfirmDialogComponent,
    UiPaginationComponent,
    UiModuleInfoComponent,
  ],
  templateUrl: './warehouses.page.html',
  styleUrl: './warehouses.page.scss',
})
export class WarehousesPage {
  private readonly api = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly items = signal<WarehouseRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);

  // Filters
  readonly search = signal('');
  readonly statusFilter = signal<'all' | 'active' | 'inactive'>('all');
  readonly openMenuWarehouseId = signal<string | null>(null);

  // Capabilities and Permissions
  readonly isWarehousesEnabled = computed(
    () => this.capabilityService?.canUseModule('warehouses') ?? true,
  );
  readonly canView = computed(
    () => this.sessionStore.hasPermission('warehouses.view') && this.isWarehousesEnabled(),
  );
  readonly canManage = computed(
    () => this.sessionStore.hasPermission('warehouses.manage') && this.isWarehousesEnabled(),
  );
  readonly canCreate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('warehouses.actions.create') ?? true),
  );
  readonly canEdit = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('warehouses.actions.edit') ?? true),
  );
  readonly canDeactivate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('warehouses.actions.deactivate') ?? true),
  );
  readonly canReactivate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('warehouses.actions.reactivate') ?? true),
  );
  readonly canDelete = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('warehouses.actions.delete') ?? true),
  );
  readonly canRefresh = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canPerformAction('warehouses.actions.refresh') ?? true),
  );
  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseFeature('warehouses.features.moduleInfo') ?? true,
  );
  readonly showSearch = computed(
    () => this.capabilityService?.canUseFeature('warehouses.features.search') ?? true,
  );
  readonly showStatusFilter = computed(
    () => this.capabilityService?.canUseFeature('warehouses.features.statusFilter') ?? true,
  );
  readonly showCode = computed(
    () => this.capabilityService?.canViewField('warehouses.fields.code') ?? true,
  );

  // Module Info Content
  readonly infoTitle = 'About warehouses';
  readonly infoDescription =
    'Warehouses belong to the organization and serve as physical or logical inventory storage locations.';
  readonly infoItems = [
    'Each organization starts with a primary warehouse and can add more within subscription plan limits.',
    'Active warehouses are eligible for purchase receipts, sales fulfillments, and inventory transfers.',
    'Inactive warehouses prevent new operational postings while preserving historical transactions and stock ledger audit trails.',
    'Warehouses with existing stock history or posted movements cannot be deleted permanently.',
  ];

  // Lifecycle confirmation modal state
  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Deactivate');
  readonly confirmDanger = signal(true);
  private pending:
    | { kind: 'status'; item: WarehouseRecord; nextStatus: 'active' | 'inactive' }
    | { kind: 'delete'; item: WarehouseRecord }
    | null = null;

  readonly hasActiveFilters = computed(() => {
    return this.search().trim().length > 0 || this.statusFilter() !== 'all';
  });

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeRowMenu();
  }

  constructor() {
    this.reload();
  }

  hasRowActions(item: WarehouseRecord): boolean {
    return (
      (item.status === 'active' && this.canDeactivate()) ||
      (item.status === 'inactive' && this.canReactivate()) ||
      this.canDelete()
    );
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.errorMessage.set('You do not have permission to view warehouses.');
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.openMenuWarehouseId.set(null);

    const queryParams: {
      page: number;
      pageSize: number;
      status?: string;
      search?: string;
    } = {
      page: this.page(),
      pageSize: this.pageSize(),
    };

    if (this.statusFilter() !== 'all') {
      queryParams.status = this.statusFilter();
    }

    const trimmedSearch = this.search().trim();
    if (trimmedSearch.length > 0) {
      queryParams.search = trimmedSearch;
    }

    this.api.listWarehouses(queryParams).subscribe({
      next: ({ items, meta }) => {
        this.items.set(items);
        this.total.set(meta.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load warehouses.')
            : 'Unable to load warehouses.',
        );
      },
    });
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.search.set(input.value);
    this.page.set(1);
    this.reload();
  }

  onSearchClear(): void {
    this.search.set('');
    this.page.set(1);
    this.reload();
  }

  onStatusChange(status: 'all' | 'active' | 'inactive'): void {
    this.statusFilter.set(status);
    this.page.set(1);
    this.reload();
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
    this.page.set(1);
    this.reload();
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

  toggleRowMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openMenuWarehouseId.update((current) => (current === id ? null : id));
  }

  closeRowMenu(): void {
    this.openMenuWarehouseId.set(null);
  }

  askDeactivate(item: WarehouseRecord): void {
    this.closeRowMenu();
    const copy = deactivateCopy('warehouse', 'Existing stock history and posted movements will remain unchanged.');
    this.pending = { kind: 'status', item, nextStatus: 'inactive' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Deactivate');
    this.confirmDanger.set(true);
    this.confirmOpen.set(true);
  }

  askReactivate(item: WarehouseRecord): void {
    this.closeRowMenu();
    const copy = reactivateCopy('warehouse');
    this.pending = { kind: 'status', item, nextStatus: 'active' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Reactivate');
    this.confirmDanger.set(false);
    this.confirmOpen.set(true);
  }

  askDelete(item: WarehouseRecord): void {
    this.closeRowMenu();
    const copy = deletePermanentlyCopy('warehouse');
    this.pending = { kind: 'delete', item };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Delete permanently');
    this.confirmDanger.set(true);
    this.confirmOpen.set(true);
  }

  confirmLifecycle(): void {
    const pending = this.pending;
    this.confirmOpen.set(false);
    this.pending = null;
    if (!pending || !this.canManage()) {
      return;
    }

    if (pending.kind === 'delete') {
      if (!this.canDelete()) {
        return;
      }
      this.api.deleteWarehouse(pending.item.id).subscribe({
        next: () => {
          this.successMessage.set(`Warehouse "${pending.item.name}" deleted.`);
          this.reload();
        },
        error: (error: unknown) => {
          this.errorMessage.set(recordInUseMessage(error, 'Unable to delete warehouse.'));
        },
      });
      return;
    }

    if (
      (pending.nextStatus === 'inactive' && !this.canDeactivate()) ||
      (pending.nextStatus === 'active' && !this.canReactivate())
    ) {
      return;
    }

    this.api
      .updateWarehouse(pending.item.id, {
        expectedVersion: pending.item.version,
        status: pending.nextStatus,
      })
      .subscribe({
        next: () => {
          this.successMessage.set(
            pending.nextStatus === 'inactive'
              ? `Warehouse "${pending.item.name}" deactivated.`
              : `Warehouse "${pending.item.name}" reactivated.`,
          );
          this.reload();
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            error instanceof HttpErrorResponse
              ? (error.error?.error?.message ?? 'Unable to update warehouse status.')
              : 'Unable to update warehouse status.',
          );
        },
      });
  }
}
