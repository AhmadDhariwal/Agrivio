import { Component, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin, of, switchMap } from 'rxjs';
import { CatalogApi } from '../../data-access/catalog.api';
import { CategoryRecord, ProductRecord } from '../../models/catalog.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { mapPlanLimitError } from '../../../../core/plan-limits/plan-limit-feedback';

@Component({
  selector: 'agrivio-product-form-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './product-form.page.html',
  styleUrl: './product-form.page.scss',
})
export class ProductFormPage {
  private readonly api = inject(CatalogApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly productId = signal<string | null>(null);
  readonly categories = signal<CategoryRecord[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly canManage = computed(() => this.sessionStore.hasPermission('catalog.manage'));
  private version = 1;

  readonly form = this.formBuilder.nonNullable.group({
    categoryId: ['', [Validators.required]],
    name: ['', [Validators.required, Validators.minLength(2)]],
    sku: [''],
    trackingMode: ['none' as string, [Validators.required]],
    baseUnitCode: ['', [Validators.required]],
    measurementDimension: ['mass' as string, [Validators.required]],
    status: ['active'],
    packagingUnits: this.formBuilder.array([this.createPackagingUnitGroup()]),
  });

  get packagingUnits(): FormArray {
    return this.form.controls.packagingUnits;
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    const categories$ = this.api.listCategories();

    if (id && id !== 'new') {
      this.productId.set(id);
      forkJoin({
        product: this.api.getProduct(id),
        packagingUnits: this.api.listPackagingUnits(id),
        categories: categories$,
      }).subscribe({
        next: ({ product, packagingUnits, categories }) => {
          this.categories.set(
            categories.filter((item) => item.status === 'active' || item.id === product.categoryId),
          );
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
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load product.'));
        },
      });
    } else {
      categories$.subscribe({
        next: (categories) => {
          this.categories.set(categories.filter((item) => item.status === 'active'));
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to load categories.'));
        },
      });
    }
  }

  addPackagingUnit(): void {
    this.packagingUnits.push(this.createPackagingUnitGroup());
  }

  removePackagingUnit(index: number): void {
    if (this.packagingUnits.length <= 1) {
      this.packagingUnits.at(0).reset({ name: '', conversionFactor: '' });
      return;
    }
    this.packagingUnits.removeAt(index);
  }

  save(): void {
    if (!this.canManage() || this.form.invalid) {
      this.form.markAllAsTouched();
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

    const productPayload = {
      name: value.name,
      categoryId: value.categoryId,
      trackingMode: value.trackingMode,
      baseUnitCode: value.baseUnitCode,
      measurementDimension: value.measurementDimension,
      ...(value.sku.trim() === '' ? {} : { sku: value.sku }),
    };

    const save$ =
      this.productId() === null
        ? this.api.createProduct(productPayload)
        : this.api.updateProduct(this.productId()!, {
            expectedVersion: this.version,
            ...productPayload,
            status: value.status,
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

  private applyProduct(product: ProductRecord): void {
    this.version = product.version;
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

  private createPackagingUnitGroup(name = '', conversionFactor = '') {
    return this.formBuilder.nonNullable.group({
      name: [name],
      conversionFactor: [conversionFactor],
    });
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
