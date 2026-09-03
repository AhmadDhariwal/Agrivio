import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface DropdownOption {
  value: string;
  label: string;
  meta?: string | undefined;
  system?: boolean | undefined;
}

@Component({
  selector: 'agrivio-ui-searchable-dropdown',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div
      class="searchable-dropdown"
      [class.searchable-dropdown--open]="open()"
      [attr.data-testid]="testId()"
    >
      <button
        #triggerButton
        type="button"
        class="searchable-dropdown__trigger"
        [class.searchable-dropdown__trigger--active]="open()"
        [disabled]="disabled()"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        [attr.data-testid]="testId() ? testId() + '-trigger' : 'dropdown-trigger'"
        (click)="toggle($event)"
        (keydown)="onTriggerKeydown($event)"
      >
        <span class="searchable-dropdown__value">{{ displayLabel() }}</span>
        <svg
          class="searchable-dropdown__chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div
        class="searchable-dropdown__panel"
        [class.searchable-dropdown__panel--open]="open()"
        [attr.aria-hidden]="!open()"
        role="listbox"
        [attr.data-testid]="testId() ? testId() + '-panel' : 'dropdown-panel'"
      >
        @if (searchable()) {
          <div class="searchable-dropdown__search">
            <svg
              class="searchable-dropdown__search-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              #searchInput
              type="text"
              class="searchable-dropdown__search-input"
              [placeholder]="searchPlaceholder()"
              [value]="searchTerm()"
              [attr.data-testid]="testId() ? testId() + '-search' : 'dropdown-search'"
              (input)="onSearchInput($event)"
              (keydown)="onSearchKeydown($event)"
            />
            @if (searchTerm()) {
              <button
                type="button"
                class="searchable-dropdown__search-clear"
                aria-label="Clear search"
                (click)="clearSearch($event)"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            }
          </div>
        }

        <div class="searchable-dropdown__options">
          @if (allOptionLabel() && (!searchTerm() || matchesAllOption())) {
            <button
              type="button"
              class="searchable-dropdown__option"
              [class.searchable-dropdown__option--selected]="value() === ''"
              role="option"
              [attr.aria-selected]="value() === ''"
              [attr.data-testid]="testId() ? testId() + '-option-all' : 'dropdown-option-all'"
              (click)="select('', $event)"
            >
              <span class="searchable-dropdown__option-text">{{ allOptionLabel() }}</span>
              @if (value() === '') {
                <svg
                  class="searchable-dropdown__check"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              }
            </button>
          }

          @for (option of visibleOptions(); track option.value; let idx = $index) {
            <button
              type="button"
              class="searchable-dropdown__option"
              [class.searchable-dropdown__option--selected]="value() === option.value"
              [class.searchable-dropdown__option--focused]="focusedIndex() === idx"
              role="option"
              [attr.aria-selected]="value() === option.value"
              [attr.data-testid]="
                testId() ? testId() + '-option-' + option.value : 'dropdown-option-' + option.value
              "
              (click)="select(option.value, $event)"
            >
              <div class="searchable-dropdown__option-main">
                <span class="searchable-dropdown__option-text">{{ option.label }}</span>
                @if (option.system) {
                  <span class="searchable-dropdown__system-badge">System</span>
                }
                @if (option.meta) {
                  <span class="searchable-dropdown__option-meta">{{ option.meta }}</span>
                }
              </div>
              @if (value() === option.value) {
                <svg
                  class="searchable-dropdown__check"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              }
            </button>
          }

          @if (visibleOptions().length === 0 && (!allOptionLabel() || !matchesAllOption())) {
            <div class="searchable-dropdown__empty">No matching options</div>
          }
        </div>
      </div>
    </div>
  `,
  styleUrl: './ui-searchable-dropdown.component.scss',
})
export class UiSearchableDropdownComponent {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('triggerButton') triggerButtonRef?: ElementRef<HTMLButtonElement>;

  readonly value = input<string>('');
  readonly selectedLabel = input<string>('');
  readonly options = input<readonly DropdownOption[]>([]);
  readonly placeholder = input('Select an option…');
  readonly allOptionLabel = input('');
  readonly searchable = input(true);
  readonly searchPlaceholder = input('Search…');
  readonly disabled = input(false);
  readonly testId = input('');
  readonly ariaLabel = input('Select option');
  readonly serverSearch = input(false);

  readonly valueChange = output<string>();
  readonly searchChange = output<string>();
  readonly openChange = output<boolean>();

  readonly open = signal(false);
  readonly searchTerm = signal('');
  readonly focusedIndex = signal(-1);

  readonly matchesAllOption = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return true;
    return this.allOptionLabel().toLowerCase().includes(term);
  });

  readonly visibleOptions = computed(() => {
    if (this.serverSearch()) {
      return this.options();
    }
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return this.options();
    }
    return this.options().filter(
      (opt) =>
        opt.label.toLowerCase().includes(term) ||
        opt.value.toLowerCase().includes(term) ||
        (opt.meta && opt.meta.toLowerCase().includes(term)),
    );
  });

  readonly displayLabel = computed(() => {
    const custom = this.selectedLabel();
    if (custom) return custom;
    const currentVal = this.value();
    if (!currentVal) {
      return this.allOptionLabel() || this.placeholder();
    }
    const found = this.options().find((o) => o.value === currentVal);
    return found ? found.label : currentVal;
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.open() && !this.elementRef.nativeElement.contains(target)) {
      this.close();
    }
  }

  @HostListener('keydown.escape', ['$event'])
  onEscape(event?: Event): void {
    if (this.open()) {
      event?.preventDefault();
      event?.stopPropagation();
      this.close();
      this.triggerButtonRef?.nativeElement.focus();
    }
  }

  toggle(event?: Event): void {
    event?.stopPropagation();
    if (this.disabled()) return;
    if (this.open()) {
      this.close();
    } else {
      this.openDropdown();
    }
  }

  openDropdown(): void {
    this.open.set(true);
    this.searchTerm.set('');
    this.focusedIndex.set(-1);
    this.openChange.emit(true);
    if (this.searchable()) {
      setTimeout(() => {
        this.searchInputRef?.nativeElement.focus();
      }, 0);
    }
  }

  close(): void {
    this.open.set(false);
    this.searchTerm.set('');
    this.focusedIndex.set(-1);
    this.openChange.emit(false);
  }

  select(val: string, event?: Event): void {
    event?.stopPropagation();
    this.valueChange.emit(val);
    this.close();
    this.triggerButtonRef?.nativeElement.focus();
  }

  onSearchInput(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    const val = inputEl.value;
    this.searchTerm.set(val);
    this.focusedIndex.set(-1);
    this.searchChange.emit(val);
  }

  clearSearch(event?: Event): void {
    event?.stopPropagation();
    this.searchTerm.set('');
    this.focusedIndex.set(-1);
    this.searchChange.emit('');
    this.searchInputRef?.nativeElement.focus();
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.open()) {
        this.openDropdown();
      }
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const options = this.visibleOptions();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = Math.min(options.length - 1, this.focusedIndex() + 1);
      this.focusedIndex.set(next);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = Math.max(0, this.focusedIndex() - 1);
      this.focusedIndex.set(prev);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const idx = this.focusedIndex();
      const opt = options[idx];
      if (opt) {
        this.select(opt.value);
      } else if (this.allOptionLabel() && this.matchesAllOption()) {
        this.select('');
      }
    }
  }
}
