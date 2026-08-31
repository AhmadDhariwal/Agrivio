import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BranchRecord, BranchesWarehousesApi } from '../../data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  startWith,
  switchMap,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MasterLifecycleFilter,
  deactivateCopy,
  deletePermanentlyCopy,
  reactivateCopy,
  recordInUseMessage,
} from '../../../../shared/lifecycle/master-lifecycle';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

@Component({
  selector: 'agrivio-branches-page',
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
  templateUrl: './branches.page.html',
  styleUrl: './branches.page.scss',
})
export class BranchesPage {
  readonly infoTitle = 'About branches';
  readonly infoDescription =
    'Branches organize your business locations and own the prefixes used for branch-wise invoice numbering.';
  readonly infoItems = [
    'Configure branch name, internal code, and unique invoice prefix',
    'Invoice prefixes determine branch-wise sequential numbering across sales invoices',
    'Active branches are available for transactions and user assignments',
  ];

  private readonly api = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadRequests = new Subject<boolean>();
  private readonly searchChanges = new Subject<string>();
  private clampAfterLoad = false;

  readonly items = signal<BranchRecord[]>([]);
  readonly statusFilter = signal<MasterLifecycleFilter>('all');
  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly openMenuBranchId = signal<string | null>(null);

  readonly canUseModule = computed(() => this.capabilityService?.canUseModule('branches') ?? true);
  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseFeature('branches.features.moduleInfo') ?? true,
  );
  readonly showSearch = computed(
    () => this.capabilityService?.canUseFeature('branches.features.search') ?? true,
  );
  readonly showStatusFilter = computed(
    () => this.capabilityService?.canUseFeature('branches.features.statusFilter') ?? true,
  );
  readonly showToolbar = computed(() => this.showSearch() || this.showStatusFilter());

  readonly showCodeField = computed(
    () => this.capabilityService?.canViewField('branches.fields.code') ?? true,
  );
  readonly showStatusField = computed(
    () => this.capabilityService?.canViewField('branches.fields.status') ?? true,
  );

  readonly canView = computed(() => this.sessionStore.hasPermission('branches.view'));
  readonly canManage = computed(() => this.sessionStore.hasPermission('branches.manage'));
  readonly canRefresh = computed(
    () => this.capabilityService?.canPerformAction('branches.actions.refresh') ?? true,
  );
  readonly canCreate = computed(
    () => this.canManage() && (this.capabilityService?.canPerformAction('branches.actions.create') ?? true),
  );
  readonly canEdit = computed(
    () => this.canManage() && (this.capabilityService?.canPerformAction('branches.actions.edit') ?? true),
  );
  readonly canDeactivate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('branches.actions.deactivate') ?? true),
  );
  readonly canReactivate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('branches.actions.reactivate') ?? true),
  );
  readonly canDelete = computed(
    () => this.canManage() && (this.capabilityService?.canPerformAction('branches.actions.delete') ?? true),
  );
  readonly hasAnyRowAction = computed(
    () => this.canEdit() || this.canDeactivate() || this.canReactivate() || this.canDelete(),
  );

  readonly hasActiveFilters = computed(() => {
    return Boolean(this.search().trim() || this.statusFilter() !== 'all');
  });

  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('Deactivate');
  readonly confirmDanger = signal(true);
  private pending:
    | { kind: 'status'; item: BranchRecord; nextStatus: 'active' | 'inactive' }
    | { kind: 'delete'; item: BranchRecord }
    | null = null;

  constructor() {
    this.searchChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((search) => {
        this.search.set(search.trim());
        this.page.set(1);
        this.reload();
      });

    this.reloadRequests
      .pipe(
        startWith(false),
        switchMap((forceRefresh) => {
          if (!this.canView() || !this.canUseModule()) {
            this.loading.set(false);
            this.errorMessage.set(
              !this.canView()
                ? 'You do not have permission to view branches.'
                : 'Branches module is unavailable for this organization.',
            );
            return EMPTY;
          }
          this.loading.set(true);
          this.errorMessage.set(null);
          return this.api
            .listBranches(
              {
                page: this.page(),
                pageSize: this.pageSize(),
                status: this.statusFilter(),
                search: this.search(),
              },
              forceRefresh,
            )
            .pipe(
              catchError((error: unknown) => {
                this.loading.set(false);
                this.errorMessage.set(
                  error instanceof HttpErrorResponse
                    ? (error.error?.error?.message ?? 'Unable to load branches.')
                    : 'Unable to load branches.',
                );
                return EMPTY;
              }),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ items, meta }) => {
        const totalPages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
        if (this.clampAfterLoad && meta.total > 0 && this.page() > totalPages) {
          this.clampAfterLoad = false;
          this.page.set(totalPages);
          this.reload();
          return;
        }
        this.clampAfterLoad = false;
        this.items.set(items);
        this.total.set(meta.total);
        this.pageSize.set(meta.pageSize);
        this.loading.set(false);
      });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.openMenuBranchId()) {
      this.closeRowMenu();
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.openMenuBranchId()) {
      this.closeRowMenu();
    }
  }

  toggleRowMenu(branchId: string, event: Event): void {
    event.stopPropagation();
    this.openMenuBranchId.update((current) => (current === branchId ? null : branchId));
  }

  closeRowMenu(): void {
    this.openMenuBranchId.set(null);
  }

  reload(forceRefresh = false, clampAfterLoad = false): void {
    this.clampAfterLoad = clampAfterLoad;
    this.reloadRequests.next(forceRefresh);
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target) {
      this.searchChanges.next(target.value);
    }
  }

  onSearchClear(): void {
    this.search.set('');
    this.page.set(1);
    this.reload();
  }

  onStatusChange(value: MasterLifecycleFilter): void {
    this.statusFilter.set(value);
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

  askDeactivate(item: BranchRecord): void {
    this.closeRowMenu();
    const copy = deactivateCopy(
      'branch',
      'Existing invoices and sales history will remain unchanged.',
    );
    this.pending = { kind: 'status', item, nextStatus: 'inactive' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Deactivate');
    this.confirmDanger.set(true);
    this.confirmOpen.set(true);
  }

  askReactivate(item: BranchRecord): void {
    this.closeRowMenu();
    const copy = reactivateCopy('branch');
    this.pending = { kind: 'status', item, nextStatus: 'active' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Reactivate');
    this.confirmDanger.set(false);
    this.confirmOpen.set(true);
  }

  askDelete(item: BranchRecord): void {
    this.closeRowMenu();
    const copy = deletePermanentlyCopy('branch');
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
    if (
      !pending ||
      (pending.kind === 'delete' && !this.canDelete()) ||
      (pending.kind === 'status' &&
        ((pending.nextStatus === 'active' && !this.canReactivate()) ||
          (pending.nextStatus === 'inactive' && !this.canDeactivate())))
    ) {
      return;
    }
    if (pending.kind === 'delete') {
      this.api.deleteBranch(pending.item.id).subscribe({
        next: () => {
          this.successMessage.set('Branch deleted.');
          this.reload(false, true);
        },
        error: (error: unknown) => {
          this.errorMessage.set(recordInUseMessage(error, 'Unable to delete branch.'));
        },
      });
      return;
    }
    this.api
      .updateBranch(pending.item.id, {
        expectedVersion: pending.item.version,
        status: pending.nextStatus,
      })
      .subscribe({
        next: () => {
          this.successMessage.set(
            pending.nextStatus === 'inactive' ? 'Branch deactivated.' : 'Branch reactivated.',
          );
          this.reload();
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            error instanceof HttpErrorResponse
              ? (error.error?.error?.message ?? 'Unable to update branch status.')
              : 'Unable to update branch status.',
          );
        },
      });
  }
}
