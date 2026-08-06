import { describe, expect, it } from 'vitest';
import {
  SYSTEM_SCOPE,
  composeTenantFilter,
  createOrganizationScope,
  createSampleTenantRepository,
  createSystemScope,
  TenantScopeError,
} from './tenant-scope.js';

describe('tenant scope', () => {
  it('rejects missing organization context', () => {
    expect(() => createOrganizationScope(undefined)).toThrow(TenantScopeError);
  });

  it('requires organizationId on tenant reads and writes', async () => {
    const scope = createOrganizationScope('org-12345678');
    const repo = createSampleTenantRepository({
      scope,
      collection: {
        async findOne(filter) {
          if (filter['organizationId'] !== 'org-12345678') {
            throw new Error('unscoped read');
          }
          return null;
        },
        async insertOne(document) {
          if (document['organizationId'] !== 'org-12345678') {
            throw new Error('unscoped write');
          }
        },
      },
    });

    await expect(repo.findById('doc-1')).resolves.toBeNull();
    await expect(
      repo.insert({ _id: 'doc-1', organizationId: 'org-other123', name: 'x' }),
    ).rejects.toThrow(TenantScopeError);
  });

  it('allows explicit system scope bypass with token and reason', () => {
    const scope = createSystemScope('platform maintenance', SYSTEM_SCOPE);
    const filter = composeTenantFilter(scope, { status: 'pending' });
    expect(filter.__systemScope).toBe(true);
    expect(filter.__systemScopeReason).toBe('platform maintenance');
  });
});
