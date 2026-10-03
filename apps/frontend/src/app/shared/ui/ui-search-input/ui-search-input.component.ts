import { Component, ElementRef, ViewChild, input, output } from '@angular/core';

@Component({
  selector: 'agrivio-ui-search-input',
  standalone: true,
  templateUrl: './ui-search-input.component.html',
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
