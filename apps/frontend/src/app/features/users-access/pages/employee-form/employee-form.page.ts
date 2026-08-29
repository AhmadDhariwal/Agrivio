import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import {
  AssignmentTarget,
  EmployeeRecord,
  OrganizationRole,
  UsersAccessApi,
} from '../../data-access/users-access.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';
import { mapPlanLimitError } from '../../../../core/plan-limits/plan-limit-feedback';

@Component({
  selector: 'agrivio-employee-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './employee-form.page.html',
  styleUrl: './employee-form.page.scss',
})
export class EmployeeFormPage {
  private readonly api = inject(UsersAccessApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly employeeId = signal<string | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly activationHandoff = signal<string | null>(null);
  readonly linkCopied = signal(false);

  readonly branches = signal<AssignmentTarget[]>([]);
  readonly warehouses = signal<AssignmentTarget[]>([]);
  readonly currentEmployeeStatus = signal<string>('active');

  readonly branchSearch = signal('');
  readonly warehouseSearch = signal('');

  readonly canUseEmployees = computed(
    () => this.capabilityService?.canUseModule('employees') ?? true,
  );
  readonly canCreate = computed(() => {
    if (!this.sessionStore.hasPermission('users.create') || !this.canUseEmployees()) {
      return false;
    }
    return this.capabilityService?.canPerformAction('employees.actions.create') ?? true;
  });
  readonly canUpdate = computed(() => {
    if (!this.sessionStore.hasPermission('users.update') || !this.canUseEmployees()) {
      return false;
    }
    return this.capabilityService?.canPerformAction('employees.actions.edit') ?? true;
  });
  readonly canAssign = computed(() => {
    if (!this.sessionStore.hasPermission('users.assign-access') || !this.canUseEmployees()) {
      return false;
    }
    return this.capabilityService?.canPerformAction('employees.actions.assignAccess') ?? true;
  });

  readonly showEmail = computed(
    () => this.capabilityService?.canViewField('employees.fields.email') ?? true,
  );
  readonly showDisplayName = computed(
    () => this.capabilityService?.canViewField('employees.fields.displayName') ?? true,
  );
  readonly showRole = computed(
    () => this.capabilityService?.canViewField('employees.fields.role') ?? true,
  );
  readonly showBranchAccess = computed(
    () => this.capabilityService?.canViewField('employees.fields.branchAccess') ?? true,
  );
  readonly showWarehouseAccess = computed(
    () => this.capabilityService?.canViewField('employees.fields.warehouseAccess') ?? true,
  );
  readonly showStatus = computed(
    () => this.capabilityService?.canViewField('employees.fields.status') ?? true,
  );

  readonly fieldRequired = hasRequiredValidator;

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    role: ['Cashier' as OrganizationRole, [Validators.required]],
    branchIds: this.formBuilder.nonNullable.control<string[]>([]),
    warehouseIds: this.formBuilder.nonNullable.control<string[]>([]),
  });

  readonly roles: OrganizationRole[] = ['Owner', 'Manager', 'Cashier', 'StoreKeeper'];

  private version = 1;

  isReadOnlyField(field: 'displayName' | 'role'): boolean {
    const key = `employees.fields.${field}`;
    return !(this.capabilityService?.canEditField(key) ?? true);
  }

  readonly canEditAssignments = computed(() => this.canAssign());

  readonly filteredBranches = computed(() => {
    const list = this.branches();
    const query = this.branchSearch().trim().toLowerCase();
    if (!query) return list;
    return list.filter((b) => b.name.toLowerCase().includes(query));
  });

  readonly filteredWarehouses = computed(() => {
    const list = this.warehouses();
    const query = this.warehouseSearch().trim().toLowerCase();
    if (!query) return list;
    return list.filter((w) => w.name.toLowerCase().includes(query));
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    const locations$ = forkJoin({
      branches: this.api.listAssignmentBranches(),
      warehouses: this.api.listAssignmentWarehouses(),
    });

    if (id && id !== 'new') {
      this.employeeId.set(id);
      forkJoin({
        employee: this.api.getEmployee(id),
        locations: locations$,
      }).subscribe({
        next: ({ employee, locations }) => {
          this.branches.set(locations.branches);
          this.warehouses.set(locations.warehouses);
          this.applyEmployee(employee);
          this.form.controls.email.disable();
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load employee.'));
        },
      });
    } else {
      locations$.subscribe({
        next: (locations) => {
          this.branches.set(locations.branches);
          this.warehouses.set(locations.warehouses);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.errorMessage.set('Unable to load branches and warehouses for assignment.');
        },
      });
    }
  }

  toggleBranch(id: string, checked: boolean): void {
    if (!this.canEditAssignments()) {
      return;
    }
    const current = new Set(this.form.controls.branchIds.value);
    if (checked) {
      current.add(id);
    } else {
      current.delete(id);
    }
    this.form.controls.branchIds.setValue([...current]);
  }

  toggleWarehouse(id: string, checked: boolean): void {
    if (!this.canEditAssignments()) {
      return;
    }
    const current = new Set(this.form.controls.warehouseIds.value);
    if (checked) {
      current.add(id);
    } else {
      current.delete(id);
    }
    this.form.controls.warehouseIds.setValue([...current]);
  }

  isBranchChecked(id: string): boolean {
    return this.form.controls.branchIds.value.includes(id);
  }

  isWarehouseChecked(id: string): boolean {
    return this.form.controls.warehouseIds.value.includes(id);
  }

  selectAllBranches(): void {
    if (!this.canEditAssignments()) {
      return;
    }
    const allIds = this.branches().map((b) => b.id);
    this.form.controls.branchIds.setValue(allIds);
  }

  clearAllBranches(): void {
    if (!this.canEditAssignments()) {
      return;
    }
    this.form.controls.branchIds.setValue([]);
  }

  selectAllWarehouses(): void {
    if (!this.canEditAssignments()) {
      return;
    }
    const allIds = this.warehouses().map((w) => w.id);
    this.form.controls.warehouseIds.setValue(allIds);
  }

  clearAllWarehouses(): void {
    if (!this.canEditAssignments()) {
      return;
    }
    this.form.controls.warehouseIds.setValue([]);
  }

  formatRoleLabel(role: OrganizationRole): string {
    return role === 'StoreKeeper' ? 'Store Keeper' : role;
  }

  copyActivationLink(url: string): void {
    navigator.clipboard?.writeText(url).then(() => {
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 3000);
    });
  }

  save(): void {
    const creating = this.employeeId() === null;
    if ((creating && !this.canCreate()) || (!creating && !this.canUpdate())) {
      this.errorMessage.set('You do not have permission for this action.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();

    if (creating) {
      this.api
        .createEmployee({
          email: value.email,
          displayName: value.displayName,
          role: value.role,
        })
        .subscribe({
          next: (created) => {
            this.activationHandoff.set(created.activationUrl ?? null);
            if (this.canAssign()) {
              this.api
                .replaceAccessAssignments(created.id, {
                  branchIds: value.branchIds,
                  warehouseIds: value.warehouseIds,
                })
                .subscribe({
                  next: () => {
                    this.saving.set(false);
                    if (!created.activationUrl) {
                      void this.router.navigateByUrl('/app/employees');
                    }
                  },
                  error: (error: unknown) => {
                    this.saving.set(false);
                    this.errorMessage.set(this.mapError(error, 'Employee created but assignments failed.'));
                  },
                });
            } else {
              this.saving.set(false);
              if (!created.activationUrl) {
                void this.router.navigateByUrl('/app/employees');
              }
            }
          },
          error: (error: unknown) => {
            this.saving.set(false);
            this.errorMessage.set(this.mapError(error, 'Unable to create employee.'));
          },
        });
      return;
    }

    const id = this.employeeId();
    if (!id) {
      this.saving.set(false);
      return;
    }

    this.api
      .updateEmployee(id, {
        expectedVersion: this.version,
        displayName: value.displayName,
        role: value.role,
      })
      .subscribe({
        next: (updated) => {
          this.version = updated.version;
          if (!this.canAssign()) {
            this.saving.set(false);
            void this.router.navigateByUrl('/app/employees');
            return;
          }
          this.api
            .replaceAccessAssignments(updated.id, {
              branchIds: value.branchIds,
              warehouseIds: value.warehouseIds,
            })
            .subscribe({
              next: () => {
                this.saving.set(false);
                void this.router.navigateByUrl('/app/employees');
              },
              error: (error: unknown) => {
                this.saving.set(false);
                this.errorMessage.set(this.mapError(error, 'Profile saved but assignments failed.'));
              },
            });
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to update employee.'));
        },
      });
  }

  private applyEmployee(employee: EmployeeRecord): void {
    this.version = employee.version;
    this.currentEmployeeStatus.set(employee.status ?? 'active');
    this.form.patchValue({
      email: employee.email,
      displayName: employee.displayName,
      role: employee.role as OrganizationRole,
      branchIds: employee.branchIds,
      warehouseIds: employee.warehouseIds,
    });
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This employee changed elsewhere. Reload and try again.';
    }
    return mapPlanLimitError(error, error.error?.error?.message ?? fallback);
  }
}
