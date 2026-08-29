import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  of,
  switchMap,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SupplierPaymentsApi } from '../../data-access/supplier-payments.api';
import {
  SupplierLedgerEffectRecord,
  SupplierReconciliationRecord,
} from '../../models/supplier-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { SupplierRecord } from '../../../suppliers/models/suppliers.models';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

@Component({
  selector: 'agrivio-supplier-ledger-page',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiEmptyStateComponent,
    UiModuleInfoComponent,
  ],
  templateUrl: './supplier-ledger.page.html',
  styleUrl: './supplier-ledger.page.scss',
})
export class SupplierLedgerPage {
  private readonly api = inject(SupplierPaymentsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly formBuilder = inject(FormBuilder);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly supplierSearchChanges = new Subject<string>();

  readonly canUseSupplierLedger = computed(
    () => this.capabilityService?.canUseModule('payments.supplierLedger') ?? true,
  );

  readonly canView = computed(
    () => this.sessionStore.hasPermission('supplier-payments.view') && this.canUseSupplierLedger(),
  );

  readonly showModuleInfo = computed(
    () => this.capabilityService?.canUseFeature('payments.supplierLedger.features.moduleInfo') ?? true,
  );

  readonly showReconciliationSummary = computed(
    () =>
      this.capabilityService?.canUseFeature(
        'payments.supplierLedger.features.reconciliationSummary',
      ) ?? true,
  );

  readonly showLedgerFilters = computed(
    () =>
      this.capabilityService?.canUseFeature('payments.supplierLedger.features.ledgerFilters') ?? true,
  );

  readonly canViewSourceAction = computed(
    () => this.capabilityService?.canPerformAction('payments.supplierLedger.actions.viewSource') ?? true,
  );

  canViewField(fieldKey: string): boolean {
    return this.capabilityService?.canViewField(`payments.supplierLedger.fields.${fieldKey}`) ?? true;
  }

  readonly loadingSuppliers = signal(true);
  readonly loadingLedger = signal(false);
  readonly loadingRecon = signal(false);
  readonly suppliers = signal<SupplierRecord[]>([]);
  readonly selectedSupplierId = signal<string>('');
  readonly ledgerItems = signal<SupplierLedgerEffectRecord[]>([]);
  readonly reconciliation = signal<SupplierReconciliationRecord | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly reconErrorMessage = signal<string | null>(null);

  readonly searchTerm = signal<string>('');
  readonly typeFilter = signal<string>('all');

  readonly form = this.formBuilder.nonNullable.group({
    supplierId: [''],
    searchSupplier: [''],
  });

  readonly selectedSupplier = computed(() => {
    const id = this.selectedSupplierId();
    if (!id) return null;
    return this.suppliers().find((s) => s.id === id) ?? null;
  });

  readonly filteredLedgerItems = computed(() => {
    const items = this.ledgerItems();
    const search = this.searchTerm().trim().toLowerCase();
    const type = this.typeFilter();

    return items.filter((item) => {
      if (type !== 'all' && item.effectKind !== type) {
        return false;
      }
      if (search) {
        const matchesSource = item.sourceId.toLowerCase().includes(search);
        const matchesType = item.sourceType.toLowerCase().includes(search);
        const matchesKind = item.effectKind.toLowerCase().includes(search);
        if (!matchesSource && !matchesType && !matchesKind) {
          return false;
        }
      }
      return true;
    });
  });

  readonly infoTitle = 'About Supplier Ledger & Reconciliation';
  readonly infoDescription =
    'Review authoritative signed ledger effects and financial reconciliation status for any active supplier.';
  readonly infoItems: string[] = [
    'All entries are derived from immutable posted financial transactions (purchases, payments, cancellations, and returns).',
    'Reconciliation compares posted payable ledger totals against payment allocations and account movements to verify financial consistency.',
    'Unallocated payment amounts remain recorded as supplier advances until allocated to future purchases.',
  ];

  constructor() {
    if (!this.canView()) {
      this.loadingSuppliers.set(false);
      return;
    }

    this.api.listSupplierLedgerSuppliers('').subscribe({
      next: (items) => {
        this.suppliers.set(items.filter((s) => s.status === 'active'));
        this.loadingSuppliers.set(false);
      },
      error: () => {
        this.loadingSuppliers.set(false);
        this.errorMessage.set('Unable to load suppliers.');
      },
    });

    this.supplierSearchChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((search) => this.api.listSupplierLedgerSuppliers(search)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (items) => {
          this.suppliers.set(items.filter((s) => s.status === 'active'));
          this.loadingSuppliers.set(false);
        },
        error: () => {
          this.loadingSuppliers.set(false);
          this.errorMessage.set('Unable to load suppliers.');
        },
      });

    this.form.controls.supplierId.valueChanges
      .pipe(
        switchMap((id) => {
          this.selectedSupplierId.set(id);
          this.ledgerItems.set([]);
          this.reconciliation.set(null);
          this.errorMessage.set(null);
          this.reconErrorMessage.set(null);
          this.searchTerm.set('');
          this.typeFilter.set('all');
          if (!id) {
            this.loadingLedger.set(false);
            this.loadingRecon.set(false);
            return of(null);
          }
          this.loadingLedger.set(true);
          this.loadingRecon.set(true);
          return forkJoin({
            ledger: this.api.listSupplierLedger(id),
            reconciliation: this.api.reconcileSupplier(id),
          });
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          if (!result) {
            return;
          }
          this.ledgerItems.set(result.ledger);
          this.reconciliation.set(result.reconciliation);
          this.loadingLedger.set(false);
          this.loadingRecon.set(false);
        },
        error: (error: unknown) => {
          this.loadingLedger.set(false);
          this.loadingRecon.set(false);
          this.errorMessage.set(
            error instanceof HttpErrorResponse
              ? (error.error?.error?.message ?? 'Unable to load ledger.')
              : 'Unable to load ledger.',
          );
        },
      });
  }

