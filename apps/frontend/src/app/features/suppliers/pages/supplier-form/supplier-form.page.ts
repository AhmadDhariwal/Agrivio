import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { SuppliersApi } from '../../data-access/suppliers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';
import {
  mapPlanLimitError,
  softWarningMessage,
} from '../../../../core/plan-limits/plan-limit-feedback';
import { SupplierRecord } from '../../models/suppliers.models';

@Component({
  selector: 'agrivio-supplier-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './supplier-form.page.html',
  styleUrl: './supplier-form.page.scss',
})
export class SupplierFormPage {
  private readonly api = inject(SuppliersApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly supplierId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly postingOpening = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly softWarning = signal<string | null>(null);
  readonly openingPosted = signal(false);

  readonly canUseSuppliers = computed(
    () => this.capabilityService?.canUseModule('suppliers') ?? true,
  );

  readonly canManage = computed(() => {
    const hasPerm = this.sessionStore.hasPermission('suppliers.manage');
    if (!hasPerm || !this.canUseSuppliers()) return false;
    const isEdit = Boolean(this.supplierId());
    const actionKey = isEdit ? 'suppliers.actions.edit' : 'suppliers.actions.create';
    return this.capabilityService?.canPerformAction(actionKey) ?? true;
  });

  readonly canPostOpening = computed(() => {
    const hasPerm = this.sessionStore.hasPermission('suppliers.opening-balance.post');
    const actionOk =
      this.capabilityService?.canPerformAction('suppliers.actions.postOpeningBalance') ?? true;
    return hasPerm && this.canUseSuppliers() && actionOk;
  });

  readonly showContactName = computed(
    () => this.capabilityService?.canViewField('suppliers.fields.contactName') ?? true,
  );
  readonly showPhone = computed(
    () => this.capabilityService?.canViewField('suppliers.fields.phone') ?? true,
  );
  readonly showEmail = computed(
    () => this.capabilityService?.canViewField('suppliers.fields.email') ?? true,
  );

  private version = 1;

  readonly fieldRequired = hasRequiredValidator;

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: [''],
    contactName: [''],
    email: [''],
    status: ['active'],
  });

  readonly openingForm = this.formBuilder.nonNullable.group({
    kind: ['payable' as string, [Validators.required]],
    amount: ['', [Validators.required]],
  });

  constructor() {
    this.checkFieldPermissions();
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.supplierId.set(id);
      this.loading.set(true);
      this.api.getSupplier(id).subscribe({
        next: (supplier) => {
          this.applySupplier(supplier);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load supplier.'));
        },
      });
    }
  }

  save(): void {
    if (!this.canManage() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.softWarning.set(null);
    const value = this.form.getRawValue();
    const request$ =
      this.supplierId() === null
        ? this.api.createSupplier({
            name: value.name,
            phone: value.phone,
            contactName: value.contactName,
            email: value.email,
          })
        : this.api.updateSupplier(this.supplierId()!, {
            expectedVersion: this.version,
            name: value.name,
            phone: value.phone,
            contactName: value.contactName,
            email: value.email,
            status: value.status,
          });

    request$.subscribe({
      next: (record) => {
        this.saving.set(false);
        if (this.supplierId() === null) {
          const warning = softWarningMessage(record.softWarning);
          this.softWarning.set(warning);
          if (warning !== null) {
            return;
          }
        }
        void this.router.navigateByUrl('/app/suppliers');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to save supplier.'));
      },
    });
  }

  postOpening(): void {
    const id = this.supplierId();
    if (!id || !this.canPostOpening() || this.openingForm.invalid || this.openingPosted()) {
      this.openingForm.markAllAsTouched();
      return;
    }
    this.postingOpening.set(true);
    this.errorMessage.set(null);
    const value = this.openingForm.getRawValue();
    this.api
      .postOpeningBalance(
        id,
        {
          kind: value.kind,
          amount: { amount: value.amount.trim(), currency: 'PKR' },
        },
        crypto.randomUUID(),
      )
      .subscribe({
        next: (supplier) => {
          this.postingOpening.set(false);
          this.applySupplier(supplier);
        },
        error: (error: unknown) => {
          this.postingOpening.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to post opening balance.'));
        },
      });
  }

  private applySupplier(supplier: SupplierRecord): void {
    this.version = supplier.version;
    this.form.patchValue({
      name: supplier.name,
      phone: supplier.phone,
      contactName: supplier.contactName,
      email: supplier.email,
      status: supplier.status,
    });
    this.openingPosted.set(Boolean(supplier.openingBalance));
    this.checkFieldPermissions();
    if (supplier.openingBalance) {
      this.openingForm.patchValue({
        kind: supplier.openingBalance.kind,
        amount: supplier.openingBalance.amount.amount,
      });
      this.openingForm.disable();
    }
  }

  private checkFieldPermissions(): void {
    if (this.capabilityService && !this.capabilityService.canEditField('suppliers.fields.name')) {
      this.form.controls.name.disable();
    }
    if (this.capabilityService && !this.capabilityService.canEditField('suppliers.fields.contactName')) {
      this.form.controls.contactName.disable();
    }
    if (this.capabilityService && !this.capabilityService.canEditField('suppliers.fields.phone')) {
      this.form.controls.phone.disable();
    }
    if (this.capabilityService && !this.capabilityService.canEditField('suppliers.fields.email')) {
      this.form.controls.email.disable();
    }
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This supplier changed elsewhere. Reload and try again.';
    }
    return mapPlanLimitError(error, error.error?.error?.message ?? fallback);
  }
}
