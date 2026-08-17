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
