/**
 * Shared browser-origin allowlist for CORS and Origin/Referer guards.
 */
function resolveAllowedOrigins(config) {
  if (Array.isArray(config.allowedOrigins)) {
    return new Set(config.allowedOrigins);
  }

  if (config.nodeEnv === 'production') {
    return new Set();
  }

  return new Set([
    'http://localhost:4200',
    'http://127.0.0.1:4200',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]);
}

module.exports = {
  resolveAllowedOrigins,
};
