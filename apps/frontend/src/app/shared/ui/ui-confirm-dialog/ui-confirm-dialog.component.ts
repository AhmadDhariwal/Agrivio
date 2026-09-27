import { Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'agrivio-ui-confirm-dialog',
  standalone: true,
  templateUrl: './ui-confirm-dialog.component.html',
  styleUrl: './ui-confirm-dialog.component.scss',
})
export class UiConfirmDialogComponent {
  readonly open = input(false);
  readonly title = input('Confirm action');
  readonly message = input('Are you sure you want to continue?');
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  readonly danger = input(false);
  readonly requireReason = input(false);
  readonly confirmed = output<string>();
  readonly dismiss = output<void>();
  readonly titleId = `ag-confirm-${Math.random().toString(36).slice(2, 9)}`;
  readonly reason = signal('');

  onReasonInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      this.reason.set(target.value);
    }
  }
}
