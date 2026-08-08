import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthSessionStore } from '../auth/auth-session.store';

@Component({
  selector: 'agrivio-workspace-home-page',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './workspace-home.page.html',
  styleUrl: './workspace-home.page.scss',
})
export class WorkspaceHomePage {
  private readonly sessionStore = inject(AuthSessionStore);

  readonly session = this.sessionStore.session;
  readonly canViewOrganization = computed(() =>
    this.sessionStore.hasPermission('organization.view'),
  );
}
