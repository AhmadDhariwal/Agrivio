const { tooManyRequests } = require('../../platform/errors/app-error');
const {
  createBoundedMemoryRateLimitStore,
  createMongooseRateLimitStore,
  createSharedRateLimiter,
} = require('../../platform/http/shared-rate-limiter');

function resolveOnboardingRateLimiterOptions(nodeEnv) {
  return nodeEnv === 'test' ? { maxAttempts: 10_000 } : { maxAttempts: 5 };
}

function createOnboardingRateLimiter(options = {}) {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const maxAttempts = options.maxAttempts ?? 5;
  const store =
    options.store ??
    (options.persistence === 'mongoose'
      ? createMongooseRateLimitStore({ namespace: 'onboarding' })
      : createBoundedMemoryRateLimitStore());

  return createSharedRateLimiter({
    windowMs,
    maxAttempts,
    now: options.now,
    store,
    createLimitError: (retryAfterSeconds) =>
      tooManyRequests(
        'Too many organization activation requests. Try again later.',
        retryAfterSeconds,
      ),
  });
}

function createOnboardingRateLimiterMiddleware(rateLimiter) {
  return function onboardingRateLimiterMiddleware(req, _res, next) {
    const clientIp =
      typeof req.ip === 'string' && req.ip.trim() !== ''
        ? req.ip.trim()
        : (req.socket?.remoteAddress ?? 'unknown');
    Promise.resolve()
      .then(() => rateLimiter.assertAllowed(`onboarding:${clientIp}`))
      .then(() => next(), next);
  };
}

module.exports = {
  createOnboardingRateLimiter,
  createOnboardingRateLimiterMiddleware,
  resolveOnboardingRateLimiterOptions,
};
