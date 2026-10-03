import { Component, input } from '@angular/core';

@Component({
  selector: 'agrivio-ui-empty-state',
  standalone: true,
  templateUrl: './ui-empty-state.component.html',
})
export class UiEmptyStateComponent {
  readonly title = input('Nothing to show yet');
  readonly message = input<string | null>(null);
}
