import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, catchError, debounceTime, distinctUntilChanged, forkJoin, map, of, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CatalogApi } from '../../data-access/catalog.api';
import { CategoryRecord, ProductRecord } from '../../models/catalog.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiFieldLabelComponent } from '../../../../shared/ui/ui-field-label/ui-field-label.component';
import {
  fieldValidationMessage,
  hasRequiredValidator,
} from '../../../../shared/form/form-field.util';
import { mapPlanLimitError } from '../../../../core/plan-limits/plan-limit-feedback';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';

const MAX_NAME = 160;
const MAX_SKU = 64;
const MAX_UNIT_CODE = 32;
const CONVERSION_FACTOR_PATTERN = /^\d+(\.\d{1,6})?$/;
const BATCH_REQUIRED_CLASSES = new Set(['fertilizer', 'seed', 'pesticide', 'chemical']);

@Component({
  selector: 'agrivio-product-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiFieldLabelComponent,
  ],
  templateUrl: './product-form.page.html',
  styleUrl: './product-form.page.scss',
})
export class ProductFormPage {
  private readonly api = inject(CatalogApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly categorySearchChanges = new Subject<string>();

  readonly productId = signal<string | null>(null);
  readonly categories = signal<CategoryRecord[]>([]);
  readonly selectedCategory = signal<CategoryRecord | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formSubmitAttempted = signal(false);
  readonly initialStatus = signal('active');
  readonly canManage = computed(() => {
    if (!this.sessionStore.hasPermission('catalog.manage')) {
      return false;
    }
    const action = this.productId() === null ? 'create' : 'edit';
    return this.capabilityService?.canPerformAction(`inventory.products.actions.${action}`) ?? true;
  });
  readonly canSave = computed(() => this.canManage() && this.form.valid && !this.saving());
  readonly showSku = computed(
    () => this.capabilityService?.canViewField('inventory.products.fields.sku') ?? true,
  );
  readonly canChangeStatus = computed(() => {
    const action = this.initialStatus() === 'active' ? 'deactivate' : 'reactivate';
    return this.capabilityService?.canPerformAction(`inventory.products.actions.${action}`) ?? true;
  });
  private version = 1;

  readonly fieldRequired = hasRequiredValidator;
  readonly fieldError = fieldValidationMessage;

  readonly form = this.formBuilder.nonNullable.group({
    categoryId: ['', [Validators.required]],
    name: ['', [Validators.required, Validators.maxLength(MAX_NAME)]],
    sku: ['', [Validators.maxLength(MAX_SKU)]],
    trackingMode: ['none' as string, [Validators.required, this.trackingModeValidator.bind(this)]],
    baseUnitCode: ['', [Validators.required, Validators.maxLength(MAX_UNIT_CODE)]],
    measurementDimension: ['mass' as string, [Validators.required]],
    status: ['active'],
    packagingUnits: this.formBuilder.array([this.createPackagingUnitGroup()]),
  });

  get packagingUnits(): FormArray {
    return this.form.controls.packagingUnits;
  }

  isReadOnlyField(key: string): boolean {
    return (
      this.productId() !== null &&
      !(this.capabilityService?.canEditField(`inventory.products.fields.${key}`) ?? true)
    );
  }

  packagingFieldError(index: number, controlName: 'name' | 'conversionFactor', label: string): string | null {
    const group = this.packagingUnits.at(index);
    const submitAttempted = this.formSubmitAttempted();
    const rowError = this.packagingRowError(group, controlName, label, submitAttempted);
    if (rowError) {
      return rowError;
    }
    return fieldValidationMessage(group.get(controlName), label, submitAttempted);
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');

    this.form.controls.categoryId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((categoryId) => {
        const category =
          this.categories().find((item) => item.id === categoryId) ??
          (this.selectedCategory()?.id === categoryId ? this.selectedCategory() : null);
        if (category) {
          this.selectedCategory.set(category);
        }
        this.form.controls.trackingMode.updateValueAndValidity({ emitEvent: false });
      });

    this.categorySearchChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => this.api.searchCategoryOptions(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (items) => {
          this.categories.set(
            this.mergeCategoryOptions(
              items,
              this.selectedCategory(),
              this.form.controls.categoryId.value,
            ),
          );
          this.form.controls.trackingMode.updateValueAndValidity({ emitEvent: false });
          if (this.productId() === null) {
            this.loading.set(false);
          }
        },
        error: (error: unknown) => {
          if (this.productId() === null) {
            this.loading.set(false);
          }
          this.errorMessage.set(this.mapError(error, 'Unable to load categories.'));
        },
      });

    if (id && id !== 'new') {
      this.productId.set(id);
      forkJoin({
        product: this.api.getProduct(id),
        packagingUnits: this.api.listPackagingUnits(id),
      })
        .pipe(
          switchMap(({ product, packagingUnits }) =>
            this.api.getCategory(product.categoryId).pipe(
              map((category) => ({ product, packagingUnits, category })),
              catchError(() => of({ product, packagingUnits, category: null })),
            ),
          ),
        )
        .subscribe({
          next: ({ product, packagingUnits, category }) => {
            if (category) {
              this.selectedCategory.set(category);
            }
            this.applyProduct(product);
            this.packagingUnits.clear();
            const activeUnits = packagingUnits.filter((unit) => unit.status === 'active');
            if (activeUnits.length === 0) {
              this.packagingUnits.push(this.createPackagingUnitGroup());
            } else {
              for (const unit of activeUnits) {
                this.packagingUnits.push(
                  this.createPackagingUnitGroup(unit.name, unit.conversionFactor),
                );
              }
            }
            this.categorySearchChanges.next('');
            this.loading.set(false);
          },
          error: (error: unknown) => {
            this.loading.set(false);
            this.errorMessage.set(this.mapError(error, 'Unable to load product.'));
          },
        });
    } else {
      this.categorySearchChanges.next('');
    }
  }

