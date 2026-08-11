import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InventoryApi } from '../../data-access/inventory.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { ExpiryInventoryRecord } from '../../models/inventory.models';

@Component({
  selector: 'agrivio-expiry-inquiry-page',
  standalone: true,
  imports: [RouterLink, UiPageHeaderComponent, UiAlertComponent, UiLoadingStateComponent],
  templateUrl: './expiry-inquiry.page.html',
  styleUrl: './expiry-inquiry.page.scss',
})
export class ExpiryInquiryPage {
  private readonly inventoryApi = inject(InventoryApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly items = signal<ExpiryInventoryRecord[]>([]);
  readonly businessDate = signal<string>('');
  readonly thresholdDays = signal<number>(30);
  readonly canView = computed(() => this.sessionStore.hasPermission('inventory.expiry.view'));

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.inventoryApi.listExpiry().subscribe({
      next: (data) => {
        this.items.set(data.items);
        this.businessDate.set(data.businessDate);
        this.thresholdDays.set(data.thresholdDays);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load expiry inquiry.');
      },
    });
  }
}
