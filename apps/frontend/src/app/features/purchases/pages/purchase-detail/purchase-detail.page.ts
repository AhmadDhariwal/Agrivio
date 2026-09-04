import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PurchasesApi } from '../../data-access/purchases.api';
import { MoneyAmount, PurchaseRecord } from '../../models/purchases.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-purchase-detail-page',
  standalone: true,
  imports: [RouterLink, UiAlertComponent, UiLoadingStateComponent, UiStatusBadgeComponent],
  templateUrl: './purchase-detail.page.html',
  styleUrl: './purchase-detail.page.scss',
})
export class PurchaseDetailPage {
  private readonly api = inject(PurchasesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly purchase = signal<PurchaseRecord | null>(null);
  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('purchases.view') &&
      (this.capabilityService?.canUseModule('purchases') ?? true) &&
      (this.capabilityService?.canPerformAction('purchases.actions.inspect') ?? true),
  );
  readonly canEdit = computed(
    () =>
      this.purchase()?.status === 'draft' &&
      this.sessionStore.hasPermission('purchases.create') &&
      (this.capabilityService?.canPerformAction('purchases.actions.editDraft') ?? true),
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.canView()) {
      this.loading.set(false);
      return;
    }
    this.api.getPurchase(id).subscribe({
      next: (purchase) => {
        this.purchase.set(purchase);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(
          error instanceof HttpErrorResponse
            ? (error.error?.error?.message ?? 'Unable to load purchase details.')
            : 'Unable to load purchase details.',
        );
        this.loading.set(false);
      },
    });
  }

  canViewField(id: string): boolean {
    return this.capabilityService?.canViewField(`purchases.fields.${id}`) ?? true;
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
}
