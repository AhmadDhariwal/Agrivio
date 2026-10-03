import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
const { createEmployeesModule } = require('./employees.module');
const { permissionsForMembershipRole } = require('./role-permissions');
const {
  UserModel,
  OrganizationMembershipModel,
  AccountActivationTokenModel,
} = require('./persistence/identity.model');

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('pending invitation cancellation real Mongo proof', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_invitation_cancel_${Date.now()}`;
  let mongoReady = false;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    try {
      await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
    } catch {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
      return;
    }
    mongoReady = await isReplicaSetPrimary();
    if (!mongoReady) {
      await mongoose.disconnect();
      return;
    }
    await Promise.all([
      UserModel.syncIndexes(),
      OrganizationMembershipModel.syncIndexes(),
      AccountActivationTokenModel.syncIndexes(),
    ]);
  }, 60000);

  afterAll(async () => {
    if (!mongoReady) return;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('deletes only unused pending membership/token state and blocks used activation', async ({ skip }) => {
    if (!mongoReady) skip('Mongo replica set rs0 PRIMARY is required');

    const organizationId = new mongoose.Types.ObjectId();
    const owner = await UserModel.create({
      email: 'mongo-owner@example.com',
      emailNormalized: 'mongo-owner@example.com',
      displayName: 'Owner',
      passwordHash: 'hash',
      status: 'active',
      version: 1,
    });
    await OrganizationMembershipModel.create({
      organizationId,
      userId: owner._id,
      role: 'Owner',
      status: 'active',
      version: 1,
    });
    const actor = {
      actorId: String(owner._id),
      role: 'Owner',
      permissions: permissionsForMembershipRole('Owner'),
    };
    const employees = createEmployeesModule({
      persistence: 'mongoose',
      evaluateEntitlement: async () => ({ allowed: true }),
    });

    const cancellable = await employees.employeesService.createEmployee(
      String(organizationId),
      { email: 'mongo-pending@example.com', displayName: 'Pending', role: 'Cashier' },
      actor,
    );
    await employees.employeesService.cancelPendingInvitation(
      String(organizationId),
      cancellable.id,
      { expectedVersion: cancellable.version },
      actor,
    );
    expect(
      await OrganizationMembershipModel.countDocuments({
        organizationId,
        userId: cancellable.id,
      }),
    ).toBe(0);
    expect(
      await AccountActivationTokenModel.countDocuments({
        organizationId,
        userId: cancellable.id,
      }),
    ).toBe(0);

    const used = await employees.employeesService.createEmployee(
      String(organizationId),
      { email: 'mongo-used@example.com', displayName: 'Used', role: 'StoreKeeper' },
      actor,
    );
    await AccountActivationTokenModel.updateOne(
      { organizationId, userId: used.id },
      { $set: { consumedAt: new Date() } },
    ).exec();
    await expect(
      employees.employeesService.cancelPendingInvitation(
        String(organizationId),
        used.id,
        { expectedVersion: used.version },
        actor,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  }, 60000);
});
