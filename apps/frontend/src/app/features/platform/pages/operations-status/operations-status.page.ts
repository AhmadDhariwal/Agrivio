import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { PlatformOperationsApi } from '../../data-access/platform-operations.api';
import { BackupOperationItem, RestoreOperationItem } from '../../models/operations.models';
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
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly canViewBackups = computed(() =>
    this.sessionStore.hasPermission('operations.backups.view'),
  );
  readonly canRestore = computed(() =>
    this.sessionStore.hasPermission('operations.restore.execute'),
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
