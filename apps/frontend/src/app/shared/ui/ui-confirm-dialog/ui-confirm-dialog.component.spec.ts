import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiConfirmDialogComponent } from './ui-confirm-dialog.component';

describe('UiConfirmDialogComponent', () => {
  let fixture: ComponentFixture<UiConfirmDialogComponent>;
  let component: UiConfirmDialogComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UiConfirmDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(UiConfirmDialogComponent);
    component = fixture.componentInstance;
  });

  it('renders nothing when open is false', () => {
    fixture.componentRef.setInput('open', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.confirm-dialog')).toBeNull();
  });

  it('renders dialog and emits both dismiss and dismissed when Cancel button is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('cancelLabel', 'Cancel Action');
    fixture.detectChanges();

    const dismissSpy = vi.fn();
    const dismissedSpy = vi.fn();
    component.dismiss.subscribe(dismissSpy);
    component.dismissed.subscribe(dismissedSpy);

    const cancelBtn = fixture.nativeElement.querySelector('.confirm-dialog__actions .ag-btn--secondary');
    expect(cancelBtn).toBeTruthy();
    expect(cancelBtn.textContent.trim()).toBe('Cancel Action');

    cancelBtn.click();
    fixture.detectChanges();

    expect(dismissSpy).toHaveBeenCalledTimes(1);
    expect(dismissedSpy).toHaveBeenCalledTimes(1);
  });

  it('emits dismiss and dismissed on backdrop click and escape key', () => {
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();

    const dismissSpy = vi.fn();
    const dismissedSpy = vi.fn();
    component.dismiss.subscribe(dismissSpy);
    component.dismissed.subscribe(dismissedSpy);

    const backdrop = fixture.nativeElement.querySelector('.ag-dialog-backdrop');
    backdrop.click();
    expect(dismissSpy).toHaveBeenCalledTimes(1);
    expect(dismissedSpy).toHaveBeenCalledTimes(1);

    component.onDismiss();
    expect(dismissSpy).toHaveBeenCalledTimes(2);
    expect(dismissedSpy).toHaveBeenCalledTimes(2);
  });

  it('applies danger styling when danger=true or tone="danger"', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('tone', 'danger');
    fixture.detectChanges();

    const confirmBtn = fixture.nativeElement.querySelectorAll('.confirm-dialog__actions button')[1];
    expect(confirmBtn.classList.contains('ag-btn--danger')).toBe(true);
  });

  it('emits confirmed event with reason when confirmed button is clicked', () => {
    fixture.componentRef.setInput('open', true);
    fixture.componentRef.setInput('confirmLabel', 'Confirm Action');
    fixture.detectChanges();

    const confirmedSpy = vi.fn();
    component.confirmed.subscribe(confirmedSpy);

    const confirmBtn = fixture.nativeElement.querySelectorAll('.confirm-dialog__actions button')[1];
    confirmBtn.click();

    expect(confirmedSpy).toHaveBeenCalledWith('');
  });
});
