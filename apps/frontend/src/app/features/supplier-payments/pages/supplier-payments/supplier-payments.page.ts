import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import { SupplierPaymentRecord } from '../../models/supplier-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-supplier-payments-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './supplier-payments.page.html',
  styleUrl: './supplier-payments.page.scss',
})
export class SupplierPaymentsPage {
  private readonly api = inject(SupplierPaymentsApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly items = signal<SupplierPaymentRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly canView = computed(() => this.sessionStore.hasPermission('supplier-payments.view'));
  readonly canPost = computed(() => this.sessionStore.hasPermission('supplier-payments.post'));

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      this.errorMessage.set('You do not have permission to view supplier payments.');
      return;
    }
    this.loading.set(true);
    this.api.listSupplierPayments().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load supplier payments.')
            : 'Unable to load supplier payments.',
        );
      },
    });
  }
}
