import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of, switchMap } from 'rxjs';
import { SalesApi } from '../../data-access/sales.api';
import { SalesReturnsApi } from '../../data-access/sales-returns.api';
import { ReturnsApi } from '../../../returns/data-access/returns.api';
import { SalesReturnRecord } from '../../../returns/models/returns.models';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { MoneyAmount, SaleRecord } from '../../models/sales.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import {
  fieldValidationMessage,
  hasRequiredValidator,
  setRequiredValidator,
} from '../../../../shared/form/form-field.util';

@Component({
  selector: 'agrivio-sale-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiFieldLabelComponent,
    UiConfirmDialogComponent,
  ],
  templateUrl: './sale-detail.page.html',
  styleUrl: './sale-detail.page.scss',
})
export class SaleDetailPage {
  private readonly api = inject(SalesApi);
  private readonly salesReturnsApi = inject(SalesReturnsApi);
  private readonly returnsApi = inject(ReturnsApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly formBuilder = inject(FormBuilder);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly sale = signal<SaleRecord | null>(null);
  readonly cancelling = signal(false);
  readonly cancelConfirmOpen = signal(false);
  readonly submittingReturn = signal(false);
  readonly refundAccounts = signal<AccountRecord[]>([]);
  readonly relatedReturns = signal<SalesReturnRecord[]>([]);
  readonly lastPostedReturnId = signal<string | null>(null);

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  readonly cancelForm = this.formBuilder.nonNullable.group({
    reason: ['', Validators.required],
  });

  readonly returnForm = this.formBuilder.nonNullable.group({
    reason: ['', Validators.required],
    resolution: [
      'ledger_adjustment' as 'ledger_adjustment' | 'account_refund',
      Validators.required,
    ],
    refundAccountId: [''],
    returnLines: this.formBuilder.array([]),
  });

  get returnLines(): FormArray {
    return this.returnForm.controls.returnLines;
  }

  returnLineGroup(index: number): FormGroup {
    return this.returnLines.at(index) as FormGroup;
  }

  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('sales.view') &&
      (this.capabilityService?.canUseModule('sales') ?? true) &&
      (this.capabilityService?.canPerformAction('sales.actions.inspect') ?? true),
  );
  readonly canEdit = computed(
    () =>
      this.sale()?.status === 'draft' &&
      this.sessionStore.hasPermission('sales.create') &&
      (this.capabilityService?.canPerformAction('sales.actions.editDraft') ?? true),
  );
  readonly canPrint = computed(
    () =>
      (this.sale()?.status === 'posted' || this.sale()?.status === 'cancelled') &&
      (this.capabilityService?.canPerformAction('sales.actions.print') ?? true),
  );
  readonly canViewCogs = computed(() => this.sessionStore.hasPermission('reports.view'));

  readonly canCancel = computed(
    () =>
      this.sale()?.status === 'posted' &&
      this.sessionStore.hasPermission('sales.cancel') &&
      (this.capabilityService?.canPerformAction('sales.actions.cancel') ?? true),
  );
  readonly canReturn = computed(
    () =>
      this.sale()?.status === 'posted' &&
      this.sessionStore.hasPermission('returns.post') &&
      (this.capabilityService?.canPerformAction('sales.actions.createReturn') ?? true) &&
      (this.capabilityService?.canPerformAction('returns.actions.post') ?? true),
  );
  readonly canViewReturns = computed(() => this.sessionStore.hasPermission('returns.view'));

  canViewField(field: string): boolean {
    return this.capabilityService?.canViewField(`sales.fields.${field}`) ?? true;
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.canView()) {
      this.loading.set(false);
      return;
    }

    this.returnForm.controls.resolution.valueChanges.subscribe((resolution) => {
      setRequiredValidator(
        this.returnForm.controls.refundAccountId,
        resolution === 'account_refund',
      );
    });

