import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractImportSpecifiers,
  collectSourceFiles,
} from '../../platform/architecture/boundary-scan.js';

const testDir = fileURLToPath(new URL('.', import.meta.url));
const backendRoot = join(testDir, '../..');

function scanForeignPersistenceViolations(rootDirectory, consumerDirs, forbiddenFragments) {
  const files = collectSourceFiles(rootDirectory);
  const violations = [];
  for (const filePath of files) {
    const normalized = filePath.replaceAll('\\', '/');
    if (!consumerDirs.some((dir) => normalized.includes(dir))) {
      continue;
    }
    if (normalized.includes('/public/')) {
      continue;
    }
    for (const specifier of extractImportSpecifiers(filePath)) {
      for (const fragment of forbiddenFragments) {
        if (specifier.includes(fragment)) {
          violations.push(`${normalized} -> ${specifier}`);
        }
      }
    }
  }
  return violations;
}

describe('F04 P3 shared posting contracts', () => {
  it('exposes Inventory public contract without persistence leakage in the entry file', () => {
    const entry = join(backendRoot, 'modules/inventory/public/index.js');
    const contents = readFileSync(entry, 'utf8');
    expect(contents).not.toMatch(/persistence\//);
    expect(contents).toMatch(/allocateStock/);
    expect(contents).toMatch(/createInventoryService/);
    const inventoryPublic = require('./public');
    expect(typeof inventoryPublic.allocateStock).toBe('function');
    expect(typeof inventoryPublic.createInventoryService).toBe('function');
    expect(typeof inventoryPublic.applyBalanceOutbound).toBe('function');
  });

  it('exposes Payments/Ledgers, Accounts, and Audit public contracts', () => {
    const ledgersPublic = require('../payments-ledgers/public');
    const accountsPublic = require('../accounts-expenses/public');
    const auditPublic = require('../audit/public');
    expect(typeof ledgersPublic.createLedgersService).toBe('function');
    expect(typeof accountsPublic.createAccountsService).toBe('function');
    expect(typeof auditPublic.createAuditWriter).toBe('function');
  });

  it('prevents future Purchases/Sales modules from importing foreign persistence models', () => {
    const violations = scanForeignPersistenceViolations(
      backendRoot,
      ['/modules/purchases/', '/modules/sales/'],
      [
        '/inventory/persistence/',
        '/payments-ledgers/persistence/',
        '/accounts-expenses/persistence/',
        '/audit/persistence/',
      ],
    );
    expect(violations).toEqual([]);
  });
});
