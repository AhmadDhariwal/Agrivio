import { describe, expect, it } from 'vitest';
import locationsModuleImport from './locations.module.js';

const { createLocationsModule } = locationsModuleImport;
const actor = { actorId: 'owner-1' };
const evaluateEntitlement = async () => ({ allowed: true, reason: 'within_limit' });

describe('location defaults', () => {
  it('keeps one organization default branch', async () => {
    const { locationsService } = createLocationsModule({
      persistence: 'memory',
      evaluateEntitlement,
    });
    const first = await locationsService.createBranch(
      'org-1',
      { name: 'First', invoicePrefix: 'FST', isDefault: true },
      actor,
    );
    await locationsService.createBranch(
      'org-1',
      { name: 'Second', invoicePrefix: 'SND', isDefault: true },
      actor,
    );
    expect((await locationsService.getBranch('org-1', first.id)).isDefault).toBe(false);
  });

  it('keeps one default warehouse per branch and rejects foreign branches', async () => {
    const { locationsService } = createLocationsModule({
      persistence: 'memory',
      evaluateEntitlement,
    });
    const branch = await locationsService.createBranch(
      'org-1',
      { name: 'Main', invoicePrefix: 'MAIN' },
      actor,
    );
    const first = await locationsService.createWarehouse(
      'org-1',
      { name: 'First WH', branchId: branch.id, isDefault: true },
      actor,
    );
    await locationsService.createWarehouse(
      'org-1',
      { name: 'Second WH', branchId: branch.id, isDefault: true },
      actor,
    );
    expect((await locationsService.getWarehouse('org-1', first.id)).isDefault).toBe(false);
    await expect(
      locationsService.createWarehouse(
        'org-2',
        { name: 'Forged WH', branchId: branch.id },
        actor,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