    this.api.getSale(id).subscribe({
      next: (sale) => {
        this.sale.set(sale);
        this.loading.set(false);
        if (this.canViewReturns()) {
          this.reloadRelatedReturns(sale.id);
        }
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error));
        this.loading.set(false);
      },
    });

    this.accountsApi
      .listAccountOptions()
      .pipe(catchError(() => of([])))
      .subscribe({
        next: (accounts) => {
          this.refundAccounts.set(accounts.filter((item) => item.status === 'active'));
        },
      });
  }

  cancel(): void {
    const sale = this.sale();
    if (!sale || !this.canCancel() || this.cancelling()) {
      return;
    }
    if (this.cancelForm.invalid) {
      this.cancelForm.markAllAsTouched();
      this.errorMessage.set('A cancellation reason is required.');
      return;
    }
    this.cancelConfirmOpen.set(true);
  }

  confirmCancel(): void {
    const sale = this.sale();
    this.cancelConfirmOpen.set(false);
    if (!sale || !this.canCancel() || this.cancelling()) {
      return;
    }
    this.cancelling.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const { reason } = this.cancelForm.getRawValue();
    this.api
      .cancelSale(sale.id, { reason, expectedVersion: sale.version }, crypto.randomUUID())
      .subscribe({
        next: (record) => {
          this.cancelling.set(false);
          this.successMessage.set('Sale cancelled.');
          this.sale.set(record);
        },
        error: (error: unknown) => {
          this.cancelling.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to cancel sale.'));
        },
      });
  }

  addReturnLine(): void {
    const sale = this.sale();
    if (!sale || sale.lines.length === 0) {
      return;
    }
    this.returnLines.push(
      this.formBuilder.nonNullable.group({
        originalLineIndex: [0, Validators.required],
        quantity: ['', Validators.required],
        stockCondition: ['sellable', Validators.required],
        unsellableReason: ['damaged'],
      }),
    );
    this.bindReturnLineConditionalRequired(this.returnLines.length - 1);
  }

  removeReturnLine(index: number): void {
    this.returnLines.removeAt(index);
  }

  submitReturn(): void {
    const sale = this.sale();
    if (!sale || !this.canReturn() || this.submittingReturn()) {
      return;
    }
    const rawLines = this.returnLines.getRawValue() as Array<{
      originalLineIndex: number | string;
      quantity: string;
      stockCondition: 'sellable' | 'unsellable';
      unsellableReason: string;
    }>;
    const lines = rawLines
      .map((line) => ({
        originalLineIndex: Number(line.originalLineIndex),
        quantity: String(line.quantity ?? '').trim(),
        stockCondition: line.stockCondition,
        unsellableReason: line.stockCondition === 'unsellable' ? line.unsellableReason : null,
      }))
      .filter(
        (line) =>
          Number.isInteger(line.originalLineIndex) &&
          line.originalLineIndex >= 0 &&
          line.quantity !== '' &&
          line.quantity !== '0',
      );
    if (lines.length === 0) {
      this.errorMessage.set('Add at least one return line with quantity > 0.');
      return;
    }
    this.returnForm.controls.reason.markAsTouched();
    this.returnForm.controls.refundAccountId.markAsTouched();
    if (
      this.returnForm.controls.reason.invalid ||
      this.returnForm.controls.refundAccountId.invalid
    ) {
      return;
    }
    const { reason, resolution, refundAccountId } = this.returnForm.getRawValue();
    if (!sale.customerId && resolution === 'ledger_adjustment') {
      this.errorMessage.set('Walk-in returns require an account refund, not a ledger adjustment.');
      return;
    }
    if (resolution === 'account_refund' && !refundAccountId) {
      this.errorMessage.set('Select a refund account for an account refund.');
      return;
    }

    this.submittingReturn.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.salesReturnsApi
      .createLinkedReturn(sale.id, { lines })
      .pipe(
        switchMap((ret) =>
          this.salesReturnsApi.postReturn(
            ret.id,
            {
              reason: reason.trim(),
              expectedVersion: ret.version,
              resolution,
              refundAccountId: resolution === 'account_refund' ? refundAccountId : null,
              lines: lines.map((line) => ({
                originalLineIndex: line.originalLineIndex,
                stockCondition: line.stockCondition,
                unsellableReason: line.unsellableReason,
              })),
            },
            crypto.randomUUID(),
          ),
        ),
      )
      .subscribe({
        next: (posted) => {
          this.submittingReturn.set(false);
          this.lastPostedReturnId.set(posted.id);
          this.successMessage.set('Sales return posted. Original invoice is unchanged.');
          this.returnLines.clear();
          this.returnForm.patchValue({ reason: '', refundAccountId: '' });
          this.api.getSale(sale.id).subscribe({
            next: (record) => this.sale.set(record),
          });
          this.reloadRelatedReturns(sale.id);
        },
        error: (error: unknown) => {
          this.submittingReturn.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to post sales return.'));
        },
      });
  }

  private bindReturnLineConditionalRequired(index: number): void {
    const group = this.returnLineGroup(index);
    setRequiredValidator(
      group.get('unsellableReason'),
      group.get('stockCondition')?.value === 'unsellable',
    );
    group.get('stockCondition')?.valueChanges.subscribe((condition) => {
      setRequiredValidator(group.get('unsellableReason'), condition === 'unsellable');
    });
  }

  private reloadRelatedReturns(saleId: string): void {
    if (!this.canViewReturns()) {
      return;
    }
    this.returnsApi.listReturns({ saleId, page: 1, pageSize: 100 }).subscribe({
      next: (result) => this.relatedReturns.set(result.items),
    });
  }

  statusTone(status: string): UiBadgeTone {
    if (status === 'posted') return 'success';
    if (status === 'cancelled') return 'danger';
    if (status === 'draft') return 'warning';
    return 'neutral';
  }

  formatMoney(value: MoneyAmount | null | undefined): string {
    if (!value) return '—';
    const amount = Number(value.amount);
    const display = Number.isFinite(amount)
      ? amount.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : value.amount;
    return `${value.currency || 'PKR'} ${display}`;
  }

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB');
  }

  private mapError(error: unknown, fallback = 'Unable to load sale details.'): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This sale changed elsewhere. Reload and try again.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
