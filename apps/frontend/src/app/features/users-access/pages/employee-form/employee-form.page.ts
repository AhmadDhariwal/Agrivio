import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';
import {
  AssignmentTarget,
  EmployeeAccessPolicy,
  EmployeeAllowedActions,
  EmployeeRecord,
  OrganizationRole,
  UsersAccessApi,
} from '../../data-access/users-access.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import {
  fieldValidationMessage,
  hasRequiredValidator,
} from '../../../../shared/form/form-field.util';
import { mapPlanLimitError } from '../../../../core/plan-limits/plan-limit-feedback';
import {
  authorizationErrorCode,
  mapAuthorizationError,
} from '../../../../core/access/authorization-error';

const MAX_NAME = 120;
const MAX_EMAIL = 254;

const ROLE_DESCRIPTIONS: Record<OrganizationRole, string> = {
  Owner: 'Full organization administrator with access to all tenant operations and settings.',
  Manager:
    'Runs day-to-day operations and can manage Cashiers and Store Keepers within assigned locations.',
  Cashier: 'POS-focused role for sales, customer payments, and required read-only operational data.',
  StoreKeeper:
    'Warehouse-focused role for inventory, transfers, purchasing, expiry, and supplier operations.',
};

const ALL_ORGANIZATION_ROLES: OrganizationRole[] = ['Owner', 'Manager', 'Cashier', 'StoreKeeper'];

function fallbackAccessPolicy(actorRole: string | undefined): EmployeeAccessPolicy {
  const role = actorRole ?? '';
  return {
    actorRole: role,
    assignableRoles:
      role === 'Owner'
        ? ALL_ORGANIZATION_ROLES
        : role === 'Manager'
          ? ['Cashier', 'StoreKeeper']
          : [],
    canManageConditionalGrants: role === 'Owner',
    roleDescriptions: ROLE_DESCRIPTIONS,
    grantablePermissions: {},
  };
}

