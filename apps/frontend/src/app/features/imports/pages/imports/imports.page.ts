import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ImportsApi } from '../../data-access/imports.api';
import { ImportJob, ImportRowError, ImportTemplate } from '../../models/imports.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiModuleInfoComponent } from '../../../../shared/ui/ui-module-info/ui-module-info.component';

const IMPORT_TYPE_LABELS: Record<string, string> = {
  product_categories: 'Product categories',
  products: 'Products',
  product_prices: 'Product prices',
  customers: 'Customers',
  suppliers: 'Suppliers',
  customer_opening_receivables: 'Customer opening receivables',
  customer_opening_advances: 'Customer opening advances',
  supplier_opening_payables: 'Supplier opening payables',
  supplier_opening_advances: 'Supplier opening advances',
  cash_opening_balances: 'Cash opening balances',
  bank_opening_balances: 'Bank opening balances',
  jazzcash_opening_balances: 'JazzCash opening balances',
  easypaisa_opening_balances: 'EasyPaisa opening balances',
  opening_stock: 'Opening stock',
};

@Component({
  selector: 'agrivio-imports-page',
  standalone: true,
  imports: [
    FormsModule,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiModuleInfoComponent,
  ],
  templateUrl: './imports.page.html',
  styleUrl: './imports.page.scss',
})
export class ImportsPage {
  private readonly api = inject(ImportsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService);

  readonly infoTitle = 'About imports';
  readonly infoDescription =
    'Imports help you create or update records in bulk using Excel workbooks. Download a template for the selected import type, fill in your data, then preview to validate before executing.';
  readonly infoItems = [
    'Download the official spreadsheet template for your target import type.',
    'Fill in the required columns and format your data according to the policy.',
    'Upload your workbook and run Preview to detect any validation issues.',
    'Execute the import only after all rows are verified and ready.',
  ];

  readonly templates = signal<ImportTemplate[]>([]);
  readonly selectedType = signal('product_categories');
  readonly selectedFile = signal<File | null>(null);
  readonly job = signal<ImportJob | null>(null);
  readonly errors = signal<ImportRowError[]>([]);
  readonly loading = signal(false);
  readonly executing = signal(false);
  readonly downloadingTemplate = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly isDragging = signal(false);
  readonly page = signal(1);
  readonly pageSize = 10;

  readonly canUseModuleInfo = computed(() =>
    this.capabilityService.canUseFeature('imports.features.moduleInfo'),
  );
  readonly canUseTemplateDownloads = computed(() =>
    this.capabilityService.canUseFeature('imports.features.templateDownloads'),
  );
  readonly canUseJobHistory = computed(() =>
    this.capabilityService.canUseFeature('imports.features.jobHistory'),
  );
  readonly canPreview = computed(
    () =>
      this.sessionStore.hasPermission('imports.preview') &&
      this.capabilityService.canPerformAction('imports.actions.preview'),
  );
  readonly canExecute = computed(
    () =>
      this.sessionStore.hasPermission('imports.execute') &&
      this.capabilityService.canPerformAction('imports.actions.execute'),
  );
  readonly suspended = computed(
    () => this.sessionStore.session()?.subscriptionAccessState?.status === 'suspended',
  );

  readonly selectedTemplate = computed(
    () => this.templates().find((item) => item.importType === this.selectedType()) ?? null,
  );

  readonly requiredColumns = computed(() => {
    const cols = this.selectedTemplate()?.columns.filter((c) => c.required) ?? [];
    return cols.map((c) => c.key).join(', ');
  });

  readonly optionalColumns = computed(() => {
    const cols = this.selectedTemplate()?.columns.filter((c) => !c.required) ?? [];
    return cols.map((c) => c.key).join(', ');
  });

  readonly columnSummary = computed(
    () => this.selectedTemplate()?.columns.map((column) => column.key).join(', ') ?? '',
  );

