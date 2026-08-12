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
import { forkJoin } from 'rxjs';
import { SalesApi } from '../../data-access/sales.api';
import {
  SaleDraftInput,
  SaleLineInput,
  SaleLinePriceOverrideInput,
  SalePaymentInput,
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
  readonly discarding = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly products = signal<ProductRecord[]>([]);
  readonly branches = signal<BranchRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly customers = signal<CustomerRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);
  readonly packagingByLine = signal<Record<number, PackagingUnitRecord[]>>({});
  readonly canCreate = computed(() => this.sessionStore.hasPermission('sales.create'));
  readonly canPost = computed(() => this.sessionStore.hasPermission('sales.post'));
  readonly canView = computed(() => this.sessionStore.hasPermission('sales.view'));
  readonly canOverridePrice = computed(() => this.sessionStore.hasPermission('pricing.override'));
  readonly isPosted = computed(() => this.sale()?.status === 'posted');
  readonly isDraft = computed(() => {
    const record = this.sale();
    return record === null || record.status === 'draft';
  });
  private version = 1;

  readonly form = this.formBuilder.nonNullable.group({
    branchId: ['', Validators.required],
    warehouseId: ['', Validators.required],
    customerId: [''],
    saleDate: ['', Validators.required],
    notes: [''],
    lines: this.formBuilder.array([this.createLineGroup()]),
    payments: this.formBuilder.array<FormGroup>([]),
  });

  get lines(): FormArray {
    return this.form.controls.lines;
  }

  get payments(): FormArray {
    return this.form.controls.payments;
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
      accounts: this.accountsApi.listAccounts(),
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

    this.api
      .postSale(
        id,
        {
          expectedVersion: this.version,
          payments,
          ...(linePriceOverrides.length > 0 ? { linePriceOverrides } : {}),
        },
        crypto.randomUUID(),
      )
      .subscribe({
        next: (record) => {
          this.posting.set(false);
          this.successMessage.set('Sale posted successfully.');
          this.applySale(record);
        },
        error: (error: unknown) => {
          this.posting.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to post sale.'));
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
    accounts: AccountRecord[];
  }): void {
    this.products.set(masters.products.filter((item) => item.status === 'active'));
    this.branches.set(masters.branches.filter((item) => item.status === 'active'));
    this.warehouses.set(masters.warehouses.filter((item) => item.status === 'active'));
    this.customers.set(masters.customers.filter((item) => item.status === 'active'));
    this.accounts.set(masters.accounts.filter((item) => item.status === 'active'));
    this.bindLineProductChanges(0);
    this.form.controls.customerId.valueChanges.subscribe(() => {
      this.refreshTierPricesForAllLines();
    });
  }

  private applySale(sale: SaleRecord): void {
    this.sale.set(sale);
    this.version = sale.version;
    const posted = sale.status === 'posted';

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
    }

    this.payments.clear();
    if (posted) {
      for (const payment of sale.payments ?? []) {
        this.payments.push(
          this.createPaymentGroup({
            accountId: payment.accountId,
            amount: payment.amount.amount,
          }),
        );
      }
    }

    if (posted) {
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

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This sale changed elsewhere. Reload and try again.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
