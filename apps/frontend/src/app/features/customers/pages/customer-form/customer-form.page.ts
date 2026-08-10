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

@Component({
  selector: 'agrivio-customer-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
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
  readonly errorMessage = signal<string | null>(null);
  readonly canManage = computed(() => this.sessionStore.hasPermission('customers.manage'));
  private version = 1;

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

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.customerId.set(id);
      this.loading.set(true);
      this.api.getCustomer(id).subscribe({
        next: (customer) => {
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
          next: () => {
            this.saving.set(false);
            void this.router.navigateByUrl('/app/customers');
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

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This customer changed elsewhere. Reload and try again.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
