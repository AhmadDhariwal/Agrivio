import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  EMPTY,
  forkJoin,
  of,
  catchError,
  map,
  switchMap,
  Subject,
  debounceTime,
  distinctUntilChanged,
  merge,
} from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import {
  hasRequiredValidator,
  fieldValidationMessage,
  setRequiredValidator,
} from '../../../../shared/form/form-field.util';
import { UiConfirmDialogComponent } from '../../../../shared/ui/ui-confirm-dialog/ui-confirm-dialog.component';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

@Component({
  selector: 'agrivio-sale-edit-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiConfirmDialogComponent,
    UiFieldLabelComponent,
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
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly productSearchChanges = new Subject<string>();
  private readonly customerSearchChanges = new Subject<string>();
  private readonly customerSearchImmediate = new Subject<string>();
  private static readonly SELECTOR_SEARCH_LIMIT = 25;
  @ViewChild('customerPicker') customerPickerRef?: ElementRef<HTMLElement>;

  readonly customerTypeOptions = [
    { value: 'walk_in', label: 'Walk-in (cash only)' },
    { value: 'farmer', label: 'Farmer' },
    { value: 'individual', label: 'Individual' },
    { value: 'business', label: 'Business' },
    { value: 'corporate', label: 'Corporate' },
  ] as const;

  readonly saleId = signal<string | null>(null);
  readonly sale = signal<SaleRecord | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly posting = signal(false);
  readonly cancelling = signal(false);
  readonly submittingReturn = signal(false);
  readonly discarding = signal(false);
  readonly discardConfirmOpen = signal(false);
  readonly cancelConfirmOpen = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);
  readonly customerDropdownOpen = signal(false);
  readonly customerSearchTerm = signal('');
  readonly customers = signal<CustomerRecord[]>([]);
  readonly customerSearchLoading = signal(false);
  readonly customerSearchError = signal(false);
  readonly selectedCustomer = signal<CustomerRecord | null>(null);
  readonly products = signal<ProductRecord[]>([]);
  readonly productSearchQuery = signal('');
  readonly branches = signal<BranchRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly accounts = signal<PosPaymentAccount[]>([]);
  readonly refundAccounts = signal<AccountRecord[]>([]);
  readonly relatedReturns = signal<SalesReturnRecord[]>([]);
  readonly lastPostedReturnId = signal<string | null>(null);
  readonly packagingByLine = signal<Record<number, PackagingUnitRecord[]>>({});
  readonly canUseSales = computed(() => this.capabilityService?.canUseModule('sales') ?? true);
  readonly canCreate = computed(() => this.sessionStore.hasPermission('sales.create'));
  readonly canCreateDraft = computed(
    () =>
      this.sessionStore.hasPermission('sales.create') &&
      (this.capabilityService?.canPerformAction('sales.actions.createDraft') ?? true),
  );
  readonly canEditDraft = computed(
    () =>
      this.sessionStore.hasPermission('sales.create') &&
      (this.capabilityService?.canPerformAction('sales.actions.editDraft') ?? true),
  );
  readonly canDiscardDraft = computed(
    () =>
      this.sessionStore.hasPermission('sales.create') &&
      (this.capabilityService?.canPerformAction('sales.actions.discardDraft') ?? true),
  );
  readonly canPost = computed(
    () =>
      this.sessionStore.hasPermission('sales.post') &&
      (this.capabilityService?.canPerformAction('sales.actions.post') ?? true),
  );
  readonly canCancel = computed(
    () =>
      this.sessionStore.hasPermission('sales.cancel') &&
      (this.capabilityService?.canPerformAction('sales.actions.cancel') ?? true),
  );
  readonly canReturn = computed(
    () =>
      this.sessionStore.hasPermission('returns.post') &&
      (this.capabilityService?.canPerformAction('sales.actions.createReturn') ?? true) &&
      (this.capabilityService?.canPerformAction('returns.actions.post') ?? true),
  );
  readonly canViewReturns = computed(() => this.sessionStore.hasPermission('returns.view'));
  readonly canView = computed(() => this.sessionStore.hasPermission('sales.view'));
  readonly canPrint = computed(
    () =>
      this.sessionStore.hasPermission('sales.view') &&
      (this.capabilityService?.canPerformAction('sales.actions.print') ?? true),
  );
  readonly canAddPaymentAtPost = computed(
    () =>
      (this.capabilityService?.canPerformAction('sales.actions.addPaymentAtPost') ?? true) &&
      this.canPost(),
  );
  readonly canSellOnCredit = computed(
    () =>
      (this.capabilityService?.canPerformAction('sales.actions.sellOnCredit') ?? true) &&
      this.canPost(),
  );
  readonly canOverridePrice = computed(
    () =>
      this.sessionStore.hasPermission('pricing.override') &&
      (this.capabilityService?.canPerformAction('sales.actions.overridePrice') ?? true) &&
      this.canPost(),
  );
  readonly canApproveCreditLimit = computed(
    () =>
      this.sessionStore.hasPermission('sales.credit-limit.approve') &&
      (this.capabilityService?.canPerformAction('sales.actions.approveCreditLimit') ?? true) &&
      this.canPost(),
  );
  readonly canApproveExpiredStock = computed(
    () =>
      this.sessionStore.hasPermission('sales.expired-stock.approve') &&
      (this.capabilityService?.canPerformAction('sales.actions.approveExpiredStock') ?? true) &&
      this.canPost(),
  );
  readonly canOverrideNegativeStock = computed(
    () =>
      this.sessionStore.hasPermission('inventory.negative-stock.override') &&
      (this.capabilityService?.canPerformAction('sales.actions.overrideNegativeStock') ?? true) &&
      this.canPost(),
  );
  readonly canUseCustomerSearch = computed(
    () => this.capabilityService?.canUseFeature('sales.features.customerSearch') ?? true,
  );
  readonly canViewCustomerField = computed(
    () => this.capabilityService?.canViewField('sales.fields.customer') ?? true,
  );
  readonly canEditCustomerField = computed(
    () => this.capabilityService?.canEditField('sales.fields.customer') ?? true,
  );
  readonly canViewNotesField = computed(
    () => this.capabilityService?.canViewField('sales.fields.notes') ?? true,
  );
  readonly canEditNotesField = computed(
    () => this.capabilityService?.canEditField('sales.fields.notes') ?? true,
  );
  readonly canViewPackagingUnitField = computed(
    () => this.capabilityService?.canViewField('sales.fields.packagingUnit') ?? true,
  );
  readonly canEditPackagingUnitField = computed(
    () => this.capabilityService?.canEditField('sales.fields.packagingUnit') ?? true,
  );
  readonly isPosted = computed(() => this.sale()?.status === 'posted');
  readonly isCancelled = computed(() => this.sale()?.status === 'cancelled');
  readonly isDraft = computed(() => {
    const record = this.sale();
    return record === null || record.status === 'draft';
  });
  readonly canSaveDraft = computed(() => {
    const canMutate = this.saleId() === null ? this.canCreateDraft() : this.canEditDraft();
    return canMutate && this.isDraft() && this.form.valid && !this.saving() && !this.posting();
  });

  statusLabel(status?: string | null): string {
    if (status === 'posted') return 'Posted';
    if (status === 'cancelled') return 'Cancelled';
    return 'Draft';
  }
  private version = 1;
  private postIdempotencyKey: string | null = null;
  private postIdempotencySaleId: string | null = null;

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  readonly selectedCustomerLabel = computed(() => {
    const customerId = this.form.controls.customerId.value.trim();
    if (customerId === '') {
      return 'Select customer';
    }
    const selected = this.selectedCustomer();
    if (selected?.id === customerId) {
      return `${selected.name} (${selected.priceTier})`;
    }
    const match = this.customers().find((item) => item.id === customerId);
    if (match) {
      return `${match.name} (${match.priceTier})`;
    }
    return 'Selected customer';
  });

  readonly form = this.formBuilder.nonNullable.group({
    branchId: ['', Validators.required],
    warehouseId: ['', Validators.required],
    customerTypeMode: ['walk_in'],
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
    resolution: [
      'ledger_adjustment' as 'ledger_adjustment' | 'account_refund',
      Validators.required,
    ],
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
    this.returnForm.controls.resolution.valueChanges.subscribe((resolution) => {
      setRequiredValidator(
        this.returnForm.controls.refundAccountId,
        resolution === 'account_refund',
      );
    });

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
      branches: this.locationsApi.listBranchOptions(),
      warehouses: this.locationsApi.listWarehouseOptions(),
      accounts: this.api.listPosPaymentAccounts().pipe(catchError(() => of([]))),
      refundAccounts: this.accountsApi.listAccountOptions().pipe(catchError(() => of([]))),
      relatedReturns:
        isEdit && id && this.canViewReturns()
          ? this.returnsApi.listReturns({ saleId: id, page: 1, pageSize: 100 }).pipe(
              map((result) => result.items),
              catchError(() => of([])),
            )
          : of([]),
    });

    this.productSearchChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) =>
          this.catalogApi.searchProductOptions(query, SaleEditPage.SELECTOR_SEARCH_LIMIT, 'active'),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => this.products.set(items.filter((item) => item.status === 'active')));

    merge(
      this.customerSearchImmediate,
      this.customerSearchChanges.pipe(debounceTime(300), distinctUntilChanged()),
    )
      .pipe(
        switchMap((query) =>
          this.customersApi.searchCustomerOptions(query).pipe(
            catchError(() => {
              this.customerSearchError.set(true);
              return of([] as CustomerRecord[]);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.customers.set(
          this.mergeCustomerOptions(items.filter((item) => item.status === 'active')),
        );
        this.customerSearchLoading.set(false);
      });

    this.form.controls.customerTypeMode.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        setRequiredValidator(this.form.controls.customerId, type !== 'walk_in');
        if (type === 'walk_in') {
          this.form.controls.customerId.setValue('');
          this.selectedCustomer.set(null);
          this.closeCustomerDropdown();
        } else {
          const selected = this.selectedCustomer();
          if (selected && selected.customerType !== type) {
            this.form.controls.customerId.setValue('');
            this.selectedCustomer.set(null);
          }
          if (this.customerDropdownOpen()) {
            this.requestCustomerSearch();
          }
        }
        this.refreshTierPricesForAllLines();
      });

    this.form.controls.customerId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.refreshTierPricesForAllLines();
      });

    if (isEdit && id) {
      this.api
        .getSale(id)
        .pipe(
          switchMap((sale) => {
            if (sale.status !== 'draft') {
              void this.router.navigateByUrl(`/app/sales/${sale.id}`, { replaceUrl: true });
              return EMPTY;
            }
            return masters$.pipe(map((masters) => ({ masters, sale })));
          }),
        )
        .subscribe({
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
      this.productSearchChanges.next(target.value.trim());
    }
  }

  onCustomerSearchInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.customerSearchTerm.set(target.value);
    this.requestCustomerSearch(target.value.trim(), false);
  }

  isWalkInCustomerType(): boolean {
    return this.form.controls.customerTypeMode.value === 'walk_in';
  }

  filteredCustomers(): CustomerRecord[] {
    const type = this.form.controls.customerTypeMode.value;
    let items = this.customers();
    if (type !== 'walk_in') {
      items = items.filter((item) => item.customerType === type);
    }
    return items;
  }

  getCustomerTypeLabel(type: string): string {
    return this.customerTypeOptions.find((item) => item.value === type)?.label ?? type;
  }

  toggleCustomerDropdown(event?: Event): void {
    event?.stopPropagation();
    if (!this.canEditCustomerField() || this.isPosted()) {
      return;
    }
    const opening = !this.customerDropdownOpen();
    this.customerDropdownOpen.set(opening);
    if (opening) {
      this.requestCustomerSearch();
    }
  }

  private requestCustomerSearch(query = this.customerSearchTerm().trim(), immediate = true): void {
    if (!this.canUseCustomerSearch()) {
      return;
    }
    this.customerSearchLoading.set(true);
    this.customerSearchError.set(false);
    if (immediate) {
      this.customerSearchImmediate.next(query);
      return;
    }
    this.customerSearchChanges.next(query);
  }

  closeCustomerDropdown(): void {
    this.customerDropdownOpen.set(false);
  }

  selectCustomer(customer: CustomerRecord): void {
    this.form.controls.customerId.setValue(customer.id);
    this.selectedCustomer.set(customer);
    if (customer.customerType && customer.customerType !== 'walk_in') {
      this.form.controls.customerTypeMode.setValue(String(customer.customerType), {
        emitEvent: false,
      });
      setRequiredValidator(this.form.controls.customerId, true);
    }
    this.customerSearchTerm.set('');
    this.closeCustomerDropdown();
    this.refreshTierPricesForAllLines();
  }

  lineFieldError(index: number, controlName: string, label: string): string | null {
    return fieldValidationMessage(
      this.lineGroup(index).get(controlName),
      label,
      this.formSubmitAttempted(),
    );
  }

  canSearchCustomers(): boolean {
    return (
      this.form.controls.branchId.value.trim() !== '' &&
      this.form.controls.warehouseId.value.trim() !== ''
    );
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.customerDropdownOpen()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    const picker = this.customerPickerRef?.nativeElement;
    if (picker?.contains(target)) {
      return;
    }
    this.closeCustomerDropdown();
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
    const id = this.saleId();
    const canManage = id === null ? this.canCreateDraft() : this.canEditDraft();
    if (!canManage || !this.isDraft()) {
      return;
    }
    const validationError = this.validateFormForSubmit();
    if (validationError !== null) {
      this.errorMessage.set(validationError);
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const payload = this.buildPayload();
    const request$ =
      id === null
        ? this.api.createSale(payload)
        : this.api.updateSale(id, { ...payload, expectedVersion: this.version });

    request$.subscribe({
      next: (record) => {
        this.saving.set(false);
        this.successMessage.set(
          'Sale draft saved. Post when ready to apply stock and receivable effects.',
        );
        if (id === null) {
          this.saleId.set(record.id);
          this.version = record.version;
          void this.router.navigateByUrl(`/app/sales/${record.id}/edit`, { replaceUrl: true });
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
    if (!this.canPost() || this.isPosted() || this.posting()) {
      return;
    }
    const validationError = this.validateFormForSubmit();
    if (validationError !== null) {
      this.errorMessage.set(validationError);
      return;
    }
    for (const control of this.payments.controls) {
      if (control.invalid) {
        control.markAllAsTouched();
        this.errorMessage.set('Fix payment lines before posting.');
        return;
      }
    }

    const existingId = this.saleId();
    if (existingId !== null) {
      this.submitPost(existingId);
      return;
    }

    this.posting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.api.createSale(this.buildPayload()).subscribe({
      next: (record) => {
        this.saleId.set(record.id);
        this.version = record.version;
        void this.router.navigateByUrl(`/app/sales/${record.id}`, { replaceUrl: true });
        this.submitPost(record.id);
      },
      error: (error: unknown) => {
        this.posting.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to save sale before posting.'));
      },
    });
  }

  private submitPost(id: string): void {
    this.posting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const idempotencyKey =
      this.postIdempotencySaleId === id && this.postIdempotencyKey
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
    this.cancelConfirmOpen.set(true);
  }

  confirmCancel(): void {
    const id = this.saleId();
    this.cancelConfirmOpen.set(false);
    if (!id || !this.canCancel() || !this.isPosted() || this.cancelling()) {
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
    this.bindReturnLineConditionalRequired(this.returnLines.length - 1);
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
    this.discardConfirmOpen.set(true);
  }

  confirmDiscard(): void {
    const id = this.saleId();
    this.discardConfirmOpen.set(false);
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
    branches: BranchRecord[];
    warehouses: WarehouseRecord[];
    accounts: PosPaymentAccount[];
    refundAccounts: AccountRecord[];
    relatedReturns?: SalesReturnRecord[];
  }): void {
    this.branches.set(
      this.sessionStore.filterBranches(masters.branches.filter((item) => item.status === 'active')),
    );
    this.warehouses.set(
      this.sessionStore.filterWarehouses(
        masters.warehouses.filter((item) => item.status === 'active'),
      ),
    );
    this.accounts.set(masters.accounts);
    this.refundAccounts.set(masters.refundAccounts.filter((item) => item.status === 'active'));
    if (masters.relatedReturns) {
      this.relatedReturns.set(masters.relatedReturns);
    }
    this.productSearchChanges.next('');
    if (this.saleId() === null && this.form.controls.saleDate.value.trim() === '') {
      this.form.controls.saleDate.setValue(this.todayIsoDate());
    }
    this.bindLineProductChanges(0);
  }

  private todayIsoDate(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private validateFormForSubmit(): string | null {
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    for (let index = 0; index < this.lines.length; index += 1) {
      this.lineGroup(index).markAllAsTouched();
    }
    if (this.form.controls.branchId.invalid) {
      return 'Select a branch before continuing.';
    }
    if (this.form.controls.warehouseId.invalid) {
      return 'Select a warehouse before continuing.';
    }
    if (this.form.controls.saleDate.invalid) {
      return 'Enter a sale date before continuing.';
    }
    if (
      this.form.controls.customerTypeMode.value !== 'walk_in' &&
      this.form.controls.customerId.value.trim() === ''
    ) {
      return `Select a ${this.getCustomerTypeLabel(this.form.controls.customerTypeMode.value).toLowerCase()} customer before continuing.`;
    }
    for (let index = 0; index < this.lines.length; index += 1) {
      const line = this.lineGroup(index);
      if (line.get('productId')?.invalid) {
        return `Line ${index + 1}: select a product.`;
      }
      if (line.get('quantity')?.invalid) {
        return `Line ${index + 1}: enter a quantity.`;
      }
      if (line.get('unitPrice')?.invalid) {
        return `Line ${index + 1}: enter a unit price.`;
      }
    }
    return null;
  }

  private mergeCustomerOptions(items: CustomerRecord[]): CustomerRecord[] {
    const selected = this.selectedCustomer();
    if (!selected) {
      return items;
    }
    if (items.some((item) => item.id === selected.id)) {
      return items;
    }
    return [selected, ...items];
  }

  private seedSelectorOptionsFromSale(sale: SaleRecord): void {
    const seen = new Set<string>();
    const productOptions: ProductRecord[] = [];
    for (const line of sale.lines) {
      if (seen.has(line.productId)) {
        continue;
      }
      seen.add(line.productId);
      productOptions.push({
        id: line.productId,
        organizationId: sale.organizationId,
        categoryId: '',
        name: line.productNameSnapshot,
        sku: '',
        trackingMode: 'none',
        baseUnitCode: line.unitCodeSnapshot,
        measurementDimension: 'mass',
        status: 'active',
        version: 1,
      });
    }
    if (productOptions.length === 0) {
      return;
    }
    const merged = [...productOptions];
    for (const product of this.products()) {
      if (!seen.has(product.id)) {
        merged.push(product);
      }
    }
    this.products.set(merged);
  }

  private applySale(sale: SaleRecord): void {
    this.sale.set(sale);
    this.version = sale.version;
    this.seedSelectorOptionsFromSale(sale);
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

    const customerId = sale.customerId ?? '';
    if (customerId) {
      this.customersApi.getCustomer(customerId).subscribe({
        next: (customer) => {
          if (customer.status === 'active') {
            this.selectedCustomer.set(customer);
            this.customers.set(this.mergeCustomerOptions([customer]));
            this.form.controls.customerTypeMode.setValue(
              customer.customerType === 'walk_in' ? 'walk_in' : String(customer.customerType),
              { emitEvent: false },
            );
          }
        },
      });
    } else {
      this.selectedCustomer.set(null);
      this.form.controls.customerTypeMode.setValue('walk_in', { emitEvent: false });
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
    const customer =
      this.selectedCustomer()?.id === customerId
        ? this.selectedCustomer()
        : this.customers().find((item) => item.id === customerId);
    const priceTier = customer?.priceTier ?? 'retail';
    this.catalogApi.listPrices(productId).subscribe({
      next: (prices) => {
        const active = prices.filter((item) => item.status === 'active');
        const tier = active.find((item) => item.priceTier === priceTier);
        const retail = active.find((item) => item.priceTier === 'retail');
        const selected = tier ?? retail;
        if (selected) {
          this.lineGroup(index).patchValue(
            { unitPrice: selected.price.amount },
            { emitEvent: false },
          );
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
    this.returnsApi.listReturns({ saleId, page: 1, pageSize: 100 }).subscribe({
      next: (result) => this.relatedReturns.set(result.items),
    });
  }

  formatCurrency(
    val: { amount?: string; currency?: string } | string | number | undefined | null,
  ): string {
    if (val === undefined || val === null) return 'PKR 0.00';
    if (typeof val === 'object') {
      if (!val.amount) return `${val.currency || 'PKR'} 0.00`;
      const num = Number(val.amount);
      if (isNaN(num)) return `${val.currency || 'PKR'} ${val.amount}`;
      return `${val.currency || 'PKR'} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    const num = Number(val);
    if (isNaN(num)) return `PKR ${val}`;
    return `PKR ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatQuantity(val: string | number | undefined | null): string {
    if (val === undefined || val === null || val === '') return '0';
    const num = Number(val);
    if (isNaN(num)) return String(val);
    return num.toLocaleString('en-US');
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
