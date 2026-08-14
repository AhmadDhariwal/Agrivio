import { Component, computed, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, of, catchError, switchMap } from 'rxjs';
import { SalesApi } from '../../data-access/sales.api';
import { SalesReturnsApi } from '../../data-access/sales-returns.api';
import { ReturnsApi } from '../../../returns/data-access/returns.api';
import { SalesReturnRecord } from '../../../returns/models/returns.models';
import {
  PosPaymentAccount,
  SaleDraftInput,
  SaleLineInput,
  SaleLinePriceOverrideInput,
  SalePaymentInput,
  SalePostApprovalsInput,
  SaleRecord,
} from '../../models/sales.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CatalogApi } from '../../../catalog/data-access/catalog.api';
import {
  BranchesWarehousesApi,
  BranchRecord,
  WarehouseRecord,
} from '../../../branches-warehouses/data-access/branches-warehouses.api';
import { CustomersApi } from '../../../customers/data-access/customers.api';
import { CustomerRecord } from '../../../customers/models/customers.models';
import { AccountsApi } from '../../../accounts-expenses/data-access/accounts.api';
import { AccountRecord } from '../../../accounts-expenses/models/accounts.models';
import { PackagingUnitRecord, ProductRecord } from '../../../catalog/models/catalog.models';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-sale-edit-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './sale-edit.page.html',
  styleUrl: './sale-edit.page.scss',
})
export class SaleEditPage {
  private readonly api = inject(SalesApi);
  private readonly salesReturnsApi = inject(SalesReturnsApi);
  private readonly returnsApi = inject(ReturnsApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly customersApi = inject(CustomersApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly saleId = signal<string | null>(null);
  readonly sale = signal<SaleRecord | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly posting = signal(false);
  readonly cancelling = signal(false);
  readonly submittingReturn = signal(false);
  readonly discarding = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly products = signal<ProductRecord[]>([]);
  readonly productSearchQuery = signal('');
  readonly filteredProducts = computed(() => {
    const needle = this.productSearchQuery().trim().toLowerCase();
    const items = this.products();
    if (needle === '') {
      return items;
    }
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        String(item.sku ?? '')
          .toLowerCase()
          .includes(needle),
    );
  });
  readonly branches = signal<BranchRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly customers = signal<CustomerRecord[]>([]);
  readonly accounts = signal<PosPaymentAccount[]>([]);
  readonly refundAccounts = signal<AccountRecord[]>([]);
  readonly relatedReturns = signal<SalesReturnRecord[]>([]);
  readonly lastPostedReturnId = signal<string | null>(null);
  readonly packagingByLine = signal<Record<number, PackagingUnitRecord[]>>({});
  readonly canCreate = computed(() => this.sessionStore.hasPermission('sales.create'));
  readonly canPost = computed(() => this.sessionStore.hasPermission('sales.post'));
  readonly canCancel = computed(() => this.sessionStore.hasPermission('sales.cancel'));
  readonly canReturn = computed(() => this.sessionStore.hasPermission('returns.post'));
  readonly canViewReturns = computed(() => this.sessionStore.hasPermission('returns.view'));
  readonly canView = computed(() => this.sessionStore.hasPermission('sales.view'));
  readonly canPrint = computed(() => this.sessionStore.hasPermission('sales.view'));
  readonly canOverridePrice = computed(() => this.sessionStore.hasPermission('pricing.override'));
  readonly canApproveCreditLimit = computed(() =>
    this.sessionStore.hasPermission('sales.credit-limit.approve'),
  );
  readonly canApproveExpiredStock = computed(() =>
    this.sessionStore.hasPermission('sales.expired-stock.approve'),
  );
  readonly canOverrideNegativeStock = computed(() =>
    this.sessionStore.hasPermission('inventory.negative-stock.override'),
  );
  readonly isPosted = computed(() => this.sale()?.status === 'posted');
  readonly isCancelled = computed(() => this.sale()?.status === 'cancelled');
  readonly isDraft = computed(() => {
    const record = this.sale();
    return record === null || record.status === 'draft';
  });
  private version = 1;
  private postIdempotencyKey: string | null = null;
  private postIdempotencySaleId: string | null = null;

  readonly form = this.formBuilder.nonNullable.group({
    branchId: ['', Validators.required],
    warehouseId: ['', Validators.required],
    customerId: [''],
    saleDate: ['', Validators.required],
    notes: [''],
    lines: this.formBuilder.array([this.createLineGroup()]),
    payments: this.formBuilder.array<FormGroup>([]),
    creditLimitApprovalReason: [''],
    expiredStockApprovalReason: [''],
    negativeStockOverrideReason: [''],
  });

  readonly cancelForm = this.formBuilder.nonNullable.group({
    reason: ['', Validators.required],
  });

  readonly returnForm = this.formBuilder.nonNullable.group({
    reason: ['', Validators.required],
    resolution: ['ledger_adjustment' as 'ledger_adjustment' | 'account_refund', Validators.required],
    refundAccountId: [''],
    returnLines: this.formBuilder.array([]),
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
    const id = this.route.snapshot.paramMap.get('id');
    const isEdit = Boolean(id && id !== 'new');
    if (isEdit && id) {
      this.saleId.set(id);
    }

    if (!this.canView() && !this.canCreate()) {
      this.loading.set(false);
      return;
    }

    const masters$ = forkJoin({
      products: this.catalogApi.listProducts(),
      branches: this.locationsApi.listBranches(),
      warehouses: this.locationsApi.listWarehouses(),
      customers: this.customersApi.listCustomers(),
      accounts: this.api.listPosPaymentAccounts().pipe(catchError(() => of([]))),
      refundAccounts: this.accountsApi.listAccounts().pipe(catchError(() => of([]))),
      relatedReturns:
        isEdit && id && this.canViewReturns()
          ? this.returnsApi.listReturns({ saleId: id }).pipe(catchError(() => of([])))
          : of([]),
    });

    if (isEdit && id) {
      forkJoin({
        masters: masters$,
        sale: this.api.getSale(id),
      }).subscribe({
        next: ({ masters, sale }) => {
          this.applyMasters(masters);
          this.applySale(sale);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load sale.'));
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
          this.errorMessage.set(this.mapError(error, 'Unable to load sale form.'));
        },
      });
    }
  }

  lineGroup(index: number): FormGroup {
    return this.lines.at(index) as FormGroup;
  }

  paymentGroup(index: number): FormGroup {
    return this.payments.at(index) as FormGroup;
  }

  packagingUnitsForLine(index: number): PackagingUnitRecord[] {
    return this.packagingByLine()[index] ?? [];
  }

  onProductSearchInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.productSearchQuery.set(target.value);
    }
  }

