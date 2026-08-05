/**
 * Browser-safe public web configuration only.
 * Never place secrets, MongoDB URIs, session keys, or server credentials here.
 */

export interface WebPublicConfig {
  readonly publicApiBaseUrl: string;
}

export class WebConfigValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid browser-safe web configuration:\n- ${issues.join('\n- ')}`);
    this.name = 'WebConfigValidationError';
    this.issues = issues;
  }
}

const FORBIDDEN_WEB_KEYS = [
  'SESSION_SECRET',
  'MONGODB_URI',
  'MONGODB_DB_NAME',
  'MONGODB_REPLICA_SET',
  'HOST',
  'PORT',
] as const;

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates the compile-time / build-time public web configuration object.
 */
export function validateWebPublicConfig(candidate: unknown): WebPublicConfig {
  const issues: string[] = [];

  if (candidate === null || typeof candidate !== 'object') {
    throw new WebConfigValidationError(['web public config must be an object']);
  }

  const record = candidate as Record<string, unknown>;

  for (const forbidden of FORBIDDEN_WEB_KEYS) {
    if (forbidden in record) {
      issues.push(`${forbidden} must not be exposed to the Angular application`);
    }
  }

  const publicApiBaseUrl = record['publicApiBaseUrl'];
  if (typeof publicApiBaseUrl !== 'string' || publicApiBaseUrl.trim() === '') {
    issues.push('publicApiBaseUrl must be a non-empty string');
  } else if (!isAbsoluteHttpUrl(publicApiBaseUrl)) {
    issues.push('publicApiBaseUrl must be an absolute http(s) URL');
  }

  if (issues.length > 0) {
    throw new WebConfigValidationError(issues);
  }

  return {
    publicApiBaseUrl: publicApiBaseUrl as string,
  };
}

/**
 * Optional build-time env bridge for public values only.
 * Secret-bearing process env keys are rejected.
 */
export function loadWebPublicConfigFromEnv(
  env: Record<string, string | undefined>,
): WebPublicConfig {
  for (const forbidden of FORBIDDEN_WEB_KEYS) {
    if (isNonEmpty(env[forbidden])) {
      throw new WebConfigValidationError([
        `${forbidden} must not be provided to browser-safe web configuration`,
      ]);
    }
  }

  return validateWebPublicConfig({
    publicApiBaseUrl: env['AGRIVIO_PUBLIC_API_BASE_URL'] ?? 'http://localhost:3000',
  });
}

function isNonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
