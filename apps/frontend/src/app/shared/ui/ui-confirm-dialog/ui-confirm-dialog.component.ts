import { Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'agrivio-ui-confirm-dialog',
  standalone: true,
  template: `
    @if (open()) {
      <div
        class="ag-dialog-backdrop"
        role="presentation"
        (click)="dismiss.emit()"
        (keydown.escape)="dismiss.emit()"
      >
        <div
          class="ag-dialog"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          tabindex="-1"
          (click)="$event.stopPropagation()"
          (keydown)="$event.stopPropagation()"
        >
          <h2 [id]="titleId">{{ title() }}</h2>
          <p class="ag-muted">{{ message() }}</p>
          @if (requireReason()) {
            <label>
              Reason
              <input
                [value]="reason()"
                (input)="onReasonInput($event)"
                data-testid="lifecycle-reason-input"
              />
            </label>
          }
          <div class="ag-actions">
            <button type="button" class="ag-btn ag-btn--secondary" (click)="dismiss.emit()">
              {{ cancelLabel() }}
            </button>
            <button
              type="button"
              class="ag-btn"
              [class.ag-btn--danger]="danger()"
              [class.ag-btn--primary]="!danger()"
              [disabled]="requireReason() && reason().trim() === ''"
              (click)="confirmed.emit(reason().trim())"
            >
              {{ confirmLabel() }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
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
