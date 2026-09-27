import { Component, input } from '@angular/core';

export type UiBadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

@Component({
  selector: 'agrivio-ui-status-badge',
  standalone: true,
  templateUrl: './ui-status-badge.component.html',
})
export class UiStatusBadgeComponent {
  readonly label = input.required<string>();
  readonly tone = input<UiBadgeTone>('primary');
}