function formatPermissionLabel(code: string): string {
  return code
    .split('.')
    .map((part) => part.replace(/-/g, ' '))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' · ');
}

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
  readonly formSubmitAttempted = signal(false);
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
    if (this.allowedActions()?.canAssignAccess === false) {
      return false;
    }
    if (!this.sessionStore.hasPermission('users.assign-access') || !this.canUseEmployees()) {
      return false;
    }
    return this.capabilityService?.canPerformAction('employees.actions.assignAccess') ?? true;
  });
  readonly canManage = computed(() => {
    if (this.employeeId() === null) {
      return this.canCreate();
    }
    if (this.allowedActions()?.canUpdate === false) {
      return false;
    }
    return this.canUpdate();
  });
  readonly canSave = computed(() => this.canManage() && this.form.valid && !this.saving());
  readonly inspectOnly = computed(() => this.employeeId() !== null && !this.canManage());

  readonly accessPolicy = signal<EmployeeAccessPolicy | null>(null);
  readonly allowedActions = signal<EmployeeAllowedActions | null>(null);
  readonly selectedRole = signal<OrganizationRole>('Cashier');

  readonly roles = computed(() => {
    const fromPolicy = this.accessPolicy()?.assignableRoles ?? [];
    const current = this.selectedRole();
    if (current && !fromPolicy.includes(current)) {
      return [...fromPolicy, current];
    }
    return fromPolicy;
  });

  readonly selectedRoleDescription = computed(() => {
    const role = this.selectedRole();
    return this.accessPolicy()?.roleDescriptions?.[role] ?? ROLE_DESCRIPTIONS[role] ?? '';
  });

  readonly canManageConditionalGrants = computed(
    () => this.accessPolicy()?.canManageConditionalGrants === true && this.canManage(),
  );

  readonly grantGroups = computed(() => {
    const role = this.selectedRole();
    const items = this.accessPolicy()?.grantablePermissions?.[role] ?? [];
    const groups = new Map<string, { code: string; label: string }[]>();
    for (const item of items) {
      const list = groups.get(item.group) ?? [];
      list.push({ code: item.code, label: formatPermissionLabel(item.code) });
      groups.set(item.group, list);
    }
    return [...groups.entries()].map(([group, permissions]) => ({ group, permissions }));
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
  readonly fieldError = fieldValidationMessage;

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(MAX_EMAIL)]],
    displayName: ['', [Validators.required, Validators.maxLength(MAX_NAME)]],
    role: ['Cashier' as OrganizationRole, [Validators.required]],
    branchIds: this.formBuilder.nonNullable.control<string[]>([]),
    warehouseIds: this.formBuilder.nonNullable.control<string[]>([]),
    conditionalPermissionGrants: this.formBuilder.nonNullable.control<string[]>([]),
  });

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
    this.form.controls.role.valueChanges.subscribe((role) => {
      this.selectedRole.set(role);
      this.pruneGrantsForRole(role);
    });

    const id = this.route.snapshot.paramMap.get('id');
    const policy$ = this.api.getAccessPolicy().pipe(
      catchError(() => of(fallbackAccessPolicy(this.sessionStore.activeContext()?.role))),
    );

    if (id && id !== 'new') {
      this.employeeId.set(id);
      this.api
        .getEmployee(id)
        .pipe(
          switchMap((employee) =>
            forkJoin({
              policy: policy$,
              branches: this.api.listAssignmentBranches(employee.branchIds),
              warehouses: this.api.listAssignmentWarehouses(employee.warehouseIds),
            }).pipe(map((loaded) => ({ employee, ...loaded }))),
          ),
        )
        .subscribe({
          next: ({ employee, policy, branches, warehouses }) => {
            this.applyAccessPolicy(policy);
            this.branches.set(branches);
            this.warehouses.set(warehouses);
            this.applyEmployee(employee);
            this.form.controls.email.disable();
            if (!this.canManage()) {
              this.form.controls.displayName.disable();
              this.form.controls.role.disable();
            }
            this.loading.set(false);
          },
          error: (error: unknown) => {
            this.loading.set(false);
            this.errorMessage.set(this.mapError(error, 'Unable to load employee.'));
          },
        });
      return;
    }

    forkJoin({
      policy: policy$,
      branches: this.api.listAssignmentBranches(),
      warehouses: this.api.listAssignmentWarehouses(),
    }).subscribe({
      next: ({ policy, branches, warehouses }) => {
        this.applyAccessPolicy(policy);
        this.branches.set(branches);
        this.warehouses.set(warehouses);
        const defaultRole = policy.assignableRoles.includes('Cashier')
          ? 'Cashier'
          : (policy.assignableRoles[0] ?? 'Cashier');
        this.form.controls.role.setValue(defaultRole);
        this.selectedRole.set(defaultRole);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          this.mapError(error, 'Unable to load branches and warehouses for assignment.'),
        );
      },
    });
  }

  onRoleChange(role: OrganizationRole): void {
    this.selectedRole.set(role);
    this.pruneGrantsForRole(role);
  }

  isGrantChecked(code: string): boolean {
    return this.form.controls.conditionalPermissionGrants.value.includes(code);
  }

  toggleGrant(code: string, checked: boolean): void {
    if (!this.canManageConditionalGrants()) {
      return;
    }
    const current = new Set(this.form.controls.conditionalPermissionGrants.value);
    if (checked) {
      current.add(code);
    } else {
      current.delete(code);
    }
    this.form.controls.conditionalPermissionGrants.setValue([...current]);
  }

  private applyAccessPolicy(policy: EmployeeAccessPolicy): void {
    this.accessPolicy.set({
      ...policy,
      roleDescriptions: { ...ROLE_DESCRIPTIONS, ...policy.roleDescriptions },
    });
  }

  private pruneGrantsForRole(role: OrganizationRole): void {
    const allowed = new Set(
      (this.accessPolicy()?.grantablePermissions?.[role] ?? []).map((item) => item.code),
    );
    const next = this.form.controls.conditionalPermissionGrants.value.filter((code) =>
      allowed.has(code),
    );
    this.form.controls.conditionalPermissionGrants.setValue(next);
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
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    const creating = this.employeeId() === null;
    if (!this.canManage()) {
      this.errorMessage.set('You do not have permission for this action.');
      return;
    }
    if (this.form.invalid) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();

    if (creating) {
      const createPayload = this.buildCreatePayload(value);
      this.api.createEmployee(createPayload).subscribe({
        next: (created) => {
          this.activationHandoff.set(created.activationUrl ?? null);
          if (this.canAssign()) {
            this.api
              .replaceAccessAssignments(created.id, this.buildAssignmentsPayload(value))
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

    this.api.updateEmployee(id, this.buildUpdatePayload(value)).subscribe({
      next: (updated) => {
        this.version = updated.version;
        if (!this.canAssign()) {
          this.saving.set(false);
          void this.router.navigateByUrl('/app/employees');
          return;
        }
        this.api
          .replaceAccessAssignments(updated.id, this.buildAssignmentsPayload(value))
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

  private buildCreatePayload(value: ReturnType<typeof this.form.getRawValue>): {
    email: string;
    displayName: string;
    role: OrganizationRole;
    conditionalPermissionGrants?: string[];
  } {
    const payload = {} as {
      email: string;
      displayName: string;
      role: OrganizationRole;
      conditionalPermissionGrants?: string[];
    };
    if (this.showEmail()) {
      payload.email = value.email.trim();
    }
    if (this.showDisplayName() && !this.isReadOnlyField('displayName')) {
      payload.displayName = value.displayName.trim();
    }
    if (this.showRole() && !this.isReadOnlyField('role')) {
      payload.role = value.role;
    }
    if (this.canManageConditionalGrants()) {
      payload.conditionalPermissionGrants = value.conditionalPermissionGrants;
    }
    return payload;
  }

  private buildUpdatePayload(value: ReturnType<typeof this.form.getRawValue>): {
    expectedVersion: number;
    displayName?: string;
    role?: OrganizationRole;
    conditionalPermissionGrants?: string[];
  } {
    const payload: {
      expectedVersion: number;
      displayName?: string;
      role?: OrganizationRole;
      conditionalPermissionGrants?: string[];
    } = { expectedVersion: this.version };
    if (this.showDisplayName() && !this.isReadOnlyField('displayName')) {
      payload.displayName = value.displayName.trim();
    }
    if (this.showRole() && !this.isReadOnlyField('role')) {
      payload.role = value.role;
    }
    if (this.canManageConditionalGrants()) {
      payload.conditionalPermissionGrants = value.conditionalPermissionGrants;
    }
    return payload;
  }

  private buildAssignmentsPayload(value: ReturnType<typeof this.form.getRawValue>): {
    branchIds: string[];
    warehouseIds: string[];
  } {
    return {
      branchIds: this.showBranchAccess() ? value.branchIds : [],
      warehouseIds: this.showWarehouseAccess() ? value.warehouseIds : [],
    };
  }

  private applyEmployee(employee: EmployeeRecord): void {
    this.version = employee.version;
    this.currentEmployeeStatus.set(employee.status ?? 'active');
    this.allowedActions.set(employee.allowedActions ?? null);
    const role = employee.role as OrganizationRole;
    this.selectedRole.set(role);
    this.form.patchValue({
      email: employee.email,
      displayName: employee.displayName,
      role,
      branchIds: employee.branchIds,
      warehouseIds: employee.warehouseIds,
      conditionalPermissionGrants: employee.conditionalPermissionGrants ?? [],
    });
  }

  private mapError(error: unknown, fallback: string): string {
    if (authorizationErrorCode(error) === 'VERSION_CONFLICT') {
      return 'This employee changed elsewhere. Reload and try again.';
    }
    const planned = mapPlanLimitError(error, fallback);
    if (planned.toLowerCase().includes('plan limit')) {
      return planned;
    }
    return mapAuthorizationError(error, fallback);
  }
}