  reloadCurrentSupplier(forceRefresh = true): void {
    const id = this.selectedSupplierId();
    if (!id) {
      return;
    }
    this.loadingLedger.set(true);
    this.loadingRecon.set(true);
    forkJoin({
      ledger: this.api.listSupplierLedger(id, { forceRefresh }),
      reconciliation: this.api.reconcileSupplier(id, { forceRefresh }),
    }).subscribe({
      next: ({ ledger, reconciliation }) => {
        this.ledgerItems.set(ledger);
        this.reconciliation.set(reconciliation);
        this.loadingLedger.set(false);
        this.loadingRecon.set(false);
      },
      error: (error: unknown) => {
        this.loadingLedger.set(false);
        this.loadingRecon.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load ledger.')
            : 'Unable to load ledger.',
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
      purchase_payable: 'Purchase invoice',
      supplier_payment_allocation: 'Payment allocation',
      supplier_payment_advance: 'Payment advance',
      purchase_return: 'Purchase return',
      purchase_cancellation: 'Purchase cancellation',
      purchase_cancellation_allocation_reversal: 'Cancellation reversal',
      supplier_opening_payable: 'Opening payable',
      supplier_opening_advance: 'Opening advance',
    };
    return labels[type] ?? type;
  }

  sourceRoute(item: SupplierLedgerEffectRecord): string[] | null {
    if (!item.sourceId || !this.canViewSourceAction()) return null;
    if (item.sourceType === 'purchase_payable' || item.sourceType === 'purchase_cancellation') {
      const canInspectPurchases =
        this.sessionStore.hasPermission('purchases.view') &&
        (this.capabilityService?.canUseModule('purchases') ?? true) &&
        (this.capabilityService?.canPerformAction('purchases.actions.inspect') ?? true);
      return canInspectPurchases ? ['/app/purchases', item.sourceId] : null;
    }
    if (
      item.sourceType === 'supplier_payment_allocation' ||
      item.sourceType === 'supplier_payment_advance'
    ) {
      const canInspectPayments =
        this.sessionStore.hasPermission('supplier-payments.view') &&
        (this.capabilityService?.canUseModule('payments.supplier') ?? true) &&
        (this.capabilityService?.canPerformAction('payments.supplier.actions.inspect') ?? true);
      return canInspectPayments ? ['/app/supplier-payments'] : null;
    }
    if (item.sourceType === 'purchase_return') {
      const canInspectReturns =
        this.sessionStore.hasPermission('returns.view') &&
        (this.capabilityService?.canUseModule('returns') ?? true);
      return canInspectReturns ? ['/app/returns', item.sourceId] : null;
    }
    return null;
  }

  supplierInitial(): string {
    const supplier = this.selectedSupplier();
    if (!supplier || !supplier.name) return 'S';
    const name = supplier.name.trim();
    if (!name) return 'S';
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts[0]?.charAt(0) ?? '';
      const second = parts[1]?.charAt(0) ?? '';
      return (first + second).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  onSupplierSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.supplierSearchChanges.next(target.value.trim());
    }
  }

  onSearchTermChange(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.searchTerm.set(target.value);
    }
  }

  onTypeFilterChange(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLSelectElement) {
      this.typeFilter.set(target.value);
    }
  }

  clearTableFilters(): void {
    this.searchTerm.set('');
    this.typeFilter.set('all');
  }
}
