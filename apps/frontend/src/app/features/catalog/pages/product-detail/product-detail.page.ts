import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of, catchError } from 'rxjs';
import { CatalogApi } from '../../data-access/catalog.api';
import {
  CategoryRecord,
  PackagingUnitRecord,
  ProductPriceRecord,
  ProductRecord,
} from '../../models/catalog.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-product-detail-page',
  standalone: true,
  imports: [RouterLink, UiAlertComponent, UiLoadingStateComponent, UiStatusBadgeComponent],
  templateUrl: './product-detail.page.html',
  styleUrl: './product-detail.page.scss',
})
export class ProductDetailPage {
  private readonly api = inject(CatalogApi);
  private readonly route = inject(ActivatedRoute);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly product = signal<ProductRecord | null>(null);
  readonly category = signal<CategoryRecord | null>(null);
  readonly packagingUnits = signal<PackagingUnitRecord[]>([]);
  readonly prices = signal<ProductPriceRecord[]>([]);

  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('catalog.view') &&
      (this.capabilityService?.canPerformAction('inventory.products.actions.inspect') ?? true),
  );

  readonly canEdit = computed(
    () =>
      this.sessionStore.hasPermission('catalog.manage') &&
      (this.capabilityService?.canPerformAction('inventory.products.actions.edit') ?? true),
  );

  readonly canManagePricing = computed(
    () =>
      this.sessionStore.hasPermission('pricing.manage') &&
      (this.capabilityService?.canPerformAction('inventory.products.actions.managePricing') ??
        true) &&
      (this.capabilityService?.canEditField('inventory.products.fields.sellingPrice') ?? true),
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.canView()) {
      this.loading.set(false);
      return;
    }

    this.api.getProduct(id).subscribe({
      next: (prod) => {
        this.product.set(prod);

        forkJoin({
          category: prod.categoryId
            ? this.api.getCategory(prod.categoryId).pipe(catchError(() => of(null)))
            : of(null),
          packagingUnits: this.api.listPackagingUnits(prod.id).pipe(catchError(() => of([]))),
          prices: this.api.listPrices(prod.id).pipe(catchError(() => of([]))),
        }).subscribe({
          next: ({ category, packagingUnits, prices }) => {
            if (category) this.category.set(category);
            if (packagingUnits) this.packagingUnits.set(packagingUnits);
            if (prices) this.prices.set(prices);
            this.loading.set(false);
          },
          error: () => {
            this.loading.set(false);
          },
        });
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error));
        this.loading.set(false);
      },
    });
  }

  statusTone(status: string | undefined): UiBadgeTone {
    if (status === 'active') return 'success';
    if (status === 'inactive') return 'neutral';
    return 'neutral';
  }

  formatLabel(val: string | undefined | null): string {
    if (!val) return '—';
    return val.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  formatMoney(amount: string | number | undefined | null, currency = 'PKR'): string {
    if (amount === undefined || amount === null || amount === '') return `${currency} 0.00`;
    const num = Number(amount);
    return `${currency} ${isNaN(num) ? String(amount) : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  formatTrackingMode(mode: string | undefined): string {
    if (mode === 'batch_expiry') return 'Batch & Expiry Tracked';
    if (mode === 'batch') return 'Batch Only Tracked';
    return 'Untracked';
  }

  private mapError(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const e = (error as { error?: { message?: string } }).error;
      if (e?.message) return e.message;
    }
    return 'Unable to load product details.';
  }
}
