import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface DropdownOption {
  value: string;
  label: string;
  meta?: string | undefined;
  system?: boolean | undefined;
}

export type SearchableDropdownOption = DropdownOption;

let nextUniqueId = 0;

@Component({
  selector: 'agrivio-ui-searchable-dropdown',
  standalone: true,
  imports: [FormsModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiSearchableDropdownComponent),
      multi: true,
    },
  ],
  template: `
    <div
      class="searchable-dropdown"
      [class.searchable-dropdown--open]="open()"
      [class.searchable-dropdown--disabled]="isControlDisabled()"
      [class.searchable-dropdown--invalid]="isControlInvalid()"
      [attr.data-testid]="effectiveTestId() ? effectiveTestId() + '-combobox' : null"
      [attr.aria-required]="effectiveAriaRequired() ? 'true' : null"
    >
      <select
        tabindex="-1"
        aria-hidden="true"
        style="position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); border: 0; pointer-events: none;"
        [disabled]="isControlDisabled()"
        [attr.data-testid]="effectiveTestId() || null"
        [attr.aria-required]="effectiveAriaRequired() ? 'true' : null"
        (change)="onNativeSelectChange($event)"
      >
        <option value="">{{ allOptionLabel() || placeholder() }}</option>
        @if (currentValue() && !hasMatchingOption()) {
          <option [value]="currentValue()" selected>{{ selectedLabel() || displayLabel() }}</option>
        }
        @for (opt of options(); track opt.value) {
          <option [value]="opt.value" [selected]="opt.value === currentValue()">{{ opt.label }}</option>
        }
      </select>
      <button
        #triggerButton
        type="button"
        class="searchable-dropdown__trigger"
        [class.searchable-dropdown__trigger--active]="open()"
        [class.searchable-dropdown__trigger--invalid]="isControlInvalid()"
        [class.searchable-dropdown__trigger--readonly]="readonly()"
        [disabled]="isControlDisabled()"
        [id]="id() || undefined"
        role="combobox"
        [attr.aria-label]="ariaLabel()"
        [attr.aria-expanded]="open()"
        aria-haspopup="listbox"
        [attr.aria-controls]="listboxId"
        [attr.aria-activedescendant]="activeOptionId()"
        [attr.aria-invalid]="isControlInvalid() ? 'true' : null"
        [attr.aria-required]="effectiveAriaRequired() ? 'true' : null"
        [attr.aria-busy]="loading() ? 'true' : null"
        [attr.data-testid]="testId() ? testId() + '-trigger' : 'dropdown-trigger'"
        (click)="toggle($event)"
        (keydown)="onTriggerKeydown($event)"
      >
        <span class="searchable-dropdown__value" [class.searchable-dropdown__value--placeholder]="isPlaceholder()">
          {{ displayLabel() }}
        </span>

        @if (clearable() && currentValue() && !isControlDisabled() && !readonly()) {
          <span
            class="searchable-dropdown__clear-btn"
            role="button"
            tabindex="0"
            aria-label="Clear selection"
            [attr.data-testid]="testId() ? testId() + '-clear' : 'dropdown-clear'"
            (click)="clearSelection($event)"
            (keydown.enter)="clearSelection($event)"
            (keydown.space)="clearSelection($event)"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </span>
        }

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
        #panelRef
        class="searchable-dropdown__panel"
        [class.searchable-dropdown__panel--open]="open()"
        [class.searchable-dropdown__panel--dropup]="dropup()"
        [class]="panelClass()"
        [id]="listboxId"
        [attr.aria-hidden]="!open()"
        role="listbox"
        [attr.aria-label]="ariaLabel()"
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
              [attr.data-testid]="testId() ? testId() + '-search-input' : 'dropdown-search'"
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

        <div #optionsContainer class="searchable-dropdown__options">
          @if (loading()) {
            <div class="searchable-dropdown__loading" role="status" aria-live="polite">
              <svg
                class="searchable-dropdown__spinner"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25" />
                <path d="M12 3a9 9 0 0 1 9 9" />
              </svg>
              <span>Loading options…</span>
            </div>
          }

          @if (!loading() && allOptionLabel() && (!searchTerm() || matchesAllOption())) {
            <button
              type="button"
              class="searchable-dropdown__option"
              [class.searchable-dropdown__option--selected]="currentValue() === ''"
              [class.searchable-dropdown__option--focused]="focusedIndex() === -10"
              role="option"
              [id]="listboxId + '-opt-all'"
              [attr.aria-selected]="currentValue() === ''"
              [attr.data-testid]="testId() ? testId() + '-option-all' : 'dropdown-option-all'"
              (click)="select('', $event)"
            >
              <span class="searchable-dropdown__option-text">{{ allOptionLabel() }}</span>
              @if (currentValue() === '') {
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
              [class.searchable-dropdown__option--selected]="currentValue() === option.value"
              [class.searchable-dropdown__option--focused]="focusedIndex() === idx"
              role="option"
              [id]="listboxId + '-opt-' + idx"
              [attr.aria-selected]="currentValue() === option.value"
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
              @if (currentValue() === option.value) {
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

          @if (!loading() && visibleOptions().length === 0 && (!allOptionLabel() || !matchesAllOption())) {
            <div class="searchable-dropdown__empty">{{ emptyText() }}</div>
          }
        </div>
      </div>
    </div>
  `,
  styleUrl: './ui-searchable-dropdown.component.scss',
})
export class UiSearchableDropdownComponent implements ControlValueAccessor {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('triggerButton') triggerButtonRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('optionsContainer') optionsContainerRef?: ElementRef<HTMLElement>;

