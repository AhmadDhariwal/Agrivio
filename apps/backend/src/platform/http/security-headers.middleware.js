/**
 * Emits defensive baseline security headers on all API responses.
 * Enforces frame protection, content-type sniffing protection, referrer policy,
 * permissions policy, API-appropriate CSP, and production HSTS.
 */
function createSecurityHeadersMiddleware(config = {}) {
  const isProduction = config.nodeEnv === 'production';

  return (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none';");

    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  };
}

module.exports = {
  createSecurityHeadersMiddleware,
};
