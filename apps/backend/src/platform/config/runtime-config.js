/**
 * Secret-bearing API environment keys that must never be logged in full.
 */
const API_SECRET_ENV_KEYS = ['SESSION_SECRET', 'MONGODB_URI'];

class EnvValidationError extends Error {
  constructor(issues) {
    super(`Invalid API environment configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseHttpOrigin(value, label, issues) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      issues.push(`${label} must be an absolute http(s) URL`);
      return undefined;
    }
    if (parsed.origin === 'null') {
      issues.push(`${label} must not be the opaque origin null`);
      return undefined;
    }
    return parsed.origin;
  } catch {
    issues.push(`${label} must be an absolute http(s) URL`);
    return undefined;
  }
}

function parseAllowedOriginsEnv(raw, issues) {
  if (raw === undefined || raw.trim() === '') {
    return [];
  }

  const origins = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') {
      continue;
    }
    if (trimmed === '*' || trimmed.toLowerCase() === 'null') {
      issues.push('AGRIVIO_ALLOWED_ORIGINS must not include wildcard or null origins');
      continue;
    }
    const origin = parseHttpOrigin(trimmed, 'AGRIVIO_ALLOWED_ORIGINS', issues);
    if (origin !== undefined && !origins.includes(origin)) {
      origins.push(origin);
    }
  }
  return origins;
}

function resolveProfile(nodeEnv, rawProfile) {
  if (rawProfile === undefined || rawProfile.trim() === '') {
    if (nodeEnv === 'test') {
      return 'test';
    }
    if (nodeEnv === 'production') {
      return 'production';
    }
    return 'local';
  }

  if (
    rawProfile === 'local' ||
    rawProfile === 'test' ||
    rawProfile === 'staging' ||
    rawProfile === 'production'
  ) {
    return rawProfile;
  }

  return undefined;
}

/**
 * Redacts known secret values and secret-bearing keys from text destined for logs.
 */
function redactSecrets(text, env = process.env) {
  let redacted = text;

  for (const key of API_SECRET_ENV_KEYS) {
    const value = env[key];
    if (isNonEmptyString(value)) {
      redacted = redacted.split(value).join('[REDACTED]');
    }
    redacted = redacted.replaceAll(
      new RegExp(`${key}\\s*[=:]\\s*[^\\s,;]+`, 'gi'),
      `${key}=[REDACTED]`,
    );
  }

  return redacted;
}

/**
 * Fail-fast validation for API runtime configuration.
 * Test profile permits local placeholder secrets; non-test profiles require real values.
 */
function loadApiEnv(env = process.env) {
  const issues = [];

  const rawNodeEnv = env['NODE_ENV'] ?? 'development';
  if (rawNodeEnv !== 'development' && rawNodeEnv !== 'test' && rawNodeEnv !== 'production') {
    issues.push('NODE_ENV must be one of development, test, production');
  }

  const nodeEnv = rawNodeEnv === 'test' || rawNodeEnv === 'production' ? rawNodeEnv : 'development';

  const profile = resolveProfile(nodeEnv, env['AGRIVIO_APP_PROFILE']);
  if (profile === undefined) {
    issues.push('AGRIVIO_APP_PROFILE must be one of local, test, staging, production when set');
  }

  const host = env['HOST'] ?? 'localhost';
  if (!isNonEmptyString(host)) {
    issues.push('HOST must be a non-empty string');
  }

  const rawPort = env['PORT'] ?? '3000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    issues.push('PORT must be an integer between 1 and 65535');
  }

  const isTestProfile = profile === 'test' || nodeEnv === 'test';

  const mongodbUri =
    env['MONGODB_URI'] ?? (isTestProfile ? 'mongodb://127.0.0.1:27017/?replicaSet=rs0' : undefined);
  if (!isNonEmptyString(mongodbUri)) {
    issues.push('MONGODB_URI is required outside the test profile');
  }

  const mongodbDbName =
    env['MONGODB_DB_NAME'] ?? (isTestProfile ? 'agrivio_test_default' : 'Agrivio');
  if (!isNonEmptyString(mongodbDbName)) {
    issues.push('MONGODB_DB_NAME must be a non-empty string');
  }

  const mongodbReplicaSet = env['MONGODB_REPLICA_SET'] ?? 'rs0';
  if (!isNonEmptyString(mongodbReplicaSet)) {
    issues.push('MONGODB_REPLICA_SET must be a non-empty string');
  }

  const sessionSecret =
    env['SESSION_SECRET'] ?? (isTestProfile ? 'test-session-secret' : undefined);
  if (!isNonEmptyString(sessionSecret)) {
    issues.push('SESSION_SECRET is required outside the test profile');
  } else if (!isTestProfile && sessionSecret.length < 32) {
    issues.push('SESSION_SECRET must be at least 32 characters outside the test profile');
  }

  const allowE2eBootstrapRaw = env['AGRIVIO_ALLOW_E2E_BOOTSTRAP'];
  const allowE2eBootstrap =
    allowE2eBootstrapRaw === '1' || allowE2eBootstrapRaw === 'true' || allowE2eBootstrapRaw === 'yes';
  if (allowE2eBootstrap && nodeEnv === 'production') {
    issues.push('AGRIVIO_ALLOW_E2E_BOOTSTRAP is impossible in production');
  }

  const skipMongoRaw = env['AGRIVIO_SKIP_MONGO'];
  const skipMongo = skipMongoRaw === '1' || skipMongoRaw === 'true' || skipMongoRaw === 'yes';
  if (skipMongo && nodeEnv !== 'test') {
    issues.push('AGRIVIO_SKIP_MONGO is only permitted when NODE_ENV=test');
  }

  const publicWebBaseUrlRaw = env['AGRIVIO_PUBLIC_WEB_BASE_URL'];
  let publicWebBaseUrl = '';
  if (!isNonEmptyString(publicWebBaseUrlRaw)) {
    if (nodeEnv === 'production') {
      issues.push('AGRIVIO_PUBLIC_WEB_BASE_URL is required in production');
    } else {
      publicWebBaseUrl = 'http://localhost:4200';
    }
  } else {
    const parsedOrigin = parseHttpOrigin(
      publicWebBaseUrlRaw,
      'AGRIVIO_PUBLIC_WEB_BASE_URL',
      issues,
    );
    if (parsedOrigin !== undefined) {
      publicWebBaseUrl = parsedOrigin;
    }
  }

  const extraAllowedOrigins = parseAllowedOriginsEnv(env['AGRIVIO_ALLOWED_ORIGINS'], issues);
  const allowedOrigins = [];
  if (isNonEmptyString(publicWebBaseUrl) && !allowedOrigins.includes(publicWebBaseUrl)) {
    allowedOrigins.push(publicWebBaseUrl);
  }
  for (const origin of extraAllowedOrigins) {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
    }
  }
  const allowLoopbackBrowserOrigins = nodeEnv !== 'production';

  if (issues.length > 0) {
    throw new EnvValidationError(issues);
  }

  if (
    profile === undefined ||
    !isNonEmptyString(host) ||
    !isNonEmptyString(mongodbUri) ||
    !isNonEmptyString(mongodbDbName) ||
    !isNonEmptyString(mongodbReplicaSet) ||
    !isNonEmptyString(sessionSecret) ||
    !isNonEmptyString(publicWebBaseUrl)
  ) {
    throw new EnvValidationError(['Internal environment validation failed']);
  }

  return {
    nodeEnv,
    profile,
    host,
    port,
    mongodbUri,
    mongodbDbName,
    mongodbReplicaSet,
    sessionSecret,
    publicWebBaseUrl,
    allowedOrigins,
    allowLoopbackBrowserOrigins,
    allowE2eBootstrap: allowE2eBootstrap && nodeEnv !== 'production',
    skipMongo: skipMongo && nodeEnv === 'test',
  };
}

/**
 * Safe summary for operational logs. Never includes secret values.
 */
function toSafeApiEnvSummary(config) {
  return {
    nodeEnv: config.nodeEnv,
    profile: config.profile,
    host: config.host,
    port: config.port,
    mongodbDbName: config.mongodbDbName,
    mongodbReplicaSet: config.mongodbReplicaSet,
    publicWebBaseUrl: config.publicWebBaseUrl,
    allowedOrigins: config.allowedOrigins,
    allowLoopbackBrowserOrigins: config.allowLoopbackBrowserOrigins === true,
    mongodbUriConfigured: 'yes',
    sessionSecretConfigured: 'yes',
  };
}

module.exports = {
  API_SECRET_ENV_KEYS,
  redactSecrets,
  loadApiEnv,
  toSafeApiEnvSummary,
  EnvValidationError,
};
