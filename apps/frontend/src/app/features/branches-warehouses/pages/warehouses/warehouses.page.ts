import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BranchesWarehousesApi, WarehouseRecord } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiLifecycleFilterComponent } from '../../../../shared/ui/ui-lifecycle-filter/ui-lifecycle-filter.component';
import {
  MasterLifecycleFilter,
  deactivateCopy,
  deletePermanentlyCopy,
  filterMasterLifecycle,
  reactivateCopy,
  recordInUseMessage,
} from '../../../../shared/lifecycle/master-lifecycle';

@Component({
  selector: 'agrivio-warehouses-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiConfirmDialogComponent,
    UiLifecycleFilterComponent,
  ],
  templateUrl: './warehouses.page.html',
  styleUrl: './warehouses.page.scss',
})
export class WarehousesPage {
  private readonly api = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly items = signal<WarehouseRecord[]>([]);
  readonly statusFilter = signal<MasterLifecycleFilter>('active');
  readonly visibleItems = computed(() => filterMasterLifecycle(this.items(), this.statusFilter()));
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly canManage = computed(() => this.sessionStore.hasPermission('warehouses.manage'));
  readonly canView = computed(() => this.sessionStore.hasPermission('warehouses.view'));
  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Deactivate');
  private pending:
    | { kind: 'status'; item: WarehouseRecord; nextStatus: 'active' | 'inactive' }
    | { kind: 'delete'; item: WarehouseRecord }
    | null = null;

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.errorMessage.set('You do not have permission to view warehouses.');
      return;
    }
    this.loading.set(true);
    this.api.listWarehouses().subscribe({
      next: (items) => {
        this.items.set(items);
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

  askDeactivate(item: WarehouseRecord): void {
    const copy = deactivateCopy('warehouse', 'Existing stock history and posted movements will remain unchanged.');
    this.pending = { kind: 'status', item, nextStatus: 'inactive' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Deactivate');
    this.confirmOpen.set(true);
  }

  askReactivate(item: WarehouseRecord): void {
    const copy = reactivateCopy('warehouse');
    this.pending = { kind: 'status', item, nextStatus: 'active' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Reactivate');
    this.confirmOpen.set(true);
  }

  askDelete(item: WarehouseRecord): void {
    const copy = deletePermanentlyCopy('warehouse');
    this.pending = { kind: 'delete', item };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Delete permanently');
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
      this.api.deleteWarehouse(pending.item.id).subscribe({
        next: () => {
          this.successMessage.set('Warehouse deleted.');
          this.reload();
        },
        error: (error: unknown) => {
          this.errorMessage.set(recordInUseMessage(error, 'Unable to delete warehouse.'));
        },
      });
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
            pending.nextStatus === 'inactive' ? 'Warehouse deactivated.' : 'Warehouse reactivated.',
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
