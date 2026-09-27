import { Component, input } from '@angular/core';

@Component({
  selector: 'agrivio-ui-field-label',
  standalone: true,
  templateUrl: './ui-field-label.component.html',
})
export class UiFieldLabelComponent {
  readonly label = input.required<string>();
  readonly for = input<string | null>(null);
  readonly required = input(false);
}
