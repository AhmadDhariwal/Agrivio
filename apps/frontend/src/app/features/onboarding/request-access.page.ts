import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'agrivio-request-access-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './request-access.page.html',
  styleUrl: './request-access.page.scss',
})
export class RequestAccessPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly http = inject(HttpClient);

  readonly submitting = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

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
    this.http
      .post(`${environment.publicApiBaseUrl}/api/v1/organization-activation-requests`, this.form.getRawValue())
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
