import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthApi } from '../../data-access/auth.api';
import { AuthLayoutComponent } from '../../../../shared/ui/auth-layout/auth-layout.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { hasRequiredValidator } from '../../../../shared/form/form-field.util';

@Component({
  selector: 'agrivio-password-reset-request-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AuthLayoutComponent,
    UiAlertComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './password-reset-request.page.html',
  styleUrl: './password-reset-request.page.scss',
})
export class PasswordResetRequestPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authApi = inject(AuthApi);

  readonly submitting = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly fieldRequired = hasRequiredValidator;

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  submit(): void {
    this.successMessage.set(null);
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Enter a valid email address.');
      return;
    }

    this.submitting.set(true);
    this.authApi.requestPasswordReset(this.form.getRawValue().email).subscribe({
      next: () => {
        this.submitting.set(false);
        this.successMessage.set(
          'If an account exists for that email, reset instructions have been sent.',
        );
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set('Unable to submit the password reset request.');
      },
    });
  }
}
