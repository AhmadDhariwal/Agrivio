const { redactSecrets, API_SECRET_ENV_KEYS } = require('../config/runtime-config');
const SENSITIVE_LOG_KEY_PATTERN =
  /(password|secret|token|authorization|cookie|csrf|credential|mongodb_uri|session_secret|evidence|paymentreference|payment_reference|storageref|storage_ref)/i;

function redactValue(value, env) {
  if (typeof value === 'string') {
    return redactSecrets(value, env);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, env));
  }
  if (value instanceof Date) {
    return value;
  }
  if (value !== null && typeof value === 'object') {
    if (typeof value._bsontype === 'string') {
      return value;
    }
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
 */
function redactLogFields(fields, env = process.env) {
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

module.exports = {
  redactLogFields,
};
