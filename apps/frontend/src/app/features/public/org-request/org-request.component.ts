import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { OnboardingApiService } from '../onboarding-api.service';

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

@Component({
  selector: 'agrivio-org-request',
  imports: [ReactiveFormsModule, RouterModule],
  templateUrl: './org-request.component.html',
})
export class OrgRequestComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(OnboardingApiService);
  private readonly router = inject(Router);

  readonly state = signal<SubmitState>('idle');
  readonly errorMessage = signal('');
  readonly organizationId = signal('');

  readonly form = this.fb.group({
    orgName: ['', [Validators.required, Validators.maxLength(200)]],
    ownerEmail: ['', [Validators.required, Validators.email]],
    ownerName: ['', [Validators.required, Validators.maxLength(200)]],
    timezone: ['Asia/Karachi'],
  });

  submit(): void {
    if (this.form.invalid || this.state() === 'submitting') return;

    this.state.set('submitting');
    this.errorMessage.set('');

    const idempotencyKey = crypto.randomUUID();
    const value = this.form.getRawValue();

    this.api
      .submitOrgRequest(
        {
          orgName: value.orgName ?? '',
          ownerEmail: value.ownerEmail ?? '',
          ownerName: value.ownerName ?? '',
          timezone: value.timezone ?? 'Asia/Karachi',
        },
        idempotencyKey,
      )
      .subscribe({
        next: (res) => {
          this.organizationId.set(res.data.organizationId);
          this.state.set('success');
        },
        error: (err: unknown) => {
          const apiErr = err as { error?: { error?: { message?: string } } };
          this.errorMessage.set(
            apiErr?.error?.error?.message ?? 'Submission failed. Please try again.',
          );
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
}
