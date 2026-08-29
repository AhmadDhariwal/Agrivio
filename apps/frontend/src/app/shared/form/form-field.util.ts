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
  if (control?.hasError('minlength')) {
    const requiredLength = control.getError('minlength')?.requiredLength;
    if (typeof requiredLength === 'number') {
      return `${label} must be at least ${requiredLength} characters.`;
    }
  }
  if (control?.hasError('maxlength')) {
    const requiredLength = control.getError('maxlength')?.requiredLength;
    if (typeof requiredLength === 'number') {
      return `${label} must be at most ${requiredLength} characters.`;
    }
  }
  if (control?.hasError('min')) {
    const min = control.getError('min')?.min;
    if (typeof min === 'number') {
      return `${label} must be at least ${min}.`;
    }
  }
  if (control?.hasError('max')) {
    const max = control.getError('max')?.max;
    if (typeof max === 'number') {
      return `${label} must be at most ${max}.`;
    }
  }
  if (control?.hasError('pattern')) {
    return `${label} is invalid.`;
  }
  if (control?.hasError('batchTrackingRequired')) {
    return 'Batch tracking is required for this product class.';
  }
  if (control?.hasError('invalidConversionFactor')) {
    return 'Conversion factor must be a positive decimal with up to six places.';
  }
  if (control?.hasError('incompletePackagingRow')) {
    return `${label} is required.`;
  }
  if (control?.hasError('invalidQuantity')) {
    return `${label} must be a positive decimal with up to four places.`;
  }
  if (control?.hasError('nonPositiveQuantity') || control?.hasError('nonZeroQuantity')) {
    return `${label} must be greater than zero.`;
  }
  if (control?.hasError('invalidMoney')) {
    return `${label} must be a non-negative decimal with up to two places.`;
  }
  if (control?.hasError('sameWarehouse')) {
    return 'Destination must differ from source warehouse.';
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
