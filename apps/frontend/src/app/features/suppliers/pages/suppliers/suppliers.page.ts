import {
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { SuppliersApi } from '../../data-access/suppliers.api';
import { SupplierRecord } from '../../models/suppliers.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { applyPaginationMeta } from '../../../../shared/data-access/pagination';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MasterLifecycleFilter,
  deactivateCopy,
  deletePermanentlyCopy,
  reactivateCopy,
  recordInUseMessage,
} from '../../../../shared/lifecycle/master-lifecycle';

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    return error.error?.error?.message ?? error.error?.message ?? error.message ?? fallback;
  }
  if (typeof error === 'object' && error !== null) {
    const rec = error as Record<string, unknown>;
    const nested = rec['error'] as Record<string, unknown> | undefined;
    if (nested?.['error'] && typeof nested['error'] === 'object' && nested['error'] !== null) {
      const deep = nested['error'] as Record<string, unknown>;
      if (typeof deep['message'] === 'string') return deep['message'];
    }
    if (typeof nested?.['message'] === 'string') return nested['message'];
    if (typeof rec['message'] === 'string') return rec['message'];
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

@Component({
  selector: 'agrivio-suppliers-page',
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
  templateUrl: './suppliers.page.html',
  styleUrl: './suppliers.page.scss',
})
export class SuppliersPage {
  readonly infoTitle = 'About Suppliers';
  readonly infoDescription =
    'Manage supplier profiles, contact information and purchasing relationships.';
  readonly infoItems = [
    'Maintain supplier identity, primary contact person, phone, and email address',
    'Track purchasing relationships and maintain supplier ledger records',
    'Monitor outstanding payable balances and advances derived from transactions',
    'Manage lifecycle states (Active / Inactive) for purchasing operations',
  ];

  private readonly api = inject(SuppliersApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);

  readonly items = signal<SupplierRecord[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly statusFilter = signal<MasterLifecycleFilter>('active');
  readonly search = signal('');
  readonly mobileFiltersOpen = signal(false);

  readonly selectedSupplier = signal<SupplierRecord | null>(null);
  readonly openMenuSupplierId = signal<string | null>(null);

  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('');
  private pending:
    | { kind: 'delete'; item: SupplierRecord }
    | { kind: 'status'; item: SupplierRecord; nextStatus: 'active' | 'inactive' }
    | null = null;

  private readonly reloadRequests = new Subject<boolean>();
  private readonly searchChanges = new Subject<string>();
  private clampAfterLoad = false;

  readonly canUseSuppliers = computed(
    () => this.capabilityService?.canUseModule('suppliers') ?? true,
  );
  readonly canManage = computed(
    () => this.sessionStore.hasPermission('suppliers.manage') && this.canUseSuppliers(),
  );
  readonly canView = computed(
    () => this.sessionStore.hasPermission('suppliers.view') && this.canUseSuppliers(),
  );

  // Feature Computeds
  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseView('suppliers.features.moduleInfo') ?? true,
  );
  readonly showSearch = computed(
    () => this.capabilityService?.canUseView('suppliers.features.search') ?? true,
  );
  readonly showStatusFilter = computed(
    () => this.capabilityService?.canUseView('suppliers.features.statusFilter') ?? true,
  );
  readonly showKpiCards = computed(
    () => this.capabilityService?.canUseView('suppliers.features.kpiCards') ?? true,
  );
  readonly showInspector = computed(
    () => this.capabilityService?.canUseView('suppliers.features.inspector') ?? true,
  );
  readonly showTechnicalDetails = computed(
    () => this.capabilityService?.canUseView('suppliers.features.technicalDetails') ?? true,
  );

  // Field Computeds
  readonly showContactName = computed(
    () => this.capabilityService?.canViewField('suppliers.fields.contactName') ?? true,
  );
  readonly showPhone = computed(
    () => this.capabilityService?.canViewField('suppliers.fields.phone') ?? true,
  );
  readonly showEmail = computed(
    () => this.capabilityService?.canViewField('suppliers.fields.email') ?? true,
  );

  // Action Computeds
  readonly canCreate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('suppliers.actions.create') ?? true),
  );
  readonly canInspect = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canPerformAction('suppliers.actions.inspect') ?? true),
  );
  readonly canEdit = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('suppliers.actions.edit') ?? true),
  );
  readonly canDeactivate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('suppliers.actions.deactivate') ?? true),
  );
  readonly canReactivate = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('suppliers.actions.reactivate') ?? true),
  );
  readonly canDelete = computed(
    () =>
      this.canManage() &&
      (this.capabilityService?.canPerformAction('suppliers.actions.delete') ?? true),
  );
  readonly canRefresh = computed(
    () =>
      this.canView() &&
      (this.capabilityService?.canPerformAction('suppliers.actions.refresh') ?? true),
  );

  readonly hasActiveFilters = computed(
    () => this.statusFilter() !== 'active' || this.search().trim().length > 0,
  );

  constructor() {
    this.searchChanges
      .pipe(debounceTime(250), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((val) => {
        this.search.set(val.trim());
        this.page.set(1);
        this.reloadRequests.next();
      });

    this.reloadRequests
      .pipe(
        startWith(false),
        switchMap((forceRefresh) => {
          if (!this.canView()) {
            this.errorMessage.set('You do not have permission to view suppliers.');
            this.loading.set(false);
            return EMPTY;
          }
          this.errorMessage.set(null);
          this.loading.set(true);
          return this.api
            .listSuppliers({
              page: this.page(),
              pageSize: this.pageSize(),
              status: this.statusFilter(),
              search: this.search(),
              forceRefresh: forceRefresh === true,
            })
            .pipe(
              catchError((error: unknown) => {
                this.loading.set(false);
                this.errorMessage.set(extractErrorMessage(error, 'Unable to load suppliers.'));
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
        applyPaginationMeta(meta, { total: this.total, pageSize: this.pageSize });
        this.loading.set(false);
      });
  }

  reload(clampAfterLoad = false, forceRefresh = false): void {
    this.clampAfterLoad = clampAfterLoad;
    this.reloadRequests.next(forceRefresh);
  }

  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchChanges.next(input.value);
  }

  onSearchClear(): void {
    this.search.set('');
    this.page.set(1);
    this.reload();
  }

  openMobileFilters(): void {
    this.mobileFiltersOpen.set(true);
  }

  closeMobileFilters(): void {
    this.mobileFiltersOpen.set(false);
  }

  onStatusChange(value: MasterLifecycleFilter): void {
    this.statusFilter.set(value);
    this.page.set(1);
    this.reload();
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('active');
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

  // Row Action Menu
  toggleRowMenu(id: string, event: MouseEvent): void {
    event.stopPropagation();
    this.openMenuSupplierId.set(this.openMenuSupplierId() === id ? null : id);
  }

  closeRowMenu(): void {
    this.openMenuSupplierId.set(null);
  }

  // Inspector Drawer Actions
  openInspector(item: SupplierRecord): void {
    this.closeRowMenu();
    this.selectedSupplier.set(item);
  }

  closeInspector(): void {
    this.selectedSupplier.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.selectedSupplier()) {
      this.closeInspector();
    }
    if (this.openMenuSupplierId()) {
      this.closeRowMenu();
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.openMenuSupplierId()) {
      this.closeRowMenu();
    }
  }

  // Initials & Labels
  getInitials(name: string): string {
    if (!name) return 'SU';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0];
    if (!first) return 'SU';
    if (parts.length === 1) {
      return first.slice(0, 2).toUpperCase();
    }
    const second = parts[1] ?? '';
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }

  formatCurrency(amount?: string, currency = 'PKR'): string {
    if (!amount || isNaN(Number(amount))) return `${currency} 0.00`;
    const num = Number(amount);
    return `${currency} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Lifecycle Actions
  askDeactivate(item: SupplierRecord): void {
    this.closeRowMenu();
    const copy = deactivateCopy('supplier', 'Existing purchases and payable history will remain unchanged.');
    this.pending = { kind: 'status', item, nextStatus: 'inactive' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Deactivate');
    this.confirmOpen.set(true);
  }

  askReactivate(item: SupplierRecord): void {
    this.closeRowMenu();
    const copy = reactivateCopy('supplier');
    this.pending = { kind: 'status', item, nextStatus: 'active' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Reactivate');
    this.confirmOpen.set(true);
  }

  askDelete(item: SupplierRecord): void {
    this.closeRowMenu();
    const copy = deletePermanentlyCopy('supplier');
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
      this.api.deleteSupplier(pending.item.id).subscribe({
        next: () => {
          this.successMessage.set('Supplier deleted.');
          if (this.selectedSupplier()?.id === pending.item.id) {
            this.closeInspector();
          }
          this.reload(true);
        },
        error: (error: unknown) => {
          this.errorMessage.set(recordInUseMessage(error, 'Unable to delete supplier.'));
        },
      });
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
          if (this.selectedSupplier()?.id === pending.item.id) {
            this.selectedSupplier.update((s) => (s ? { ...s, status: pending.nextStatus } : null));
          }
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
