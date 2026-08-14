const { forbidden } = require('../../platform/errors/app-error');

/**
 * Simple progressive in-memory throttle for auth endpoints.
 */
function createAuthRateLimiter(options = {}) {
  // Release 1 production defaults recorded for F09 (REL-G05): 20 attempts / 15 minutes.
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const maxAttempts = options.maxAttempts ?? 20;
  const now = options.now ?? (() => Date.now());
  const buckets = new Map();

  return {
    assertAllowed(key) {
      const current = now();
      const existing = buckets.get(key);
      if (existing === undefined || existing.resetAt <= current) {
        buckets.set(key, { count: 1, resetAt: current + windowMs });
        return;
      }
      if (existing.count >= maxAttempts) {
        throw forbidden('Too many authentication attempts. Try again later.');
      }
      existing.count += 1;
    },

    reset(key) {
      buckets.delete(key);
    },
  };
}

module.exports = {
  createAuthRateLimiter,
};
