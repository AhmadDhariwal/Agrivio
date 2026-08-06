// @ts-check
import {
  isNonRetryableTransactionFailure,
  isTransientTransactionError,
} from './transaction-errors.js';
import { createDefaultRetryPolicy, waitForRetry } from './retry-policy.js';

/**
 * @typedef {import('mongoose').ClientSession} ClientSession
 * @typedef {{
 *   startSession: () => Promise<ClientSession>;
 *   withTransaction: (
 *     session: ClientSession,
 *     fn: (session: ClientSession) => Promise<unknown>,
 *   ) => Promise<unknown>;
 *   endSession: (session: ClientSession) => Promise<void>;
 * }} TransactionSessionPort
 * @typedef {import('./retry-policy.js').RetryPolicy} RetryPolicy
 */

/**
 * @param {TransactionSessionPort} port
 * @param {{ retryPolicy?: RetryPolicy; sleep?: (ms: number) => Promise<void> }} [options]
 */
export function createTransactionRunner(port, options = {}) {
  const retryPolicy = options.retryPolicy ?? createDefaultRetryPolicy();
  const sleep = options.sleep;

  return {
    /**
     * @template T
     * @param {(session: ClientSession) => Promise<T>} work
     * @returns {Promise<T>}
     */
    async run(work) {
      let attempt = 0;
      /** @type {unknown} */
      let lastError;

      while (attempt < retryPolicy.maxAttempts) {
        attempt += 1;
        const session = await port.startSession();

        try {
          /** @type {T | undefined} */
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
 * @param {{
 *   onCommit?: () => void;
 *   onAbort?: () => void;
 *   transientFailuresBeforeSuccess?: number;
 * }} [options]
 */
export function createMockTransactionSessionPort(options = {}) {
  let transientRemaining = options.transientFailuresBeforeSuccess ?? 0;
  let committed = false;
  let aborted = false;
  let sessionEnded = false;

  /** @type {import('mongoose').ClientSession} */
  const session = /** @type {import('mongoose').ClientSession} */ (
    /** @type {unknown} */ ({ id: 'mock-session' })
  );

  return {
    port: {
      async startSession() {
        committed = false;
        aborted = false;
        sessionEnded = false;
        return session;
      },
      async withTransaction(
        /** @type {ClientSession} */ _session,
        /** @type {(session: ClientSession) => Promise<unknown>} */ fn,
      ) {
        if (transientRemaining > 0) {
          transientRemaining -= 1;
          const error = new Error('Transient transaction failure');
          Object.assign(error, {
            hasErrorLabel: (/** @type {string} */ label) =>
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
