import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { EmployeeRecord, UsersAccessApi } from '../../data-access/users-access.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';

@Component({
  selector: 'agrivio-employees-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiConfirmDialogComponent,
  ],
  templateUrl: './employees.page.html',
  styleUrl: './employees.page.scss',
})
export class EmployeesPage {
  private readonly api = inject(UsersAccessApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly items = signal<EmployeeRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly canCreate = computed(() => this.sessionStore.hasPermission('users.create'));
  readonly canView = computed(() => this.sessionStore.hasPermission('users.view'));
  readonly canDeactivate = computed(() => this.sessionStore.hasPermission('users.deactivate'));
  readonly canUpdate = computed(() => this.sessionStore.hasPermission('users.update'));

  readonly confirmOpen = signal(false);
  private pendingDeactivateId: string | null = null;

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
    this.api.listEmployees().subscribe({
      next: (items) => {
        this.items.set(items);
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

  askDeactivate(item: EmployeeRecord): void {
    this.pendingDeactivateId = item.id;
    this.confirmOpen.set(true);
  }

  confirmDeactivate(): void {
    const id = this.pendingDeactivateId;
    this.confirmOpen.set(false);
    if (!id || !this.canDeactivate()) {
      return;
    }
    this.api.deactivateEmployee(id).subscribe({
      next: () => {
        this.successMessage.set('Employee access deactivated.');
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
