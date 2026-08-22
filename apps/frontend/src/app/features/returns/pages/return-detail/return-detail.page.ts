import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, forkJoin, of } from 'rxjs';
import { ReturnsApi } from '../../data-access/returns.api';
import {
  SalesReturnRecord,
  returnResolutionLabel,
  returnTypeLabel,
} from '../../models/returns.models';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { CustomerRecord } from '../../../customers/models/customers.models';
import {
  BranchesWarehousesApi,
  WarehouseRecord,
} from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-return-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './return-detail.page.html',
  styleUrl: './return-detail.page.scss',
})
export class ReturnDetailPage {
  private readonly api = inject(ReturnsApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly reversing = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly record = signal<SalesReturnRecord | null>(null);
  readonly reverseReason = signal('');
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly customers = signal<CustomerRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);
  readonly canView = computed(() => this.sessionStore.hasPermission('returns.view'));
  readonly canReverse = computed(() => this.sessionStore.hasPermission('returns.reverse'));

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.canView()) {
      this.loading.set(false);
      return;
    }
    forkJoin({
      record: this.api.getReturn(id),
      warehouses: this.locationsApi.listWarehouseOptions().pipe(catchError(() => of([]))),
      customers: this.customersApi.searchCustomerOptions().pipe(catchError(() => of([]))),
      accounts: this.accountsApi.listAccountOptions().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ record, warehouses, customers, accounts }) => {
        this.record.set(record);
        this.warehouses.set(warehouses);
        this.customers.set(customers);
        this.accounts.set(accounts);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to load return.'));
      },
    });
  }

  typeLabel(value: string): string {
    return returnTypeLabel(value);
  }

  resolutionLabel(value: string): string {
    return returnResolutionLabel(value);
  }

  warehouseName(id: string): string {
    return this.warehouses().find((item) => item.id === id)?.name ?? 'Warehouse';
  }

  partyLabel(record: SalesReturnRecord): string {
    if (record.customerIdentifyingName) {
      return record.customerIdentifyingName;
    }
    if (record.customerId) {
      return this.customers().find((item) => item.id === record.customerId)?.name ?? 'Customer';
    }
    return '—';
  }

  refundAccountName(id: string | null): string {
    if (!id) {
      return '—';
    }
    const account = this.accounts().find((item) => item.id === id);
    return account ? `${account.name} (${account.accountType})` : 'Refund account';
  }

  statusTone(status: string): 'success' | 'warning' | 'neutral' {
    if (status === 'posted') {
      return 'success';
    }
    if (status === 'reversed') {
      return 'warning';
    }
    return 'neutral';
  }

  reverse(): void {
    const current = this.record();
    if (!current || !this.canReverse() || current.status !== 'posted' || this.reversing()) {
      return;
    }
    const reason = this.reverseReason().trim();
    if (reason === '') {
      this.errorMessage.set('A reversal reason is required.');
      return;
    }
    this.reversing.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.api
      .reverseReturn(
        current.id,
        { reason, expectedVersion: current.version },
        `return-reverse-${current.id}-${Date.now()}`,
      )
      .subscribe({
        next: (updated) => {
          this.record.set(updated);
          this.reversing.set(false);
          this.reverseReason.set('');
          this.successMessage.set(
            'Return reversed. Original return is preserved and linked to a corrective transaction.',
          );
        },
        error: (error: unknown) => {
          this.reversing.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to reverse return.'));
        },
      });
  }

  onReverseReasonInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.reverseReason.set(target.value);
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.status === 403) {
      return error.error?.error?.message ?? 'You do not have permission for this action.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
