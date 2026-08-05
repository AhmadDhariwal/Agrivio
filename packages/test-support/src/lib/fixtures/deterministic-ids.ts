import { createHash, randomUUID } from 'node:crypto';

/**
 * Deterministic identifier for tests without embedding business rules.
 */
export function createDeterministicTestId(label: string): string {
  const digest = createHash('sha256').update(label).digest('hex').slice(0, 24);
  return `test_${digest}`;
}

/**
 * Organization-scoped identifier placeholder for future tenant-isolation tests.
 */
export function createTestOrganizationId(seed: string = randomUUID()): string {
  return createDeterministicTestId(`organization:${seed}`);
}
