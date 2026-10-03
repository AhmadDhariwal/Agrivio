/**
 * Customer payments presentation utilities.
 * Pure functions — no Angular dependencies.
 */

const APPLIED_TO_LABELS: Record<string, string> = {
  receivable: 'Receivable',
  advance: 'Advance',
  receivable_and_advance: 'Receivable & Advance',
};

/**
 * Returns a human-readable label for the `appliedTo` classification
 * returned by the backend. Returns `null` when `appliedTo` is absent
 * (e.g. voided or fully-reversed payments with no posted allocations).
 */
export function getAppliedToLabel(
  appliedTo: string | null | undefined,
): string | null {
  if (!appliedTo) {
    return null;
  }
  return APPLIED_TO_LABELS[appliedTo] ?? null;
}
