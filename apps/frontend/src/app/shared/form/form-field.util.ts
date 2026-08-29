import { AbstractControl, Validators } from '@angular/forms';

export function controlIsRequired(control: AbstractControl | null | undefined): boolean {
  if (!control || !control.validator) {
    return false;
  }
  const probe = control.validator({} as AbstractControl);
  return probe !== null && Object.prototype.hasOwnProperty.call(probe, 'required');
}

export function hasRequiredValidator(control: AbstractControl | null | undefined): boolean {
  if (!control) {
    return false;
  }
  if (control.hasValidator(Validators.required)) {
    return true;
  }
  return controlIsRequired(control);
}

export function shouldShowControlError(
  control: AbstractControl | null | undefined,
  submitAttempted: boolean,
): boolean {
  if (!control) {
    return false;
  }
  return control.invalid && (control.touched || submitAttempted);
}

export function fieldValidationMessage(
  control: AbstractControl | null | undefined,
  label: string,
  submitAttempted: boolean,
): string | null {
  if (!shouldShowControlError(control, submitAttempted)) {
    return null;
  }
  if (control?.hasError('required')) {
    return `${label} is required.`;
  }
  return `${label} is invalid.`;
}

export function setRequiredValidator(
  control: AbstractControl | null | undefined,
  required: boolean,
): void {
  if (!control) {
    return;
  }
  const hasRequired = control.hasValidator(Validators.required);
  if (required && !hasRequired) {
    control.addValidators(Validators.required);
    control.updateValueAndValidity({ emitEvent: false });
    return;
  }
  if (!required && hasRequired) {
    control.removeValidators(Validators.required);
    control.updateValueAndValidity({ emitEvent: false });
  }
}
