const TRANSIENT_TRANSACTION_ERROR_LABELS = [
  'TransientTransactionError',
  'UnknownTransactionCommitResult',
];

function isTransientTransactionError(error) {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  const hasErrorLabel = error.hasErrorLabel;
  if (typeof hasErrorLabel !== 'function') {
    return false;
  }

  return TRANSIENT_TRANSACTION_ERROR_LABELS.some((label) => hasErrorLabel.call(error, label));
}

function isNonRetryableTransactionFailure(error) {
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

module.exports = {
  TRANSIENT_TRANSACTION_ERROR_LABELS,
  isTransientTransactionError,
  isNonRetryableTransactionFailure,
};
