import { Component, input, output } from '@angular/core';

@Component({
  selector: 'agrivio-ui-dialog',
  standalone: true,
  template: `
    @if (open()) {
      <div
        class="ag-dialog-backdrop"
        role="presentation"
        (click)="onBackdropClick()"
        (keydown.escape)="dismiss.emit()"
      >
        <div
          class="ag-dialog"
          [class.ag-dialog--wide]="size() === 'lg'"
          [class.ag-dialog--medium]="size() === 'md'"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
          tabindex="-1"
          (click)="$event.stopPropagation()"
          (keydown)="$event.stopPropagation()"
        >
          <div class="ag-dialog__header">
            <h2 [id]="titleId" class="ag-dialog__title">{{ title() }}</h2>
            <button
              type="button"
              class="ag-btn ag-btn--ghost ag-btn--sm ag-dialog__close"
              aria-label="Close dialog"
              (click)="dismiss.emit()"
            >
              <span aria-hidden="true">&times;</span>
            </button>
          </div>

          @if (description()) {
            <p class="ag-muted ag-dialog__description">{{ description() }}</p>
          }

          <div class="ag-dialog__body">
            <ng-content />
          </div>

          <div class="ag-dialog__footer">
            <ng-content select="[dialog-actions]" />
          </div>
        </div>
      </div>
    }
  `,
})
export class UiDialogComponent {
  readonly open = input(false);
  readonly title = input('Dialog');
  readonly description = input<string | null>(null);
  readonly size = input<'sm' | 'md' | 'lg' | 'default'>('default');
  readonly closeOnBackdropClick = input<boolean>(true);
  readonly dismiss = output<void>();
  readonly titleId = `ag-dialog-title-${Math.random().toString(36).slice(2, 9)}`;

  onBackdropClick(): void {
    if (this.closeOnBackdropClick()) {
      this.dismiss.emit();
    }
  }
}
