import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { CatalogApi } from '../../data-access/catalog.api';
import { PriceTier } from '../../models/catalog.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

const PRICE_TIERS: PriceTier[] = ['retail', 'wholesale', 'dealer', 'distributor'];

@Component({
  selector: 'agrivio-product-pricing-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './product-pricing.page.html',
  styleUrl: './product-pricing.page.scss',
})
export class ProductPricingPage {
  private readonly api = inject(CatalogApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);

  readonly productId = signal<string | null>(null);
  readonly productName = signal('Product');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly canManage = computed(() => this.sessionStore.hasPermission('pricing.manage'));
  private version = 1;

  readonly form = this.formBuilder.nonNullable.group({
    retail: ['', [Validators.required]],
    wholesale: [''],
    dealer: [''],
    distributor: [''],
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || id === 'new') {
      this.loading.set(false);
      this.errorMessage.set('Product id is required.');
      return;
    }
    this.productId.set(id);
    forkJoin({
      product: this.api.getProduct(id),
      prices: this.api.listPrices(id),
    }).subscribe({
      next: ({ product, prices }) => {
        this.version = product.version;
        this.productName.set(product.name);
        const byTier = new Map(prices.filter((p) => p.status === 'active').map((p) => [p.priceTier, p]));
        this.form.patchValue({
          retail: byTier.get('retail')?.price.amount ?? '',
          wholesale: byTier.get('wholesale')?.price.amount ?? '',
          dealer: byTier.get('dealer')?.price.amount ?? '',
          distributor: byTier.get('distributor')?.price.amount ?? '',
        });
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error, 'Unable to load pricing.'));
      },
    });
  }

  save(): void {
    if (!this.canManage() || this.productId() === null || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    const value = this.form.getRawValue();
    const items = PRICE_TIERS.filter((tier) => value[tier].trim() !== '').map((tier) => ({
      priceTier: tier,
      price: { amount: value[tier].trim(), currency: 'PKR' },
      status: 'active',
    }));

    this.api
      .replacePrices(this.productId()!, {
        expectedVersion: this.version,
        items,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          void this.router.navigateByUrl('/app/products');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.errorMessage.set(this.mapError(error, 'Unable to save pricing.'));
        },
      });
  }

  private mapError(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }
    if (error.error?.error?.code === 'VERSION_CONFLICT') {
      return 'This product changed elsewhere. Reload and try again.';
    }
    return error.error?.error?.message ?? fallback;
  }
}
