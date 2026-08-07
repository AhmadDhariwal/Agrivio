import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../errors/app-error';
import { ApiTransportErrorCode } from '@agrivio/api-contracts';
import { createMockTransactionSessionPort, createTransactionRunner } from './transaction-runner';
import { createDeterministicRetryPolicy } from './retry-policy';
import { isTransientTransactionError } from './transaction-errors';
describe('transaction runner', () => {
  it('commits work and ends the session', async () => {
    const mock = createMockTransactionSessionPort();
    const runner = createTransactionRunner(mock.port);

    const value = await runner.run(async () => 'done');

    expect(value).toBe('done');
    expect(mock.getState()).toEqual({ committed: true, aborted: false, sessionEnded: true });
  });

  it('retries transient transaction failures with deterministic timing', async () => {
    const sleep = vi.fn(async () => undefined);
    const mock = createMockTransactionSessionPort({ transientFailuresBeforeSuccess: 2 });
    const runner = createTransactionRunner(mock.port, {
      retryPolicy: createDeterministicRetryPolicy({ delaysMs: [1, 2] }),
      sleep,
    });

    await runner.run(async () => 'ok');

    expect(sleep).toHaveBeenCalledTimes(2);
    expect(mock.getState().committed).toBe(true);
  });

  it('does not retry validation failures', async () => {
    const mock = createMockTransactionSessionPort({ transientFailuresBeforeSuccess: 0 });
    const runner = createTransactionRunner(mock.port, {
      retryPolicy: createDeterministicRetryPolicy({ delaysMs: [0, 0, 0] }),
    });

    await expect(
      runner.run(async () => {
        throw new AppError(ApiTransportErrorCode.ValidationFailed, 'bad input', 400);
      }),
    ).rejects.toThrow(/bad input/);

    expect(mock.getState().aborted).toBe(true);
  });

  it('exhausts retry attempts for repeated transient failures', async () => {
    const mock = createMockTransactionSessionPort({ transientFailuresBeforeSuccess: 5 });
    const runner = createTransactionRunner(mock.port, {
      retryPolicy: createDeterministicRetryPolicy({ delaysMs: [0, 0] }),
    });

    await expect(runner.run(async () => 'never')).rejects.toThrow(/Transient transaction failure/);
  });
});

describe('transaction error labels', () => {
  it('detects MongoDB transient labels', () => {
    const error = {
      hasErrorLabel: (label) => label === 'TransientTransactionError',
    };
    expect(isTransientTransactionError(error)).toBe(true);
  });
});
