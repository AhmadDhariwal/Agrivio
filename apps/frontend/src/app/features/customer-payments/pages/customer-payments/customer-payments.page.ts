import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CustomerPaymentsApi } from '../../data-access/customer-payments.api';
import { CustomerPaymentRecord } from '../../models/customer-payments.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';
import { UiPaginationComponent } from '../../../../shared/ui/ui-pagination/ui-pagination.component';
import { UiSearchInputComponent } from '../../../../shared/ui/ui-search-input/ui-search-input.component';
import { EMPTY, Subject, catchError, debounceTime, distinctUntilChanged, startWith, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'agrivio-customer-payments-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
    UiStatusBadgeComponent,
    UiPaginationComponent,
    UiSearchInputComponent,
  ],
  templateUrl: './customer-payments.page.html',
  styleUrl: './customer-payments.page.scss',
})
export class CustomerPaymentsPage {
  private readonly api = inject(CustomerPaymentsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly destroyRef = inject(DestroyRef); private readonly reloadRequests = new Subject<void>(); private readonly searchChanges = new Subject<string>();

  readonly items = signal<CustomerPaymentRecord[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly canView = computed(() => this.sessionStore.hasPermission('customer-payments.view'));
  readonly canPost = computed(() => this.sessionStore.hasPermission('customer-payments.post'));
  readonly page = signal(1); readonly pageSize = signal(25); readonly total = signal(0); readonly search = signal('');

  constructor() {
    this.searchChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe((value) => { this.search.set(value.trim()); this.page.set(1); this.reload(); });
    this.reloadRequests.pipe(startWith(undefined), switchMap(() => {
      if (!this.canView()) { this.loading.set(false); this.errorMessage.set('You do not have permission to view customer payments.'); return EMPTY; }
      this.loading.set(true); this.errorMessage.set(null);
      return this.api.listCustomerPayments({ page: this.page(), pageSize: this.pageSize(), search: this.search() }).pipe(catchError((error: unknown) => {
        this.loading.set(false); this.errorMessage.set(error instanceof HttpErrorResponse ? (error.error?.error?.message ?? 'Unable to load customer payments.') : 'Unable to load customer payments.'); return EMPTY;
      }));
    }), takeUntilDestroyed(this.destroyRef)).subscribe(({ items, meta }) => { this.items.set(items); this.total.set(meta.total); this.loading.set(false); });
  }

  reload(): void {
    this.reloadRequests.next();
  }
  onSearchChange(value: string): void { this.searchChanges.next(value); }
  onPageChange(page: number): void { this.page.set(page); this.reload(); }
  onPageSizeChange(size: number): void { this.pageSize.set(size); this.page.set(1); this.reload(); }
}
