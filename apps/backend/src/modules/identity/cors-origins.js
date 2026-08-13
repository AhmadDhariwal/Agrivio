/**
 * Shared browser-origin allowlist for CORS and Origin/Referer guards.
 *
 * Production uses only explicit configured origins (never loopback auto-allow).
 * Non-production also allows http(s) loopback hosts on any port so local Angular
 * serve (4200, 4400, or another free port) works without scattered port checks.
 * Credentialed CORS always reflects a specific allowed origin; never '*'.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function resolveAllowedOrigins(config) {
  const origins = new Set();

  if (Array.isArray(config.allowedOrigins)) {
    for (const origin of config.allowedOrigins) {
      if (typeof origin === 'string' && origin !== '') {
        origins.add(origin);
      }
    }
    return origins;
  }

  if (typeof config.publicWebBaseUrl === 'string' && config.publicWebBaseUrl !== '') {
    origins.add(config.publicWebBaseUrl);
  }

  return origins;
}

function allowsLoopbackBrowserOrigins(config) {
  if (config.allowLoopbackBrowserOrigins === true) {
    return true;
  }
  if (config.allowLoopbackBrowserOrigins === false) {
    return false;
  }
  return config.nodeEnv !== 'production';
}

function isLoopbackBrowserOrigin(origin) {
  if (typeof origin !== 'string' || origin === '') {
    return false;
  }

  try {
    const url = new URL(origin);
    if (url.origin !== origin) {
      return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    return LOOPBACK_HOSTS.has(hostname);
  } catch {
    return false;
  }
}

function isAllowedBrowserOrigin(origin, config) {
  if (typeof origin !== 'string' || origin === '') {
    return false;
  }

  if (resolveAllowedOrigins(config).has(origin)) {
    return true;
  }

  return allowsLoopbackBrowserOrigins(config) && isLoopbackBrowserOrigin(origin);
}

module.exports = {
  resolveAllowedOrigins,
  allowsLoopbackBrowserOrigins,
  isLoopbackBrowserOrigin,
  isAllowedBrowserOrigin,
};
