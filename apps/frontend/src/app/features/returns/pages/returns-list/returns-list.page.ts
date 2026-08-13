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
}
