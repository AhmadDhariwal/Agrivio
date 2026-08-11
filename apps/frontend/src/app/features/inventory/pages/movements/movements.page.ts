import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InventoryApi } from '../../data-access/inventory.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { StockMovementRecord } from '../../models/inventory.models';

@Component({
  selector: 'agrivio-movements-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './movements.page.html',
  styleUrl: './movements.page.scss',
})
export class MovementsPage {
  private readonly inventoryApi = inject(InventoryApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly movements = signal<StockMovementRecord[]>([]);
  readonly canView = computed(() => this.sessionStore.hasPermission('inventory.view'));

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canView()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.inventoryApi.listMovements().subscribe({
      next: (items) => {
        this.movements.set(items);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Unable to load stock movements.');
      },
    });
  }
}
