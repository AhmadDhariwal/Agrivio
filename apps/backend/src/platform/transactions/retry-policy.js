function createDefaultRetryPolicy() {
  return {
    maxAttempts: 3,
    delayMs: (attempt) => Math.min(50 * 2 ** (attempt - 1), 200),
  };
}

function createDeterministicRetryPolicy(options = {}) {
  const delaysMs = options.delaysMs ?? [0, 0, 0];
  return {
    maxAttempts: delaysMs.length + 1,
    delayMs: (attempt) => delaysMs[attempt - 1] ?? 0,
  };
}

async function waitForRetry(policy, attempt, sleep = defaultSleep) {
  const delay = policy.delayMs(attempt);
  if (delay > 0) {
    await sleep(delay);
  }
}

async function defaultSleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  createDefaultRetryPolicy,
  createDeterministicRetryPolicy,
  waitForRetry,
  sleepMs: defaultSleep,
};
