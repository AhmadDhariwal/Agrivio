import { Component, input } from '@angular/core';

@Component({
  selector: 'agrivio-ui-loading-state',
  standalone: true,
  templateUrl: './ui-loading-state.component.html',
})
export class UiLoadingStateComponent {
  readonly label = input('Loading…');
}
