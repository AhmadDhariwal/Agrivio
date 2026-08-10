import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApi } from './auth.api';
import { AuthSessionStore } from './auth-session.store';
import { AuthLayoutComponent } from '../../shared/ui/auth-layout.component';
import { UiAlertComponent } from '../../shared/ui/ui-alert.component';

@Component({
  selector: 'agrivio-login-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, UiAlertComponent],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authApi = inject(AuthApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(12)]],
  });

  submit(): void {
    this.successMessage.set(null);
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Enter a valid email and password.');
      return;
    }

    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    this.authApi.login(email, password).subscribe({
      next: (result) => {
        this.sessionStore.applySession(result.session);
        this.submitting.set(false);
        this.successMessage.set('Signed in successfully.');
        this.form.patchValue({ password: '' });
        void this.router.navigateByUrl('/context');
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set('Sign-in failed. Check your email and password.');
      },
    });
  }
}
