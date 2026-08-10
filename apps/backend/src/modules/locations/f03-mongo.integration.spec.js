import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { OrganizationSettingsModel } from '../settings/persistence/organization-settings.model';
import { BranchModel } from '../locations/persistence/branch.model';
import { WarehouseModel } from '../locations/persistence/warehouse.model';
import { AccessAssignmentModel } from '../locations/persistence/access-assignment.model';
import {
  UserModel,
  OrganizationMembershipModel,
  AccountActivationTokenModel,
  AuthSessionModel,
  PasswordResetTokenModel,
} from '../identity/persistence/identity.model';
import { SubscriptionModel } from '../subscriptions/persistence/subscription.model';
import { SubscriptionPlanModel } from '../subscriptions/persistence/subscription-plan.model';
import { SubscriptionBillingRecordModel } from '../subscriptions/persistence/subscription-billing-record.model';
import { OrganizationModel } from '../organizations/persistence/organization.model';
import { AuditEventModel } from '../audit/persistence/audit-event.model';
import { IdempotencyRecordModel } from '../../platform/idempotency/persistence/idempotency-record.model';
import {
  createIdempotencyService,
  createMongooseIdempotencyStore,
} from '../../platform/idempotency/idempotency-service';

/**
 * Real Mongo index/persistence proof for implemented F00–F03 P1 models.
 * Uses an isolated database name so Agrivio production-adjacent data is not touched.
 */
describe('Implemented-model Mongo completeness', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_model_audit_${Date.now()}`;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    await mongoose.connect(parsed.toString());
    await Promise.all([
      OrganizationSettingsModel.syncIndexes(),
      BranchModel.syncIndexes(),
      WarehouseModel.syncIndexes(),
      AccessAssignmentModel.syncIndexes(),
      UserModel.syncIndexes(),
      OrganizationMembershipModel.syncIndexes(),
      AccountActivationTokenModel.syncIndexes(),
      AuthSessionModel.syncIndexes(),
      PasswordResetTokenModel.syncIndexes(),
      OrganizationModel.syncIndexes(),
      SubscriptionModel.syncIndexes(),
      SubscriptionPlanModel.syncIndexes(),
      SubscriptionBillingRecordModel.syncIndexes(),
      AuditEventModel.syncIndexes(),
      IdempotencyRecordModel.syncIndexes(),
    ]);
  }, 60000);

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('enforces organization-scoped unique indexes for settings, branches, warehouses, assignments', async () => {
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
    const branchTargetId = new mongoose.Types.ObjectId();
    await AccessAssignmentModel.create({
      organizationId,
      membershipId,
      assignmentType: 'branch',
      targetId: branchTargetId,
      status: 'active',
      version: 1,
    });
    await expect(
      AccessAssignmentModel.create({
        organizationId,
        membershipId,
        assignmentType: 'branch',
        targetId: branchTargetId,
        status: 'active',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('enforces unique normalized email, membership, token hashes, and one subscription per org', async () => {
    await UserModel.create({
      email: 'Owner@Example.com',
      emailNormalized: 'owner@example.com',
      displayName: 'Owner',
      status: 'active',
      version: 1,
    });
    await expect(
      UserModel.create({
        email: 'other@example.com',
        emailNormalized: 'owner@example.com',
        displayName: 'Dup',
        status: 'active',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    const organizationId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    await OrganizationMembershipModel.create({
      organizationId,
      userId,
      role: 'Owner',
      status: 'active',
      version: 1,
    });
    await expect(
      OrganizationMembershipModel.create({
        organizationId,
        userId,
        role: 'Manager',
        status: 'active',
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await AccountActivationTokenModel.create({
      userId,
      organizationId,
      tokenHash: 'activation-hash-1',
      expiresAt: new Date(Date.now() + 60_000),
      purpose: 'employee_activation',
    });
    await expect(
      AccountActivationTokenModel.create({
        userId,
        organizationId,
        tokenHash: 'activation-hash-1',
        expiresAt: new Date(Date.now() + 60_000),
        purpose: 'owner_activation',
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await AuthSessionModel.create({
      tokenHash: 'session-hash-1',
      csrfHash: 'csrf-hash-1',
      userId,
      activeContextType: 'none',
      absoluteExpiresAt: new Date(Date.now() + 60_000),
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      AuthSessionModel.create({
        tokenHash: 'session-hash-1',
        csrfHash: 'csrf-hash-2',
        userId,
        activeContextType: 'none',
        absoluteExpiresAt: new Date(Date.now() + 60_000),
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await PasswordResetTokenModel.create({
      userId,
      tokenHash: 'reset-hash-1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      PasswordResetTokenModel.create({
        userId,
        tokenHash: 'reset-hash-1',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await SubscriptionModel.create({
      organizationId,
      status: 'trial',
      planCode: 'Starter',
      planVersion: 1,
      version: 1,
    });
    await expect(
      SubscriptionModel.create({
        organizationId,
        status: 'active',
        planCode: 'Business',
        planVersion: 1,
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('enforces plan version uniqueness and stores audit request correlation', async () => {
    await SubscriptionPlanModel.create({
      planCode: 'Starter',
      planVersion: 1,
      status: 'active',
      currency: 'PKR',
      trialEligible: true,
      version: 1,
    });
    await expect(
      SubscriptionPlanModel.create({
        planCode: 'Starter',
        planVersion: 1,
        status: 'draft',
        currency: 'PKR',
        trialEligible: true,
        version: 1,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    const organizationId = new mongoose.Types.ObjectId();
    const [event] = await AuditEventModel.create([
      {
        organizationId,
        actorId: 'actor-1',
        action: 'organization_settings.updated',
        resourceType: 'organization_settings',
        resourceId: 'settings-1',
        requestId: 'req-correlation-1',
        occurredAt: new Date(),
      },
    ]);
    expect(event.requestId).toBe('req-correlation-1');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });

  it('persists idempotency claims without double-applying side effects', async () => {
    const store = createMongooseIdempotencyStore({
      ttlMs: 60_000,
      now: () => new Date(),
    });
    const service = createIdempotencyService(store);
    const organizationId = new mongoose.Types.ObjectId().toString();
    let executions = 0;
    const scope = {
      scopeType: 'organization',
      organizationId,
      actorId: 'owner-2',
      operation: 'warehouses.create',
    };

    const first = await service.execute(scope, 'key-2', { name: 'WH' }, async () => {
      executions += 1;
      return { statusCode: 201, body: { id: 'wh-1' } };
    });
    const second = await service.execute(scope, 'key-2', { name: 'WH' }, async () => {
      executions += 1;
      return { statusCode: 201, body: { id: 'wh-should-not-run' } };
    });

    expect(first.replay).toBe(false);
    expect(second.replay).toBe(true);
    expect(second.response.body).toEqual({ id: 'wh-1' });
    expect(executions).toBe(1);
  });
});
