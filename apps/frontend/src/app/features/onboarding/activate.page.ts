import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthApi, AuthSessionSnapshot } from '../auth/auth.api';
import { AuthSessionStore } from '../auth/auth-session.store';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'agrivio-activate-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './activate.page.html',
  styleUrl: './activate.page.scss',
})
export class ActivatePage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly authApi = inject(AuthApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    token: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
  });

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.form.patchValue({ token });
    }
  }

  submit(): void {
    this.successMessage.set(null);
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Provide a valid activation token and password (12–128 characters).');
      return;
    }

    this.submitting.set(true);
    this.authApi
      .postWithCsrf(`${environment.publicApiBaseUrl}/api/v1/auth/activate`, this.form.getRawValue())
      .subscribe({
        next: (response) => {
          const payload = response as { data?: { session?: AuthSessionSnapshot } };
          if (payload.data?.session !== undefined) {
            this.sessionStore.applySession(payload.data.session);
          }
          this.submitting.set(false);
          this.successMessage.set('Owner account activated. Continue to select your active context.');
          this.form.patchValue({ password: '' });
          void this.router.navigateByUrl('/context');
        },
        error: () => {
          this.submitting.set(false);
          this.errorMessage.set(
            'Activation failed. The token may be invalid, expired, or already used.',
          );
        },
      });
  }
}
