import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { createServer } from 'node:http';
import {
  API_AUTH_ACTIVATE_PATH,
  API_AUTH_CSRF_PATH,
  API_CSRF_HEADER,
  API_SESSION_COOKIE_NAME,
} from '@agrivio/api-contracts';
import { createApp } from '../../app';
import { createMockDatabaseLifecycle } from '../../platform/database/mongo-connection';
import { loadApiEnv } from '../../platform/config/runtime-config';
import { hashToken } from '../identity/crypto-tokens';
import onboardingServiceModule from './onboarding.service';
import auditModelModule from '../audit/persistence/audit-event.model';
import identityModelModule from '../identity/persistence/identity.model';
import organizationModelModule from '../organizations/persistence/organization.model';
import subscriptionModelModule from '../subscriptions/persistence/subscription.model';

const { AuditEventModel } = auditModelModule;
const { AccountActivationTokenModel, AuthSessionModel, OrganizationMembershipModel, UserModel } =
  identityModelModule;
const { OrganizationModel } = organizationModelModule;
const { SubscriptionModel } = subscriptionModelModule;
const { buildActivationUrl } = onboardingServiceModule;

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
          AccountActivationTokenModel.syncIndexes(),
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

  it('persists approve and reissue activation hashes through commit and activates only the newest token', async ({
    skip,
  }) => {
    if (!mongoReady) skip('Mongo replica set rs0 PRIMARY is required for activation-token proof');

    const app = createApp({
      config: loadApiEnv({ NODE_ENV: 'test' }),
      database: createMockDatabaseLifecycle({ ready: true }),
      onboardingPersistence: 'mongoose',
      authPersistence: 'mongoose',
      subscriptionPersistence: 'mongoose',
    });
    const service = app.agrivio.onboarding.onboardingService;
    const submitted = await service.submitActivationRequest({
      organizationName: 'Mongo Activation Org',
      ownerEmail: 'mongo-activation-owner@example.com',
      ownerDisplayName: 'Mongo Activation Owner',
      timezone: 'UTC',
    });

    const approved = await service.approveOrganization(submitted.organizationId, {
      actorId: 'platform-admin',
    });
    const tokenA = approved.activationToken;
    const storedA = await app.agrivio.onboarding.store.findActivationTokenByHash(hashToken(tokenA));
    expect(storedA).toMatchObject({
      tokenHash: hashToken(tokenA),
      purpose: 'owner_activation',
    });
    expect(storedA?.consumedAt ?? null).toBeNull();

    const reissued = await service.reissueOwnerActivationToken(submitted.organizationId, {
      actorId: 'platform-admin',
    });
    const tokenB = reissued.activationToken;
    expect(tokenB).not.toBe(tokenA);
    expect(reissued.activationUrl).toBe(buildActivationUrl('http://localhost:4200', tokenB));
    const decodedTokenB = new URL(reissued.activationUrl).searchParams.get('token');
    expect(decodedTokenB).toBe(tokenB);

    const [consumedA, storedB] = await Promise.all([
      app.agrivio.onboarding.store.findActivationTokenByHash(hashToken(tokenA)),
      app.agrivio.onboarding.store.findActivationTokenByHash(hashToken(tokenB)),
    ]);
    expect(consumedA?.consumedAt).toBeInstanceOf(Date);
    expect(storedB).toMatchObject({
      tokenHash: hashToken(tokenB),
      purpose: 'owner_activation',
    });
    expect(storedB?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedB?.consumedAt ?? null).toBeNull();
    expect(new Date(storedB.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const server = createServer(app);
    await listen(server);
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Expected TCP port');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const jar = createCookieJar();

    try {
      const oldToken = await activate(baseUrl, jar, tokenA);
      expect(oldToken.status).toBe(409);
      expect(oldToken.body.error.message).toBe('Activation token has already been used');

      const newestToken = await activate(baseUrl, jar, decodedTokenB);
      expect(newestToken.status).toBe(200);
      expect(newestToken.body.data.status).toBe('active');

      const reusedToken = await activate(baseUrl, jar, tokenB);
      expect(reusedToken.status).toBe(409);
      expect(reusedToken.body.error.message).toBe('Activation token has already been used');

      expect(
        await UserModel.findOne({ emailNormalized: 'mongo-activation-owner@example.com' }).lean(),
      ).toMatchObject({
        status: 'active',
        passwordHash: expect.any(String),
      });
      expect(
        await OrganizationMembershipModel.findOne({
          organizationId: new mongoose.Types.ObjectId(submitted.organizationId),
        }).lean(),
      ).toMatchObject({ status: 'active' });

      const visibilityTokenHash = hashToken('mongo-activation-transaction-visibility');
      const visibilitySession = await mongoose.startSession();
      try {
        await visibilitySession.withTransaction(async () => {
          await app.agrivio.onboarding.store.insertActivationToken(visibilitySession, {
            userId: storedB.userId,
            organizationId: storedB.organizationId,
            tokenHash: visibilityTokenHash,
            expiresAt: new Date(Date.now() + 60_000),
            purpose: 'owner_activation',
          });
          expect(
            await app.agrivio.onboarding.store.findActivationTokenByHash(
              visibilityTokenHash,
              visibilitySession,
            ),
          ).toMatchObject({ tokenHash: visibilityTokenHash });
        });
      } finally {
        await visibilitySession.endSession();
      }
      expect(
        await app.agrivio.onboarding.store.findActivationTokenByHash(visibilityTokenHash),
      ).toMatchObject({ tokenHash: visibilityTokenHash });
    } finally {
      await close(server);
    }
  }, 120000);
});

async function activate(baseUrl, jar, token) {
  const csrf = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
  expect(csrf.status).toBe(200);
  return fetchJson(
    baseUrl,
    'POST',
    API_AUTH_ACTIVATE_PATH,
    { token, password: 'a-strong-passphrase' },
    { [API_CSRF_HEADER]: csrf.body.data.csrfToken },
    jar,
  );
}

function createCookieJar() {
  const cookies = new Map();
  return {
    absorb(headers) {
      for (const entry of headers.getSetCookie?.() ?? []) {
        const [pair] = entry.split(';');
        const index = pair.indexOf('=');
        if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
    },
    header() {
      return [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    },
    get(name) {
      return cookies.get(name);
    },
  };
}

async function fetchJson(baseUrl, method, path, body, headers, jar) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(jar.get(API_SESSION_COOKIE_NAME) === undefined ? {} : { cookie: jar.header() }),
      ...headers,
    },
    body: JSON.stringify(body),
  });
  jar.absorb(response.headers);
  return { status: response.status, body: await response.json() };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve(undefined)));
  });
}
