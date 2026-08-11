import { describe, expect, it } from 'vitest';

const { allocateLandedCosts, sumLandedCostComponents } = require('./landed-cost-allocation');

describe('landed-cost allocation (BR-COST-014/015)', () => {
  it('allocates proportionally and reconciles exactly to total', () => {
    const allocations = allocateLandedCosts(
      [
        { lineProductAmountMinorUnits: '60000' },
        { lineProductAmountMinorUnits: '40000' },
      ],
      '1000',
    );
    expect(allocations).toEqual(['600', '400']);
    const sum = allocations.reduce((acc, value) => acc + BigInt(value), 0n);
    expect(sum).toBe(1000n);
  });

  it('puts remainder on the last line for rounding', () => {
    const allocations = allocateLandedCosts(
      [
        { lineProductAmountMinorUnits: '100' },
        { lineProductAmountMinorUnits: '100' },
        { lineProductAmountMinorUnits: '100' },
      ],
      '10',
    );
    const sum = allocations.reduce((acc, value) => acc + BigInt(value), 0n);
    expect(sum).toBe(10n);
    expect(allocations[allocations.length - 1]).toBe(
      (10n - BigInt(allocations[0]) - BigInt(allocations[1])).toString(),
    );
  });

  it('returns zeros when landed cost is zero', () => {
    expect(
      allocateLandedCosts([{ lineProductAmountMinorUnits: '500' }, { lineProductAmountMinorUnits: '500' }], '0'),
    ).toEqual(['0', '0']);
  });

  it('blocks posting when landed cost exists but all line values are zero', () => {
    expect(() =>
      allocateLandedCosts(
        [{ lineProductAmountMinorUnits: '0' }, { lineProductAmountMinorUnits: '0' }],
        '100',
      ),
    ).toThrow(/zero/);
  });

  it('sums landed cost components', () => {
    expect(
      sumLandedCostComponents({
        freightMinorUnits: '100',
        loadingMinorUnits: '50',
        transportMinorUnits: '25',
        otherMinorUnits: '25',
      }),
    ).toBe('200');
  });
});