  readonly canSubmitExecute = computed(
    () =>
      this.canExecute() &&
      this.job()?.status === 'previewed' &&
      this.job()?.preview?.invalidRows === 0 &&
      !this.executing(),
  );

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.errors().length / this.pageSize)));

  readonly pagedErrors = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.errors().slice(start, start + this.pageSize);
  });

  readonly paginationText = computed(() => {
    const count = this.errors().length;
    if (count === 0) return '';
    const start = (this.page() - 1) * this.pageSize + 1;
    const end = Math.min(this.page() * this.pageSize, count);
    return `Showing ${start} to ${end} of ${count} issues`;
  });

  readonly formattedFileSize = computed(() => {
    const file = this.selectedFile();
    if (!file) return '';
    return this.formatBytes(file.size);
  });

  constructor() {
    if (this.canPreview()) {
      this.api.listTemplates().subscribe({
        next: (items) => this.templates.set(items),
        error: (error: unknown) =>
          this.errorMessage.set(this.readError(error, 'Unable to load templates.')),
      });
    }
  }

  getImportTypeLabel(type: string): string {
    return IMPORT_TYPE_LABELS[type] ?? type.replaceAll('_', ' ');
  }

  onTypeChange(value: string): void {
    this.selectedType.set(value);
    this.job.set(null);
    this.errors.set([]);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.page.set(1);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.setFile(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file) {
      this.setFile(file);
    }
  }

  setFile(file: File | null): void {
    this.selectedFile.set(file);
    this.job.set(null);
    this.errors.set([]);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.page.set(1);
  }

  clearFile(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.selectedFile.set(null);
    this.job.set(null);
    this.errors.set([]);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.page.set(1);
  }

  downloadTemplate(): void {
    if (!this.canUseTemplateDownloads()) return;
    const importType = this.selectedType();
    this.downloadingTemplate.set(true);
    this.api.downloadTemplate(importType).subscribe({
      next: (blob) => {
        this.downloadingTemplate.set(false);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${importType}-template.xls`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (error: unknown) => {
        this.downloadingTemplate.set(false);
        this.errorMessage.set(this.readError(error, 'Unable to download template.'));
      },
    });
  }

  startPreview(): void {
    const file = this.selectedFile();
    if (!file || !this.canPreview() || this.loading() || this.executing()) {
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.api.createJob(this.selectedType()).subscribe({
      next: (job) => {
        this.api.upload(job.id, file).subscribe({
          next: (uploaded) => {
            this.api.validate(uploaded.id).subscribe({
              next: (previewed) => {
                this.job.set(previewed);
                this.errors.set(previewed.errors ?? []);
                this.page.set(1);
                this.loading.set(false);
              },
              error: (error: unknown) => this.fail(error, 'Preview failed.'),
            });
          },
          error: (error: unknown) => this.fail(error, 'Upload failed.'),
        });
      },
      error: (error: unknown) => this.fail(error, 'Unable to create import job.'),
    });
  }

  confirmAndExecute(): void {
    const job = this.job();
    if (!job || !this.canSubmitExecute()) {
      return;
    }
    this.executing.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.api.confirm(job.id).subscribe({
      next: (confirmed) => {
        this.job.set(confirmed);
        this.api.execute(confirmed.id, crypto.randomUUID()).subscribe({
          next: (executed) => {
            this.job.set(executed);
            this.executing.set(false);
            if (executed.result) {
              this.successMessage.set(`Imported ${executed.result.createdCount} rows.`);
            }
          },
          error: (error: unknown) => this.fail(error, 'Execute failed.'),
        });
      },
      error: (error: unknown) => this.fail(error, 'Confirm failed.'),
    });
  }

  goToPage(p: number): void {
    if (p >= 1 && p <= this.totalPages()) {
      this.page.set(p);
    }
  }

  private fail(error: unknown, fallback: string): void {
    this.loading.set(false);
    this.executing.set(false);
    this.errorMessage.set(this.readError(error, fallback));
  }

  private readError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.error?.message;
      if (typeof message === 'string' && message.trim() !== '') {
        return message;
      }
    }
    return fallback;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
