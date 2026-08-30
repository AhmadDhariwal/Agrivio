import { Component, input } from '@angular/core';

@Component({
  selector: 'agrivio-ui-field-label',
  standalone: true,
  template: `
    <label class="ag-field__label" [attr.for]="for()">
      {{ label() }}
      @if (required()) {
        <span class="ag-field__required" aria-hidden="true">*</span>
        <span class="ag-sr-only"> (required)</span>
      }
    </label>
  `,
})
export class UiFieldLabelComponent {
  readonly label = input.required<string>();
  readonly for = input<string | null>(null);
  readonly required = input(false);
}
