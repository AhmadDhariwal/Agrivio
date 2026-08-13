import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReturnsApi } from '../../data-access/returns.api';
import { SalesReturnRecord } from '../../models/returns.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-returns-list-page',
  standalone: true,
  imports: [RouterLink, UiPageHeaderComponent, UiAlertComponent, UiLoadingStateComponent],
  templateUrl: './returns-list.page.html',
  styleUrl: './returns-list.page.scss',
})
export class ReturnsListPage {
  private readonly api = inject(ReturnsApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly items = signal<SalesReturnRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly canView = computed(() => this.sessionStore.hasPermission('returns.view'));
  readonly canPost = computed(() => this.sessionStore.hasPermission('returns.post'));
  readonly canApproveWithoutInvoice = computed(() =>
    this.sessionStore.hasPermission('returns.without-invoice.approve'),
  );
  readonly canReverse = computed(() => this.sessionStore.hasPermission('returns.reverse'));
  readonly reverseReason = signal('');
  readonly reversingId = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  constructor() {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }
    this.api.listReturns().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Unable to load returns.');
        this.loading.set(false);
      },
    });
  }

  reverse(item: SalesReturnRecord): void {
    if (!this.canReverse() || item.status !== 'posted' || this.reversingId()) {
      return;
    }
    const reason = this.reverseReason().trim();
    if (reason === '') {
      this.errorMessage.set('A reversal reason is required.');
      return;
    }
    this.reversingId.set(item.id);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.api
      .reverseReturn(
        item.id,
        { reason, expectedVersion: item.version },
        `return-reverse-${item.id}-${Date.now()}`,
      )
      .subscribe({
        next: (updated) => {
          this.items.update((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
          this.reversingId.set(null);
          this.reverseReason.set('');
          this.successMessage.set('Return reversed with a linked corrective transaction.');
        },
        error: () => {
          this.reversingId.set(null);
          this.errorMessage.set('Unable to reverse return.');
        },
      });
  }

  onReverseReasonInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.reverseReason.set(target.value);
  }
}
