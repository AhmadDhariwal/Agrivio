import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { OrganizationSettingsModel } from '../settings/persistence/organization-settings.model';
import { BranchModel } from '../locations/persistence/branch.model';
import { WarehouseModel } from '../locations/persistence/warehouse.model';
import { AccessAssignmentModel } from '../locations/persistence/access-assignment.model';

/**
 * Real Mongo index/collection proof for F03 P1 models.
 * Uses an isolated database name so Agrivio production-adjacent data is not touched.
 */
describe('F03 P1 Mongo models', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_f03_${Date.now()}`;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    await mongoose.connect(parsed.toString());
    await Promise.all([
      OrganizationSettingsModel.syncIndexes(),
      BranchModel.syncIndexes(),
      WarehouseModel.syncIndexes(),
      AccessAssignmentModel.syncIndexes(),
    ]);
  }, 60000);

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('enforces organization-scoped unique indexes for settings, branches, warehouses', async () => {
    const organizationId = new mongoose.Types.ObjectId();

    await OrganizationSettingsModel.create({
      organizationId,
      tradingName: 'A',
      version: 1,
    });
    await expect(
      OrganizationSettingsModel.create({
        organizationId,
        tradingName: 'B',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await BranchModel.create({
      organizationId,
      name: 'Main',
      nameNormalized: 'main',
      invoicePrefix: 'MAIN',
      invoicePrefixNormalized: 'MAIN',
      status: 'active',
      version: 1,
    });
    await expect(
      BranchModel.create({
        organizationId,
        name: 'Main 2',
        nameNormalized: 'main',
        invoicePrefix: 'MAIN2',
        invoicePrefixNormalized: 'MAIN2',
        status: 'active',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await WarehouseModel.create({
      organizationId,
      name: 'WH1',
      nameNormalized: 'wh1',
      status: 'active',
      version: 1,
    });
    await expect(
      WarehouseModel.create({
        organizationId,
        name: 'WH1-dup',
        nameNormalized: 'wh1',
        status: 'active',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    const membershipId = new mongoose.Types.ObjectId();
    await AccessAssignmentModel.create({
      organizationId,
      membershipId,
      assignmentType: 'branch',
      targetId: 'branch-1',
      status: 'active',
      version: 1,
    });
    await expect(
      AccessAssignmentModel.create({
        organizationId,
        membershipId,
        assignmentType: 'branch',
        targetId: 'branch-1',
        status: 'active',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});
