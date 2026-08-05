import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { API_V1_PREFIX, ApiTransportErrorCode, type ApiHealthResponse } from './api-contracts';

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
    expect(API_V1_PREFIX).toBe('/api/v1');
    expect(health.status).toBe('ok');
    expect(ApiTransportErrorCode.NotFound).toBe('NOT_FOUND');
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
