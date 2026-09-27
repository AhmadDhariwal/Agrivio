import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  effect,
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
  host: {
    '[class.searchable-dropdown-host]': 'true',
    '[class.searchable-dropdown-host--open]': 'open()',
  },
  templateUrl: './ui-searchable-dropdown.component.html',
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
  readonly clearable = input(true);
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
  readonly panelMaxHeight = signal<number>(320);
  readonly optionsMaxHeight = signal<number>(240);

  private readonly formValue = signal<string | null>(null);
  private readonly localValue = signal<string | null>(null);
  private readonly formDisabled = signal(false);
  private isFormManaged = false;

  constructor() {
    effect(
      () => {
        const v = this.value();
        if (!this.isFormManaged && v !== undefined) {
          this.localValue.set(v !== null ? String(v) : '');
        }
      },
      { allowSignalWrites: true },
    );
  }

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
    const currentVal = this.currentValue();
    if (!currentVal) {
      return this.allOptionLabel() || this.placeholder();
    }
    const found = this.options().find((o) => o.value === currentVal);
    if (found) return found.label;
    const custom = this.selectedLabel();
    if (custom) return custom;
    return currentVal;
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
    const target = event?.target;
    if (target instanceof Element && target.closest('.searchable-dropdown__clear-btn')) {
      return;
    }
    if (this.open()) {
      this.close();
    } else {
      this.openDropdown();
    }
  }

  recalculatePosition(): void {
    if (typeof window === 'undefined') return;

    const triggerEl = this.triggerButtonRef?.nativeElement ?? this.elementRef.nativeElement;
    const rect = triggerEl.getBoundingClientRect();

    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 800;
    const margin = 10;
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - margin);
    const spaceAbove = Math.max(0, rect.top - margin);

    const defaultDesiredHeight = 280;
    let isDropup = false;

    if (this.dropupAuto()) {
      if (spaceBelow < defaultDesiredHeight && spaceAbove > spaceBelow) {
        isDropup = true;
      } else {
        isDropup = false;
      }
    }

    this.dropup.set(isDropup);

    const availableSpace = isDropup ? spaceAbove : spaceBelow;
    const effectivePanelMax = Math.max(140, Math.min(340, availableSpace));
    this.panelMaxHeight.set(effectivePanelMax);

    const searchHeight = this.searchable() ? 46 : 0;
    const effectiveOptionsMax = Math.max(60, effectivePanelMax - searchHeight - 10);
    this.optionsMaxHeight.set(effectiveOptionsMax);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.open()) {
      this.recalculatePosition();
    }
  }

  @HostListener('window:scroll', ['$event'])
  onWindowScroll(event: Event): void {
    if (!this.open()) return;
    const target = event.target;
    if (target instanceof Node && this.elementRef.nativeElement.contains(target)) {
      return;
    }
    this.recalculatePosition();
  }

  openDropdown(): void {
    if (this.isControlDisabled() || this.readonly()) return;

    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent('agrivio-dropdown-opened', { detail: this }));
    }

    this.recalculatePosition();

    this.open.set(true);
    this.searchTerm.set('');
    this.focusedIndex.set(-1);
    this.openChange.emit(true);

    setTimeout(() => {
      if (this.optionsContainerRef?.nativeElement) {
        this.optionsContainerRef.nativeElement.scrollTop = 0;
      }
      if (this.searchable()) {
        this.searchInputRef?.nativeElement.focus();
      }
    }, 0);
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
    event?.preventDefault();
    event?.stopPropagation();
    if (this.isControlDisabled() || this.readonly()) return;
    if (this.isFormManaged) {
      this.formValue.set('');
    }
    this.localValue.set('');
    this.searchTerm.set('');
    this.focusedIndex.set(-1);
    this.onChange('');
    this.onTouched();
    this.valueChange.emit('');
    this.searchChange.emit('');
    this.clear.emit();
    if (this.open()) {
      this.close();
    }
    this.triggerButtonRef?.nativeElement?.focus?.();
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

    const target = event.target;
    if (target instanceof Element && target.closest('.searchable-dropdown__clear-btn')) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        this.clearSelection(event);
        return;
      }
    }

    if ((event.key === 'Backspace' || event.key === 'Delete') && !this.open()) {
      if (this.clearable() && this.currentValue()) {
        event.preventDefault();
        event.stopPropagation();
        this.clearSelection(event);
        return;
      }
    }

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
