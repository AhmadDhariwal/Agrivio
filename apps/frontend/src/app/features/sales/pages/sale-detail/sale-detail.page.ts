import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SalesApi } from '../../data-access/sales.api';
import { MoneyAmount, SaleRecord } from '../../models/sales.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import {
  UiBadgeTone,
  UiStatusBadgeComponent,
} from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-sale-detail-page',
  standalone: true,
  imports: [RouterLink, UiAlertComponent, UiLoadingStateComponent, UiStatusBadgeComponent],
  templateUrl: './sale-detail.page.html',
  styleUrl: './sale-detail.page.scss',
})
export class SaleDetailPage {
  private readonly api = inject(SalesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService, { optional: true });

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly sale = signal<SaleRecord | null>(null);
  readonly canView = computed(
    () =>
      this.sessionStore.hasPermission('sales.view') &&
      (this.capabilityService?.canUseModule('sales') ?? true) &&
      (this.capabilityService?.canPerformAction('sales.actions.inspect') ?? true),
  );
  readonly canEdit = computed(
    () =>
      this.sale()?.status === 'draft' &&
      this.sessionStore.hasPermission('sales.create') &&
      (this.capabilityService?.canPerformAction('sales.actions.editDraft') ?? true),
  );
  readonly canPrint = computed(
    () =>
      (this.sale()?.status === 'posted' || this.sale()?.status === 'cancelled') &&
      (this.capabilityService?.canPerformAction('sales.actions.print') ?? true),
  );
  readonly canViewCogs = computed(() => this.sessionStore.hasPermission('reports.view'));

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id || !this.canView()) {
      this.loading.set(false);
      return;
    }
    this.api.getSale(id).subscribe({
      next: (sale) => {
        this.sale.set(sale);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.errorMessage.set(this.mapError(error));
        this.loading.set(false);
      },
    });
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

  private mapError(error: unknown): string {
    return error instanceof HttpErrorResponse
      ? (error.error?.error?.message ?? 'Unable to load sale details.')
      : 'Unable to load sale details.';
  }
}
