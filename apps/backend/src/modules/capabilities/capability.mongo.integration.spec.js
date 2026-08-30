import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import capabilityPolicyModelModule from './persistence/organization-capability-policy.model';

const { OrganizationCapabilityPolicyModel } = capabilityPolicyModelModule;

async function isReplicaSetPrimary() {
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    return hello.setName === 'rs0' && hello.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('Organization Capability Policy Mongo persistence', () => {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_capabilities_${Date.now()}`;
  let mongoReady = false;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    try {
      await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
      mongoReady = await isReplicaSetPrimary();
      if (mongoReady) {
        await OrganizationCapabilityPolicyModel.syncIndexes();
      }
    } catch {
      mongoReady = false;
    }
  }, 60000);

  afterAll(async () => {
    if (mongoReady) {
      await mongoose.connection.dropDatabase();
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it('enforces one policy document per organization and persists version metadata', async ({
    skip,
  }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo capability proof');
    }
    const organizationId = new mongoose.Types.ObjectId();
    await OrganizationCapabilityPolicyModel.create({
      organizationId,
      version: 1,
      overrides: [{ key: 'inventory.products.fields.sku', value: { editable: false } }],
      updatedBy: 'platform-admin',
    });
    await expect(
      OrganizationCapabilityPolicyModel.create({
        organizationId,
        version: 1,
        overrides: [],
        updatedBy: 'another-admin',
      }),
    ).rejects.toMatchObject({ code: 11000 });

    const stored = await OrganizationCapabilityPolicyModel.findOne({ organizationId }).lean();
    expect(stored).toMatchObject({ version: 1, updatedBy: 'platform-admin' });
    expect(stored.overrides).toHaveLength(1);
  });
});
