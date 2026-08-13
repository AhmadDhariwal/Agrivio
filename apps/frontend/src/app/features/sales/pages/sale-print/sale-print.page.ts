import { Component, ViewEncapsulation, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { SalesApi } from '../../data-access/sales.api';
import {
  INVOICE_PRINT_LAYOUTS,
  InvoicePrintLayout,
  SalePrintInvoice,
} from '../../models/sales.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-sale-print-page',
  standalone: true,
  imports: [RouterLink, UiAlertComponent, UiLoadingStateComponent],
  templateUrl: './sale-print.page.html',
  styleUrl: './sale-print.page.scss',
  encapsulation: ViewEncapsulation.None,
})
export class SalePrintPage {
  private readonly api = inject(SalesApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly route = inject(ActivatedRoute);

  readonly layouts = INVOICE_PRINT_LAYOUTS;
  readonly layout = signal<InvoicePrintLayout>('80mm');
  readonly invoice = signal<SalePrintInvoice | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly canView = this.sessionStore.hasPermission('sales.view');
  readonly saleId = this.route.snapshot.paramMap.get('id');

  constructor() {
    if (!this.canView) {
      this.loading.set(false);
      return;
    }
    const id = this.saleId;
    if (!id) {
      this.loading.set(false);
      this.errorMessage.set('Sale is required.');
      return;
    }
    this.api.getPrintInvoice(id).subscribe({
      next: (invoice) => {
        this.invoice.set(invoice);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error));
      },
    });
  }

  selectLayout(layout: InvoicePrintLayout): void {
    this.layout.set(layout);
  }

  print(): void {
    window.print();
  }

  private mapError(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'Unable to load invoice for printing.';
    }
    if (error.status === 403) {
      return 'You do not have permission to view or print invoices.';
    }
    return error.error?.error?.message ?? 'Unable to load invoice for printing.';
  }
}