  addPackagingUnit(): void {
    this.packagingUnits.push(this.createPackagingUnitGroup());
  }

  removePackagingUnit(index: number): void {
    if (this.packagingUnits.length <= 1) {
      this.packagingUnits.at(0).reset({ name: '', conversionFactor: '' });
      this.packagingUnits.at(0).updateValueAndValidity();
      return;
    }
    this.packagingUnits.removeAt(index);
    this.form.updateValueAndValidity();
  }

  save(): void {
    this.formSubmitAttempted.set(true);
    this.form.markAllAsTouched();
    for (const group of this.packagingUnits.controls) {
      group.markAllAsTouched();
    }
    if (!this.canManage() || this.form.invalid) {
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    const packagingItems = value.packagingUnits
      .filter((unit) => unit.name.trim() !== '' && unit.conversionFactor.trim() !== '')
      .map((unit) => ({
        name: unit.name.trim(),
        conversionFactor: unit.conversionFactor.trim(),
        status: 'active',
      }));

    const isEdit = this.productId() !== null;
    const productPayload = this.buildProductPayload(value, isEdit);

    const save$ =
      this.productId() === null
        ? this.api.createProduct({
            name: value.name.trim(),
            categoryId: value.categoryId,
            trackingMode: value.trackingMode,
            baseUnitCode: value.baseUnitCode.trim(),
            measurementDimension: value.measurementDimension,
            ...(value.sku.trim() === '' ? {} : { sku: value.sku.trim() }),
          })
        : this.api.updateProduct(this.productId()!, {
            expectedVersion: this.version,
            ...productPayload,
            ...(this.canChangeStatus() ? { status: value.status } : {}),
          });

    save$
      .pipe(
        switchMap((product: ProductRecord) => {
          if (packagingItems.length === 0 && this.productId() === null) {
            return of(product);
          }
          return this.api
            .replacePackagingUnits(product.id, {
              expectedVersion: product.version,
              items: packagingItems,
            })
            .pipe(switchMap(() => of(product)));
        }),
      )
      .subscribe({
        next: () => {
          this.saving.set(false);
          void this.router.navigateByUrl('/app/products');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to save product.'));
        },
      });
  }

  onCategorySearch(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.categorySearchChanges.next(target.value.trim());
    }
  }

