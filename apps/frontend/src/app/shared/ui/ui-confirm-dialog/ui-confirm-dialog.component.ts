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
          class="ag-dialog confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          tabindex="-1"
          (click)="$event.stopPropagation()"
          (keydown)="$event.stopPropagation()"
        >
          <div class="confirm-dialog__header">
            <h2 [id]="titleId" class="confirm-dialog__title">{{ title() }}</h2>
          </div>
          <div class="confirm-dialog__body">
            <p class="confirm-dialog__message">{{ message() }}</p>
            @if (requireReason()) {
              <div class="ag-field confirm-dialog__field">
                <label class="ag-field__label" for="confirm-dialog-reason">
                  Reason <span class="confirm-dialog__required" aria-hidden="true">*</span>
                </label>
                <input
                  id="confirm-dialog-reason"
                  class="ag-input confirm-dialog__input"
                  type="text"
                  placeholder="Enter reason for this action (required)…"
                  [value]="reason()"
                  (input)="onReasonInput($event)"
                  data-testid="lifecycle-reason-input"
                  autocomplete="off"
                />
                <span class="ag-field__hint">Provide a clear operational or audit reason for this action.</span>
              </div>
            }
          </div>
          <div class="confirm-dialog__actions">
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
  styles: [`
    :host {
      display: contents;
    }

    .confirm-dialog {
      width: min(calc(100vw - 2rem), 32rem);
      padding: 1.5rem 1.75rem;
      border-radius: var(--ag-radius-lg, 0.75rem);
      background: var(--ag-color-surface, #ffffff);
      border: 1px solid var(--ag-color-border, #e2e8f0);
      box-shadow: var(--ag-shadow-lg, 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1));
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .confirm-dialog__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .confirm-dialog__title {
      font-family: var(--ag-font-display, var(--ag-font-family, serif));
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--ag-color-text, #0f172a);
      margin: 0;
      line-height: 1.3;
    }

    .confirm-dialog__body {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .confirm-dialog__message {
      font-size: 0.9375rem;
      line-height: 1.55;
      color: var(--ag-color-text-muted, #475569);
      margin: 0;
    }

    .confirm-dialog__field {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      margin-top: 0.25rem;
    }

    .confirm-dialog__field .ag-field__label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--ag-color-text, #1e293b);
      letter-spacing: 0.01em;
    }

    .confirm-dialog__required {
      color: var(--ag-color-danger, #dc2626);
      font-weight: 700;
      margin-left: 0.125rem;
    }

    .confirm-dialog__input {
      min-height: 2.625rem;
      font-size: 0.875rem;
      border-radius: var(--ag-radius-md, 0.5rem);
      border: 1px solid var(--ag-color-border, #cbd5e1);
      padding: 0 0.875rem;
      width: 100%;
      color: var(--ag-color-text, #0f172a);
      background: var(--ag-color-surface, #ffffff);
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;

      &:focus,
      &:focus-visible {
        outline: none;
        border-color: var(--ag-color-primary, #15803d);
        box-shadow: 0 0 0 3px rgba(21, 128, 61, 0.15);
      }

      &::placeholder {
        color: var(--ag-color-text-muted, #94a3b8);
      }
    }

    .confirm-dialog__field .ag-field__hint {
      font-size: 0.75rem;
      color: var(--ag-color-text-muted, #64748b);
      line-height: 1.4;
    }

    .confirm-dialog__actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 0.75rem;
      padding-top: 0.875rem;
      border-top: 1px solid var(--ag-color-border, #e2e8f0);
    }
  `],
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
