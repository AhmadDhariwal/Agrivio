import { Component, effect, input, output } from '@angular/core';
import { lockBodyScroll, unlockBodyScroll } from '../body-scroll-lock';

@Component({
  selector: 'agrivio-ui-dialog',
  standalone: true,
  templateUrl: './ui-dialog.component.html',
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
