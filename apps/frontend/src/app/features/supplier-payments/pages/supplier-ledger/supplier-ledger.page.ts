import { Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import {
  SupplierLedgerEffectRecord,
  SupplierReconciliationRecord,
} from '../../models/supplier-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { SupplierRecord } from '../../../suppliers/models/suppliers.models';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';

@Component({
  selector: 'agrivio-supplier-ledger-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiEmptyStateComponent,
  ],
  templateUrl: './supplier-ledger.page.html',
  styleUrl: './supplier-ledger.page.scss',
})
export class SupplierLedgerPage {
  private readonly api = inject(SupplierPaymentsApi);
  private readonly suppliersApi = inject(SuppliersApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly formBuilder = inject(FormBuilder);

  readonly canView = computed(() => this.sessionStore.hasPermission('supplier-payments.view'));

  readonly loadingSuppliers = signal(true);
  readonly loadingLedger = signal(false);
  readonly loadingRecon = signal(false);
  readonly suppliers = signal<SupplierRecord[]>([]);
  readonly selectedSupplierId = signal<string>('');
  readonly ledgerItems = signal<SupplierLedgerEffectRecord[]>([]);
  readonly reconciliation = signal<SupplierReconciliationRecord | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly reconErrorMessage = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    supplierId: [''],
  });

  constructor() {
    if (!this.canView()) {
      this.loadingSuppliers.set(false);
      return;
    }
    this.suppliersApi.listSuppliers().subscribe({
      next: (items) => {
        this.suppliers.set(items.filter((s) => s.status === 'active'));
        this.loadingSuppliers.set(false);
      },
      error: () => {
        this.loadingSuppliers.set(false);
        this.errorMessage.set('Unable to load suppliers.');
      },
    });

    this.form.controls.supplierId.valueChanges.subscribe((id) => {
      this.selectedSupplierId.set(id);
      this.ledgerItems.set([]);
      this.reconciliation.set(null);
      this.errorMessage.set(null);
      this.reconErrorMessage.set(null);
      if (!id) {
        return;
      }
      this.loadLedger(id);
      this.loadReconciliation(id);
    });
  }

  private loadLedger(supplierId: string): void {
    this.loadingLedger.set(true);
    this.api.listSupplierLedger(supplierId).subscribe({
      next: (items) => {
        this.ledgerItems.set(items);
        this.loadingLedger.set(false);
      },
      error: (error: unknown) => {
        this.loadingLedger.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load ledger.')
            : 'Unable to load ledger.',
        );
      },
    });
  }

  private loadReconciliation(supplierId: string): void {
    this.loadingRecon.set(true);
    this.api.reconcileSupplier(supplierId).subscribe({
      next: (recon) => {
        this.reconciliation.set(recon);
        this.loadingRecon.set(false);
      },
      error: (error: unknown) => {
        this.loadingRecon.set(false);
        this.reconErrorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load reconciliation.')
            : 'Unable to load reconciliation.',
        );
      },
    });
  }

  effectKindLabel(kind: string): string {
    const labels: Record<string, string> = {
      payable: 'Payable',
      supplier_advance: 'Supplier advance',
      receivable: 'Receivable',
      advance: 'Advance',
    };
    return labels[kind] ?? kind;
  }

  sourceTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      purchase_payable: 'Purchase payable',
      supplier_payment_allocation: 'Payment allocation',
      supplier_payment_advance: 'Payment advance',
      purchase_return: 'Purchase return',
      purchase_cancellation: 'Purchase cancellation',
      purchase_cancellation_allocation_reversal: 'Cancellation allocation reversal',
      supplier_opening_payable: 'Opening payable',
      supplier_opening_advance: 'Opening advance',
    };
    return labels[type] ?? type;
  }
}
