const { redactSecrets } = require('../config/runtime-config');
const { getRequestId } = require('../http/request-context');
const { redactLogFields } = require('./redact-log-fields');

function writeLogLine(level, entry) {
  const line = JSON.stringify({ level, ...entry });
  if (level === 'error' || level === 'warn') {
    console.error(redactSecrets(line));
    return;
  }
  console.log(redactSecrets(line));
}

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
