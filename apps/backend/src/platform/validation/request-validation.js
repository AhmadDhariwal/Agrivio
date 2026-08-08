const { validationFailed, versionConflict } = require('../errors/app-error');

function validateRequestFields(rules, body) {
  const issues = [];

  for (const rule of rules) {
    const value = body[rule.field];
    if (rule.required && (value === undefined || value === null || value === '')) {
      issues.push({ field: rule.field, message: rule.message ?? `${rule.field} is required` });
      continue;
    }

    if (
      typeof rule.maxLength === 'number' &&
      typeof value === 'string' &&
      value.length > rule.maxLength
    ) {
      issues.push({
        field: rule.field,
        message: rule.message ?? `${rule.field} exceeds maximum length`,
      });
    }
  }

  if (issues.length > 0) {
    throw validationFailed('Validation failed', issues);
  }
}

function assertOptimisticVersion(document, expectedVersion) {
  const actualVersion = document.version;
  if (typeof actualVersion !== 'number' || actualVersion !== expectedVersion) {
    throw versionConflict('Version conflict', [
      { expectedVersion, ...(typeof actualVersion === 'number' ? { actualVersion } : {}) },
    ]);
  }
}

module.exports = {
  validateRequestFields,
  assertOptimisticVersion,
};
