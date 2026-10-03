import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Component } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { DropdownOption, UiSearchableDropdownComponent } from './ui-searchable-dropdown.component';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, UiSearchableDropdownComponent],
  template: `
    <agrivio-ui-searchable-dropdown
      [formControl]="control"
      [options]="options"
      [clearable]="clearable"
      [invalid]="control.invalid && control.touched"
    />
  `,
})
class FormTestHostComponent {
  control = new FormControl('sale.posted');
  clearable = true;
  options: DropdownOption[] = [
    { value: 'customer.created', label: 'Customer created' },
    { value: 'customer.deleted', label: 'Customer deleted' },
    { value: 'sale.posted', label: 'Sale posted' },
  ];
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, UiSearchableDropdownComponent],
  template: `
    <agrivio-ui-searchable-dropdown
      [formControl]="control"
      [options]="options"
      [invalid]="control.invalid && control.touched"
    />
  `,
})
class RequiredFormTestHostComponent {
  control = new FormControl('sale.posted', { validators: [Validators.required], nonNullable: true });
  options: DropdownOption[] = [
    { value: 'customer.created', label: 'Customer created' },
    { value: 'customer.deleted', label: 'Customer deleted' },
    { value: 'sale.posted', label: 'Sale posted' },
  ];
}

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, UiSearchableDropdownComponent],
  template: `
    <agrivio-ui-searchable-dropdown
      testId="branch-select"
      [formControl]="branchControl"
      [options]="branchOptions"
    />
    <agrivio-ui-searchable-dropdown
      testId="warehouse-select"
      [formControl]="warehouseControl"
      [options]="warehouseOptions"
    />
  `,
})
class CascadeTestHostComponent {
  branchControl = new FormControl('b1', { nonNullable: true });
  warehouseControl = new FormControl('w1', { nonNullable: true });
  branchOptions: DropdownOption[] = [
    { value: 'b1', label: 'Branch 1' },
    { value: 'b2', label: 'Branch 2' },
  ];
  warehouseOptions: DropdownOption[] = [
    { value: 'w1', label: 'Warehouse 1' },
    { value: 'w2', label: 'Warehouse 2' },
  ];
  apiCallCount = 0;

  constructor() {
    this.branchControl.valueChanges.subscribe((bId) => {
      if (!bId) {
        this.warehouseOptions = [];
        this.warehouseControl.setValue('');
        return;
      }
      this.apiCallCount++;
      this.warehouseOptions = [{ value: 'w1', label: 'Warehouse 1' }];
      this.warehouseControl.setValue('w1');
    });
  }
}

