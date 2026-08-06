// @ts-check

/** @typedef {readonly string[]} MongoErrorLabels */

export const TRANSIENT_TRANSACTION_ERROR_LABELS = /** @type {const} */ ([
  'TransientTransactionError',
  'UnknownTransactionCommitResult',
]);

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isTransientTransactionError(error) {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  const hasErrorLabel = /** @type {{ hasErrorLabel?: (label: string) => boolean }} */ (error)
    .hasErrorLabel;
  if (typeof hasErrorLabel !== 'function') {
    return false;
  }

  return TRANSIENT_TRANSACTION_ERROR_LABELS.some((label) => hasErrorLabel.call(error, label));
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isNonRetryableTransactionFailure(error) {
  if (error instanceof Error) {
    const name = error.name;
    if (
      name === 'ValidationError' ||
      name === 'AppError' ||
      name === 'TenantScopeError' ||
      name === 'IdempotencyConflictError'
    ) {
      return true;
    }
  }

  return !isTransientTransactionError(error);
}