  readonly listboxId = `agrivio-listbox-${++nextUniqueId}`;

  // Form identity & state inputs
  readonly id = input<string>('');
  readonly name = input<string>('');
  readonly value = input<string | null | undefined>('');
  readonly selectedLabel = input<string>('');
  readonly options = input<readonly DropdownOption[]>([]);
  readonly placeholder = input('Select an option…');
  readonly allOptionLabel = input<string | undefined>('');
  readonly searchable = input(true);
  readonly searchPlaceholder = input('Search…');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly invalid = input(false);
  readonly error = input<string | null | undefined>('');
  readonly required = input(false);
  readonly ariaRequired = input<boolean | string | null>(null);
  readonly clearable = input(false);
  readonly loading = input(false);
  readonly emptyText = input('No matching options');
  readonly testId = input('');
  readonly ariaLabel = input('Select option');
  readonly serverSearch = input(false);
  readonly panelClass = input('');
  readonly dropupAuto = input(true);

  // Outputs
  readonly valueChange = output<string>();
  readonly searchChange = output<string>();
  readonly openChange = output<boolean>();
  readonly clear = output<void>();

  // Internal reactive state
  readonly open = signal(false);
  readonly searchTerm = signal('');
  readonly focusedIndex = signal(-1);
  readonly dropup = signal(false);

  private readonly formValue = signal<string | null>(null);
  private readonly localValue = signal<string | null>(null);
  private readonly formDisabled = signal(false);
  private isFormManaged = false;

  private onChange: (value: string) => void = (_value: string) => {
    // ControlValueAccessor default callback
  };
  private onTouched: () => void = () => {
    // ControlValueAccessor default callback
  };

  // Effective current value and disabled status
  readonly currentValue = computed(() => {
    if (this.isFormManaged) {
      return this.formValue() ?? '';
    }
    const local = this.localValue();
    if (local !== null) {
      return local;
    }
    return this.value() ?? '';
  });

  readonly isControlDisabled = computed(() => {
    return this.disabled() || this.formDisabled();
  });

  readonly isControlInvalid = computed(() => {
    return Boolean(this.invalid() || this.error());
  });

  readonly effectiveAriaRequired = computed(() => {
    const ar = this.ariaRequired();
    if (ar !== null && ar !== undefined) {
      return ar === true || ar === 'true';
    }
    return this.required();
  });

  readonly effectiveTestId = computed(() => {
    return this.testId() || this.id() || '';
  });

  readonly activeOptionId = computed(() => {
    const idx = this.focusedIndex();
    if (idx === -10) return `${this.listboxId}-opt-all`;
    if (idx >= 0) return `${this.listboxId}-opt-${idx}`;
    return null;
  });

  readonly isPlaceholder = computed(() => {
    return !this.currentValue() && !this.allOptionLabel();
  });

