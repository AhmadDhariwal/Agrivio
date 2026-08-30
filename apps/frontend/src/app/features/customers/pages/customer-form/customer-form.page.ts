import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { CustomersApi } from '../../data-access/customers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import {
  fieldValidationMessage,
  hasRequiredValidator,
} from '../../../../shared/form/form-field.util';
import {
  mapPlanLimitError,
  softWarningMessage,
} from '../../../../core/plan-limits/plan-limit-feedback';
import { CustomerRecord } from '../../models/customers.models';

const MAX_NAME = 160;
const MAX_PHONE = 32;

@Component({
  selector: 'agrivio-customer-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './customer-form.page.html',
  styleUrl: './customer-form.page.scss',
})
export class CustomerFormPage {
  private readonly api = inject(CustomersApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly customerId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly postingOpening = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly softWarning = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);
  readonly openingPosted = signal(false);
  readonly derivedReceivable = signal<string | null>(null);
  readonly derivedAdvance = signal<string | null>(null);

  readonly canUseCustomers = computed(
    () => this.capabilityService?.canUseModule('customers') ?? true,
  );

  readonly canManage = computed(() => {
    const hasPerm = this.sessionStore.hasPermission('customers.manage');
    if (!hasPerm || !this.canUseCustomers()) return false;
    const isEdit = Boolean(this.customerId());
    const actionKey = isEdit ? 'customers.actions.edit' : 'customers.actions.create';
    return this.capabilityService?.canPerformAction(actionKey) ?? true;
  });

  readonly canPostOpening = computed(() => {
    const hasPerm = this.sessionStore.hasPermission('customers.opening-balance.post');
    const actionOk =
      this.capabilityService?.canPerformAction('customers.actions.postOpeningBalance') ?? true;
    return hasPerm && this.canUseCustomers() && actionOk;
  });

  readonly canEditCreditPolicy = computed(() => {
    const hasPerm = this.sessionStore.hasPermission('customers.credit-policy.manage');
    const actionOk =
      this.capabilityService?.canPerformAction('customers.actions.editCreditPolicy') ?? true;
    const fieldEditable =
      this.capabilityService?.canEditField('customers.fields.creditEnabled') ?? true;
    return hasPerm && this.canUseCustomers() && actionOk && fieldEditable;
  });

  readonly canSave = computed(() => this.canManage() && this.form.valid && !this.saving());

  readonly showCreditSection = computed(
    () => this.capabilityService?.canUseView('customers.features.creditSection') ?? true,
  );
  readonly showPhone = computed(
    () => this.capabilityService?.canViewField('customers.fields.phone') ?? true,
  );
  readonly showPriceTier = computed(
    () => this.capabilityService?.canViewField('customers.fields.priceTier') ?? true,
  );
  readonly showCreditLimit = computed(
    () => this.capabilityService?.canViewField('customers.fields.creditLimit') ?? true,
  );
  readonly showCreditLimitBehaviour = computed(
    () => this.capabilityService?.canViewField('customers.fields.creditLimitBehaviour') ?? true,
  );

