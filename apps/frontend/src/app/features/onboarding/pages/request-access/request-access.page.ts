import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthApi } from '../../../auth/data-access/auth.api';
import { environment } from '../../../../../environments/environment';
import { AuthLayoutComponent } from '../../../../shared/ui/auth-layout/auth-layout.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';

@Component({
  selector: 'agrivio-request-access-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, UiAlertComponent, UiFieldLabelComponent],
  templateUrl: './request-access.page.html',
  styleUrl: './request-access.page.scss',
})
export class RequestAccessPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authApi = inject(AuthApi);

  readonly submitting = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly fieldRequired = hasRequiredValidator;

  readonly form = this.formBuilder.nonNullable.group({
    organizationName: ['', [Validators.required, Validators.maxLength(200)]],
    ownerEmail: ['', [Validators.required, Validators.email]],
    ownerDisplayName: ['', [Validators.required, Validators.maxLength(200)]],
    timezone: ['Asia/Karachi'],
  });

  submit(): void {
    this.successMessage.set(null);
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Please complete the required fields.');
      return;
    }

    this.submitting.set(true);
    this.authApi
      .postWithCsrf(
        `${environment.publicApiBaseUrl}/api/v1/organization-activation-requests`,
        this.form.getRawValue(),
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.successMessage.set(
            'Request submitted. A Super Admin will review it before Owner activation.',
          );
          this.form.reset({
            organizationName: '',
            ownerEmail: '',
            ownerDisplayName: '',
            timezone: 'Asia/Karachi',
          });
        },
        error: () => {
          this.submitting.set(false);
          this.errorMessage.set('Unable to submit the activation request.');
        },
      });
  }
}
