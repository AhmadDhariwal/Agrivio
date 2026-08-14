import { Component, computed, inject, signal } from '@angular/core';
import { KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ReportsApi } from '../../data-access/reports.api';
import { ReportCatalogItem, ReportDataset } from '../../models/reports.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-reports-page',
  standalone: true,
  imports: [
    FormsModule,
    KeyValuePipe,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss',
})
export class ReportsPage {
  private readonly api = inject(ReportsApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly catalog = signal<ReportCatalogItem[]>([]);
  readonly selectedKey = signal('sales');
  readonly filters = signal<Record<string, string>>({});
  readonly dataset = signal<ReportDataset | null>(null);
  readonly loading = signal(false);
  readonly catalogLoading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly exporting = signal(false);

  readonly canView = computed(() => this.sessionStore.hasPermission('reports.view'));
  readonly canExport = computed(() => this.sessionStore.hasPermission('reports.export'));
  readonly suspended = computed(
    () => this.sessionStore.session()?.subscriptionAccessState?.status === 'suspended',
  );
  readonly selected = computed(
    () => this.catalog().find((item) => item.key === this.selectedKey()) ?? null,
  );

  constructor() {
    this.loadCatalog();
  }

  loadCatalog(): void {
    if (!this.canView()) {
      this.catalogLoading.set(false);
      return;
    }
    this.api.listCatalog().subscribe({
      next: (items) => {
        this.catalog.set(items);
        this.catalogLoading.set(false);
        if (items[0] && !items.some((item) => item.key === this.selectedKey())) {
          this.selectedKey.set(items[0].key);
        }
      },
      error: (error: unknown) => {
        this.catalogLoading.set(false);
        this.errorMessage.set(this.readError(error, 'Unable to load report catalog.'));
      },
    });
  }

  onReportChange(key: string): void {
    this.selectedKey.set(key);
    this.filters.set({});
    this.dataset.set(null);
  }

  setFilter(field: string, value: string): void {
    this.filters.update((current) => ({ ...current, [field]: value }));
  }

  filterValue(field: string): string {
    return this.filters()[field] ?? '';
  }

  run(): void {
    if (!this.canView()) {
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api.getReport(this.selectedKey(), this.filters()).subscribe({
      next: (data) => {
        this.dataset.set(data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.dataset.set(null);
        this.errorMessage.set(this.readError(error, 'Unable to load report.'));
      },
    });
  }

  exportFormat(format: string): void {
    if (!this.canExport()) {
      this.errorMessage.set('You do not have permission to export reports.');
      return;
    }
    this.exporting.set(true);
    this.api.exportReport(this.selectedKey(), format, this.filters()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${this.selectedKey()}.${format === 'excel' ? 'xls' : format}`;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: (error: unknown) => {
        this.exporting.set(false);
        this.errorMessage.set(this.readError(error, 'Unable to export report.'));
      },
    });
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.error?.message ?? fallback;
    }
    return fallback;
  }
}
