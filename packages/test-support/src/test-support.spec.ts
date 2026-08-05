import { describe, expect, it } from 'vitest';
import {
  AGRIVIO_TEST_DATABASE_PREFIX,
  createDeterministicTestId,
  createIsolatedTestDatabaseName,
  createTestOrganizationId,
} from './index.js';

describe('test-support naming helpers', () => {
  it('creates isolated MongoDB database names with the frozen prefix', () => {
    const name = createIsolatedTestDatabaseName('suite_a');
    expect(name.startsWith(AGRIVIO_TEST_DATABASE_PREFIX)).toBe(true);
    expect(name).toContain('suite_a');
  });

  it('creates deterministic ids without business semantics', () => {
    const first = createDeterministicTestId('actor');
    const second = createDeterministicTestId('actor');
    expect(first).toBe(second);
    expect(first.startsWith('test_')).toBe(true);
  });

  it('creates organization ids scoped for future tenant tests', () => {
    const orgId = createTestOrganizationId('seed-1');
    expect(orgId.startsWith('test_')).toBe(true);
  });
});
