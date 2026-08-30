import { FormControl } from '@angular/forms';
import {
  inventoryMoneyValidator,
  inventoryQuantityValidator,
} from './inventory-form.validation';

describe('inventory-form.validation', () => {
  it('accepts positive quantities with up to four decimal places', () => {
    const control = new FormControl('10.5000');
    expect(inventoryQuantityValidator(control)).toBeNull();
  });

  it('rejects zero and invalid quantity formats', () => {
    expect(inventoryQuantityValidator(new FormControl('0'))).toEqual({
      nonPositiveQuantity: true,
    });
    expect(inventoryQuantityValidator(new FormControl('-1'))).toEqual({
      invalidQuantity: true,
    });
    expect(inventoryQuantityValidator(new FormControl('1.23456'))).toEqual({
      invalidQuantity: true,
    });
  });

  it('accepts non-negative money values with up to two decimal places', () => {
    expect(inventoryMoneyValidator(new FormControl('250000.00'))).toBeNull();
    expect(inventoryMoneyValidator(new FormControl('0'))).toBeNull();
  });

  it('rejects invalid money formats', () => {
    expect(inventoryMoneyValidator(new FormControl('12.345'))).toEqual({
      invalidMoney: true,
    });
    expect(inventoryMoneyValidator(new FormControl('-5.00'))).toEqual({
      invalidMoney: true,
    });
  });
});
