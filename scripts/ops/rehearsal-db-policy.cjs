'use strict';

const REHEARSAL_DB_PATTERN = /^agrivio_rehearsal_(source|restored|import)_[A-Za-z0-9]+$/;

const FORBIDDEN_DATABASE_NAMES = new Set([
  'agrivio',
  'agrivio_dev',
  'agrivio_test_default',
  'agrivio_test_e2e',
  'admin',
  'local',
  'config',
]);

function normalizeDbName(name) {
  return String(name ?? '').trim();
}

function isForbiddenDatabaseName(name) {
  const normalized = normalizeDbName(name);
  if (normalized === '') {
    return true;
  }
  if (FORBIDDEN_DATABASE_NAMES.has(normalized.toLowerCase())) {
    return true;
  }
  if (/^agrivio_test_/i.test(normalized) && !REHEARSAL_DB_PATTERN.test(normalized)) {
    return true;
  }
  return false;
}

function isAllowedRehearsalDatabaseName(name, expectedKind) {
  const normalized = normalizeDbName(name);
  if (!REHEARSAL_DB_PATTERN.test(normalized)) {
    return false;
  }
  if (expectedKind) {
    return normalized.startsWith(`agrivio_rehearsal_${expectedKind}_`);
  }
  return true;
}

function assertAllowedRehearsalDatabase(name, operation, expectedKind) {
  const normalized = normalizeDbName(name);
  if (isForbiddenDatabaseName(normalized) || !isAllowedRehearsalDatabaseName(normalized, expectedKind)) {
    throw new Error(
      `Refusing ${operation} on database '${normalized}'. Allowed names are agrivio_rehearsal_source_<id>, agrivio_rehearsal_restored_<id>, or agrivio_rehearsal_import_<id> only.`,
    );
  }
  return normalized;
}

function rehearsalDatabaseNames(runId) {
  const id = String(runId ?? '').replace(/[^A-Za-z0-9]/g, '');
  if (id === '') {
    throw new Error('runId is required for rehearsal database names');
  }
  return {
    runId: id,
    source: `agrivio_rehearsal_source_${id}`,
    restored: `agrivio_rehearsal_restored_${id}`,
    importDb: `agrivio_rehearsal_import_${id}`,
  };
}

function sanitizeCommand(command) {
  return String(command).replace(/mongodb:\/\/([^@/]+)@/gi, 'mongodb://***@');
}

module.exports = {
  REHEARSAL_DB_PATTERN,
  FORBIDDEN_DATABASE_NAMES,
  isForbiddenDatabaseName,
  isAllowedRehearsalDatabaseName,
  assertAllowedRehearsalDatabase,
  rehearsalDatabaseNames,
  sanitizeCommand,
};
