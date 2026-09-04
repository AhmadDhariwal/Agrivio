import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EmployeeRecord, UsersAccessApi } from '../../data-access/users-access.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-employee-detail-page',
  standalone: true,
  imports: [RouterLink, UiAlertComponent, UiLoadingStateComponent],
  templateUrl: './employee-detail.page.html',
  styleUrl: './employee-detail.page.scss',
})
export class EmployeeDetailPage {
  private readonly api = inject(UsersAccessApi);
  private readonly route = inject(ActivatedRoute);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly employee = signal<EmployeeRecord | null>(null);
  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('users.view') &&
      (this.capabilityService?.canUseModule('employees') ?? true),
  );
  readonly canEdit = computed(
    () =>
      this.sessionStore.hasPermission('users.update') &&
      (this.capabilityService?.canPerformAction('employees.actions.edit') ?? true) &&
      (this.employee()?.allowedActions?.canUpdate ?? true),
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.canView()) {
      this.loading.set(false);
      return;
    }
    this.api.getEmployee(id).subscribe({
      next: (employee) => {
        this.employee.set(employee);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load employee.')
            : 'Unable to load employee.',
        );
        this.loading.set(false);
      },
    });
  }

  roleLabel(role: string): string {
    return role === 'StoreKeeper' ? 'Store Keeper' : role;
  }
}
