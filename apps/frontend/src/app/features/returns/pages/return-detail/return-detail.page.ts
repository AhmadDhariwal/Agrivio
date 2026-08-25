import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, forkJoin, of } from 'rxjs';
import { ReturnsApi } from '../../data-access/returns.api';
import {
  MoneyAmount,
  SalesReturnRecord,
  returnResolutionLabel,
  returnTypeLabel,
} from '../../models/returns.models';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { CustomerRecord } from '../../../customers/models/customers.models';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { SupplierRecord } from '../../../suppliers/models/suppliers.models';
import {
  BranchesWarehousesApi,
  WarehouseRecord,
} from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';

@Component({
  selector: 'agrivio-return-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiConfirmDialogComponent,
  ],
  templateUrl: './return-detail.page.html',
  styleUrl: './return-detail.page.scss',
})
export class ReturnDetailPage {
  private readonly api = inject(ReturnsApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly suppliersApi = inject(SuppliersApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly reversing = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly record = signal<SalesReturnRecord | null>(null);
  readonly reverseDialogOpen = signal(false);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly customers = signal<CustomerRecord[]>([]);
  readonly suppliers = signal<SupplierRecord[]>([]);
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
      suppliers: this.suppliersApi.searchSupplierOptions().pipe(catchError(() => of([]))),
      accounts: this.accountsApi.listAccountOptions().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ record, warehouses, customers, suppliers, accounts }) => {
        this.record.set(record);
        this.warehouses.set(warehouses);
        this.customers.set(customers);
        this.suppliers.set(suppliers);
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

  typeBadgeLabel(returnType: string): string {
    if (returnType === 'sales') return 'SALES RETURN';
    if (returnType === 'purchase') return 'PURCHASE RETURN';
    if (returnType === 'sales_without_invoice') return 'WITHOUT INVOICE';
    return returnType ? returnType.toUpperCase() : 'RETURN';
  }

  typeBadgeClass(returnType: string): string {
    if (returnType === 'sales') return 'type-badge type-badge--sales';
    if (returnType === 'purchase') return 'type-badge type-badge--purchase';
    if (returnType === 'sales_without_invoice') return 'type-badge type-badge--without-invoice';
    return 'type-badge';
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
    if (record.supplierId) {
      return this.suppliers().find((item) => item.id === record.supplierId)?.name ?? 'Supplier';
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

  statusTone(status: string): UiBadgeTone {
    if (status === 'posted') return 'success';
    if (status === 'reversed') return 'warning';
    if (status === 'draft') return 'neutral';
    return 'neutral';
  }

  formatMoney(amount: MoneyAmount | null | undefined): string {
    if (!amount || amount.amount === undefined || amount.amount === null) {
      return '—';
    }
    const num = Number(amount.amount);
    const formatted = isNaN(num)
      ? amount.amount
      : num.toLocaleString('en-PK', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
    return `${amount.currency || 'PKR'} ${formatted}`;
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  formatDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    if (isNaN(date.getTime())) return iso;
    return `${date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })} ${date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })}`;
  }

  openReverseDialog(): void {
    const current = this.record();
    if (!current || !this.canReverse() || current.status !== 'posted' || this.reversing()) {
      return;
    }
    this.reverseDialogOpen.set(true);
  }

  onDismissReverse(): void {
    this.reverseDialogOpen.set(false);
  }

  onConfirmReverse(reason: string): void {
    const current = this.record();
    if (!current || !this.canReverse() || current.status !== 'posted' || this.reversing()) {
      return;
    }
    const trimmed = reason.trim();
    if (trimmed === '') {
      this.errorMessage.set('A reversal reason is required.');
      return;
    }

    this.reversing.set(true);
    this.reverseDialogOpen.set(false);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    this.api
      .reverseReturn(
        current.id,
        { reason: trimmed, expectedVersion: current.version },
        `return-reverse-${current.id}-${Date.now()}`,
      )
      .subscribe({
        next: (updated) => {
          this.record.set(updated);
          this.reversing.set(false);
          this.successMessage.set(
            'Return reversed with a linked corrective transaction. The original return record is preserved in history.',
          );
        },
        error: (error: unknown) => {
          this.reversing.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to reverse return.'));
        },
      });
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