  private version = 1;

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(MAX_NAME)]],
    phone: ['', [Validators.maxLength(MAX_PHONE)]],
    customerType: ['individual' as string, [Validators.required]],
    priceTier: ['retail' as string, [Validators.required]],
    creditEnabled: [false],
    creditLimitAmount: ['0'],
    creditLimitBehaviour: ['warning' as string],
    status: ['active'],
  });

  readonly openingForm = this.formBuilder.nonNullable.group({
    kind: ['receivable' as string, [Validators.required]],
    amount: ['', [Validators.required]],
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.customerId.set(id);
      this.loading.set(true);
      this.api.getCustomer(id).subscribe({
        next: (customer) => {
          this.applyCustomer(customer);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load customer.'));
        },
      });
    }
  }

  save(): void {
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    if (!this.canManage() || this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.softWarning.set(null);
    const value = this.form.getRawValue();
    const creditLimit = {
      amount: value.creditLimitAmount.trim() === '' ? '0' : value.creditLimitAmount.trim(),
      currency: 'PKR',
    };

    if (this.customerId() === null) {
      this.api
        .createCustomer({
          name: value.name.trim(),
          ...(value.phone.trim() === '' ? {} : { phone: value.phone.trim() }),
          customerType: value.customerType,
          priceTier: value.priceTier,
          creditEnabled: value.creditEnabled,
          creditLimit,
          creditLimitBehaviour: value.creditLimitBehaviour,
        })
        .subscribe({
          next: (created) => {
            this.saving.set(false);
            const warning = softWarningMessage(created.softWarning);
            this.softWarning.set(warning);
            if (warning === null) {
              void this.router.navigateByUrl('/app/customers');
            }
          },
          error: (error: unknown) => {
            this.saving.set(false);
            this.errorMessage.set(this.mapError(error, 'Unable to save customer.'));
          },
        });
      return;
    }

    const update$ = this.api.updateCustomer(
      this.customerId()!,
      this.buildCustomerUpdatePayload(value),
    );

    const pipeline$ = this.canEditCreditPolicy()
      ? update$.pipe(
          switchMap((customer) =>
            this.api.updateCreditPolicy(this.customerId()!, {
              expectedVersion: customer.version,
              creditEnabled: value.creditEnabled,
              creditLimit,
              creditLimitBehaviour: value.creditLimitBehaviour,
            }),
          ),
        )
      : update$;

    pipeline$.subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigateByUrl('/app/customers');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to save customer.'));
      },
    });
  }

  postOpening(): void {
    const id = this.customerId();
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
        next: (customer) => {
          this.postingOpening.set(false);
          this.applyCustomer(customer);
        },
        error: (error: unknown) => {
          this.postingOpening.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to post opening balance.'));
        },
      });
  }

  private buildCustomerUpdatePayload(
    value: ReturnType<typeof this.form.getRawValue>,
  ): {
    expectedVersion: number;
    name?: string;
    phone?: string;
    customerType?: string;
    priceTier?: string;
    status?: string;
  } {
    const payload: {
      expectedVersion: number;
      name?: string;
      phone?: string;
      customerType?: string;
      priceTier?: string;
      status?: string;
    } = { expectedVersion: this.version };
    const controls = this.form.controls;

    if (!controls.name.disabled) {
      payload.name = value.name.trim();
    }
    if (!controls.phone.disabled) {
      payload.phone = value.phone.trim();
    }
    if (!controls.customerType.disabled) {
      payload.customerType = value.customerType;
    }
    if (!controls.priceTier.disabled) {
      payload.priceTier = value.priceTier;
    }
    if (!controls.status.disabled) {
      payload.status = value.status;
    }

    return payload;
  }

  private applyCustomer(customer: CustomerRecord): void {
    this.version = customer.version;
    this.form.patchValue({
      name: customer.name,
      phone: customer.phone,
      customerType: customer.customerType,
      priceTier: customer.priceTier,
      creditEnabled: customer.creditEnabled,
      creditLimitAmount: customer.creditLimit.amount,
      creditLimitBehaviour: customer.creditLimitBehaviour,
      status: customer.status,
    });
    if (this.customerId() && !this.canEditCreditPolicy()) {
      this.form.controls.creditEnabled.disable();
      this.form.controls.creditLimitAmount.disable();
      this.form.controls.creditLimitBehaviour.disable();
    }
    if (this.capabilityService && !this.capabilityService.canEditField('customers.fields.name')) {
      this.form.controls.name.disable();
    }
    if (this.capabilityService && !this.capabilityService.canEditField('customers.fields.phone')) {
      this.form.controls.phone.disable();
    }
    if (this.capabilityService && !this.capabilityService.canEditField('customers.fields.customerType')) {
      this.form.controls.customerType.disable();
    }
    if (this.capabilityService && !this.capabilityService.canEditField('customers.fields.priceTier')) {
      this.form.controls.priceTier.disable();
    }
    if (this.capabilityService && !this.capabilityService.canEditField('customers.fields.creditLimit')) {
      this.form.controls.creditLimitAmount.disable();
    }
    if (this.capabilityService && !this.capabilityService.canEditField('customers.fields.creditLimitBehaviour')) {
      this.form.controls.creditLimitBehaviour.disable();
    }
    this.openingPosted.set(Boolean(customer.openingBalance));
    this.derivedReceivable.set(customer.derivedBalances?.receivable.amount ?? null);
    this.derivedAdvance.set(customer.derivedBalances?.advance.amount ?? null);
    if (customer.openingBalance) {
      this.openingForm.patchValue({
        kind: customer.openingBalance.kind,
        amount: customer.openingBalance.amount.amount,
      });
      this.openingForm.disable();
    }
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This customer changed elsewhere. Reload and try again.';
    }
    return mapPlanLimitError(error, error.error?.error?.message ?? fallback);
  }
}
