import { Component, input, output } from '@angular/core';

@Component({
  selector: 'agrivio-ui-checkbox',
  standalone: true,
  template: `
    <label class="ag-checkbox" [class.is-disabled]="disabled()">
      <input
        type="checkbox"
        [id]="id()"
        [checked]="checked()"
        [indeterminate]="indeterminate()"
        [disabled]="disabled()"
        (change)="onCheckboxChange($event)"
      />
      @if (label()) {
        <span>{{ label() }}</span>
      }
      <ng-content />
    </label>
  `,
})
export class UiCheckboxComponent {
  readonly checked = input(false);
  readonly indeterminate = input(false);
  readonly disabled = input(false);
  readonly label = input<string | null>(null);
  readonly id = input<string>(`ag-chk-${Math.random().toString(36).slice(2, 9)}`);

  readonly checkedChange = output<boolean>();

  onCheckboxChange(event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.checkedChange.emit(isChecked);
  }
}
