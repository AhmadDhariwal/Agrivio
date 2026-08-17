import { Component, effect, input, output } from '@angular/core';

let bodyScrollLockCount = 0;
let previousBodyOverflow = '';

function lockBodyScroll(): void {
  if (bodyScrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  bodyScrollLockCount += 1;
}

function unlockBodyScroll(): void {
  if (bodyScrollLockCount === 0) {
    return;
  }
  bodyScrollLockCount -= 1;
  if (bodyScrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
  }
}

@Component({
  selector: 'agrivio-ui-dialog',
  standalone: true,
  template: `
    @if (open()) {
      <div
        class="ag-dialog-backdrop"
        role="presentation"
        (click)="onBackdropClick()"
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
          (keydown.escape)="onEscape($event)"
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

          <div
            class="ag-dialog__body"
            [class.ag-dialog__body--contained]="contained()"
          >
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
  readonly contained = input(false);
  readonly dismiss = output<void>();
  readonly titleId = `ag-dialog-title-${Math.random().toString(36).slice(2, 9)}`;

  constructor() {
    effect((onCleanup) => {
      if (!this.open()) {
        return;
      }
      lockBodyScroll();
      onCleanup(() => {
        unlockBodyScroll();
      });
    });
  }

  onBackdropClick(): void {
    if (this.closeOnBackdropClick()) {
      this.dismiss.emit();
    }
  }

  onEscape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.dismiss.emit();
  }
}
