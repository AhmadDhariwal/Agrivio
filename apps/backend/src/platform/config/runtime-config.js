/**
 * Secret-bearing API environment keys that must never be logged in full.
 */
const API_SECRET_ENV_KEYS = ['SESSION_SECRET', 'MONGODB_URI', 'AGRIVIO_SMTP_PASSWORD'];

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
    allowE2eBootstrapRaw === '1' ||
    allowE2eBootstrapRaw === 'true' ||
    allowE2eBootstrapRaw === 'yes';
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

  const smtpHost = env['AGRIVIO_SMTP_HOST'];
  if (nodeEnv === 'production' && !isNonEmptyString(smtpHost)) {
    issues.push('AGRIVIO_SMTP_HOST is required in production');
  }
  const smtpSecure =
    env['AGRIVIO_SMTP_SECURE'] === '1' ||
    env['AGRIVIO_SMTP_SECURE'] === 'true' ||
    env['AGRIVIO_SMTP_SECURE'] === 'yes';
  const rawSmtpPort = env['AGRIVIO_SMTP_PORT'] ?? (smtpSecure ? '465' : '587');
  const smtpPort = Number(rawSmtpPort);
  if (
    isNonEmptyString(smtpHost) &&
    (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535)
  ) {
    issues.push('AGRIVIO_SMTP_PORT must be an integer between 1 and 65535');
  }
  const smtpUsername = env['AGRIVIO_SMTP_USERNAME'] ?? '';
  const smtpPassword = env['AGRIVIO_SMTP_PASSWORD'] ?? '';
  const smtpFrom = env['AGRIVIO_SMTP_FROM'] ?? 'noreply@localhost';
  if (nodeEnv === 'production' && !isNonEmptyString(env['AGRIVIO_SMTP_FROM'])) {
    issues.push('AGRIVIO_SMTP_FROM is required in production');
  }

  // Backup configuration (optional; validated when set)
  const backupDir = env['AGRIVIO_BACKUP_DIR']?.trim() ?? '';
  if (isNonEmptyString(backupDir)) {
    const path = require('path');
    if (!path.isAbsolute(backupDir)) {
      issues.push('AGRIVIO_BACKUP_DIR must be an absolute path when set');
    }
  }

  const rawRetentionDays = env['AGRIVIO_BACKUP_RETENTION_DAYS'];
  let backupRetentionDays = 0;
  if (isNonEmptyString(rawRetentionDays)) {
    backupRetentionDays = Number(rawRetentionDays);
    if (!Number.isInteger(backupRetentionDays) || backupRetentionDays < 0) {
      issues.push('AGRIVIO_BACKUP_RETENTION_DAYS must be a non-negative integer when set');
    }
  }

  const billingEvidenceStorageDir = env['AGRIVIO_BILLING_EVIDENCE_STORAGE_DIR']?.trim() ?? '';
  if (isNonEmptyString(billingEvidenceStorageDir)) {
    const path = require('path');
    if (!path.isAbsolute(billingEvidenceStorageDir)) {
      issues.push('AGRIVIO_BILLING_EVIDENCE_STORAGE_DIR must be an absolute path when set');
    }
  }

  const rawPlatformAuditRetentionDays = env['AGRIVIO_PLATFORM_AUDIT_RETENTION_DAYS'];
  let platformAuditRetentionDays = null;
  if (isNonEmptyString(rawPlatformAuditRetentionDays)) {
    platformAuditRetentionDays = Number(rawPlatformAuditRetentionDays);
    if (!Number.isInteger(platformAuditRetentionDays) || platformAuditRetentionDays < 1) {
      issues.push('AGRIVIO_PLATFORM_AUDIT_RETENTION_DAYS must be a positive integer when set');
    }
  }

  const rawAuditRetentionOverrideDays = env['AGRIVIO_AUDIT_RETENTION_DAYS_OVERRIDE'];
  let auditRetentionOverrideDays = null;
  if (isNonEmptyString(rawAuditRetentionOverrideDays)) {
    auditRetentionOverrideDays = Number(rawAuditRetentionOverrideDays);
    if (!Number.isInteger(auditRetentionOverrideDays) || auditRetentionOverrideDays < 1) {
      issues.push('AGRIVIO_AUDIT_RETENTION_DAYS_OVERRIDE must be a positive integer when set');
    }
    if (nodeEnv === 'production') {
      issues.push('AGRIVIO_AUDIT_RETENTION_DAYS_OVERRIDE is not permitted in production');
    }
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
    smtpHost: isNonEmptyString(smtpHost) ? smtpHost.trim() : '',
    smtpPort,
    smtpSecure,
    smtpUsername,
    smtpPassword,
    smtpFrom,
    backupDir: isNonEmptyString(backupDir) ? backupDir : '',
    backupRetentionDays,
    billingEvidenceStorageDir: isNonEmptyString(billingEvidenceStorageDir)
      ? billingEvidenceStorageDir
      : '',
    platformAuditRetentionDays,
    auditRetentionOverrideDays,
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
    smtpConfigured: config.smtpHost ? 'yes' : 'no',
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
