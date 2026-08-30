import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  OrganizationSetupApi,
  SetupProgress,
  SetupStep,
} from '../../data-access/organization-setup.api';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiStatusBadgeComponent } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-organization-setup-page',
  standalone: true,
  imports: [
    RouterLink,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiLoadingStateComponent,
    UiEmptyStateComponent,
    UiStatusBadgeComponent,
  ],
  templateUrl: './organization-setup.page.html',
  styleUrl: './organization-setup.page.scss',
})
export class OrganizationSetupPage {
  private readonly api = inject(OrganizationSetupApi);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly progress = signal<SetupProgress | null>(null);

  constructor() {
    this.reload();
  }

  reload(forceRefresh = false): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    const request$ = forceRefresh
      ? this.api.getSetupProgress(true)
      : this.api.getSetupProgress();
    request$.subscribe({
      next: (data) => {
        this.progress.set(data);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.mapError(error));
      },
    });
  }

  toneFor(step: SetupStep): 'success' | 'warning' | 'neutral' {
    if (step.status === 'complete') {
      return 'success';
    }
    if (step.status === 'blocked') {
      return 'neutral';
    }
    return 'warning';
  }

  private mapError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.error?.message ?? 'Unable to load setup progress.';
    }
    return 'Unable to load setup progress.';
  }
}
