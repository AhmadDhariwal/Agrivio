import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BillingRecordSummary, SubscriptionApi } from '../subscriptions/subscription.api';

@Component({
  selector: 'agrivio-platform-billing-review-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './billing-review.page.html',
  styleUrl: './billing-review.page.scss',
})
export class PlatformBillingReviewPage {
  private readonly subscriptionApi = inject(SubscriptionApi);
  private readonly formBuilder = inject(FormBuilder);

  readonly items = signal<BillingRecordSummary[]>([]);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly rejectForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(3)]],
  });

  constructor() {
    this.reload();
  }

  reload(): void {
    this.subscriptionApi.listPlatformBillingRecords().subscribe({
      next: (items) => this.items.set(items),
      error: () => this.errorMessage.set('Unable to load billing review queue.'),
    });
  }

  approve(item: BillingRecordSummary): void {
    this.errorMessage.set(null);
    this.subscriptionApi.approveBilling(item.id, item.version).subscribe({
      next: () => {
        this.successMessage.set(`Approved ${item.id}`);
        this.reload();
      },
      error: () => this.errorMessage.set('Approve failed.'),
    });
  }

  reject(item: BillingRecordSummary): void {
    this.errorMessage.set(null);
    if (this.rejectForm.invalid) {
      this.rejectForm.markAllAsTouched();
      this.errorMessage.set('Rejection reason is required.');
      return;
    }
    this.subscriptionApi
      .rejectBilling(item.id, item.version, this.rejectForm.getRawValue().reason)
      .subscribe({
        next: () => {
          this.successMessage.set(`Rejected ${item.id}`);
          this.reload();
        },
        error: () => this.errorMessage.set('Reject failed.'),
      });
  }
}
