import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { EMPTY, forkJoin, merge, Subject, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PurchasesApi } from '../../data-access/purchases.api';
import { ReturnsApi } from '../../data-access/returns.api';
import {
  PurchaseDraftInput,
  PurchaseLineInput,
  PurchasePaymentInput,
  PurchaseRecord,
  PurchaseReturnLineInput,
} from '../../models/purchases.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import {
  BranchesWarehousesApi,
  WarehouseRecord,
} from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { SuppliersApi } from '../../../suppliers/data-access/suppliers.api';
import { SupplierRecord } from '../../../suppliers/models/suppliers.models';
import { PackagingUnitRecord, ProductRecord } from '../../../catalog/models/catalog.models';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import {
  fieldValidationMessage,
  hasRequiredValidator,
  setRequiredValidator,
} from '../../../../shared/form/form-field.util';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

function toCleanString(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  return String(val).trim();
}

function toMoneyString(val: unknown, fallback = '0.00'): string {
  const str = toCleanString(val);
  if (!str) {
    return fallback;
  }
  return str;
}

@Component({
  selector: 'agrivio-purchase-edit-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiConfirmDialogComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './purchase-edit.page.html',
  styleUrl: './purchase-edit.page.scss',
})
export class PurchaseEditPage {
  private readonly api = inject(PurchasesApi);
  private readonly returnsApi = inject(ReturnsApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly suppliersApi = inject(SuppliersApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly productSearchChanges = new Subject<string>();
  private readonly supplierSearchChanges = new Subject<string>();

  readonly purchaseId = signal<string | null>(null);
  readonly purchase = signal<PurchaseRecord | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly discarding = signal(false);
  readonly discardConfirmOpen = signal(false);
  readonly cancelConfirmOpen = signal(false);
  readonly posting = signal(false);
  readonly cancelling = signal(false);
  readonly submittingReturn = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);
  readonly products = signal<ProductRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly suppliers = signal<SupplierRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);
  readonly packagingByLine = signal<Record<number, PackagingUnitRecord[]>>({});
  readonly isPosted = computed(() => this.purchase()?.status === 'posted');
  readonly isCancelled = computed(() => this.purchase()?.status === 'cancelled');
  readonly isDraft = computed(() => {
    const record = this.purchase();
    return record === null || record.status === 'draft';
  });
  readonly canUsePurchases = computed(
    () => this.capabilityService?.canUseModule('purchases') ?? true,
  );
  readonly canCreate = computed(
    () =>
      this.sessionStore.hasPermission('purchases.create') &&
      this.canUsePurchases() &&
      (this.capabilityService?.canPerformAction('purchases.actions.createDraft') ?? true),
  );
  readonly canInspect = computed(
    () =>
      this.sessionStore.hasPermission('purchases.view') &&
      this.canUsePurchases() &&
      (this.capabilityService?.canPerformAction('purchases.actions.inspect') ?? true),
  );
  readonly canView = this.canInspect;
  readonly canEditDraft = computed(
    () =>
      this.sessionStore.hasPermission('purchases.create') &&
      this.canUsePurchases() &&
      (this.capabilityService?.canPerformAction('purchases.actions.editDraft') ?? true) &&
      this.isDraft(),
  );
  readonly canDiscard = computed(
    () =>
      this.sessionStore.hasPermission('purchases.create') &&
      this.canUsePurchases() &&
      (this.capabilityService?.canPerformAction('purchases.actions.discardDraft') ?? true) &&
      this.purchaseId() !== null &&
      this.isDraft(),
  );
  readonly hasPostPermission = computed(
    () =>
      this.sessionStore.hasPermission('purchases.post') &&
      this.canUsePurchases() &&
      (this.capabilityService?.canPerformAction('purchases.actions.post') ?? true),
  );
  readonly canPost = computed(
    () =>
      this.hasPostPermission() &&
      this.purchaseId() !== null &&
      this.isDraft(),
  );
  readonly canCancel = computed(
    () =>
      this.sessionStore.hasPermission('purchases.cancel') &&
      this.canUsePurchases() &&
      (this.capabilityService?.canPerformAction('purchases.actions.cancel') ?? true) &&
      this.isPosted(),
  );
  readonly canReturn = computed(
    () =>
      this.sessionStore.hasPermission('purchases.return') &&
      this.sessionStore.hasPermission('returns.post') &&
      this.canUsePurchases() &&
      (this.capabilityService?.canPerformAction('purchases.actions.createReturn') ?? true) &&
      (this.capabilityService?.canUseModule('returns') ?? true) &&
      (this.capabilityService?.canPerformAction('returns.actions.post') ?? true) &&
      this.isPosted(),
  );
  readonly canAddPaymentAtPost = computed(
    () =>
      this.sessionStore.hasPermission('purchases.post') &&
      this.canUsePurchases() &&
      this.isDraft() &&
      (this.capabilityService?.canPerformAction('purchases.actions.post') ?? true) &&
      (this.capabilityService?.canPerformAction('purchases.actions.addPaymentAtPost') ?? true),
  );
  readonly formValid = signal(false);

