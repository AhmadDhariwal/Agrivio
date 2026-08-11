import { describe, expect, it } from 'vitest';

const { applyInboundWac } = require('./wac');
const {
  convertEnteredQuantityToBaseMinorUnits,
  computeUnitCostMinorUnits,
  formatMoneyMinorUnits,
  formatQuantityMinorUnits,
  parseMoneyMinorUnits,
  parseQuantityMinorUnits,
} = require('../../platform/primitives/money-and-time');

describe('BR-COST weighted-average cost', () => {
  it('uses receipt unit cost when existing quantity is zero', () => {
    const result = applyInboundWac(
      {
        quantityBaseMinorUnits: 0n,
        inventoryValueMinorUnits: 0n,
      },
      {
        quantityBaseMinorUnits: parseQuantityMinorUnits('10'),
        inventoryValueMinorUnits: parseMoneyMinorUnits('1000.00'),
      },
    );
    expect(formatQuantityMinorUnits(result.quantityBaseMinorUnits)).toBe('10.0000');
    expect(formatMoneyMinorUnits(result.inventoryValueMinorUnits)).toBe('1000.00');
    expect(formatMoneyMinorUnits(result.weightedAverageCostMinorUnits)).toBe('100.00');
  });

  it('applies normal WAC when existing quantity is positive', () => {
    const first = applyInboundWac(
      {
        quantityBaseMinorUnits: 0n,
        inventoryValueMinorUnits: 0n,
      },
      {
        quantityBaseMinorUnits: parseQuantityMinorUnits('10'),
        inventoryValueMinorUnits: parseMoneyMinorUnits('1000.00'),
      },
    );
    const second = applyInboundWac(
      {
        quantityBaseMinorUnits: first.quantityBaseMinorUnits,
        inventoryValueMinorUnits: first.inventoryValueMinorUnits,
      },
      {
        quantityBaseMinorUnits: parseQuantityMinorUnits('10'),
        inventoryValueMinorUnits: parseMoneyMinorUnits('1500.00'),
      },
    );
    expect(formatQuantityMinorUnits(second.quantityBaseMinorUnits)).toBe('20.0000');
    expect(formatMoneyMinorUnits(second.inventoryValueMinorUnits)).toBe('2500.00');
    expect(formatMoneyMinorUnits(second.weightedAverageCostMinorUnits)).toBe('125.00');
  });

  it('sets WAC to receipt unit cost when existing quantity is negative', () => {
    const result = applyInboundWac(
      {
        quantityBaseMinorUnits: -20000n,
        inventoryValueMinorUnits: 0n,
      },
      {
        quantityBaseMinorUnits: parseQuantityMinorUnits('5'),
        inventoryValueMinorUnits: parseMoneyMinorUnits('500.00'),
      },
    );
    expect(formatQuantityMinorUnits(result.quantityBaseMinorUnits)).toBe('3.0000');
    expect(formatMoneyMinorUnits(result.weightedAverageCostMinorUnits)).toBe('100.00');
    expect(formatMoneyMinorUnits(result.inventoryValueMinorUnits)).toBe('300.00');
  });

  it('converts packaging quantity to base with round-half-up', () => {
    const base = convertEnteredQuantityToBaseMinorUnits(
      parseQuantityMinorUnits('2'),
      '50.5',
    );
    expect(formatQuantityMinorUnits(base)).toBe('101.0000');
  });

  it('computes unit cost with money scale', () => {
    const unit = computeUnitCostMinorUnits(
      parseMoneyMinorUnits('10.00'),
      parseQuantityMinorUnits('3'),
    );
    expect(formatMoneyMinorUnits(unit)).toBe('3.33');
  });
});
