import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UiEmptyStateComponent } from '../../../../shared/ui/ui-empty-state/ui-empty-state.component';

@Component({
  selector: 'agrivio-feature-unavailable-page',
  standalone: true,
  imports: [RouterLink, UiEmptyStateComponent],
  template: `
    <section class="ag-stack" data-testid="feature-unavailable">
      <agrivio-ui-empty-state
        title="Feature unavailable"
        message="This feature is not enabled for your organization."
      />
      <div class="ag-actions">
        <a class="ag-btn ag-btn--primary" routerLink="/app">Return to workspace</a>
      </div>
    </section>
  `,
})
export class FeatureUnavailablePage {}
