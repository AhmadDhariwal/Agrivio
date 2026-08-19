import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { InventoryApi } from '../../data-access/inventory.api';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { StockMovementRecord } from '../../models/inventory.models';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { EMPTY, Subject, catchError, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'agrivio-movements-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiPaginationComponent,
  ],
  templateUrl: './movements.page.html',
  styleUrl: './movements.page.scss',
})
export class MovementsPage {
  private readonly inventoryApi = inject(InventoryApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly destroyRef = inject(DestroyRef); private readonly reloadRequests = new Subject<void>();

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly movements = signal<StockMovementRecord[]>([]);
  readonly canView = computed(() => this.sessionStore.hasPermission('inventory.view'));
  readonly page = signal(1); readonly pageSize = signal(25); readonly total = signal(0);

  constructor() {
    this.reloadRequests.pipe(startWith(undefined), switchMap(() => {
      if (!this.canView()) { this.loading.set(false); return EMPTY; }
      this.loading.set(true); this.errorMessage.set(null);
      return this.inventoryApi.listMovements({ page: this.page(), pageSize: this.pageSize() }).pipe(catchError(() => { this.loading.set(false); this.errorMessage.set('Unable to load stock movements.'); return EMPTY; }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe(({ items, meta }) => { this.movements.set(items); this.total.set(meta.total); this.loading.set(false); });
  }

  reload(): void {
    this.reloadRequests.next();
  }
  onPageChange(page: number): void { this.page.set(page); this.reload(); }
  onPageSizeChange(size: number): void { this.pageSize.set(size); this.page.set(1); this.reload(); }
}
