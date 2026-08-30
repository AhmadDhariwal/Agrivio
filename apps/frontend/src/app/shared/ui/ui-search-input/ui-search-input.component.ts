import { Component, ElementRef, ViewChild, input, output } from '@angular/core';

@Component({
  selector: 'agrivio-ui-search-input',
  standalone: true,
  template: `
    <div class="ag-search-wrap">
      <span class="ag-search-wrap__icon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </span>
      <input
        #searchInput
        type="search"
        class="ag-input ag-search-wrap__input"
        [placeholder]="placeholder()"
        [value]="value()"
        [attr.aria-label]="ariaLabel()"
        (input)="onInput($event)"
        (keydown.escape)="onEscape($event)"
      />
      @if (value()) {
        <button
          type="button"
          class="ag-search-wrap__clear"
          [attr.aria-label]="clearLabel()"
          (click)="clear()"
        >
          <span aria-hidden="true">&times;</span>
        </button>
      }
    </div>
  `,
})
export class UiSearchInputComponent {
  @ViewChild('searchInput') inputRef?: ElementRef<HTMLInputElement>;

  readonly placeholder = input('Search…');
  readonly value = input('');
  readonly ariaLabel = input('Search');
  readonly clearLabel = input('Clear search');

  readonly valueChange = output<string>();
  readonly searchChange = output<string>();
  readonly cleared = output<void>();

  onInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.valueChange.emit(val);
    this.searchChange.emit(val);
  }

  onEscape(event: Event): void {
    if (this.value()) {
      event.preventDefault();
      event.stopPropagation();
      this.clear();
    }
  }

  clear(): void {
    this.valueChange.emit('');
    this.searchChange.emit('');
    this.cleared.emit();
    if (this.inputRef?.nativeElement) {
      this.inputRef.nativeElement.value = '';
      this.inputRef.nativeElement.focus();
    }
  }
}
