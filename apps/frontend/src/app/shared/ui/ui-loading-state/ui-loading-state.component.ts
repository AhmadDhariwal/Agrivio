import { Component, input } from '@angular/core';

@Component({
  selector: 'agrivio-ui-loading-state',
  standalone: true,
  template: `
    <div class="ag-loading" role="status" aria-live="polite">
      <div class="ag-loading__pulse" aria-hidden="true"></div>
      <strong>{{ label() }}</strong>
    </div>
  `,
})
export class UiLoadingStateComponent {
  readonly label = input('Loading…');
}
