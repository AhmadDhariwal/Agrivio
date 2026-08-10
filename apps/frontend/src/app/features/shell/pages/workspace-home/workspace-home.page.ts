import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthSessionStore } from '../../../auth/data-access/auth-session.store';
import { UiPageHeaderComponent } from '../../../../shared/ui/ui-page-header/ui-page-header.component';
import { UiStatusBadgeComponent, UiBadgeTone } from '../../../../shared/ui/ui-status-badge/ui-status-badge.component';

@Component({
  selector: 'agrivio-workspace-home-page',
  standalone: true,
  imports: [RouterLink, UiPageHeaderComponent, UiStatusBadgeComponent],
  templateUrl: './workspace-home.page.html',
  styleUrl: './workspace-home.page.scss',
})
export class WorkspaceHomePage {
  private readonly sessionStore = inject(AuthSessionStore);

  readonly session = this.sessionStore.session;
  readonly activeContext = this.sessionStore.activeContext;
  readonly subscriptionAccessState = computed(
    () => this.sessionStore.session()?.subscriptionAccessState ?? null,
  );
  readonly canViewOrganization = computed(() =>
    this.sessionStore.hasPermission('organization.view'),
  );
  readonly canSubmitBilling = computed(() =>
    this.sessionStore.hasPermission('subscription.billing-evidence.submit'),
  );

  subscriptionTone(status: string | null | undefined): UiBadgeTone {
    switch (status) {
      case 'active':
      case 'trialing':
        return 'success';
      case 'grace':
        return 'warning';
      case 'suspended':
        return 'danger';
      default:
        return 'neutral';
    }
  }
}
