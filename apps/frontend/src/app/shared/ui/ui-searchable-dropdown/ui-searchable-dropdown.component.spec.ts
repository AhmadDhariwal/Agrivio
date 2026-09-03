import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DropdownOption, UiSearchableDropdownComponent } from './ui-searchable-dropdown.component';

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
});