  readonly matchesAllOption = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return true;
    const label = this.allOptionLabel();
    return label ? label.toLowerCase().includes(term) : false;
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
    const currentVal = this.currentValue();
    if (!currentVal) {
      return this.allOptionLabel() || this.placeholder();
    }
    const found = this.options().find((o) => o.value === currentVal);
    return found ? found.label : currentVal;
  });

  readonly hasMatchingOption = computed(() => {
    const val = this.currentValue();
    if (!val) return true;
    return this.options().some((o) => o.value === val);
  });

  onNativeSelectChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    if (target) {
      this.select(target.value);
    }
  }

  // ControlValueAccessor implementation
  writeValue(value: unknown): void {
    this.isFormManaged = true;
    const nextVal = value !== null && value !== undefined ? String(value) : '';
    this.formValue.set(nextVal);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled.set(isDisabled);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.open() && !this.elementRef.nativeElement.contains(target)) {
      this.close();
    }
  }

  @HostListener('document:agrivio-dropdown-opened', ['$event'])
  onOtherDropdownOpened(event: Event): void {
    const custom = event as CustomEvent<UiSearchableDropdownComponent>;
    if (custom.detail !== this && this.open()) {
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
    if (this.isControlDisabled() || this.readonly()) return;
    if (this.open()) {
      this.close();
    } else {
      this.openDropdown();
    }
  }

  openDropdown(): void {
    if (this.isControlDisabled() || this.readonly()) return;

    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('agrivio-dropdown-opened', { detail: this }));
    }

    if (this.dropupAuto() && typeof window !== 'undefined') {
      const rect = this.elementRef.nativeElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      this.dropup.set(spaceBelow < 250 && spaceAbove > spaceBelow);
    }

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
    if (!this.open()) return;
    this.open.set(false);
    this.searchTerm.set('');
    this.focusedIndex.set(-1);
    this.onTouched();
    this.openChange.emit(false);
  }

  select(val: string, event?: Event): void {
    event?.stopPropagation();
    if (this.isFormManaged) {
      this.formValue.set(val);
    } else {
      this.localValue.set(val);
    }
    this.onChange(val);
    this.onTouched();
    this.valueChange.emit(val);
    this.close();
    this.triggerButtonRef?.nativeElement.focus();
  }

  clearSelection(event?: Event): void {
    event?.stopPropagation();
    if (this.isControlDisabled() || this.readonly()) return;
    if (this.isFormManaged) {
      this.formValue.set('');
    } else {
      this.localValue.set('');
    }
    this.onChange('');
    this.onTouched();
    this.valueChange.emit('');
    this.clear.emit();
    if (this.open()) {
      this.close();
    }
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
    if (this.isControlDisabled() || this.readonly()) return;

    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.open()) {
        this.openDropdown();
      }
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    const options = this.visibleOptions();
    const hasAll = !!this.allOptionLabel() && this.matchesAllOption();

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      let next = this.focusedIndex();
      if (next === -1 && hasAll) {
        next = -10; // All option
      } else if (next === -10) {
        next = options.length > 0 ? 0 : -10;
      } else {
        next = Math.min(options.length - 1, next + 1);
      }
      this.focusedIndex.set(next);
      this.scrollFocusedIntoView();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      let prev = this.focusedIndex();
      if (prev > 0) {
        prev = prev - 1;
      } else if (prev === 0 && hasAll) {
        prev = -10;
      } else if (prev === -10) {
        prev = -10;
      } else if (prev === -1 && options.length > 0) {
        prev = options.length - 1;
      }
      this.focusedIndex.set(prev);
      this.scrollFocusedIntoView();
    } else if (event.key === 'Home') {
      event.preventDefault();
      this.focusedIndex.set(hasAll ? -10 : (options.length > 0 ? 0 : -1));
      this.scrollFocusedIntoView();
    } else if (event.key === 'End') {
      event.preventDefault();
      this.focusedIndex.set(options.length > 0 ? options.length - 1 : (hasAll ? -10 : -1));
      this.scrollFocusedIntoView();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const idx = this.focusedIndex();
      if (idx === -10) {
        this.select('');
      } else if (idx >= 0 && options[idx]) {
        this.select(options[idx]!.value);
      } else if (options.length === 1) {
        this.select(options[0]!.value);
      } else if (hasAll && !this.searchTerm()) {
        this.select('');
      }
    } else if (event.key === 'Tab') {
      this.close();
    }
  }

  private scrollFocusedIntoView(): void {
    setTimeout(() => {
      const container = this.optionsContainerRef?.nativeElement;
      if (!container) return;
      const focusedEl = container.querySelector('.searchable-dropdown__option--focused') as HTMLElement;
      if (focusedEl) {
        focusedEl.scrollIntoView({ block: 'nearest' });
      }
    }, 0);
  }
}
