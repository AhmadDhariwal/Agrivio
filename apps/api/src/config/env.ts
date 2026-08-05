/**
 * Secret-bearing API environment keys that must never be logged in full.
 */
export const API_SECRET_ENV_KEYS = ['SESSION_SECRET', 'MONGODB_URI'] as const;

export type ApiSecretEnvKey = (typeof API_SECRET_ENV_KEYS)[number];

export type ApiRuntimeProfile = 'local' | 'test' | 'staging' | 'production';

export type ApiNodeEnv = 'development' | 'test' | 'production';

export interface ApiEnv {
  readonly nodeEnv: ApiNodeEnv;
  readonly profile: ApiRuntimeProfile;
  readonly host: string;
  readonly port: number;
  readonly mongodbUri: string;
  readonly mongodbDbName: string;
  readonly mongodbReplicaSet: string;
  readonly sessionSecret: string;
}

export class EnvValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid API environment configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolveProfile(
  nodeEnv: ApiNodeEnv,
  rawProfile: string | undefined,
): ApiRuntimeProfile | undefined {
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
export function redactSecrets(text: string, env: NodeJS.ProcessEnv = process.env): string {
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
export function loadApiEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const issues: string[] = [];

  const rawNodeEnv = env['NODE_ENV'] ?? 'development';
  if (rawNodeEnv !== 'development' && rawNodeEnv !== 'test' && rawNodeEnv !== 'production') {
    issues.push('NODE_ENV must be one of development, test, production');
  }

  const nodeEnv: ApiNodeEnv =
    rawNodeEnv === 'test' || rawNodeEnv === 'production' ? rawNodeEnv : 'development';

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

  return {
    nodeEnv,
    profile: profile as ApiRuntimeProfile,
    host: host as string,
    port,
    mongodbUri: mongodbUri as string,
    mongodbDbName: mongodbDbName as string,
    mongodbReplicaSet: mongodbReplicaSet as string,
    sessionSecret: sessionSecret as string,
  };
}

/**
 * Safe summary for operational logs. Never includes secret values.
 */
export function toSafeApiEnvSummary(config: ApiEnv): Record<string, string | number> {
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