  addLine(): void {
    if (this.isPosted()) {
      return;
    }
    const index = this.lines.length;
    this.lines.push(this.createLineGroup());
    this.bindLineProductChanges(index);
  }

  removeLine(index: number): void {
    if (this.isPosted()) {
      return;
    }
    if (this.lines.length <= 1) {
      this.lines.at(0).reset({
        productId: '',
        packagingUnitId: '',
        quantity: '',
        unitPrice: '',
        priceOverrideReason: '',
      });
      this.packagingByLine.update((current) => ({ ...current, [0]: [] }));
      return;
    }
    this.lines.removeAt(index);
    this.rebuildPackagingMap();
  }

  addPayment(): void {
    if (this.isPosted()) {
      return;
    }
    this.payments.push(this.createPaymentGroup());
  }

  removePayment(index: number): void {
    if (this.isPosted()) {
      return;
    }
    this.payments.removeAt(index);
  }

  save(): void {
    if (!this.canCreate() || this.isPosted() || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const payload = this.buildPayload();
    const id = this.saleId();
    const request$ =
      id === null
        ? this.api.createSale(payload)
        : this.api.updateSale(id, { ...payload, expectedVersion: this.version });

    request$.subscribe({
      next: (record) => {
        this.saving.set(false);
        this.successMessage.set('Sale draft saved. Post when ready to apply stock and receivable effects.');
        if (id === null) {
          this.saleId.set(record.id);
          this.version = record.version;
          void this.router.navigateByUrl(`/app/sales/${record.id}`, { replaceUrl: true });
        } else {
          this.applySale(record);
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to save sale draft.'));
      },
    });
  }

  fillFullCash(): void {
    if (!this.isDraft()) {
      return;
    }
    const accountId = this.accounts()[0]?.id ?? '';
    if (this.payments.length === 0) {
      this.payments.push(this.createPaymentGroup({ accountId, amount: this.cartEstimate() }));
      return;
    }
    this.paymentGroup(0).patchValue({ accountId, amount: this.cartEstimate() });
  }

  clearPaymentsForCredit(): void {
    if (!this.isDraft()) {
      return;
    }
    this.payments.clear();
  }

  cartEstimate(): string {
    let total = 0;
    for (const control of this.lines.controls) {
      const value = (control as FormGroup).getRawValue() as { quantity: string; unitPrice: string };
      const quantity = Number(value.quantity);
      const unitPrice = Number(value.unitPrice);
      if (Number.isFinite(quantity) && Number.isFinite(unitPrice)) {
        total += quantity * unitPrice;
      }
    }
    return total.toFixed(2);
  }

  post(): void {
    const id = this.saleId();
    if (!id || !this.canPost() || this.isPosted() || this.posting()) {
      return;
    }
    for (const control of this.payments.controls) {
      if (control.invalid) {
        control.markAllAsTouched();
        this.errorMessage.set('Fix payment lines before posting.');
        return;
      }
    }
    this.posting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const idempotencyKey = this.postIdempotencySaleId === id && this.postIdempotencyKey
      ? this.postIdempotencyKey
      : crypto.randomUUID();
    this.postIdempotencyKey = idempotencyKey;
    this.postIdempotencySaleId = id;

    const payments: SalePaymentInput[] = this.payments.controls.map((control) => {
      const value = (control as FormGroup).getRawValue() as {
        accountId: string;
        amount: string;
      };
      return {
        accountId: value.accountId,
        amount: { amount: value.amount.trim(), currency: 'PKR' },
      };
    });

    const linePriceOverrides: SaleLinePriceOverrideInput[] = [];
    this.lines.controls.forEach((control, index) => {
      const reason = String((control as FormGroup).get('priceOverrideReason')?.value ?? '').trim();
      if (reason !== '') {
        linePriceOverrides.push({ lineIndex: index, reason });
      }
    });

    const approvals: SalePostApprovalsInput = {};
    const creditReason = this.form.controls.creditLimitApprovalReason.value.trim();
    const expiredReason = this.form.controls.expiredStockApprovalReason.value.trim();
    const negativeReason = this.form.controls.negativeStockOverrideReason.value.trim();
    if (creditReason !== '') {
      approvals.creditLimit = { reason: creditReason };
    }
    if (expiredReason !== '') {
      approvals.expiredStock = { reason: expiredReason };
    }
    if (negativeReason !== '') {
      approvals.negativeStock = { reason: negativeReason };
    }

    this.api
      .postSale(
        id,
        {
          expectedVersion: this.version,
          payments,
          ...(linePriceOverrides.length > 0 ? { linePriceOverrides } : {}),
          ...(Object.keys(approvals).length > 0 ? { approvals } : {}),
        },
        idempotencyKey,
      )
      .subscribe({
        next: (record) => {
          this.posting.set(false);
          this.postIdempotencyKey = null;
          this.postIdempotencySaleId = null;
          const invoice = record.invoiceNumber ? ` Invoice ${record.invoiceNumber}.` : '';
          this.successMessage.set(`Sale posted successfully.${invoice}`);
          this.applySale(record);
        },
        error: (error: unknown) => {
          this.posting.set(false);
          if (error instanceof HttpErrorResponse && error.status > 0 && error.status < 500) {
            this.postIdempotencyKey = null;
            this.postIdempotencySaleId = null;
          }
          this.errorMessage.set(this.mapError(error, 'Unable to post sale.'));
        },
      });
  }

  cancel(): void {
    const id = this.saleId();
    if (!id || !this.canCancel() || !this.isPosted() || this.cancelling()) {
      return;
    }
    if (this.cancelForm.invalid) {
      this.cancelForm.markAllAsTouched();
      this.errorMessage.set('A cancellation reason is required.');
      return;
    }
    this.cancelling.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const { reason } = this.cancelForm.getRawValue();
    this.api
      .cancelSale(id, { reason, expectedVersion: this.version }, crypto.randomUUID())
      .subscribe({
        next: (record) => {
          this.cancelling.set(false);
          this.successMessage.set('Sale cancelled.');
          this.applySale(record);
        },
        error: (error: unknown) => {
          this.cancelling.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to cancel sale.'));
      },
    });
  }

  returnLineGroup(index: number): FormGroup {
    return this.returnLines.at(index) as FormGroup;
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
  }

  removeReturnLine(index: number): void {
    this.returnLines.removeAt(index);
  }

  submitReturn(): void {
    const id = this.saleId();
    if (!id || !this.canReturn() || !this.isPosted() || this.submittingReturn()) {
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
        unsellableReason:
          line.stockCondition === 'unsellable' ? line.unsellableReason : null,
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
    const { reason, resolution, refundAccountId } = this.returnForm.getRawValue();
    if (!reason.trim()) {
      this.errorMessage.set('A return reason is required.');
      return;
    }
    if (resolution === 'account_refund' && !refundAccountId) {
      this.errorMessage.set('Select a refund account for cash/bank/digital refund.');
      return;
    }
    if (!this.sale()?.customerId && resolution === 'ledger_adjustment') {
      this.errorMessage.set('Walk-in returns require an account refund, not a ledger adjustment.');
      return;
    }
    this.submittingReturn.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.salesReturnsApi
      .createLinkedReturn(id, { lines })
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
          this.returnForm.patchValue({ reason: '' });
          if (id) {
            this.api.getSale(id).subscribe({
              next: (record) => this.applySale(record),
            });
            this.reloadRelatedReturns(id);
          }
        },
        error: (error: unknown) => {
          this.submittingReturn.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to post sales return.'));
        },
      });
  }

