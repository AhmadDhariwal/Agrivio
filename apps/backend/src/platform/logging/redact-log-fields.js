// @ts-check
import { redactSecrets, API_SECRET_ENV_KEYS } from '../config/runtime-config.js';

const SENSITIVE_LOG_KEY_PATTERN =
  /(password|secret|token|authorization|cookie|csrf|credential|mongodb_uri|session_secret)/i;

/**
 * @param {unknown} value
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {unknown}
 */
function redactValue(value, env) {
  if (typeof value === 'string') {
    return redactSecrets(value, env);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, env));
  }
  if (value !== null && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_LOG_KEY_PATTERN.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactValue(nested, env);
      }
    }
    return result;
  }
  return value;
}

/**
 * Redacts secrets and sensitive fields from structured log metadata.
 * @param {Record<string, unknown>} fields
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<string, unknown>}
 */
export function redactLogFields(fields, env = process.env) {
  /** @type {Record<string, unknown>} */
  const redacted = {};

  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_LOG_KEY_PATTERN.test(key) || API_SECRET_ENV_KEYS.includes(key)) {
      redacted[key] = '[REDACTED]';
      continue;
    }
    redacted[key] = redactValue(value, env);
  }

  return redacted;
}
