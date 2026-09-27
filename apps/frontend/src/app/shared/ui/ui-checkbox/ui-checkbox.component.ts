import { Component, input, output } from '@angular/core';

@Component({
  selector: 'agrivio-ui-checkbox',
  standalone: true,
  templateUrl: './ui-checkbox.component.html',
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
