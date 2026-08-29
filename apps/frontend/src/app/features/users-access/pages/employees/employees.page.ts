import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { EmployeeRecord, UsersAccessApi } from '../../data-access/users-access.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';

@Component({
  selector: 'agrivio-employees-page',
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
  templateUrl: './employees.page.html',
  styleUrl: './employees.page.scss',
})
export class EmployeesPage {
  private readonly api = inject(UsersAccessApi);
  private readonly sessionStore = inject(AuthSessionStore);

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeRowMenu();
  }

  readonly items = signal<EmployeeRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly page = signal(1);
  readonly pageSize = signal(25);
  readonly total = signal(0);

  // Filters
  readonly search = signal('');
  readonly statusFilter = signal<string>('all');
  readonly roleFilter = signal<string>('all');
  readonly openMenuEmployeeId = signal<string | null>(null);

  // Permissions
  readonly canCreate = computed(() => this.sessionStore.hasPermission('users.create'));
  readonly canView = computed(() => this.sessionStore.hasPermission('users.view'));
  readonly canDeactivate = computed(() => this.sessionStore.hasPermission('users.deactivate'));
  readonly canUpdate = computed(() => this.sessionStore.hasPermission('users.update'));

  // Module Info Content
  readonly infoTitle = 'About employees & access';
  readonly infoDescription =
    'Manage team member identities, predefined roles, and location-based data access scoping for this organization.';
  readonly infoItems = [
    'Roles are predefined permission bundles: Owner (full control), Manager (operations & reports), Cashier (sales & customer payments), and Store Keeper (inventory & purchases).',
    'Branch and warehouse assignments constrain operational data access to designated locations without granting extra permissions.',
    'Super Admin is reserved for platform-level operators and cannot be assigned as an organization employee role.',
    'Deactivating an employee immediately revokes their active sessions and blocks future logins while preserving historical records.',
  ];

  // Deactivate confirm modal state
  readonly confirmOpen = signal(false);
  private pendingDeactivateItem: EmployeeRecord | null = null;

  // Filtered Items (Client-side refinement on active/role when needed over current page)
  readonly visibleItems = computed(() => {
    let result = this.items();
    const status = this.statusFilter();
    if (status !== 'all') {
      result = result.filter((item) => item.status.toLowerCase() === status.toLowerCase());
    }
    const role = this.roleFilter();
    if (role !== 'all') {
      result = result.filter((item) => item.role.toLowerCase() === role.toLowerCase());
    }
    return result;
  });

  // KPI Metrics (Authoritatively derived from list metadata / items if total is complete)
  readonly kpis = computed(() => {
    const list = this.items();
    const activeCount = list.filter((i) => i.status === 'active').length;
    const pendingInactiveCount = list.filter((i) => i.status !== 'active').length;
    return {
      total: this.total(),
      active: activeCount,
      pendingInactive: pendingInactiveCount,
    };
  });

  readonly hasActiveFilters = computed(() => {
    return this.search().trim().length > 0 || this.statusFilter() !== 'all' || this.roleFilter() !== 'all';
  });

  readonly activeFiltersCount = computed(() => {
    let count = 0;
    if (this.statusFilter() !== 'all') count++;
    if (this.roleFilter() !== 'all') count++;
    return count;
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.errorMessage.set('You do not have permission to view employees.');
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.openMenuEmployeeId.set(null);

    const queryParams: { page: number; pageSize: number; search?: string } = {
      page: this.page(),
      pageSize: this.pageSize(),
    };

    const trimmedSearch = this.search().trim();
    if (trimmedSearch.length > 0) {
      queryParams.search = trimmedSearch;
    }

    this.api.listEmployees(queryParams).subscribe({
      next: ({ items, meta }) => {
        this.items.set(items);
        this.total.set(meta.total);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load employees.')
            : 'Unable to load employees.',
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

  onStatusChange(status: string): void {
    this.statusFilter.set(status);
  }

  onRoleChange(role: string): void {
    this.roleFilter.set(role);
  }

  clearFilters(): void {
    this.search.set('');
    this.statusFilter.set('all');
    this.roleFilter.set('all');
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
    this.openMenuEmployeeId.update((current) => (current === id ? null : id));
  }

  closeRowMenu(): void {
    this.openMenuEmployeeId.set(null);
  }

  formatRole(role: string): string {
    switch (role) {
      case 'StoreKeeper':
        return 'Store Keeper';
      default:
        return role;
    }
  }

  formatStatus(status: string): string {
    switch (status.toLowerCase()) {
      case 'active':
        return 'Active';
      case 'pending':
        return 'Pending activation';
      case 'deactivated':
        return 'Deactivated';
      default:
        return status;
    }
  }

  formatBranchAccess(item: EmployeeRecord): string {
    const count = item.branchIds?.length ?? 0;
    if (count === 0) {
      return 'None assigned';
    }
    return `${count} ${count === 1 ? 'branch' : 'branches'}`;
  }

  formatWarehouseAccess(item: EmployeeRecord): string {
    const count = item.warehouseIds?.length ?? 0;
    if (count === 0) {
      return 'None assigned';
    }
    return `${count} ${count === 1 ? 'warehouse' : 'warehouses'}`;
  }

  askDeactivate(item: EmployeeRecord): void {
    this.closeRowMenu();
    this.pendingDeactivateItem = item;
    this.confirmOpen.set(true);
  }

  confirmDeactivate(): void {
    const item = this.pendingDeactivateItem;
    this.confirmOpen.set(false);
    if (!item || !this.canDeactivate()) {
      return;
    }
    this.api.deactivateEmployee(item.id).subscribe({
      next: () => {
        this.successMessage.set(`Employee ${item.displayName} access deactivated.`);
        this.reload();
      },
      error: (error: unknown) => {
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to deactivate employee.')
            : 'Unable to deactivate employee.',
        );
      },
    });
  }
}