describe('UiSearchableDropdownComponent', () => {
  const sampleOptions: DropdownOption[] = [
    { value: 'customer.created', label: 'Customer created' },
    { value: 'customer.deleted', label: 'Customer deleted' },
    { value: 'sale.posted', label: 'Sale posted' },
  ];

  it('renders trigger button with placeholder or allOptionLabel when no value is selected', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('placeholder', 'Select action…');
    fixture.componentRef.setInput('allOptionLabel', 'All actions');
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.searchable-dropdown__trigger');
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain('All actions');
  });

  it('renders active option label when value matches an option', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('options', sampleOptions);
    fixture.componentRef.setInput('value', 'customer.deleted');
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.searchable-dropdown__trigger');
    expect(trigger.textContent).toContain('Customer deleted');
  });

  it('toggles open and closed on trigger click', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('options', sampleOptions);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector(
      '.searchable-dropdown__trigger',
    ) as HTMLButtonElement;
    expect(fixture.componentInstance.open()).toBe(false);

    trigger.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.open()).toBe(true);

    trigger.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('filters options based on search input', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('options', sampleOptions);
    fixture.detectChanges();

    fixture.componentInstance.openDropdown();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      '.searchable-dropdown__search-input',
    ) as HTMLInputElement;
    input.value = 'deleted';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.visibleOptions()).toEqual([
      { value: 'customer.deleted', label: 'Customer deleted' },
    ]);
  });

  it('emits valueChange and closes dropdown when an option is selected', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('options', sampleOptions);
    fixture.detectChanges();

    fixture.componentInstance.openDropdown();
    fixture.detectChanges();

    const emitted: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => emitted.push(v));

    fixture.componentInstance.select('sale.posted');
    expect(emitted).toEqual(['sale.posted']);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('closes on Escape key press', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.detectChanges();

    fixture.componentInstance.openDropdown();
    expect(fixture.componentInstance.open()).toBe(true);

    fixture.componentInstance.onEscape();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('closes on outside document click', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.detectChanges();

    fixture.componentInstance.openDropdown();
    expect(fixture.componentInstance.open()).toBe(true);

    const outsideDiv = document.createElement('div');
    document.body.appendChild(outsideDiv);

    const clickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(clickEvent, 'target', { value: outsideDiv });
    fixture.componentInstance.onDocumentClick(clickEvent);

    expect(fixture.componentInstance.open()).toBe(false);
    document.body.removeChild(outsideDiv);
  });

  it('does not open when disabled', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector(
      '.searchable-dropdown__trigger',
    ) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);

    trigger.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('closes when another dropdown instance opens', () => {
    const fixture1 = TestBed.createComponent(UiSearchableDropdownComponent);
    const fixture2 = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture1.detectChanges();
    fixture2.detectChanges();

    fixture1.componentInstance.openDropdown();
    expect(fixture1.componentInstance.open()).toBe(true);

    fixture2.componentInstance.openDropdown();
    expect(fixture2.componentInstance.open()).toBe(true);
    expect(fixture1.componentInstance.open()).toBe(false);
  });

  // --- New Tests for Phase 1 enhancements ---

  it('integrates seamlessly with Reactive Forms via ControlValueAccessor', () => {
    const fixture = TestBed.createComponent(FormTestHostComponent);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.searchable-dropdown__trigger');
    expect(trigger.textContent).toContain('Sale posted');

    // Update form control externally
    fixture.componentInstance.control.setValue('customer.created');
    fixture.detectChanges();
    expect(trigger.textContent).toContain('Customer created');

    // Disable control
    fixture.componentInstance.control.disable();
    fixture.detectChanges();
    expect(trigger.disabled).toBe(true);
  });

  it('supports clearable action to reset value', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('options', sampleOptions);
    fixture.componentRef.setInput('value', 'sale.posted');
    fixture.componentRef.setInput('clearable', true);
    fixture.detectChanges();

    const clearBtn = fixture.nativeElement.querySelector('.searchable-dropdown__clear-btn') as HTMLElement;
    expect(clearBtn).toBeTruthy();

    const cleared: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => cleared.push(v));

    clearBtn.click();
    fixture.detectChanges();

    expect(cleared).toEqual(['']);
    expect(fixture.componentInstance.currentValue()).toBe('');
  });

  it('displays loading spinner and polite aria-busy when loading', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.searchable-dropdown__trigger');
    expect(trigger.getAttribute('aria-busy')).toBe('true');

    fixture.componentInstance.openDropdown();
    fixture.detectChanges();

    const loadingEl = fixture.nativeElement.querySelector('.searchable-dropdown__loading');
    expect(loadingEl).toBeTruthy();
    expect(loadingEl.textContent).toContain('Loading options…');
  });

  it('applies invalid error styles and aria-invalid when invalid is true', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('invalid', true);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.searchable-dropdown__trigger');
    expect(trigger.classList).toContain('searchable-dropdown__trigger--invalid');
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
  });

  it('supports keyboard navigation via ArrowDown, ArrowUp, Home, End, and Enter', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('options', sampleOptions);
    fixture.detectChanges();

    fixture.componentInstance.openDropdown();
    fixture.detectChanges();

    // Arrow down
    fixture.componentInstance.onSearchKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(fixture.componentInstance.focusedIndex()).toBe(0);

    fixture.componentInstance.onSearchKeydown(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(fixture.componentInstance.focusedIndex()).toBe(1);

    // Arrow up
    fixture.componentInstance.onSearchKeydown(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(fixture.componentInstance.focusedIndex()).toBe(0);

    // End
    fixture.componentInstance.onSearchKeydown(new KeyboardEvent('keydown', { key: 'End' }));
    expect(fixture.componentInstance.focusedIndex()).toBe(2);

    // Home
    fixture.componentInstance.onSearchKeydown(new KeyboardEvent('keydown', { key: 'Home' }));
    expect(fixture.componentInstance.focusedIndex()).toBe(0);

    // Enter to select
    const selected: string[] = [];
    fixture.componentInstance.valueChange.subscribe((v) => selected.push(v));

    fixture.componentInstance.onSearchKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(selected).toEqual(['customer.created']);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('calculates dropup and bounds panel maxHeight when space below is constrained', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('options', sampleOptions);
    fixture.detectChanges();

    const triggerBtn = fixture.componentInstance.triggerButtonRef?.nativeElement;
    const mockRect = {
      top: 400,
      bottom: 435,
      left: 100,
      right: 300,
      width: 200,
      height: 35,
      x: 100,
      y: 400,
      toJSON: () => ({}),
    };
    if (triggerBtn) {
      vi.spyOn(triggerBtn, 'getBoundingClientRect').mockReturnValue(mockRect);
    }
    vi.spyOn(fixture.nativeElement, 'getBoundingClientRect').mockReturnValue(mockRect);

    Object.defineProperty(window, 'innerHeight', { value: 500, configurable: true });

    fixture.componentInstance.openDropdown();
    fixture.detectChanges();

    expect(fixture.componentInstance.open()).toBe(true);
    expect(fixture.componentInstance.dropup()).toBe(true);

    const panel = fixture.nativeElement.querySelector('.searchable-dropdown__panel') as HTMLElement;
    expect(panel.classList).toContain('searchable-dropdown__panel--dropup');
    expect(panel.style.maxHeight).toBeTruthy();
    expect(parseInt(panel.style.maxHeight, 10)).toBeGreaterThanOrEqual(140);
    expect(parseInt(panel.style.maxHeight, 10)).toBeLessThanOrEqual(340);

    const searchInput = fixture.nativeElement.querySelector('.searchable-dropdown__search-input');
    expect(searchInput).toBeTruthy();

    const optionsContainer = fixture.nativeElement.querySelector('.searchable-dropdown__options') as HTMLElement;
    expect(optionsContainer.style.maxHeight).toBeTruthy();
  });

  it('defaults clearable to true and renders clear button when an option is selected', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('options', sampleOptions);
    fixture.componentRef.setInput('value', 'customer.created');
    fixture.detectChanges();

    // Default clearable is true, so clear button should render automatically
    let clearBtn = fixture.nativeElement.querySelector('.searchable-dropdown__clear-btn');
    expect(clearBtn).toBeTruthy();

    // When value is empty, clear button is hidden
    fixture.componentRef.setInput('value', '');
    fixture.detectChanges();
    clearBtn = fixture.nativeElement.querySelector('.searchable-dropdown__clear-btn');
    expect(clearBtn).toBeNull();

    // When clearable is explicitly false, clear button is suppressed
    fixture.componentRef.setInput('value', 'customer.created');
    fixture.componentRef.setInput('clearable', false);
    fixture.detectChanges();
    clearBtn = fixture.nativeElement.querySelector('.searchable-dropdown__clear-btn');
    expect(clearBtn).toBeNull();
  });

  it('clears canonical ID, display label, internal search text, and highlighted option on clear', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('options', sampleOptions);
    fixture.componentRef.setInput('value', 'customer.created');
    fixture.detectChanges();

    fixture.componentInstance.searchTerm.set('cust');
    fixture.componentInstance.focusedIndex.set(1);

    const valueChanges: string[] = [];
    const searchChanges: string[] = [];
    let clearedFired = false;

    fixture.componentInstance.valueChange.subscribe((v) => valueChanges.push(v));
    fixture.componentInstance.searchChange.subscribe((s) => searchChanges.push(s));
    fixture.componentInstance.clear.subscribe(() => {
      clearedFired = true;
    });

    const clearBtn = fixture.nativeElement.querySelector('.searchable-dropdown__clear-btn') as HTMLElement;
    expect(clearBtn).toBeTruthy();
    clearBtn.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.currentValue()).toBe('');
    expect(fixture.componentInstance.displayLabel()).toBe('Select an option…');
    expect(fixture.componentInstance.searchTerm()).toBe('');
    expect(fixture.componentInstance.focusedIndex()).toBe(-1);
    expect(valueChanges).toEqual(['']);
    expect(searchChanges).toEqual(['']);
    expect(clearedFired).toBe(true);
  });

  it('allows selecting another option immediately after clearing without page reload, and reopening does not restore old selection', () => {
    const fixture = TestBed.createComponent(FormTestHostComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe('sale.posted');

    const clearBtn = fixture.nativeElement.querySelector('.searchable-dropdown__clear-btn') as HTMLElement;
    clearBtn.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe('');
    const child1 = fixture.debugElement.children[0];
    if (!child1) throw new Error('Dropdown child not found');
    const dropdown = child1.componentInstance as UiSearchableDropdownComponent;
    expect(dropdown.currentValue()).toBe('');
    expect(dropdown.displayLabel()).toBe('Select an option…');

    // Reopen dropdown - old value must not be restored
    dropdown.openDropdown();
    fixture.detectChanges();

    expect(dropdown.open()).toBe(true);
    expect(dropdown.currentValue()).toBe('');

    const selectedOptions = fixture.nativeElement.querySelectorAll('.searchable-dropdown__option--selected');
    expect(selectedOptions.length).toBe(0);

    // User selects another option normally
    dropdown.select('customer.deleted');
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe('customer.deleted');
    expect(dropdown.currentValue()).toBe('customer.deleted');
    expect(dropdown.displayLabel()).toBe('Customer deleted');
    expect(dropdown.open()).toBe(false);
  });

  it('allows clearing required fields as an intermediate state and marks form control invalid', () => {
    const fixture = TestBed.createComponent(RequiredFormTestHostComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.control.valid).toBe(true);

    const clearBtn = fixture.nativeElement.querySelector('.searchable-dropdown__clear-btn') as HTMLElement;
    expect(clearBtn).toBeTruthy();
    clearBtn.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe('');
    expect(fixture.componentInstance.control.valid).toBe(false);
    expect(fixture.componentInstance.control.hasError('required')).toBe(true);

    // Form control remains invalid with empty intermediate state until user selects a valid option
    const child2 = fixture.debugElement.children[0];
    if (!child2) throw new Error('Dropdown child not found');
    const dropdown = child2.componentInstance as UiSearchableDropdownComponent;
    dropdown.select('customer.created');
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe('customer.created');
    expect(fixture.componentInstance.control.valid).toBe(true);
  });

  it('does not expose clear action or allow clearing when disabled or read-only', () => {
    const fixture = TestBed.createComponent(UiSearchableDropdownComponent);
    fixture.componentRef.setInput('options', sampleOptions);
    fixture.componentRef.setInput('value', 'sale.posted');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    let clearBtn = fixture.nativeElement.querySelector('.searchable-dropdown__clear-btn');
    expect(clearBtn).toBeNull();

    fixture.componentInstance.clearSelection();
    expect(fixture.componentInstance.currentValue()).toBe('sale.posted');

    // Readonly test
    fixture.componentRef.setInput('disabled', false);
    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();

    clearBtn = fixture.nativeElement.querySelector('.searchable-dropdown__clear-btn');
    expect(clearBtn).toBeNull();

    fixture.componentInstance.clearSelection();
    expect(fixture.componentInstance.currentValue()).toBe('sale.posted');
  });

  it('supports keyboard clearing via Backspace and Delete on trigger button', () => {
    const fixture = TestBed.createComponent(FormTestHostComponent);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.searchable-dropdown__trigger') as HTMLElement;
    const child3 = fixture.debugElement.children[0];
    if (!child3) throw new Error('Dropdown child not found');
    const dropdown = child3.componentInstance as UiSearchableDropdownComponent;

    // Backspace clears value
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.control.value).toBe('');

    // Restore value and test Delete
    fixture.componentInstance.control.setValue('sale.posted');
    fixture.detectChanges();
    expect(dropdown.currentValue()).toBe('sale.posted');

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.control.value).toBe('');
  });

  it('supports keyboard clearing via Enter and Space on clear button without opening dropdown', () => {
    const fixture = TestBed.createComponent(FormTestHostComponent);
    fixture.detectChanges();

    const child4 = fixture.debugElement.children[0];
    if (!child4) throw new Error('Dropdown child not found');
    const dropdown = child4.componentInstance as UiSearchableDropdownComponent;
    const clearBtn = fixture.nativeElement.querySelector('.searchable-dropdown__clear-btn') as HTMLElement;

    // Enter on clear button
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(enterEvent, 'target', { value: clearBtn });
    triggerKeydown(fixture, enterEvent);
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe('');
    expect(dropdown.open()).toBe(false);

    // Restore value and test Space
    fixture.componentInstance.control.setValue('sale.posted');
    fixture.detectChanges();
    const clearBtn2 = fixture.nativeElement.querySelector('.searchable-dropdown__clear-btn') as HTMLElement;

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true });
    Object.defineProperty(spaceEvent, 'target', { value: clearBtn2 });
    triggerKeydown(fixture, spaceEvent);
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBe('');
    expect(dropdown.open()).toBe(false);
  });

  it('resets dependent child selection on parent clear without unnecessary API calls and preserves explicit user clears', () => {
    const fixture = TestBed.createComponent(CascadeTestHostComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.branchControl.value).toBe('b1');
    expect(fixture.componentInstance.warehouseControl.value).toBe('w1');
    expect(fixture.componentInstance.apiCallCount).toBe(0);

    // Clear parent branch
    const branchClearBtn = fixture.nativeElement.querySelector(
      '[data-testid="branch-select-clear"]',
    ) as HTMLElement;
    expect(branchClearBtn).toBeTruthy();
    branchClearBtn.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.branchControl.value).toBe('');
    expect(fixture.componentInstance.warehouseControl.value).toBe('');
    expect(fixture.componentInstance.warehouseOptions).toEqual([]);
    expect(fixture.componentInstance.apiCallCount).toBe(0); // No API call on clear

    // Re-select branch to trigger resolution
    fixture.componentInstance.branchControl.setValue('b2');
    fixture.detectChanges();

    expect(fixture.componentInstance.branchControl.value).toBe('b2');
    expect(fixture.componentInstance.warehouseControl.value).toBe('w1');
    expect(fixture.componentInstance.apiCallCount).toBe(1);

    // Now explicitly clear warehouse - smart default must not immediately override user clear
    const warehouseClearBtn = fixture.nativeElement.querySelector(
      '[data-testid="warehouse-select-clear"]',
    ) as HTMLElement;
    expect(warehouseClearBtn).toBeTruthy();
    warehouseClearBtn.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.warehouseControl.value).toBe('');
    expect(fixture.componentInstance.branchControl.value).toBe('b2');
    expect(fixture.componentInstance.warehouseControl.value).toBe(''); // Remains cleared!
  });
});

function triggerKeydown(fixture: { nativeElement: HTMLElement }, event: KeyboardEvent): void {
  const trigger = fixture.nativeElement.querySelector('.searchable-dropdown__trigger') as HTMLElement;
  trigger.dispatchEvent(event);
}

