import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';
import { ACCESS_DENIED_MESSAGE } from '../../../../core/access/authorization-error';

@Component({
  selector: 'agrivio-access-denied-page',
  standalone: true,
  imports: [RouterLink, UiEmptyStateComponent],
  template: `
    <section class="ag-stack" data-testid="access-denied">
      <agrivio-ui-empty-state title="Access denied" [message]="message" />
      <div class="ag-actions">
        <a class="ag-btn ag-btn--primary" routerLink="/app">Return to workspace</a>
      </div>
    </section>
  `,
})
export class AccessDeniedPage {
  readonly message = ACCESS_DENIED_MESSAGE;
}
