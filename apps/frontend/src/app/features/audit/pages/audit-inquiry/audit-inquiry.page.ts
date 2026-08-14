import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AuditApi } from '../../data-access/audit.api';
import { AuditEventItem } from '../../models/audit.models';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiAlertComponent } from '../../../../shared/ui/ui-alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { UiLoadingStateComponent } from '../../../../shared/ui/ui-loading-state/ui-loading-state.component';

@Component({
  selector: 'agrivio-audit-inquiry-page',
  standalone: true,
  imports: [
    FormsModule,
    UiPageHeaderComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiLoadingStateComponent,
  ],
  templateUrl: './audit-inquiry.page.html',
})
export class AuditInquiryPage {
  private readonly api = inject(AuditApi);
  private readonly sessionStore = inject(AuthSessionStore);

  readonly actorId = signal('');
  readonly action = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly resourceType = signal('');
  readonly resourceId = signal('');
  readonly reason = signal('');
  readonly items = signal<AuditEventItem[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly canView = computed(() => this.sessionStore.hasPermission('audit.view'));
  readonly suspended = computed(
    () => this.sessionStore.session()?.subscriptionAccessState?.status === 'suspended',
  );

  constructor() {
    this.search();
  }

  search(): void {
    if (!this.canView()) {
      return;
    }
    this.loading.set(true);
    this.errorMessage.set(null);
    this.api
      .query({
        actorId: this.actorId(),
        action: this.action(),
        from: this.from(),
        to: this.to(),
        resourceType: this.resourceType(),
        resourceId: this.resourceId(),
        reason: this.reason(),
      })
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.errorMessage.set(this.readError(error, 'Unable to load audit history.'));
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
