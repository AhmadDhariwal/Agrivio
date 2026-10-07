const { tooManyRequests } = require('../../platform/errors/app-error');
const {
  createBoundedMemoryRateLimitStore,
  createMongooseRateLimitStore,
  createSharedRateLimiter,
} = require('../../platform/http/shared-rate-limiter');

/**
 * Coded default is 20 attempts / 15 minutes. A raised ceiling is applied only
 * when the caller passes options (auth.service does that solely for nodeEnv === 'test').
 */
function resolveAuthRateLimiterOptions(nodeEnv) {
  return nodeEnv === 'test' ? { maxAttempts: 10_000 } : {};
}

function createAuthRateLimiter(options = {}) {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const maxAttempts = options.maxAttempts ?? 20;
  const store =
    options.store ??
    (options.persistence === 'mongoose'
      ? createMongooseRateLimitStore({ namespace: 'auth' })
      : createBoundedMemoryRateLimitStore());

  return createSharedRateLimiter({
    windowMs,
    maxAttempts,
    now: options.now,
    store,
    createLimitError: (retryAfterSeconds) =>
      tooManyRequests('Too many authentication attempts. Try again later.', retryAfterSeconds),
  });
}

module.exports = {
  createAuthRateLimiter,
  resolveAuthRateLimiterOptions,
};
