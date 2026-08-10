import { Component, input } from '@angular/core';

export type UiBadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

@Component({
  selector: 'agrivio-ui-status-badge',
  standalone: true,
  template: `
    <span
      class="ag-badge"
      [class.ag-badge--success]="tone() === 'success'"
      [class.ag-badge--warning]="tone() === 'warning'"
      [class.ag-badge--danger]="tone() === 'danger'"
      [class.ag-badge--neutral]="tone() === 'neutral'"
    >
      {{ label() }}
    </span>
  `,
})
export class UiStatusBadgeComponent {
  readonly label = input.required<string>();
  readonly tone = input<UiBadgeTone>('primary');
}
