import { Component, input } from '@angular/core';

@Component({
  selector: 'agrivio-ui-empty-state',
  standalone: true,
  template: `
    <div class="ag-empty" role="status">
      <strong>{{ title() }}</strong>
      @if (message()) {
        <p>{{ message() }}</p>
      }
      <ng-content />
    </div>
  `,
})
export class UiEmptyStateComponent {
  readonly title = input('Nothing to show yet');
  readonly message = input<string | null>(null);
}
