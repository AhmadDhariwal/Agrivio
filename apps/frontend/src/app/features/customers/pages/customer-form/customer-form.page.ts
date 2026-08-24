import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { CustomersApi } from '../../data-access/customers.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';
import {
  mapPlanLimitError,
  softWarningMessage,
} from '../../../../core/plan-limits/plan-limit-feedback';
import { CustomerRecord } from '../../models/customers.models';

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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly customerId = signal<string | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly postingOpening = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly softWarning = signal<string | null>(null);
  readonly openingPosted = signal(false);
  readonly derivedReceivable = signal<string | null>(null);
  readonly derivedAdvance = signal<string | null>(null);
  readonly canManage = computed(() => this.sessionStore.hasPermission('customers.manage'));
  readonly canPostOpening = computed(() =>
    this.sessionStore.hasPermission('customers.opening-balance.post'),
  );
  private version = 1;

  readonly fieldRequired = hasRequiredValidator;

  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    phone: [''],
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
    if (!this.canManage() || this.form.invalid) {
      this.form.markAllAsTouched();
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
          name: value.name,
          ...(value.phone.trim() === '' ? {} : { phone: value.phone }),
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

    this.api
      .updateCustomer(this.customerId()!, {
        expectedVersion: this.version,
        name: value.name,
        phone: value.phone,
        customerType: value.customerType,
        priceTier: value.priceTier,
        status: value.status,
      })
      .pipe(
        switchMap((customer) =>
          this.api.updateCreditPolicy(this.customerId()!, {
            expectedVersion: customer.version,
            creditEnabled: value.creditEnabled,
            creditLimit,
            creditLimitBehaviour: value.creditLimitBehaviour,
          }),
        ),
      )
      .subscribe({
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
