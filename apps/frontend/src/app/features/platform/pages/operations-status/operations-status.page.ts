import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { PlatformOperationsApi } from '../../data-access/platform-operations.api';
import {
  AuditRetentionStatus,
  BackupOperationItem,
  RestoreOperationItem,
} from '../../models/operations.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-platform-operations-status-page',
  standalone: true,
  imports: [
    FormsModule,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './operations-status.page.html',
})
export class PlatformOperationsStatusPage {
  private readonly api = inject(PlatformOperationsApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly backups = signal<BackupOperationItem[]>([]);
  readonly restore = signal<RestoreOperationItem | null>(null);
  readonly reason = signal('');
  readonly retention = signal<AuditRetentionStatus | null>(null);
  readonly retentionScope = signal<'tenant' | 'platform'>('platform');
  readonly retentionOrganizationId = signal('');
  readonly retentionReason = signal('');
  readonly retentionConfirmed = signal(false);
  readonly retentionLoading = signal(false);
  readonly retentionPurging = signal(false);
  readonly retentionMessage = signal<string | null>(null);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly canViewBackups = computed(() =>
    this.sessionStore.hasPermission('operations.backups.view'),
  );
  readonly canRestore = computed(() =>
    this.sessionStore.hasPermission('operations.restore.execute'),
  );
  readonly canManageAuditRetention = computed(() =>
    this.sessionStore.hasPermission('platform.audit.view'),
  );
  readonly latestSuccessfulBackup = computed(
    () => this.backups().find((item) => item.status === 'success') ?? null,
  );

  constructor() {
    this.reload();
  }

  reload(): void {
    if (!this.canViewBackups()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.listBackups().subscribe({
      next: (items) => {
        this.backups.set(items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.readError(error, 'Unable to load backup status.'));
      },
    });
  }

  loadRetention(): void {
    if (!this.canManageAuditRetention()) return;
    this.retentionLoading.set(true);
    this.retentionMessage.set(null);
    this.api.getAuditRetention(this.retentionScope(), this.retentionOrganizationId()).subscribe({
      next: (status) => {
        this.retention.set(status);
        this.retentionLoading.set(false);
      },
      error: (error: unknown) => {
        this.retentionLoading.set(false);
        this.retentionMessage.set(this.readError(error, 'Unable to load audit retention.'));
      },
    });
  }

  purgeExpiredAuditRecords(): void {
    if (!this.canManageAuditRetention() || !this.retentionConfirmed()) return;
    this.retentionPurging.set(true);
    this.retentionMessage.set(null);
    this.api
      .purgeExpiredAuditRecords({
        scope: this.retentionScope(),
        organizationId: this.retentionOrganizationId(),
        reason: this.retentionReason(),
      })
      .subscribe({
        next: (result) => {
          this.retentionPurging.set(false);
          this.retentionConfirmed.set(false);
          this.retentionMessage.set(`Purged ${result.deletedCount} expired audit record(s).`);
          this.loadRetention();
        },
        error: (error: unknown) => {
          this.retentionPurging.set(false);
          this.retentionMessage.set(
            this.readError(error, 'Unable to purge expired audit records.'),
          );
        },
      });
  }

  formatBytes(value: number | null): string {
    if (value === null) return '—';
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  coordinateRestore(): void {
    if (!this.canRestore()) {
      this.errorMessage.set('Restore coordination requires operations.restore.execute.');
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.api.initiateRestore(this.reason()).subscribe({
      next: (restore) => {
        this.restore.set(restore);
        this.submitting.set(false);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(this.readError(error, 'Unable to initiate restore coordination.'));
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
