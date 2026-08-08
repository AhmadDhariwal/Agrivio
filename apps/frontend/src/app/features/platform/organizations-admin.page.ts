import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  PlatformOrganizationSummary,
  PlatformOrganizationsApi,
} from './platform-organizations.api';

@Component({
  selector: 'agrivio-platform-organizations-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './organizations-admin.page.html',
  styleUrl: './organizations-admin.page.scss',
})
export class PlatformOrganizationsPage {
  private readonly api = inject(PlatformOrganizationsApi);
  private readonly formBuilder = inject(FormBuilder);

  readonly items = signal<PlatformOrganizationSummary[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly activationToken = signal<string | null>(null);

  readonly rejectForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(3)]],
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.api.list().subscribe({
      next: (items) => this.items.set(items),
      error: () => this.errorMessage.set('Unable to load organizations.'),
    });
  }

  approve(item: PlatformOrganizationSummary): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.activationToken.set(null);
    this.api.approve(item.id).subscribe({
      next: (result) => {
        this.successMessage.set(`Approved ${item.name}`);
        this.activationToken.set(result.activationToken);
        this.reload();
      },
      error: () => this.errorMessage.set('Approve failed.'),
    });
  }

  reject(item: PlatformOrganizationSummary): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    if (this.rejectForm.invalid) {
      this.rejectForm.markAllAsTouched();
      this.errorMessage.set('Rejection reason is required.');
      return;
    }
    this.api.reject(item.id, this.rejectForm.getRawValue().reason).subscribe({
      next: () => {
        this.successMessage.set(`Rejected ${item.name}`);
        this.reload();
      },
      error: () => this.errorMessage.set('Reject failed.'),
    });
  }
}
