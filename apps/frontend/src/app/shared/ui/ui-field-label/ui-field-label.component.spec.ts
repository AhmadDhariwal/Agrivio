import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiFieldLabelComponent } from './ui-field-label.component';

describe('UiFieldLabelComponent', () => {
  let fixture: ComponentFixture<UiFieldLabelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiFieldLabelComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(UiFieldLabelComponent);
  });

  it('renders optional labels without an asterisk', () => {
    fixture.componentRef.setInput('label', 'Notes');
    fixture.componentRef.setInput('for', 'notes');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Notes');
    expect(fixture.nativeElement.querySelector('.ag-field__required')).toBeFalsy();
  });

  it('renders required labels with a visible asterisk and screen-reader hint', () => {
    fixture.componentRef.setInput('label', 'Email');
    fixture.componentRef.setInput('for', 'email');
    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ag-field__required')?.textContent).toBe('*');
    expect(fixture.nativeElement.textContent).toContain('(required)');
  });

  it('toggles the required marker when the required input changes', () => {
    fixture.componentRef.setInput('label', 'Approval reason');
    fixture.componentRef.setInput('for', 'approval-reason');
    fixture.componentRef.setInput('required', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ag-field__required')).toBeFalsy();

    fixture.componentRef.setInput('required', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ag-field__required')?.textContent).toBe('*');

    fixture.componentRef.setInput('required', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ag-field__required')).toBeFalsy();
  });
});
