import { describe, expect, it } from 'vitest';

const {
  reconcileSupplierLedgerState,
  sumByEffectKind,
  sumAllocations,
} = require('./supplier-reconciliation');

describe('F05 P3 reconcileSupplierLedgerState', () => {
  it('returns ok:true when all totals match expected fixtures', () => {
    const effects = [
      { effectKind: 'payable', signedAmountMinorUnits: '220000', status: 'posted' },
      { effectKind: 'payable', signedAmountMinorUnits: '-120000', status: 'posted', sourceType: 'supplier_payment_allocation' },
    ];
    const allocations = [
      { targetType: 'purchase', allocatedAmountMinorUnits: '120000', status: 'posted' },
    ];
    const accountMovements = [
      { signedAmountMinorUnits: '-120000', status: 'posted' },
    ];

    const result = reconcileSupplierLedgerState({
      effects,
      allocations,
      accountMovements,
      expectedPayableMinorUnits: '100000',
      expectedAllocationTotalMinorUnits: '120000',
      expectedAccountMovementTotalMinorUnits: '-120000',
      detectInternalInconsistency: true,
    });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.payableMinorUnits).toBe('100000');
    expect(result.allocationTotalMinorUnits).toBe('120000');
    expect(result.accountMovementTotalMinorUnits).toBe('-120000');
  });

  it('produces SUPPLIER_PAYABLE_MISMATCH when payable total does not match expected', () => {
    const effects = [
      { effectKind: 'payable', signedAmountMinorUnits: '100000', status: 'posted' },
    ];

    const result = reconcileSupplierLedgerState({
      effects,
      allocations: [],
      accountMovements: [],
      expectedPayableMinorUnits: '999999',
    });

    expect(result.ok).toBe(false);
    const finding = result.findings.find((f) => f.code === 'SUPPLIER_PAYABLE_MISMATCH');
    expect(finding).toBeDefined();
    expect(finding.actualMinorUnits).toBe('100000');
    expect(finding.expectedMinorUnits).toBe('999999');
  });

  it('produces SUPPLIER_ADVANCE_MISMATCH when advance total does not match expected', () => {
    const effects = [
      { effectKind: 'supplier_advance', signedAmountMinorUnits: '5000', status: 'posted' },
    ];

    const result = reconcileSupplierLedgerState({
      effects,
      allocations: [],
      accountMovements: [],
      expectedAdvanceMinorUnits: '1000',
    });

    expect(result.ok).toBe(false);
    const finding = result.findings.find((f) => f.code === 'SUPPLIER_ADVANCE_MISMATCH');
    expect(finding).toBeDefined();
    expect(finding.actualMinorUnits).toBe('5000');
  });

  it('produces SUPPLIER_ALLOCATION_MISMATCH when allocation total is wrong', () => {
    const allocations = [
      { targetType: 'purchase', allocatedAmountMinorUnits: '70000', status: 'posted' },
      { targetType: 'purchase', allocatedAmountMinorUnits: '30000', status: 'posted' },
    ];

    const result = reconcileSupplierLedgerState({
      effects: [],
      allocations,
      accountMovements: [],
      expectedAllocationTotalMinorUnits: '50000',
    });

    expect(result.ok).toBe(false);
    const finding = result.findings.find((f) => f.code === 'SUPPLIER_ALLOCATION_MISMATCH');
    expect(finding).toBeDefined();
    expect(finding.actualMinorUnits).toBe('100000');
  });

  it('produces SUPPLIER_ACCOUNT_MOVEMENT_MISMATCH when account movement total is wrong', () => {
    const accountMovements = [
      { signedAmountMinorUnits: '-50000', status: 'posted' },
      { signedAmountMinorUnits: '-20000', status: 'posted' },
    ];

    const result = reconcileSupplierLedgerState({
      effects: [],
      allocations: [],
      accountMovements,
      expectedAccountMovementTotalMinorUnits: '-100000',
    });

    expect(result.ok).toBe(false);
    const finding = result.findings.find((f) => f.code === 'SUPPLIER_ACCOUNT_MOVEMENT_MISMATCH');
    expect(finding).toBeDefined();
    expect(finding.actualMinorUnits).toBe('-70000');
  });

  it('detects ALLOCATION_LEDGER_INCONSISTENCY when allocation effects differ from allocation records', () => {
    const allocations = [
      { targetType: 'purchase', allocatedAmountMinorUnits: '100000', status: 'posted' },
    ];
    const effects = [
      { effectKind: 'payable', sourceType: 'supplier_payment_allocation', signedAmountMinorUnits: '-50000', status: 'posted' },
    ];

    const result = reconcileSupplierLedgerState({
      effects,
      allocations,
      accountMovements: [],
      detectInternalInconsistency: true,
    });

    expect(result.ok).toBe(false);
    const finding = result.findings.find((f) => f.code === 'ALLOCATION_LEDGER_INCONSISTENCY');
    expect(finding).toBeDefined();
    expect(finding.allocationTotalMinorUnits).toBe('100000');
    expect(finding.allocationEffectTotalMinorUnits).toBe('-50000');
  });

  it('skips non-posted effects and allocations', () => {
    const effects = [
      { effectKind: 'payable', signedAmountMinorUnits: '100000', status: 'posted' },
      { effectKind: 'payable', signedAmountMinorUnits: '999999', status: 'void' },
    ];
    const allocations = [
      { targetType: 'purchase', allocatedAmountMinorUnits: '50000', status: 'posted' },
      { targetType: 'purchase', allocatedAmountMinorUnits: '999999', status: 'void' },
    ];

    const result = reconcileSupplierLedgerState({
      effects,
      allocations,
      accountMovements: [],
    });

    expect(result.payableMinorUnits).toBe('100000');
    expect(result.allocationTotalMinorUnits).toBe('50000');
  });

  it('skips supplier_advance allocations from allocation total', () => {
    const allocations = [
      { targetType: 'purchase', allocatedAmountMinorUnits: '70000', status: 'posted' },
      { targetType: 'supplier_advance', allocatedAmountMinorUnits: '30000', status: 'posted' },
    ];

    const result = reconcileSupplierLedgerState({
      effects: [],
      allocations,
      accountMovements: [],
    });

    expect(result.allocationTotalMinorUnits).toBe('70000');
  });

  it('sumByEffectKind correctly sums a single kind ignoring others', () => {
    const effects = [
      { effectKind: 'payable', signedAmountMinorUnits: '100', status: 'posted' },
      { effectKind: 'supplier_advance', signedAmountMinorUnits: '50', status: 'posted' },
      { effectKind: 'payable', signedAmountMinorUnits: '200', status: 'posted' },
    ];
    expect(sumByEffectKind(effects, 'payable')).toBe(300n);
    expect(sumByEffectKind(effects, 'supplier_advance')).toBe(50n);
  });

  it('sumAllocations sums only purchase-target posted allocations', () => {
    const allocations = [
      { targetType: 'purchase', allocatedAmountMinorUnits: '100', status: 'posted' },
      { targetType: 'supplier_advance', allocatedAmountMinorUnits: '50', status: 'posted' },
      { targetType: 'purchase', allocatedAmountMinorUnits: '200', status: 'void' },
    ];
    expect(sumAllocations(allocations)).toBe(100n);
  });

  it('handles empty input without throwing', () => {
    const result = reconcileSupplierLedgerState({});
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.payableMinorUnits).toBe('0');
    expect(result.allocationTotalMinorUnits).toBe('0');
  });
});
