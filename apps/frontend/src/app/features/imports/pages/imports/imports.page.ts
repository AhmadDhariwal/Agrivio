import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ImportsApi } from '../../data-access/imports.api';
import { ImportJob, ImportRowError, ImportTemplate } from '../../models/imports.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { CapabilityService } from '../../../capabilities/data-access/capability.service';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-imports-page',
  standalone: true,
  imports: [FormsModule, UiPageHeaderComponent, UiAlertComponent, UiLoadingStateComponent],
  templateUrl: './imports.page.html',
  styleUrl: './imports.page.scss',
})
export class ImportsPage {
  private readonly api = inject(ImportsApi);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly capabilityService = inject(CapabilityService);

  readonly templates = signal<ImportTemplate[]>([]);
  readonly selectedType = signal('product_categories');
  readonly job = signal<ImportJob | null>(null);
  readonly errors = signal<ImportRowError[]>([]);
  readonly loading = signal(false);
  readonly executing = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedFile = signal<File | null>(null);

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
  readonly columnSummary = computed(
    () => this.selectedTemplate()?.columns.map((column) => column.key).join(', ') ?? '',
  );

  constructor() {
    if (this.canPreview()) {
      this.api.listTemplates().subscribe({
        next: (items) => this.templates.set(items),
        error: (error: unknown) => this.errorMessage.set(this.readError(error, 'Unable to load templates.')),
      });
    }
  }

  onTypeChange(value: string): void {
    this.selectedType.set(value);
    this.job.set(null);
    this.errors.set([]);
    this.selectedFile.set(null);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  startPreview(): void {
    const file = this.selectedFile();
    if (!file || !this.canPreview()) {
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api.createJob(this.selectedType()).subscribe({
      next: (job) => {
        this.api.upload(job.id, file).subscribe({
          next: (uploaded) => {
            this.api.validate(uploaded.id).subscribe({
              next: (previewed) => {
                this.job.set(previewed);
                this.errors.set(previewed.errors ?? []);
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
    if (!job || !this.canExecute()) {
      return;
    }
    this.executing.set(true);
    this.errorMessage.set(null);
    this.api.confirm(job.id).subscribe({
      next: (confirmed) => {
        this.job.set(confirmed);
        this.api.execute(confirmed.id, crypto.randomUUID()).subscribe({
          next: (executed) => {
            this.job.set(executed);
            this.executing.set(false);
          },
          error: (error: unknown) => this.fail(error, 'Execute failed.'),
        });
      },
      error: (error: unknown) => this.fail(error, 'Confirm failed.'),
    });
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
}
