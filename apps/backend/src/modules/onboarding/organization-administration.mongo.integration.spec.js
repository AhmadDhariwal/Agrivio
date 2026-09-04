import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { createMockDatabaseLifecycle } from '../../platform/database/mongo-connection';
import { loadApiEnv } from '../../platform/config/runtime-config';
import auditModelModule from '../audit/persistence/audit-event.model';
import identityModelModule from '../identity/persistence/identity.model';
import organizationModelModule from '../organizations/persistence/organization.model';
import subscriptionModelModule from '../subscriptions/persistence/subscription.model';

const { AuditEventModel } = auditModelModule;
const { AuthSessionModel, OrganizationMembershipModel, UserModel } = identityModelModule;
const { OrganizationModel } = organizationModelModule;
const { SubscriptionModel } = subscriptionModelModule;

async function isReplicaSetPrimary() {
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    return hello.setName === 'rs0' && hello.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('platform organization lifecycle Mongo transaction', () => {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_platform_org_admin_${Date.now()}`;
  let mongoReady = false;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    try {
      await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
      mongoReady = await isReplicaSetPrimary();
      if (mongoReady) {
        await Promise.all([
          OrganizationModel.syncIndexes(),
          UserModel.syncIndexes(),
          OrganizationMembershipModel.syncIndexes(),
          AuthSessionModel.syncIndexes(),
          SubscriptionModel.syncIndexes(),
          AuditEventModel.syncIndexes(),
        ]);
      }
    } catch {
      mongoReady = false;
    }
  }, 60000);

  afterAll(async () => {
    if (mongoReady) await mongoose.connection.dropDatabase();
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });

  it('atomically suspends, revokes sessions, preserves membership, and reactivates', async ({
    skip,
  }) => {
    if (!mongoReady) skip('Mongo replica set rs0 PRIMARY is required for lifecycle proof');

    const app = createApp({
      config: loadApiEnv({ NODE_ENV: 'test' }),
      database: createMockDatabaseLifecycle({ ready: true }),
      onboardingPersistence: 'mongoose',
      authPersistence: 'mongoose',
      subscriptionPersistence: 'mongoose',
    });
    const owner = await UserModel.create({
      email: 'mongo-owner@example.com',
      emailNormalized: 'mongo-owner@example.com',
      displayName: 'Mongo Owner',
      status: 'active',
      passwordHash: 'redacted-test-hash',
      version: 1,
    });
    const organization = await OrganizationModel.create({
      name: 'Mongo Lifecycle Org',
      nameNormalized: 'mongo lifecycle org',
      timezone: 'UTC',
      status: 'approved',
      applicantFingerprint: 'mongo-lifecycle-fingerprint',
      ownerUserId: owner._id,
      version: 1,
    });
    const membership = await OrganizationMembershipModel.create({
      organizationId: organization._id,
      userId: owner._id,
      role: 'Owner',
      status: 'active',
      version: 1,
    });
    await SubscriptionModel.create({
      organizationId: organization._id,
      status: 'active',
      planCode: 'Starter',
      planVersion: 1,
      billingPeriod: 'monthly',
      periodStartsAt: new Date('2026-09-01T00:00:00.000Z'),
      periodEndsAt: new Date('2026-10-01T00:00:00.000Z'),
      version: 1,
    });
    await AuthSessionModel.create({
      tokenHash: 'mongo-session-token-hash',
      csrfHash: 'mongo-session-csrf-hash',
      userId: owner._id,
      activeContextType: 'organization',
      activeMembershipId: membership._id,
      activeOrganizationId: organization._id,
      absoluteExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
      lastSeenAt: new Date('2026-09-04T00:00:00.000Z'),
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    });

    const suspended = await app.agrivio.onboarding.onboardingService.suspendOrganization(
      String(organization._id),
      { reason: 'Security response', expectedVersion: 1, confirmed: true },
      { actorId: 'platform-admin' },
      'mongo-suspend-1',
    );
    expect(suspended.data).toMatchObject({ status: 'suspended', subscriptionStatus: 'suspended' });
    expect(
      await AuthSessionModel.exists({ userId: owner._id, revokedAt: { $ne: null } }),
    ).toBeTruthy();
    expect(await OrganizationMembershipModel.findById(membership._id).lean()).toMatchObject({
      role: 'Owner',
      status: 'active',
      version: 1,
    });

    const reactivated = await app.agrivio.onboarding.onboardingService.reactivateOrganization(
      String(organization._id),
      { reason: 'Security review complete', expectedVersion: 2 },
      { actorId: 'platform-admin' },
      'mongo-reactivate-1',
    );
    expect(reactivated.data).toMatchObject({ status: 'approved', subscriptionStatus: 'active' });
    expect(
      await AuditEventModel.countDocuments({
        scope: 'platform',
        organizationId: organization._id,
        action: { $in: ['organization.suspended', 'organization.reactivated'] },
      }),
    ).toBe(2);
    expect(await AuthSessionModel.findOne({ userId: owner._id }).lean()).toMatchObject({
      revokedAt: expect.any(Date),
    });
  }, 120000);
});
