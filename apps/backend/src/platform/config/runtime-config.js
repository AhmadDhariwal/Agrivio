// @ts-check

/**
 * Secret-bearing API environment keys that must never be logged in full.
 */
export const API_SECRET_ENV_KEYS = ['SESSION_SECRET', 'MONGODB_URI'];

/**
 * @typedef {'local' | 'test' | 'staging' | 'production'} ApiRuntimeProfile
 * @typedef {'development' | 'test' | 'production'} ApiNodeEnv
 * @typedef {{
 *   nodeEnv: ApiNodeEnv;
 *   profile: ApiRuntimeProfile;
 *   host: string;
 *   port: number;
 *   mongodbUri: string;
 *   mongodbDbName: string;
 *   mongodbReplicaSet: string;
 *   sessionSecret: string;
 * }} ApiEnv
 */

export class EnvValidationError extends Error {
  /**
   * @param {readonly string[]} issues
   */
  constructor(issues) {
    super(`Invalid API environment configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'EnvValidationError';
    /** @type {readonly string[]} */
    this.issues = issues;
  }
}

/**
 * @param {string | undefined} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * @param {ApiNodeEnv} nodeEnv
 * @param {string | undefined} rawProfile
 * @returns {ApiRuntimeProfile | undefined}
 */
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
 * @param {string} text
 * @param {NodeJS.ProcessEnv} [env]
 */
export function redactSecrets(text, env = process.env) {
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
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {ApiEnv}
 */
export function loadApiEnv(env = process.env) {
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
    env['MONGODB_DB_NAME'] ?? (isTestProfile ? 'agrivio_test_default' : 'agrivio_dev');
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

  if (issues.length > 0) {
    throw new EnvValidationError(issues);
  }

  if (
    profile === undefined ||
    !isNonEmptyString(host) ||
    !isNonEmptyString(mongodbUri) ||
    !isNonEmptyString(mongodbDbName) ||
    !isNonEmptyString(mongodbReplicaSet) ||
    !isNonEmptyString(sessionSecret)
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
  };
}

/**
 * Safe summary for operational logs. Never includes secret values.
 * @param {ApiEnv} config
 * @returns {Record<string, string | number>}
 */
export function toSafeApiEnvSummary(config) {
  return {
    nodeEnv: config.nodeEnv,
    profile: config.profile,
    host: config.host,
    port: config.port,
    mongodbDbName: config.mongodbDbName,
    mongodbReplicaSet: config.mongodbReplicaSet,
    mongodbUriConfigured: 'yes',
    sessionSecretConfigured: 'yes',
  };
}
