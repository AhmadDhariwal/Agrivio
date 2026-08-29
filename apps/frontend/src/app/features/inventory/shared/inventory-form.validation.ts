import { AbstractControl, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';

/** Matches backend parseQuantityMinorUnits (up to four decimal places, non-negative). */
export const INVENTORY_QUANTITY_PATTERN = /^\d+(\.\d{1,4})?$/;

/** Matches backend parseMoneyMinorUnits (up to two decimal places, non-negative). */
export const INVENTORY_MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

const QUANTITY_MINOR_UNIT_FACTOR = 10000n;

export function inventoryQuantityValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (value === '') {
    return null;
  }
  if (!INVENTORY_QUANTITY_PATTERN.test(value)) {
    return { invalidQuantity: true };
  }
  const [wholePart, fractionPart = ''] = value.split('.');
  if (wholePart === undefined || wholePart.length === 0) {
    return { invalidQuantity: true };
  }
  try {
    const fractionPadded = `${fractionPart}0000`.slice(0, 4);
    const minor = BigInt(wholePart) * QUANTITY_MINOR_UNIT_FACTOR + BigInt(fractionPadded);
    if (minor === 0n && wholePart === '0' && fractionPart.length > 0) {
      return { nonZeroQuantity: true };
    }
    if (minor <= 0n) {
      return { nonPositiveQuantity: true };
    }
  } catch {
    return { invalidQuantity: true };
  }
  return null;
}

export function inventoryMoneyValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (value === '') {
    return null;
  }
  if (!INVENTORY_MONEY_PATTERN.test(value)) {
    return { invalidMoney: true };
  }
  const [wholePart] = value.split('.');
  if (wholePart === undefined || wholePart.length === 0) {
    return { invalidMoney: true };
  }
  return null;
}

export const inventoryQuantityValidators: ValidatorFn[] = [
  Validators.required,
  inventoryQuantityValidator,
];

export const inventoryMoneyValidators: ValidatorFn[] = [
  Validators.required,
  inventoryMoneyValidator,
];
