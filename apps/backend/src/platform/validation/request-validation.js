// @ts-check
import { validationFailed, versionConflict } from '../errors/app-error.js';

/**
 * @typedef {{ field: string; message: string }} ValidationIssue
 * @typedef {{ field: string; value?: unknown; message?: string; required?: boolean; maxLength?: number }} FieldRule
 */

/**
 * @param {readonly FieldRule[]} rules
 * @param {Record<string, unknown>} body
 */
export function validateRequestFields(rules, body) {
  /** @type {ValidationIssue[]} */
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

/**
 * @param {{ version?: number }} document
 * @param {number} expectedVersion
 */
export function assertOptimisticVersion(document, expectedVersion) {
  const actualVersion = document.version;
  if (typeof actualVersion !== 'number' || actualVersion !== expectedVersion) {
    throw versionConflict('Version conflict', [
      { expectedVersion, ...(typeof actualVersion === 'number' ? { actualVersion } : {}) },
    ]);
  }
}
