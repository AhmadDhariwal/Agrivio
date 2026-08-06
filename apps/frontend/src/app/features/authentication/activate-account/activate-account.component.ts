import { Component, inject, signal, OnInit } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { OnboardingApiService } from '../../public/onboarding-api.service';

type ActivateState = 'idle' | 'submitting' | 'success' | 'error';

function passwordsMatchValidator(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password');
  const confirm = control.get('confirmPassword');
  if (!password || !confirm) return null;
  return password.value === confirm.value ? null : { passwordMismatch: true };
}

@Component({
  selector: 'agrivio-activate-account',
  imports: [ReactiveFormsModule, RouterModule],
  templateUrl: './activate-account.component.html',
})
export class ActivateAccountComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(OnboardingApiService);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<ActivateState>('idle');
  readonly errorMessage = signal('');
  private token = '';

  readonly form = this.fb.group(
    {
      password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(128)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatchValidator },
  );

  ngOnInit(): void {
    // Token is passed as a query parameter: /activate?token=...
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.errorMessage.set('Activation link is invalid or missing the token parameter.');
      this.state.set('error');
    }
  }

  submit(): void {
    if (this.form.invalid || this.state() === 'submitting' || !this.token) return;

    this.state.set('submitting');
    this.errorMessage.set('');

    const { password } = this.form.getRawValue();

    this.api.activateAccount({ token: this.token, password: password ?? '' }).subscribe({
      next: () => {
        this.state.set('success');
      },
      error: (err: unknown) => {
        const apiErr = err as { error?: { error?: { code?: string; message?: string } } };
        const code: string = apiErr?.error?.error?.code ?? '';
        if (code === 'TOKEN_EXPIRED') {
          this.errorMessage.set('Your activation link has expired. Please contact support.');
        } else if (code === 'NOT_FOUND') {
          this.errorMessage.set('Activation link not found. It may have already been used.');
        } else {
          this.errorMessage.set(
            apiErr?.error?.error?.message ?? 'Activation failed. Please try again.',
          );
        }
        this.state.set('error');
      },
    });
  }

  get isSubmitting(): boolean {
    return this.state() === 'submitting';
  }

  get isSuccess(): boolean {
    return this.state() === 'success';
  }

  get hasTokenError(): boolean {
    return this.state() === 'error' && !this.token;
  }
}
