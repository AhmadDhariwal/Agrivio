import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  API_HEALTH_LIVENESS_PATH,
  API_OPERATIONS_READINESS_PATH,
  API_REQUEST_ID_HEADER,
  API_IDEMPOTENCY_KEY_HEADER,
  API_V1_PREFIX,
  ApiTransportErrorCode,
  createApiErrorEnvelope,
  createApiSuccessEnvelope,
  type ApiHealthResponse,
  type ApiReadinessResponse,
  type ApiSuccessEnvelope,
  type PaginationMeta,
} from './api-contracts';

const packageSrcRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const FORBIDDEN_IMPORT_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'express', pattern: /from\s+['"]express(?:\/[^'"]*)?['"]/ },
  { label: 'Angular', pattern: /from\s+['"]@angular\/[^'"]+['"]/ },
  { label: 'mongoose', pattern: /from\s+['"]mongoose(?:\/[^'"]*)?['"]/ },
  { label: 'NestJS', pattern: /from\s+['"]@nestjs\/[^'"]+['"]/ },
];

function collectTypeScriptFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectTypeScriptFiles(fullPath));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('api-contracts transport surface', () => {
  it('exposes the stable API v1 prefix and health contract', () => {
    const health: ApiHealthResponse = { status: 'ok' };
    const readiness: ApiReadinessResponse = { status: 'ready' };
    expect(API_V1_PREFIX).toBe('/api/v1');
    expect(API_REQUEST_ID_HEADER).toBe('X-Request-Id');
    expect(API_HEALTH_LIVENESS_PATH).toBe('/api/v1/health');
    expect(API_OPERATIONS_READINESS_PATH).toBe('/api/v1/platform/operations/readiness');
    expect(health.status).toBe('ok');
    expect(readiness.status).toBe('ready');
    expect(ApiTransportErrorCode.NotFound).toBe('NOT_FOUND');
    expect(ApiTransportErrorCode.VersionConflict).toBe('VERSION_CONFLICT');
    expect(ApiTransportErrorCode.IdempotencyConflict).toBe('IDEMPOTENCY_CONFLICT');
    expect(API_IDEMPOTENCY_KEY_HEADER).toBe('Idempotency-Key');
  });

  it('builds frozen success and error envelopes', () => {
    const success = createApiSuccessEnvelope('req-12345678', { status: 'ok' });
    const error = createApiErrorEnvelope('req-12345678', {
      code: ApiTransportErrorCode.InternalError,
      message: 'Unexpected',
    });

    expect(success).toEqual({
      data: { status: 'ok' },
      requestId: 'req-12345678',
    });
    expect(error).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Unexpected' },
      requestId: 'req-12345678',
    });
  });

  it('types pagination metadata on the shared success envelope', () => {
    const meta: PaginationMeta = { page: 2, pageSize: 25, total: 61 };
    const success: ApiSuccessEnvelope<string[], PaginationMeta> =
      createApiSuccessEnvelope('req-12345678', ['item'], meta);

    expect(success).toEqual({
      data: ['item'],
      meta,
      requestId: 'req-12345678',
    });
  });

  it('contains no Express, Angular, Mongoose, or NestJS imports', () => {
    const sourceFiles = collectTypeScriptFiles(packageSrcRoot);
    expect(sourceFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const filePath of sourceFiles) {
      const contents = readFileSync(filePath, 'utf8');
      for (const forbidden of FORBIDDEN_IMPORT_PATTERNS) {
        if (forbidden.pattern.test(contents)) {
          violations.push(`${relative(packageSrcRoot, filePath)} → ${forbidden.label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
