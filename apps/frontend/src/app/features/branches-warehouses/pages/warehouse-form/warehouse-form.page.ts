import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { BranchesWarehousesApi } from '../../data-access/branches-warehouses.api';
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

const MAX_NAME = 120;
const MAX_CODE = 40;

@Component({
  selector: 'agrivio-warehouse-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './warehouse-form.page.html',
  styleUrl: './warehouse-form.page.scss',
})
export class WarehouseFormPage {
  private readonly api = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly warehouseId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);

  readonly isWarehousesEnabled = computed(
    () => this.capabilityService?.canUseModule('warehouses') ?? true,
  );
  readonly canManage = computed(
    () => this.sessionStore.hasPermission('warehouses.manage') && this.isWarehousesEnabled(),
  );
  readonly canPerformSave = computed(() => {
    if (!this.canManage()) return false;
    const isEdit = this.warehouseId() !== null;
    return isEdit
      ? (this.capabilityService?.canPerformAction('warehouses.actions.edit') ?? true)
      : (this.capabilityService?.canPerformAction('warehouses.actions.create') ?? true);
  });
  readonly canSave = computed(
    () => this.canPerformSave() && this.form.valid && !this.saving(),
  );
  readonly showCode = computed(
    () => this.capabilityService?.canViewField('warehouses.fields.code') ?? true,
  );
  readonly isCodeEditable = computed(
    () => this.capabilityService?.canEditField('warehouses.fields.code') ?? true,
  );

  private version = 1;

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(MAX_NAME)]],
    code: ['', [Validators.maxLength(MAX_CODE)]],
    status: ['active'],
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.warehouseId.set(id);
      this.loading.set(true);
      this.api.getWarehouse(id).subscribe({
        next: (warehouse) => {
          this.version = warehouse.version;
          this.form.patchValue({
            name: warehouse.name,
            code: warehouse.code ?? '',
            status: warehouse.status ?? 'active',
          });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load warehouse.'));
        },
      });
    }
  }

  save(): void {
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    if (!this.canPerformSave()) {
      this.errorMessage.set('You do not have permission to perform this warehouse operation.');
      return;
    }
    if (this.form.invalid) {
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    const id = this.warehouseId();
    const includeCode = this.showCode() && this.isCodeEditable();

    const request$ =
      id === null
        ? this.api.createWarehouse({
            name: value.name.trim(),
            ...(includeCode && value.code.trim() !== '' ? { code: value.code.trim() } : {}),
          })
        : this.api.updateWarehouse(id, {
            expectedVersion: this.version,
            name: value.name.trim(),
            ...(includeCode ? { code: value.code.trim() } : {}),
            status: value.status,
          });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigateByUrl('/app/warehouses');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to save warehouse.'));
      },
    });
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This warehouse changed elsewhere. Reload and try again.';
    }
    return mapPlanLimitError(error, error.error?.error?.message ?? fallback);
  }
}
