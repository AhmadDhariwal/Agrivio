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
const MAX_PREFIX = 20;
const INVOICE_PREFIX_PATTERN = /^[A-Za-z0-9-]{1,20}$/;

@Component({
  selector: 'agrivio-branch-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './branch-form.page.html',
  styleUrl: './branch-form.page.scss',
})
export class BranchFormPage {
  private readonly api = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly branchId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);

  readonly isBranchesEnabled = computed(
    () => this.capabilityService?.canUseModule('branches') ?? true,
  );
  readonly canManage = computed(
    () => this.sessionStore.hasPermission('branches.manage') && this.isBranchesEnabled(),
  );
  readonly canPerformSave = computed(() => {
    if (!this.canManage()) return false;
    const isEdit = this.branchId() !== null;
    return isEdit
      ? (this.capabilityService?.canPerformAction('branches.actions.edit') ?? true)
      : (this.capabilityService?.canPerformAction('branches.actions.create') ?? true);
  });
  readonly canSave = computed(
    () => this.canPerformSave() && this.form.valid && !this.saving(),
  );

  readonly showCodeField = computed(
    () => this.capabilityService?.canViewField('branches.fields.code') ?? true,
  );
  readonly showStatusField = computed(
    () => this.capabilityService?.canViewField('branches.fields.status') ?? true,
  );

  private version = 1;

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(MAX_NAME)]],
    invoicePrefix: [
      '',
      [Validators.required, Validators.maxLength(MAX_PREFIX), Validators.pattern(INVOICE_PREFIX_PATTERN)],
    ],
    code: ['', [Validators.maxLength(MAX_CODE)]],
    status: ['active'],
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.branchId.set(id);
      this.loading.set(true);
      this.api.getBranch(id).subscribe({
        next: (branch) => {
          this.version = branch.version;
          this.form.patchValue({
            name: branch.name,
            invoicePrefix: branch.invoicePrefix,
            code: branch.code,
            status: branch.status,
          });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load branch.'));
        },
      });
    }
  }

  get previewPrefix(): string {
    const raw = this.form.controls.invoicePrefix.value.trim();
    return raw ? raw.toUpperCase() : 'BRN';
  }

  get previewInvoiceNumber(): string {
    return `${this.previewPrefix}-000001`;
  }

  save(): void {
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    if (!this.canPerformSave()) {
      this.errorMessage.set('You do not have permission to perform this branch operation.');
      return;
    }
    if (this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    const normalizedPrefix = value.invoicePrefix.trim().toUpperCase();
    const currentBranchId = this.branchId();
    const request$ =
      currentBranchId === null
        ? this.api.createBranch({
            name: value.name.trim(),
            invoicePrefix: normalizedPrefix,
            ...(value.code.trim() === '' ? {} : { code: value.code.trim() }),
          })
        : this.api.updateBranch(currentBranchId, {
            expectedVersion: this.version,
            name: value.name.trim(),
            invoicePrefix: normalizedPrefix,
            code: value.code.trim(),
            status: value.status,
          });

    request$.subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigateByUrl('/app/branches');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to save branch.'));
      },
    });
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This branch changed elsewhere. Reload and try again.';
    }
    return mapPlanLimitError(error, error.error?.error?.message ?? fallback);
  }
}