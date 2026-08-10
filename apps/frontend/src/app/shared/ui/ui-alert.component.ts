import { Component, input } from '@angular/core';

export type UiAlertTone = 'success' | 'danger' | 'warning' | 'info';

@Component({
  selector: 'agrivio-ui-alert',
  standalone: true,
  template: `
    @if (message()) {
      <div class="ag-alert" [class]="'ag-alert ag-alert--' + tone()" [attr.role]="role()">
        <ng-content />
        <span>{{ message() }}</span>
      </div>
    }
  `,
})
export class UiAlertComponent {
  readonly message = input<string | null>(null);
  readonly tone = input<UiAlertTone>('info');
  readonly role = input<'status' | 'alert'>('status');
}
