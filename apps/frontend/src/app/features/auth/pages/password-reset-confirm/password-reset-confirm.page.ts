import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthApi } from '../../data-access/auth.api';
import { AuthLayoutComponent } from '../../../../shared/ui/auth-layout/auth-layout.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';

@Component({
  selector: 'agrivio-password-reset-confirm-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, UiAlertComponent],
  templateUrl: './password-reset-confirm.page.html',
  styleUrl: './password-reset-confirm.page.scss',
})
export class PasswordResetConfirmPage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authApi = inject(AuthApi);
  private readonly route = inject(ActivatedRoute);

  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    token: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
    passwordConfirmation: ['', [Validators.required]],
  });

  readonly tokenFromLink = signal(false);

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.form.patchValue({ token });
      this.tokenFromLink.set(true);
    }
  }

  submit(): void {
    this.successMessage.set(null);
    this.errorMessage.set(null);
    const { token, password, passwordConfirmation } = this.form.getRawValue();
    if (password !== passwordConfirmation) {
      this.errorMessage.set('Passwords must match.');
      this.form.markAllAsTouched();
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Provide a valid reset token and password (12–128 characters).');
      return;
    }
    this.submitting.set(true);
    this.authApi.confirmPasswordReset(token, password).subscribe({
      next: () => {
        this.submitting.set(false);
        this.successMessage.set('Password updated. You can sign in with the new password.');
        this.form.patchValue({ password: '' });
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set('Reset failed. The token may be invalid, expired, or already used.');
      },
    });
  }
}
