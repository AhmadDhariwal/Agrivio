import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
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
      [clearable]="true"
      [invalid]="control.invalid && control.touched"
    />
  `,
})
class FormTestHostComponent {
  control = new FormControl('sale.posted');
  options: DropdownOption[] = [
    { value: 'customer.created', label: 'Customer created' },
    { value: 'customer.deleted', label: 'Customer deleted' },
    { value: 'sale.posted', label: 'Sale posted' },
  ];
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
});

