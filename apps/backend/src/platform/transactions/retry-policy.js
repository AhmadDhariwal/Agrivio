// @ts-check

/**
 * @typedef {{
 *   maxAttempts: number;
 *   delayMs: (attempt: number) => number;
 * }} RetryPolicy
 */

/** @returns {RetryPolicy} */
export function createDefaultRetryPolicy() {
  return {
    maxAttempts: 3,
    delayMs: (attempt) => Math.min(50 * 2 ** (attempt - 1), 200),
  };
}

/**
 * @param {{ delaysMs?: readonly number[] }} [options]
 * @returns {RetryPolicy}
 */
export function createDeterministicRetryPolicy(options = {}) {
  const delaysMs = options.delaysMs ?? [0, 0, 0];
  return {
    maxAttempts: delaysMs.length + 1,
    delayMs: (attempt) => delaysMs[attempt - 1] ?? 0,
  };
}

/**
 * @param {RetryPolicy} policy
 * @param {number} attempt
 * @param {(ms: number) => Promise<void>} [sleep]
 */
export async function waitForRetry(policy, attempt, sleep = defaultSleep) {
  const delay = policy.delayMs(attempt);
  if (delay > 0) {
    await sleep(delay);
  }
}

/**
 * @param {number} ms
 */
async function defaultSleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export { defaultSleep as sleepMs };
