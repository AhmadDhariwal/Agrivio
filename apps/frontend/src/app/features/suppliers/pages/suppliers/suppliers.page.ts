import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { SuppliersApi } from '../../data-access/suppliers.api';
import { SupplierRecord } from '../../models/suppliers.models';
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
  filterMasterLifecycle,
  reactivateCopy,
} from '../../../../shared/lifecycle/master-lifecycle';

@Component({
  selector: 'agrivio-suppliers-page',
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
  templateUrl: './suppliers.page.html',
  styleUrl: './suppliers.page.scss',
})
export class SuppliersPage {
  private readonly api = inject(SuppliersApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly items = signal<SupplierRecord[]>([]);
  readonly statusFilter = signal<MasterLifecycleFilter>('all');
  readonly visibleItems = computed(() => filterMasterLifecycle(this.items(), this.statusFilter()));
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly canManage = computed(() => this.sessionStore.hasPermission('suppliers.manage'));
  readonly canView = computed(() => this.sessionStore.hasPermission('suppliers.view'));
  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Deactivate');
  private pending: { item: SupplierRecord; nextStatus: 'active' | 'inactive' } | null = null;

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.errorMessage.set('You do not have permission to view suppliers.');
      return;
    }
    this.loading.set(true);
    this.api.listSuppliers().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load suppliers.')
            : 'Unable to load suppliers.',
        );
      },
    });
  }

  askDeactivate(item: SupplierRecord): void {
    const copy = deactivateCopy('supplier', 'Existing purchases and payable history will remain unchanged.');
    this.pending = { item, nextStatus: 'inactive' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Deactivate');
    this.confirmOpen.set(true);
  }

  askReactivate(item: SupplierRecord): void {
    const copy = reactivateCopy('supplier');
    this.pending = { item, nextStatus: 'active' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Reactivate');
    this.confirmOpen.set(true);
  }

  confirmLifecycle(): void {
    const pending = this.pending;
    this.confirmOpen.set(false);
    this.pending = null;
    if (!pending || !this.canManage()) {
      return;
    }
    this.api
      .updateSupplier(pending.item.id, {
        expectedVersion: pending.item.version,
        status: pending.nextStatus,
      })
      .subscribe({
        next: () => {
          this.successMessage.set(
            pending.nextStatus === 'inactive' ? 'Supplier deactivated.' : 'Supplier reactivated.',
          );
          this.reload();
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            error instanceof HttpErrorResponse
              ? (error.error?.error?.message ?? 'Unable to update supplier status.')
              : 'Unable to update supplier status.',
          );
        },
      });
  }
}
