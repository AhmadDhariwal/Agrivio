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
import { PurchasesApi } from '../../data-access/purchases.api';
import {
  PurchaseDraftInput,
  PurchaseLineInput,
  PurchasePaymentInput,
  PurchaseRecord,
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
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-purchase-edit-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './purchase-edit.page.html',
  styleUrl: './purchase-edit.page.scss',
})
export class PurchaseEditPage {
  private readonly api = inject(PurchasesApi);
  private readonly catalogApi = inject(CatalogApi);
  private readonly locationsApi = inject(BranchesWarehousesApi);
  private readonly suppliersApi = inject(SuppliersApi);
  private readonly accountsApi = inject(AccountsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly purchaseId = signal<string | null>(null);
  readonly purchase = signal<PurchaseRecord | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly discarding = signal(false);
  readonly posting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly products = signal<ProductRecord[]>([]);
  readonly warehouses = signal<WarehouseRecord[]>([]);
  readonly suppliers = signal<SupplierRecord[]>([]);
  readonly accounts = signal<AccountRecord[]>([]);
  readonly packagingByLine = signal<Record<number, PackagingUnitRecord[]>>({});
  readonly canCreate = computed(() => this.sessionStore.hasPermission('purchases.create'));
  readonly canPost = computed(() => this.sessionStore.hasPermission('purchases.post'));
  readonly canView = computed(() => this.sessionStore.hasPermission('purchases.view'));
  readonly isPosted = computed(() => this.purchase()?.status === 'posted');
  readonly isDraft = computed(() => {
    const record = this.purchase();
    return record === null || record.status === 'draft';
  });
  private version = 1;

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
      this.purchaseId.set(id);
    }

    if (!this.canView() && !this.canCreate()) {
      this.loading.set(false);
      return;
    }

    const masters$ = forkJoin({
      products: this.catalogApi.listProducts(),
      warehouses: this.locationsApi.listWarehouses(),
      suppliers: this.suppliersApi.listSuppliers(),
      accounts: this.accountsApi.listAccounts(),
    });

    if (isEdit && id) {
      forkJoin({
        masters: masters$,
        purchase: this.api.getPurchase(id),
      }).subscribe({
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

  paymentGroup(index: number): FormGroup {
    return this.payments.at(index) as FormGroup;
  }

  trackingModeForLine(index: number): string {
    const productId = String(this.lineGroup(index).get('productId')?.value ?? '');
    return this.products().find((item) => item.id === productId)?.trackingMode ?? 'none';
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
        unitCost: '',
        batchNumber: '',
        manufacturingDate: '',
        expiryDate: '',
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
    const id = this.purchaseId();
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
          void this.router.navigateByUrl(`/app/purchases/${record.id}`, { replaceUrl: true });
        } else {
          this.applyPurchase(record);
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to save purchase draft.'));
      },
    });
  }

  discard(): void {
    const id = this.purchaseId();
    if (!id || !this.canCreate() || this.isPosted()) {
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
    }
    this.posting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    const payments: PurchasePaymentInput[] = this.payments.controls.map((control) => {
      const value = (control as FormGroup).getRawValue() as {
        accountId: string;
        amount: string;
      };
      return {
        accountId: value.accountId,
        amount: { amount: value.amount.trim(), currency: 'PKR' },
      };
    });

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
    products: ProductRecord[];
    warehouses: WarehouseRecord[];
    suppliers: SupplierRecord[];
    accounts: AccountRecord[];
  }): void {
    this.products.set(masters.products.filter((item) => item.status === 'active'));
    this.warehouses.set(masters.warehouses.filter((item) => item.status === 'active'));
    this.suppliers.set(masters.suppliers.filter((item) => item.status === 'active'));
    this.accounts.set(masters.accounts.filter((item) => item.status === 'active'));
    this.bindLineProductChanges(0);
  }

  private applyPurchase(purchase: PurchaseRecord): void {
    this.purchase.set(purchase);
    this.version = purchase.version;
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
    purchase.lines.forEach((line, index) => {
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

  private buildPayload(): PurchaseDraftInput {
    const value = this.form.getRawValue();
    const rawLines = value.lines as Array<{
      productId: string;
      packagingUnitId: string;
      quantity: string;
      unitCost: string;
      batchNumber: string;
      manufacturingDate: string;
      expiryDate: string;
    }>;
    const lines: PurchaseLineInput[] = rawLines.map((line) => {
      const mode =
        this.products().find((item) => item.id === line['productId'])?.trackingMode ?? 'none';
      const payload: PurchaseLineInput = {
        productId: line['productId'],
        quantity: line['quantity'].trim(),
        unitCost: { amount: line['unitCost'].trim(), currency: 'PKR' },
      };
      if (line['packagingUnitId'].trim() !== '') {
        payload.packagingUnitId = line['packagingUnitId'];
      }
      if (mode !== 'none' && line['batchNumber'].trim() !== '') {
        payload.batchNumber = line['batchNumber'].trim();
      }
      if (line['manufacturingDate'].trim() !== '') {
        payload.manufacturingDate = line['manufacturingDate'].trim();
      }
      if (mode === 'batch_expiry' && line['expiryDate'].trim() !== '') {
        payload.expiryDate = line['expiryDate'].trim();
      }
      return payload;
    });

    return {
      warehouseId: value.warehouseId,
      supplierId: value.supplierId,
      purchaseDate: value.purchaseDate,
      supplierInvoiceReference: value.supplierInvoiceReference.trim(),
      notes: value.notes.trim(),
      lines,
      landedCosts: {
        freight: { amount: value.freight.trim() || '0.00', currency: 'PKR' },
        loading: { amount: value.loadingCost.trim() || '0.00', currency: 'PKR' },
        transport: { amount: value.transport.trim() || '0.00', currency: 'PKR' },
        other: { amount: value.other.trim() || '0.00', currency: 'PKR' },
      },
    };
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
}