  private buildProductPayload(
    value: ReturnType<typeof this.form.getRawValue>,
    isEdit: boolean,
  ): {
    name?: string;
    categoryId?: string;
    trackingMode?: string;
    baseUnitCode?: string;
    measurementDimension?: string;
    sku?: string;
  } {
    const payload: {
      name?: string;
      categoryId?: string;
      trackingMode?: string;
      baseUnitCode?: string;
      measurementDimension?: string;
      sku?: string;
    } = {};

    if (!isEdit || !this.isReadOnlyField('productName')) {
      payload['name'] = value.name.trim();
    }
    if (!isEdit || !this.isReadOnlyField('category')) {
      payload['categoryId'] = value.categoryId;
    }
    if (!isEdit || !this.isReadOnlyField('trackingMode')) {
      payload['trackingMode'] = value.trackingMode;
    }
    if (!isEdit || !this.isReadOnlyField('baseUnit')) {
      payload['baseUnitCode'] = value.baseUnitCode.trim();
    }
    if (!isEdit || !this.isReadOnlyField('measurementDimension')) {
      payload['measurementDimension'] = value.measurementDimension;
    }

    if (this.showSku() && (!isEdit || !this.isReadOnlyField('sku'))) {
      if (value.sku.trim() !== '') {
        payload['sku'] = value.sku.trim();
      } else if (isEdit) {
        payload['sku'] = '';
      }
    }

    return payload;
  }

  private applyProduct(product: ProductRecord): void {
    this.version = product.version;
    this.initialStatus.set(product.status);
    this.form.patchValue({
      categoryId: product.categoryId,
      name: product.name,
      sku: product.sku,
      trackingMode: product.trackingMode,
      baseUnitCode: product.baseUnitCode,
      measurementDimension: product.measurementDimension,
      status: product.status,
    });
  }

  private mergeCategoryOptions(
    items: CategoryRecord[],
    selected: CategoryRecord | null,
    selectedId: string,
  ): CategoryRecord[] {
    const merged = items.filter((item) => item.status === 'active' || item.id === selectedId);
    if (selected && !merged.some((item) => item.id === selected.id)) {
      return [selected, ...merged];
    }
    return merged;
  }

  private createPackagingUnitGroup(name = '', conversionFactor = '') {
    return this.formBuilder.nonNullable.group(
      {
        name: [name, [Validators.maxLength(MAX_NAME)]],
        conversionFactor: [conversionFactor],
      },
      { validators: [this.packagingRowValidator.bind(this)] },
    );
  }

  private trackingModeValidator(control: AbstractControl): ValidationErrors | null {
    const trackingMode = control.value;
    const categoryId = this.form?.controls.categoryId.value;
    const category =
      this.categories().find((item) => item.id === categoryId) ?? this.selectedCategory();
    if (
      category &&
      BATCH_REQUIRED_CLASSES.has(category.productClass.toLowerCase()) &&
      trackingMode === 'none'
    ) {
      return { batchTrackingRequired: true };
    }
    return null;
  }

  private packagingRowValidator(group: AbstractControl): ValidationErrors | null {
    const name = String(group.get('name')?.value ?? '').trim();
    const factor = String(group.get('conversionFactor')?.value ?? '').trim();
    if (name === '' && factor === '') {
      return null;
    }
    if (name === '' || factor === '') {
      return { incompletePackagingRow: true };
    }
    if (
      !CONVERSION_FACTOR_PATTERN.test(factor) ||
      factor === '0' ||
      /^0+(\.0+)?$/.test(factor)
    ) {
      return { invalidConversionFactor: true };
    }
    return null;
  }

  private packagingRowError(
    group: AbstractControl,
    controlName: 'name' | 'conversionFactor',
    label: string,
    submitAttempted: boolean,
  ): string | null {
    if (!shouldShowPackagingRowError(group, submitAttempted)) {
      return null;
    }
    if (group.hasError('incompletePackagingRow')) {
      const name = String(group.get('name')?.value ?? '').trim();
      const factor = String(group.get('conversionFactor')?.value ?? '').trim();
      if (controlName === 'name' && name === '') {
        return `${label} is required.`;
      }
      if (controlName === 'conversionFactor' && factor === '') {
        return `${label} is required.`;
      }
    }
    if (controlName === 'conversionFactor' && group.hasError('invalidConversionFactor')) {
      return 'Conversion factor must be a positive decimal with up to six places.';
    }
    return null;
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This product changed elsewhere. Reload and try again.';
    }
    return mapPlanLimitError(error, error.error?.error?.message ?? fallback);
  }
}

function shouldShowPackagingRowError(group: AbstractControl, submitAttempted: boolean): boolean {
  return group.invalid && (group.touched || submitAttempted);
}
