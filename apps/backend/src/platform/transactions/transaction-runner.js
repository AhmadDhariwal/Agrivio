const {
  isNonRetryableTransactionFailure,
  isTransientTransactionError,
} = require('./transaction-errors');
const { createDefaultRetryPolicy, waitForRetry } = require('./retry-policy');

function createTransactionRunner(port, options = {}) {
  const retryPolicy = options.retryPolicy ?? createDefaultRetryPolicy();
  const sleep = options.sleep;

  return {
    async run(work) {
      let attempt = 0;
      let lastError;

      while (attempt < retryPolicy.maxAttempts) {
        attempt += 1;
        const session = await port.startSession();

        try {
          let result;
          await port.withTransaction(session, async (activeSession) => {
            result = await work(activeSession);
          });

          if (result === undefined) {
            throw new Error('Transaction callback did not return a value');
          }

          return result;
        } catch (error) {
          lastError = error;
          if (isNonRetryableTransactionFailure(error) || !isTransientTransactionError(error)) {
            throw error;
          }

          if (attempt >= retryPolicy.maxAttempts) {
            throw error;
          }

          await waitForRetry(retryPolicy, attempt, sleep);
        } finally {
          await port.endSession(session);
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Transaction failed after retries');
    },
  };
}

/**
 * In-memory session port for unit tests.
 */
function createMockTransactionSessionPort(options = {}) {
  let transientRemaining = options.transientFailuresBeforeSuccess ?? 0;
  let committed = false;
  let aborted = false;
  let sessionEnded = false;

  const session = { id: 'mock-session' };

  return {
    port: {
      async startSession() {
        committed = false;
        aborted = false;
        sessionEnded = false;
        return session;
      },
      async withTransaction(_session, fn) {
        if (transientRemaining > 0) {
          transientRemaining -= 1;
          const error = new Error('Transient transaction failure');
          Object.assign(error, {
            hasErrorLabel: (label) =>
              label === 'TransientTransactionError' || label === 'UnknownTransactionCommitResult',
          });
          throw error;
        }

        try {
          const result = await fn(session);
          committed = true;
          options.onCommit?.();
          return result;
        } catch (error) {
          aborted = true;
          options.onAbort?.();
          throw error;
        }
      },
      async endSession() {
        sessionEnded = true;
      },
    },
    getState() {
      return { committed, aborted, sessionEnded };
    },
  };
}

module.exports = {
  createTransactionRunner,
  createMockTransactionSessionPort,
};
