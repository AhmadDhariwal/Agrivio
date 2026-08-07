// @ts-check
const { redactSecrets } = require('../config/runtime-config');
const { getRequestId } = require('../http/request-context');
const { redactLogFields } = require('./redact-log-fields');
/**
 * @typedef {'debug' | 'info' | 'warn' | 'error'} LogLevel
 * @typedef {(level: LogLevel, message: string, fields?: Record<string, unknown>) => void} StructuredLogger
 */

/**
 * @param {LogLevel} level
 * @param {Record<string, unknown>} entry
 */
function writeLogLine(level, entry) {
  const line = JSON.stringify({ level, ...entry });
  if (level === 'error' || level === 'warn') {
    console.error(redactSecrets(line));
    return;
  }
  console.log(redactSecrets(line));
}

/**
 * @param {Record<string, unknown>} [baseFields]
 * @returns {StructuredLogger}
 */
function createStructuredLogger(baseFields = {}) {
  return (level, message, fields = {}) => {
    const requestId = getRequestId();
    const payload = redactLogFields({
      ...baseFields,
      ...fields,
      ...(requestId === undefined ? {} : { requestId }),
      message,
      timestamp: new Date().toISOString(),
    });

    writeLogLine(level, payload);
  };
}

module.exports = {
  createStructuredLogger,
};
