import { Component, input, output } from '@angular/core';

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
          <div class="ag-actions">
            <button type="button" class="ag-btn ag-btn--secondary" (click)="dismiss.emit()">
              {{ cancelLabel() }}
            </button>
            <button
              type="button"
              class="ag-btn"
              [class.ag-btn--danger]="danger()"
              [class.ag-btn--primary]="!danger()"
              (click)="confirmed.emit()"
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
  readonly confirmed = output<void>();
  readonly dismiss = output<void>();
  readonly titleId = `ag-confirm-${Math.random().toString(36).slice(2, 9)}`;
}