  isDraftValid(): boolean {
    if (!this.form.valid) {
      return false;
    }
    const warehouseId = toCleanString(this.form.controls.warehouseId.value);
    const supplierId = toCleanString(this.form.controls.supplierId.value);
    const purchaseDate = toCleanString(this.form.controls.purchaseDate.value);
    if (!warehouseId || !supplierId || !purchaseDate) {
      return false;
    }
    if (this.lines.length === 0) {
      return false;
    }
    for (let index = 0; index < this.lines.length; index += 1) {
      const line = this.lineGroup(index);
      if (line.invalid) {
        return false;
      }
      const productId = toCleanString(line.get('productId')?.value);
      const rawQuantity = toCleanString(line.get('quantity')?.value);
      const rawUnitCost = toCleanString(line.get('unitCost')?.value);
      if (!productId || !rawQuantity || !rawUnitCost) {
        return false;
      }
      const quantity = Number(rawQuantity);
      const unitCost = Number(rawUnitCost);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return false;
      }
      if (!Number.isFinite(unitCost) || unitCost <= 0) {
        return false;
      }
    }
    return true;
  }

  readonly canSaveDraft = computed(
    () =>
      (this.purchaseId() === null ? this.canCreate() : this.canEditDraft()) &&
      this.formValid() &&
      !this.saving() &&
      !this.posting() &&
      this.isDraft(),
  );

  readonly canDirectPost = computed(
    () =>
      this.hasPostPermission() &&
      (this.purchaseId() === null ? this.canCreate() : this.canEditDraft()) &&
      this.formValid() &&
      !this.saving() &&
      !this.posting() &&
      this.isDraft(),
  );
  private version = 1;

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  canViewPurchaseField(id: string): boolean {
    return this.capabilityService?.canViewField(`purchases.fields.${id}`) ?? true;
  }

  canEditPurchaseField(id: string): boolean {
    const canMutate = this.purchaseId() === null ? this.canCreate() : this.canEditDraft();
    return canMutate && (this.capabilityService?.canEditField(`purchases.fields.${id}`) ?? true);
  }

  getLineTotal(index: number): string {
    const group = this.lineGroup(index);
    const qty = parseFloat(group.get('quantity')?.value ?? '0');
    const unitCost = parseFloat(group.get('unitCost')?.value ?? '0');
    if (isNaN(qty) || isNaN(unitCost) || qty <= 0 || unitCost <= 0) return '0.00';
    return (qty * unitCost).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  statusLabel(status?: string | null): string {
    if (status === 'draft') return 'Draft (unposted)';
    if (status === 'posted') return 'Posted';
    if (status === 'cancelled') return 'Cancelled';
    return status || 'Draft';
  }

  statusTone(status?: string | null): 'warning' | 'success' | 'danger' | 'neutral' {
    if (status === 'draft') return 'warning';
    if (status === 'posted') return 'success';
    if (status === 'cancelled') return 'danger';
    return 'neutral';
  }

  readonly form = this.formBuilder.nonNullable.group({
    warehouseId: ['', Validators.required],
    supplierId: ['', Validators.required],
    purchaseDate: ['', Validators.required],
    supplierInvoiceReference: [''],
    notes: [''],
    freight: ['0.00'],
    loadingCost: ['0.00'],
    transport: ['0.00'],
    other: ['0.00'],
    lines: this.formBuilder.array([this.createLineGroup()]),
    payments: this.formBuilder.array<FormGroup>([]),
  });

  readonly cancelForm = this.formBuilder.nonNullable.group({
    reason: ['', Validators.required],
  });

  readonly returnForm = this.formBuilder.nonNullable.group({
    reason: [''],
    returnLines: this.formBuilder.array<FormGroup>([]),
  });

  get lines(): FormArray {
    return this.form.controls.lines;
  }

  get payments(): FormArray {
    return this.form.controls.payments;
  }

  get returnLines(): FormArray {
    return this.returnForm.controls.returnLines;
  }

  constructor() {
    this.formValid.set(this.isDraftValid());
    merge(this.form.statusChanges, this.form.valueChanges)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.formValid.set(this.isDraftValid());
      });

    const id = this.route.snapshot.paramMap.get('id');
    const isEdit = Boolean(id && id !== 'new');
    if (isEdit && id) {
      this.purchaseId.set(id);
    }

    if (!this.canView() && !this.canCreate()) {
      this.loading.set(false);
      return;
    }

    const masters$ = forkJoin({
      warehouses: this.locationsApi.listWarehouseOptions(),
      accounts: this.accountsApi.listAccountOptions(),
    });

    this.productSearchChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.catalogApi.searchProductOptions(query, 25, 'active')),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => this.products.set(items.filter((item) => item.status === 'active')));

    this.supplierSearchChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.suppliersApi.searchSupplierOptions(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => this.suppliers.set(items.filter((item) => item.status === 'active')));

    this.supplierSearchChanges.next('');
    this.productSearchChanges.next('');

    if (isEdit && id) {
      this.api
        .getPurchase(id)
        .pipe(
          switchMap((purchase) => {
            if (purchase.status !== 'draft') {
              void this.router.navigateByUrl(`/app/purchases/${purchase.id}`, { replaceUrl: true });
              return EMPTY;
            }
            return masters$.pipe(map((masters) => ({ masters, purchase })));
          }),
        )
        .subscribe({
          next: ({ masters, purchase }) => {
            this.applyMasters(masters);
            this.applyPurchase(purchase);
            this.loading.set(false);
          },
          error: (error: unknown) => {
            this.loading.set(false);
            this.errorMessage.set(this.mapError(error, 'Unable to load purchase.'));
          },
        });
    } else {
      if (!this.canCreate()) {
        this.loading.set(false);
        return;
      }
      masters$.subscribe({
        next: (masters) => {
          this.applyMasters(masters);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load purchase form.'));
        },
      });
    }
  }

  lineGroup(index: number): FormGroup {
    return this.lines.at(index) as FormGroup;
  }

  lineFieldError(index: number, controlName: string, label: string): string | null {
    return fieldValidationMessage(
      this.lineGroup(index).get(controlName),
      label,
      this.formSubmitAttempted(),
    );
  }

  onSupplierSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.supplierSearchChanges.next(target.value.trim());
    }
  }

  onProductSearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.productSearchChanges.next(target.value.trim());
    }
  }

  paymentGroup(index: number): FormGroup {
    return this.payments.at(index) as FormGroup;
  }

  trackingModeForLine(index: number): string {
    const productId = String(this.lineGroup(index).get('productId')?.value ?? '');
    const fromCatalog = this.products().find((item) => item.id === productId)?.trackingMode;
    if (fromCatalog) {
      return fromCatalog;
    }
    const line = this.purchase()?.lines[index];
    return line?.trackingModeSnapshot ?? 'none';
  }

  packagingUnitsForLine(index: number): PackagingUnitRecord[] {
    return this.packagingByLine()[index] ?? [];
  }

  addLine(): void {
    const canMutate = this.purchaseId() === null ? this.canCreate() : this.canEditDraft();
    if (!canMutate) {
      return;
    }
    const index = this.lines.length;
    this.lines.push(this.createLineGroup());
    this.bindLineProductChanges(index);
    this.formValid.set(this.isDraftValid());
  }

  removeLine(index: number): void {
    const canMutate = this.purchaseId() === null ? this.canCreate() : this.canEditDraft();
    if (!canMutate) {
      return;
    }
    if (this.lines.length <= 1) {
      this.lines.at(0).reset({
        productId: '',
        packagingUnitId: '',
        quantity: '',
        unitCost: '',
        batchNumber: '',
        manufacturingDate: '',
        expiryDate: '',
      });
      this.packagingByLine.update((current) => ({ ...current, [0]: [] }));
      this.syncLineTrackingRequired(0);
      this.formValid.set(this.isDraftValid());
      return;
    }
    this.lines.removeAt(index);
    this.rebuildPackagingMap();
    this.formValid.set(this.isDraftValid());
  }

  addPayment(): void {
    if (!this.canAddPaymentAtPost()) {
      return;
    }
    this.payments.push(this.createPaymentGroup());
  }

  removePayment(index: number): void {
    if (!this.canAddPaymentAtPost()) {
      return;
    }
    this.payments.removeAt(index);
  }

  returnLineGroup(index: number): FormGroup {
    return this.returnLines.at(index) as FormGroup;
  }

  cancel(): void {
    const id = this.purchaseId();
    if (!id || !this.canCancel() || !this.isPosted() || this.cancelling()) {
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
    const id = this.purchaseId();
    this.cancelConfirmOpen.set(false);
    if (!id || !this.canCancel() || !this.isPosted() || this.cancelling()) {
      return;
    }
    this.cancelling.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const { reason } = this.cancelForm.getRawValue();
    this.api
      .cancelPurchase(id, { reason, expectedVersion: this.version }, crypto.randomUUID())
      .subscribe({
        next: (record) => {
          this.cancelling.set(false);
          this.successMessage.set('Purchase cancelled.');
          this.applyPurchase(record);
        },
        error: (error: unknown) => {
          this.cancelling.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to cancel purchase.'));
        },
      });
  }

  submitReturn(): void {
    const id = this.purchaseId();
    if (!id || !this.canReturn() || !this.isPosted() || this.submittingReturn()) {
      return;
    }
    const rawLines = this.returnLines.getRawValue() as Array<{
      originalLineIndex: number | string;
      quantity: string;
    }>;
    const lines: PurchaseReturnLineInput[] = rawLines
      .map((line) => ({
        originalLineIndex: Number(line.originalLineIndex),
        quantity: String(line.quantity ?? '').trim(),
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
    const { reason } = this.returnForm.getRawValue();
    this.submittingReturn.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const trimmedReason = reason.trim();
    this.returnsApi
      .createReturn(id, trimmedReason ? { lines, reason: trimmedReason } : { lines })
      .pipe(
        switchMap((ret) =>
          this.returnsApi.postReturn(
            ret.id,
            {
              reason: reason.trim() || 'purchase return',
              expectedVersion: ret.version,
              resolution: 'ledger_adjustment',
            },
            crypto.randomUUID(),
          ),
        ),
      )
      .subscribe({
        next: () => {
          this.submittingReturn.set(false);
          this.successMessage.set('Return created and posted successfully.');
          this.returnLines.clear();
          this.returnForm.patchValue({ reason: '' });
          if (id) {
            this.api.getPurchase(id, { forceRefresh: true }).subscribe({
              next: (record) => this.applyPurchase(record),
            });
          }
        },
        error: (error: unknown) => {
          this.submittingReturn.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to submit return.'));
        },
      });
  }

  addReturnLine(): void {
    const purchase = this.purchase();
    if (!purchase || !purchase.lines || purchase.lines.length === 0) {
      return;
    }
    this.returnLines.push(
      this.formBuilder.nonNullable.group({
        originalLineIndex: [0, Validators.required],
        quantity: ['', Validators.required],
      }),
    );
  }

  removeReturnLine(index: number): void {
    this.returnLines.removeAt(index);
  }

  save(): void {
    const id = this.purchaseId();
    const canManage = id === null ? this.canCreate() : this.canEditDraft();
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    for (let index = 0; index < this.lines.length; index += 1) {
      this.lineGroup(index).markAllAsTouched();
    }
    if (!canManage || this.form.invalid) {
      return;
    }

    try {
      const payload = this.buildPayload();
      this.saving.set(true);
      this.errorMessage.set(null);
      this.successMessage.set(null);

      const request$ =
        id === null
          ? this.api.createPurchase(payload)
          : this.api.updatePurchase(id, { ...payload, expectedVersion: this.version });

      request$.subscribe({
        next: (record) => {
          this.saving.set(false);
          this.successMessage.set('Purchase draft saved. It remains unposted until you post it.');
          if (id === null) {
            this.purchaseId.set(record.id);
            this.version = record.version;
            void this.router.navigateByUrl(`/app/purchases/${record.id}/edit`, { replaceUrl: true });
          } else {
            this.applyPurchase(record);
          }
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to save purchase draft.'));
        },
      });
    } catch (err: unknown) {
      this.saving.set(false);
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Unable to prepare purchase draft.',
      );
    }
  }

  saveAndPost(): void {
    const id = this.purchaseId();
    const canManage = id === null ? this.canCreate() : this.canEditDraft();
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    for (let index = 0; index < this.lines.length; index += 1) {
      this.lineGroup(index).markAllAsTouched();
    }
    for (const control of this.payments.controls) {
      control.markAllAsTouched();
    }
    if (!canManage || !this.canDirectPost() || !this.isDraftValid()) {
      return;
    }
    for (const control of this.payments.controls) {
      if (control.invalid) {
        this.errorMessage.set('Fix payment lines before posting.');
        return;
      }
      const val = (control as FormGroup).getRawValue() as Record<string, unknown>;
      const accountId = toCleanString(val['accountId']);
      const amountStr = toCleanString(val['amount']);
      const amountNum = Number(amountStr);
      if (!accountId || !Number.isFinite(amountNum) || amountNum <= 0) {
        this.errorMessage.set('Payment lines must specify an account and an amount greater than 0.');
        return;
      }
    }

    try {
      const payments: PurchasePaymentInput[] = this.payments.controls.map((control) => {
        const value = (control as FormGroup).getRawValue() as Record<string, unknown>;
        return {
          accountId: toCleanString(value['accountId']),
          amount: { amount: toCleanString(value['amount']), currency: 'PKR' },
        };
      });

      const payload = this.buildPayload();

      this.posting.set(true);
      this.errorMessage.set(null);
      this.successMessage.set(null);

      const draft$ =
        id === null
          ? this.api.createPurchase(payload)
          : this.api.updatePurchase(id, { ...payload, expectedVersion: this.version });

      draft$
        .pipe(
          switchMap((record) => {
            this.purchaseId.set(record.id);
            this.version = record.version;
            return this.api.postPurchase(
              record.id,
              {
                expectedVersion: record.version,
                payments,
              },
              crypto.randomUUID(),
            );
          }),
        )
        .subscribe({
          next: (postedRecord) => {
            this.posting.set(false);
            this.successMessage.set('Purchase posted successfully.');
            this.applyPurchase(postedRecord);
            void this.router.navigateByUrl(`/app/purchases/${postedRecord.id}`);
          },
          error: (error: unknown) => {
            this.posting.set(false);
            this.errorMessage.set(this.mapError(error, 'Unable to post purchase.'));
          },
        });
    } catch (err: unknown) {
      this.posting.set(false);
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Unable to prepare purchase for posting.',
      );
    }
  }

  discard(): void {
    const id = this.purchaseId();
    if (!id || !this.canDiscard()) {
      return;
    }
    this.discardConfirmOpen.set(true);
  }

  confirmDiscard(): void {
    const id = this.purchaseId();
    this.discardConfirmOpen.set(false);
    if (!id || !this.canDiscard()) {
      return;
    }
    this.discarding.set(true);
    this.errorMessage.set(null);
    this.api.discardPurchase(id).subscribe({
      next: () => {
        this.discarding.set(false);
        void this.router.navigateByUrl('/app/purchases');
      },
      error: (error: unknown) => {
        this.discarding.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to discard purchase draft.'));
      },
    });
  }

  post(): void {
    const id = this.purchaseId();
    if (!id || !this.canPost() || this.isPosted() || this.posting()) {
      return;
    }
    for (const control of this.payments.controls) {
      if (control.invalid) {
        control.markAllAsTouched();
        this.errorMessage.set('Fix payment lines before posting.');
        return;
      }
      const val = (control as FormGroup).getRawValue() as Record<string, unknown>;
      const accountId = toCleanString(val['accountId']);
      const amountStr = toCleanString(val['amount']);
      const amountNum = Number(amountStr);
      if (!accountId || !Number.isFinite(amountNum) || amountNum <= 0) {
        this.errorMessage.set('Payment lines must specify an account and an amount greater than 0.');
        return;
      }
    }

    try {
      const payments: PurchasePaymentInput[] = this.payments.controls.map((control) => {
        const value = (control as FormGroup).getRawValue() as Record<string, unknown>;
        return {
          accountId: toCleanString(value['accountId']),
          amount: { amount: toCleanString(value['amount']), currency: 'PKR' },
        };
      });

      this.posting.set(true);
      this.errorMessage.set(null);
      this.successMessage.set(null);

      this.api
        .postPurchase(
          id,
          {
            expectedVersion: this.version,
            payments,
          },
          crypto.randomUUID(),
        )
        .subscribe({
          next: (record) => {
            this.posting.set(false);
            this.successMessage.set('Purchase posted successfully.');
            this.applyPurchase(record);
          },
          error: (error: unknown) => {
            this.posting.set(false);
            this.errorMessage.set(this.mapError(error, 'Unable to post purchase.'));
          },
        });
    } catch (err: unknown) {
      this.posting.set(false);
      this.errorMessage.set(
        err instanceof Error ? err.message : 'Unable to prepare payment information.',
      );
    }
  }

  private createLineGroup(
    values: {
      productId?: string;
      packagingUnitId?: string;
      quantity?: string;
      unitCost?: string;
      batchNumber?: string;
      manufacturingDate?: string;
      expiryDate?: string;
    } = {},
  ): FormGroup {
    return this.formBuilder.nonNullable.group({
      productId: [values.productId ?? '', Validators.required],
      packagingUnitId: [values.packagingUnitId ?? ''],
      quantity: [values.quantity ?? '', Validators.required],
      unitCost: [values.unitCost ?? '', Validators.required],
      batchNumber: [values.batchNumber ?? ''],
      manufacturingDate: [values.manufacturingDate ?? ''],
      expiryDate: [values.expiryDate ?? ''],
    });
  }

  private createPaymentGroup(
    values: {
      accountId?: string;
      amount?: string;
    } = {},
  ): FormGroup {
    return this.formBuilder.nonNullable.group({
      accountId: [values.accountId ?? '', Validators.required],
      amount: [values.amount ?? '', Validators.required],
    });
  }

  private applyMasters(masters: {
    warehouses: WarehouseRecord[];
    accounts: AccountRecord[];
  }): void {
    this.warehouses.set(masters.warehouses.filter((item) => item.status === 'active'));
    this.accounts.set(masters.accounts.filter((item) => item.status === 'active'));
    this.bindLineProductChanges(0);
    this.formValid.set(this.isDraftValid());
  }

  private seedSelectorOptionsFromPurchase(purchase: PurchaseRecord): void {
    this.suppliers.set([
      {
        id: purchase.supplierId,
        organizationId: purchase.organizationId,
        name: purchase.supplierNameSnapshot,
        phone: '',
        contactName: '',
        email: '',
        status: 'active',
        version: purchase.version,
      },
    ]);
    const seen = new Set<string>();
    const productOptions: ProductRecord[] = [];
    for (const line of purchase.lines ?? []) {
      if (seen.has(line.productId)) {
        continue;
      }
      seen.add(line.productId);
      productOptions.push({
        id: line.productId,
        organizationId: purchase.organizationId,
        categoryId: '',
        name: line.productNameSnapshot,
        sku: '',
        trackingMode: line.trackingModeSnapshot,
        baseUnitCode: line.unitCodeSnapshot,
        measurementDimension: 'mass',
        status: 'active',
        version: 1,
      });
    }
    this.products.set(productOptions);
  }

  private applyPurchase(purchase: PurchaseRecord): void {
    this.purchase.set(purchase);
    this.version = purchase.version;
    this.seedSelectorOptionsFromPurchase(purchase);
    const posted = purchase.status === 'posted';

    this.form.patchValue({
      warehouseId: purchase.warehouseId,
      supplierId: purchase.supplierId,
      purchaseDate: purchase.purchaseDate,
      supplierInvoiceReference: purchase.supplierInvoiceReference ?? '',
      notes: purchase.notes ?? '',
      freight: purchase.landedCosts?.freight?.amount ?? '0.00',
      loadingCost: purchase.landedCosts?.loading?.amount ?? '0.00',
      transport: purchase.landedCosts?.transport?.amount ?? '0.00',
      other: purchase.landedCosts?.other?.amount ?? '0.00',
    });

    this.lines.clear();
    const nextPackaging: Record<number, PackagingUnitRecord[]> = {};
    (purchase.lines ?? []).forEach((line, index) => {
      this.lines.push(
        this.createLineGroup({
          productId: line.productId,
          packagingUnitId: line.packagingUnitId ?? '',
          quantity: line.quantity,
          unitCost: line.unitCost.amount,
          batchNumber: line.batchNumber ?? '',
          manufacturingDate: line.manufacturingDate ?? '',
          expiryDate: line.expiryDate ?? '',
        }),
      );
      this.syncLineTrackingRequired(index);
      if (!posted) {
        this.bindLineProductChanges(index);
        this.catalogApi.listPackagingUnits(line.productId).subscribe({
          next: (units) => {
            nextPackaging[index] = units.filter((item) => item.status === 'active');
            this.packagingByLine.set({ ...this.packagingByLine(), ...nextPackaging });
          },
        });
      }
    });
    if (this.lines.length === 0) {
      this.lines.push(this.createLineGroup());
      this.bindLineProductChanges(0);
      this.syncLineTrackingRequired(0);
    }

    this.payments.clear();
    const locked = purchase.status === 'posted' || purchase.status === 'cancelled';
    if (locked) {
      for (const payment of purchase.payments ?? []) {
        this.payments.push(
          this.createPaymentGroup({
            accountId: payment.accountId,
            amount: payment.amount.amount,
          }),
        );
      }
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
    }
    this.formValid.set(this.isDraftValid());
  }

  private bindLineProductChanges(index: number): void {
    const control = this.lineGroup(index).get('productId');
    if (!control) {
      return;
    }
    control.valueChanges.subscribe((productId: string) => {
      this.lineGroup(index).patchValue({ packagingUnitId: '' }, { emitEvent: false });
      this.syncLineTrackingRequired(index);
      if (!productId) {
        this.packagingByLine.update((current) => ({ ...current, [index]: [] }));
        return;
      }
      this.catalogApi.listPackagingUnits(productId).subscribe({
        next: (units) => {
          this.packagingByLine.update((current) => ({
            ...current,
            [index]: units.filter((item) => item.status === 'active'),
          }));
        },
        error: () => {
          this.packagingByLine.update((current) => ({ ...current, [index]: [] }));
        },
      });
    });
  }

  private syncLineTrackingRequired(index: number): void {
    const mode = this.trackingModeForLine(index);
    const group = this.lineGroup(index);
    setRequiredValidator(group.get('batchNumber'), mode !== 'none');
    setRequiredValidator(group.get('expiryDate'), mode === 'batch_expiry');
  }

  private rebuildPackagingMap(): void {
    const next: Record<number, PackagingUnitRecord[]> = {};
    for (let index = 0; index < this.lines.length; index += 1) {
      const productId = String(this.lineGroup(index).get('productId')?.value ?? '');
      if (!productId) {
        next[index] = [];
        continue;
      }
      this.catalogApi.listPackagingUnits(productId).subscribe({
        next: (units) => {
          this.packagingByLine.update((current) => ({
            ...current,
            [index]: units.filter((item) => item.status === 'active'),
          }));
        },
      });
      this.bindLineProductChanges(index);
    }
    this.packagingByLine.set(next);
  }

  private buildPayload(): PurchaseDraftInput {
    const value = this.form.getRawValue();
    const rawLines = (value.lines ?? []) as Array<Record<string, unknown>>;
    const lines: PurchaseLineInput[] = rawLines.map((line) => {
      const productId = toCleanString(line['productId']);
      const mode =
        this.products().find((item) => item.id === productId)?.trackingMode ?? 'none';
      const quantity = toCleanString(line['quantity']);
      const unitCost = toCleanString(line['unitCost']);
      const packagingUnitId = toCleanString(line['packagingUnitId']);
      const batchNumber = toCleanString(line['batchNumber']);
      const manufacturingDate = toCleanString(line['manufacturingDate']);
      const expiryDate = toCleanString(line['expiryDate']);

      const payload: PurchaseLineInput = {
        productId,
        quantity,
        unitCost: { amount: unitCost, currency: 'PKR' },
      };
      if (this.canEditPurchaseField('packagingUnit') && packagingUnitId !== '') {
        payload.packagingUnitId = packagingUnitId;
      }
      if (mode !== 'none' && batchNumber !== '') {
        payload.batchNumber = batchNumber;
      }
      if (
        this.canEditPurchaseField('manufacturingDate') &&
        manufacturingDate !== ''
      ) {
        payload.manufacturingDate = manufacturingDate;
      }
      if (mode === 'batch_expiry' && expiryDate !== '') {
        payload.expiryDate = expiryDate;
      }
      return payload;
    });

    const warehouseId = toCleanString(value.warehouseId);
    const supplierId = toCleanString(value.supplierId);
    const purchaseDate = toCleanString(value.purchaseDate);

    const payload: PurchaseDraftInput = {
      warehouseId,
      supplierId,
      purchaseDate,
      lines,
    };
    if (this.canEditPurchaseField('supplierInvoiceReference')) {
      payload.supplierInvoiceReference = toCleanString(value.supplierInvoiceReference);
    }
    if (this.canEditPurchaseField('notes')) {
      payload.notes = toCleanString(value.notes);
    }
    if (this.canEditPurchaseField('landedCosts')) {
      payload.landedCosts = {
        freight: { amount: toMoneyString(value.freight, '0.00'), currency: 'PKR' },
        loading: { amount: toMoneyString(value.loadingCost, '0.00'), currency: 'PKR' },
        transport: { amount: toMoneyString(value.transport, '0.00'), currency: 'PKR' },
        other: { amount: toMoneyString(value.other, '0.00'), currency: 'PKR' },
      };
    }
    return payload;
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This purchase changed elsewhere. Reload and try again.';
    }
    return error.error?.error?.message ?? fallback;
  }

  formatAmount(val: string | null | undefined): string {
    if (!val) return '0.00';
    const num = Number(val);
    if (!Number.isFinite(num)) return String(val);
    return num.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatQuantity(quantity: string | number | undefined | null): string {
    if (quantity === undefined || quantity === null || quantity === '') return '0';
    const num = typeof quantity === 'number' ? quantity : parseFloat(quantity);
    if (isNaN(num)) return String(quantity);
    if (Number.isInteger(num)) {
      return num.toLocaleString('en-PK');
    }
    return num.toLocaleString('en-PK', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  }
}