  discard(): void {
    const id = this.saleId();
    if (!id || !this.canCreate() || this.isPosted()) {
      return;
    }
    this.discarding.set(true);
    this.errorMessage.set(null);
    this.api.discardSale(id).subscribe({
      next: () => {
        this.discarding.set(false);
        void this.router.navigateByUrl('/app/sales');
      },
      error: (error: unknown) => {
        this.discarding.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to discard sale draft.'));
      },
    });
  }

  private createLineGroup(
    values: {
      productId?: string;
      packagingUnitId?: string;
      quantity?: string;
      unitPrice?: string;
      priceOverrideReason?: string;
    } = {},
  ): FormGroup {
    return this.formBuilder.nonNullable.group({
      productId: [values.productId ?? '', Validators.required],
      packagingUnitId: [values.packagingUnitId ?? ''],
      quantity: [values.quantity ?? '', Validators.required],
      unitPrice: [values.unitPrice ?? '', Validators.required],
      priceOverrideReason: [values.priceOverrideReason ?? ''],
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
    products: ProductRecord[];
    branches: BranchRecord[];
    warehouses: WarehouseRecord[];
    customers: CustomerRecord[];
    accounts: PosPaymentAccount[];
    refundAccounts: AccountRecord[];
    relatedReturns?: SalesReturnRecord[];
  }): void {
    this.products.set(masters.products.filter((item) => item.status === 'active'));
    this.branches.set(
      this.sessionStore.filterBranches(masters.branches.filter((item) => item.status === 'active')),
    );
    this.warehouses.set(
      this.sessionStore.filterWarehouses(
        masters.warehouses.filter((item) => item.status === 'active'),
      ),
    );
    this.customers.set(masters.customers.filter((item) => item.status === 'active'));
    this.accounts.set(masters.accounts);
    this.refundAccounts.set(masters.refundAccounts.filter((item) => item.status === 'active'));
    if (masters.relatedReturns) {
      this.relatedReturns.set(masters.relatedReturns);
    }
    this.bindLineProductChanges(0);
    this.form.controls.customerId.valueChanges.subscribe(() => {
      this.refreshTierPricesForAllLines();
    });
  }

  private applySale(sale: SaleRecord): void {
    this.sale.set(sale);
    this.version = sale.version;
    const locked = sale.status === 'posted' || sale.status === 'cancelled';

    this.form.patchValue({
      branchId: sale.branchId,
      warehouseId: sale.warehouseId,
      customerId: sale.customerId ?? '',
      saleDate: sale.saleDate,
      notes: sale.notes ?? '',
    });

    this.lines.clear();
    const nextPackaging: Record<number, PackagingUnitRecord[]> = {};
    sale.lines.forEach((line, index) => {
      this.lines.push(
        this.createLineGroup({
          productId: line.productId,
          packagingUnitId: line.packagingUnitId ?? '',
          quantity: line.quantity,
          unitPrice: line.unitPrice.amount,
          priceOverrideReason: line.priceOverrideReason ?? '',
        }),
      );
      if (!locked) {
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
    }

    this.payments.clear();
    if (locked) {
      for (const payment of sale.payments ?? []) {
        this.payments.push(
          this.createPaymentGroup({
            accountId: payment.accountId,
            amount: payment.amount.amount,
          }),
        );
      }
    }

    if (locked) {
      this.form.disable({ emitEvent: false });
    } else {
      this.form.enable({ emitEvent: false });
    }
  }

  private bindLineProductChanges(index: number): void {
    const control = this.lineGroup(index).get('productId');
    if (!control) {
      return;
    }
    control.valueChanges.subscribe((productId: string) => {
      this.lineGroup(index).patchValue({ packagingUnitId: '' }, { emitEvent: false });
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
      this.refreshTierPriceForLine(index);
    });
  }

  private refreshTierPricesForAllLines(): void {
    for (let index = 0; index < this.lines.length; index += 1) {
      this.refreshTierPriceForLine(index);
    }
  }

  private refreshTierPriceForLine(index: number): void {
    const productId = String(this.lineGroup(index).get('productId')?.value ?? '');
    if (!productId) {
      return;
    }
    const customerId = this.form.controls.customerId.value.trim();
    const customer = this.customers().find((item) => item.id === customerId);
    const priceTier = customer?.priceTier ?? 'retail';
    this.catalogApi.listPrices(productId).subscribe({
      next: (prices) => {
        const active = prices.filter((item) => item.status === 'active');
        const tier = active.find((item) => item.priceTier === priceTier);
        const retail = active.find((item) => item.priceTier === 'retail');
        const selected = tier ?? retail;
        if (selected) {
          this.lineGroup(index).patchValue({ unitPrice: selected.price.amount }, { emitEvent: false });
        }
      },
    });
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

  private buildPayload(): SaleDraftInput {
    const value = this.form.getRawValue();
    const rawLines = value.lines as Array<{
      productId: string;
      packagingUnitId: string;
      quantity: string;
      unitPrice: string;
    }>;
    const lines: SaleLineInput[] = rawLines.map((line) => {
      const payload: SaleLineInput = {
        productId: line.productId,
        quantity: line.quantity.trim(),
        unitPrice: { amount: line.unitPrice.trim(), currency: 'PKR' },
      };
      if (line.packagingUnitId.trim() !== '') {
        payload.packagingUnitId = line.packagingUnitId;
      }
      return payload;
    });

    const customerId = value.customerId.trim();
    return {
      branchId: value.branchId,
      warehouseId: value.warehouseId,
      customerId: customerId === '' ? null : customerId,
      saleDate: value.saleDate,
      notes: value.notes.trim(),
      lines,
    };
  }

  private reloadRelatedReturns(saleId: string): void {
    if (!this.canViewReturns()) {
      return;
    }
    this.returnsApi.listReturns({ saleId }).subscribe({
      next: (items) => this.relatedReturns.set(items),
    });
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This sale changed elsewhere. Reload and try again.';
    }
    if (error.status === 403) {
      const message = error.error?.error?.message ?? fallback;
      if (/approval|override|credit-limit|expired|negative-stock/i.test(message)) {
        if (
          this.canApproveCreditLimit() ||
          this.canApproveExpiredStock() ||
          this.canOverrideNegativeStock()
        ) {
          return `${message} Enter the required approval reason and post again.`;
        }
        return `${message} A Manager or Owner must complete this sale.`;
      }
      return message;
    }
    return error.error?.error?.message ?? fallback;
  }
}
