import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CustomerPaymentsApi } from '../../data-access/customer-payments.api';
import { CustomerPaymentRecord } from '../../models/customer-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-customer-payments-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './customer-payments.page.html',
  styleUrl: './customer-payments.page.scss',
})
export class CustomerPaymentsPage {
  private readonly api = inject(CustomerPaymentsApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly items = signal<CustomerPaymentRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly canView = computed(() => this.sessionStore.hasPermission('customer-payments.view'));
  readonly canPost = computed(() => this.sessionStore.hasPermission('customer-payments.post'));

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.errorMessage.set('You do not have permission to view customer payments.');
      return;
    }
    this.loading.set(true);
    this.api.listCustomerPayments().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load customer payments.')
            : 'Unable to load customer payments.',
        );
      },
    });
  }
}
