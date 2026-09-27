import { Component, input } from '@angular/core';

export type UiAlertTone = 'success' | 'danger' | 'warning' | 'info';

@Component({
  selector: 'agrivio-ui-alert',
  standalone: true,
  templateUrl: './ui-alert.component.html',
})
export class UiAlertComponent {
  readonly message = input<string | null>(null);
  readonly tone = input<UiAlertTone>('info');
  readonly role = input<'status' | 'alert'>('status');
}
