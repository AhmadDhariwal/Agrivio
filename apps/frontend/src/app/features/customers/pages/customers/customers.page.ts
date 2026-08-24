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
import { CustomersApi } from '../../data-access/customers.api';
import { CustomerRecord, CustomerType, PriceTier } from '../../models/customers.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
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
  selector: 'agrivio-customers-page',
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
  templateUrl: './customers.page.html',
  styleUrl: './customers.page.scss',
})
export class CustomersPage {
  readonly infoTitle = 'About Customers';
  readonly infoDescription =
    'Manage customer profiles, pricing relationships, contact details and credit settings.';
  readonly infoItems = [
    'Maintain customer identity, contact details, customer type, and price tier',
    'Configure customer credit permissions, credit limits, and credit block behavior',
    'Track outstanding receivable balances and advances across sales workflows',
    'Manage lifecycle states (Active / Inactive) for sales operations',
  ];

  private readonly api = inject(CustomersApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly items = signal<CustomerRecord[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);
  readonly statusFilter = signal<MasterLifecycleFilter>('active');
  readonly search = signal('');
  readonly mobileFiltersOpen = signal(false);

  readonly selectedCustomer = signal<CustomerRecord | null>(null);
  readonly openMenuCustomerId = signal<string | null>(null);

  readonly confirmOpen = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  readonly confirmLabel = signal('');
  private pending:
    | { kind: 'delete'; item: CustomerRecord }
    | { kind: 'status'; item: CustomerRecord; nextStatus: 'active' | 'inactive' }
    | null = null;

  private readonly reloadRequests = new Subject<void>();
  private readonly searchChanges = new Subject<string>();
  private clampAfterLoad = false;

  readonly canManage = computed(() => this.sessionStore.hasPermission('customers.manage'));
  readonly canView = computed(() => this.sessionStore.hasPermission('customers.view'));
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
        startWith(undefined),
        switchMap(() => {
          if (!this.canView()) {
            this.errorMessage.set('You do not have permission to view customers.');
            this.loading.set(false);
            return EMPTY;
          }
          this.errorMessage.set(null);
          this.loading.set(true);
          return this.api
            .listCustomers({
              page: this.page(),
              pageSize: this.pageSize(),
              status: this.statusFilter(),
              search: this.search(),
            })
            .pipe(
              catchError((error: unknown) => {
                this.loading.set(false);
                this.errorMessage.set(extractErrorMessage(error, 'Unable to load customers.'));
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

  reload(clampAfterLoad = false): void {
    this.clampAfterLoad = clampAfterLoad;
    this.reloadRequests.next();
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
    this.openMenuCustomerId.set(this.openMenuCustomerId() === id ? null : id);
  }

  closeRowMenu(): void {
    this.openMenuCustomerId.set(null);
  }

  // Inspector Drawer Actions
  openInspector(item: CustomerRecord): void {
    this.closeRowMenu();
    this.selectedCustomer.set(item);
  }

  closeInspector(): void {
    this.selectedCustomer.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.selectedCustomer()) {
      this.closeInspector();
    }
    if (this.openMenuCustomerId()) {
      this.closeRowMenu();
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.openMenuCustomerId()) {
      this.closeRowMenu();
    }
  }

  // Initials & Labels
  getInitials(name: string): string {
    if (!name) return 'CU';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0];
    if (!first) return 'CU';
    if (parts.length === 1) {
      return first.slice(0, 2).toUpperCase();
    }
    const second = parts[1] ?? '';
    return (first.charAt(0) + second.charAt(0)).toUpperCase();
  }

  getCustomerTypeLabel(type: CustomerType | string): string {
    switch (type) {
      case 'walk_in':
        return 'Walk-in';
      case 'farmer':
        return 'Farmer';
      case 'individual':
        return 'Individual';
      case 'business':
        return 'Business';
      case 'corporate':
        return 'Corporate';
      default:
        return type || 'Standard';
    }
  }

  getPriceTierLabel(tier: PriceTier | string): string {
    switch (tier) {
      case 'retail':
        return 'Retail';
      case 'wholesale':
        return 'Wholesale';
      case 'dealer':
        return 'Dealer';
      case 'distributor':
        return 'Distributor';
      default:
        return tier || 'Retail';
    }
  }

  getPriceTierClass(tier: PriceTier | string): string {
    switch (tier) {
      case 'retail':
        return 'tier-tag--retail';
      case 'wholesale':
        return 'tier-tag--wholesale';
      case 'dealer':
        return 'tier-tag--dealer';
      case 'distributor':
        return 'tier-tag--distributor';
      default:
        return 'tier-tag--retail';
    }
  }

  getCreditLimitBehaviourLabel(behaviour: string): string {
    switch (behaviour) {
      case 'warning':
        return 'Warning';
      case 'manager_approval':
        return 'Manager Approval';
      case 'block':
        return 'Hard Block';
      default:
        return behaviour || 'Warning';
    }
  }

  formatCurrency(amount?: string, currency = 'PKR'): string {
    if (!amount || isNaN(Number(amount))) return `${currency} 0.00`;
    const num = Number(amount);
    return `${currency} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Lifecycle Actions
  askDeactivate(item: CustomerRecord): void {
    this.closeRowMenu();
    const copy = deactivateCopy('customer', 'Existing invoices and ledger history will remain unchanged.');
    this.pending = { kind: 'status', item, nextStatus: 'inactive' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Deactivate');
    this.confirmOpen.set(true);
  }

  askReactivate(item: CustomerRecord): void {
    this.closeRowMenu();
    const copy = reactivateCopy('customer');
    this.pending = { kind: 'status', item, nextStatus: 'active' };
    this.confirmTitle.set(copy.title);
    this.confirmMessage.set(copy.message);
    this.confirmLabel.set('Reactivate');
    this.confirmOpen.set(true);
  }

  askDelete(item: CustomerRecord): void {
    this.closeRowMenu();
    const copy = deletePermanentlyCopy('customer');
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
      this.api.deleteCustomer(pending.item.id).subscribe({
        next: () => {
          this.successMessage.set('Customer deleted.');
          if (this.selectedCustomer()?.id === pending.item.id) {
            this.closeInspector();
          }
          this.reload(true);
        },
        error: (error: unknown) => {
          this.errorMessage.set(recordInUseMessage(error, 'Unable to delete customer.'));
        },
      });
      return;
    }
    this.api
      .updateCustomer(pending.item.id, {
        expectedVersion: pending.item.version,
        status: pending.nextStatus,
      })
      .subscribe({
        next: () => {
          this.successMessage.set(
            pending.nextStatus === 'inactive' ? 'Customer deactivated.' : 'Customer reactivated.',
          );
          if (this.selectedCustomer()?.id === pending.item.id) {
            this.selectedCustomer.update((c) => (c ? { ...c, status: pending.nextStatus } : null));
          }
          this.reload();
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            error instanceof HttpErrorResponse
              ? (error.error?.error?.message ?? 'Unable to update customer status.')
              : 'Unable to update customer status.',
          );
        },
      });
  }
}
