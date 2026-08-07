import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'agrivio-activate-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './activate.page.html',
  styleUrl: './activate.page.scss',
})
export class ActivatePage implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

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
    this.http.post(`${environment.publicApiBaseUrl}/api/v1/auth/activate`, this.form.getRawValue()).subscribe({
      next: () => {
        this.submitting.set(false);
        this.successMessage.set('Owner account activated. You can sign in once session authentication is available.');
        this.form.patchValue({ password: '' });
      },
      error: () => {
        this.submitting.set(false);
        this.errorMessage.set('Activation failed. The token may be invalid, expired, or already used.');
      },
    });
  }
}
