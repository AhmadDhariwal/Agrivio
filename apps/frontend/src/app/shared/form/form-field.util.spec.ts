import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { UiFieldLabelComponent } from '../ui/ui-field-label/ui-field-label.component';
import { controlIsRequired, hasRequiredValidator } from './form-field.util';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, UiFieldLabelComponent],
  template: `
    <agrivio-ui-field-label label="Batch number" for="batch-number" [required]="fieldRequired(control)" />
    <input
      id="batch-number"
      [formControl]="control"
      [attr.aria-required]="fieldRequired(control) ? 'true' : null"
    />
  `,
})
class RequiredMarkerHostComponent {
  readonly fieldRequired = hasRequiredValidator;
  readonly control = new FormControl('');
}

describe('form-field.util', () => {
  it('detects required validators on controls', () => {
    const required = new FormControl('', Validators.required);
    const optional = new FormControl('');
    expect(hasRequiredValidator(required)).toBe(true);
    expect(hasRequiredValidator(optional)).toBe(false);
    expect(controlIsRequired(required)).toBe(true);
    expect(controlIsRequired(optional)).toBe(false);
  });

  it('treats conditionally attached required validators as required', () => {
    const control = new FormControl('');
    expect(hasRequiredValidator(control)).toBe(false);
    control.addValidators(Validators.required);
    control.updateValueAndValidity();
    expect(hasRequiredValidator(control)).toBe(true);
    control.removeValidators(Validators.required);
    control.updateValueAndValidity();
    expect(hasRequiredValidator(control)).toBe(false);
  });

  it('updates the shared required marker and aria-required when validators change', async () => {
    await TestBed.configureTestingModule({
      imports: [RequiredMarkerHostComponent],
    }).compileComponents();
    const fixture: ComponentFixture<RequiredMarkerHostComponent> =
      TestBed.createComponent(RequiredMarkerHostComponent);
    fixture.detectChanges();

    const host = fixture.componentInstance;
    const input = fixture.nativeElement.querySelector('#batch-number') as HTMLInputElement;
    expect(fixture.nativeElement.querySelector('.ag-field__required')).toBeFalsy();
    expect(input.getAttribute('aria-required')).toBeNull();

    host.control.addValidators(Validators.required);
    host.control.updateValueAndValidity();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ag-field__required')?.textContent).toBe('*');
    expect(input.getAttribute('aria-required')).toBe('true');

    host.control.removeValidators(Validators.required);
    host.control.updateValueAndValidity();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ag-field__required')).toBeFalsy();
    expect(input.getAttribute('aria-required')).toBeNull();
  });
});
