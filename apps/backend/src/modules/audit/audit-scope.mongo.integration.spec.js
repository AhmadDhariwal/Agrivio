import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import {
  AuditEventModel,
  createMongooseAuditEventStore,
} from './persistence/audit-event.model.js';

describe('Audit scope Mongo isolation', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_audit_scope_${Date.now()}`;
  let mongoReady = false;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    try {
      await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
      const hello = await mongoose.connection.db.admin().command({ hello: 1 });
      mongoReady = hello.setName === 'rs0' && hello.isWritablePrimary === true;
      if (!mongoReady) {
        await mongoose.disconnect();
        return;
      }
      await AuditEventModel.syncIndexes();
    } catch {
      mongoReady = false;
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    }
  }, 60000);

  afterAll(async () => {
    if (!mongoReady) {
      return;
    }
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('persists the scope index and separates tenant and platform records', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo Audit scope proof');
    }
    const store = createMongooseAuditEventStore();
    const orgA = new mongoose.Types.ObjectId();
    const orgB = new mongoose.Types.ObjectId();
    const occurredAt = new Date('2026-09-03T00:00:00.000Z');

    await AuditEventModel.create([
      {
        scope: 'tenant',
        organizationId: orgA,
        actorId: 'org-a-owner',
        action: 'sale.posted',
        resourceType: 'sale',
        occurredAt,
      },
      {
        scope: 'tenant',
        organizationId: orgB,
        actorId: 'org-b-owner',
        action: 'sale.posted',
        resourceType: 'sale',
        occurredAt,
      },
      {
        scope: 'platform',
        organizationId: orgA,
        actorId: 'super-admin',
        action: 'organization.suspended',
        resourceType: 'organization',
        occurredAt,
      },
      {
        actorId: 'legacy-platform',
        action: 'backup.completed',
        resourceType: 'backup_operation',
        occurredAt,
      },
    ]);

    const tenant = await store.queryPage(
      { scope: 'tenant', organizationId: String(orgA) },
      { skip: 0, pageSize: 25 },
    );
    const platform = await store.queryPage({ scope: 'platform' }, { skip: 0, pageSize: 25 });
    const indexes = await AuditEventModel.collection.indexes();

    expect(tenant.items.map((event) => event.actorId)).toEqual(['org-a-owner']);
    expect(platform.items.map((event) => event.actorId).sort()).toEqual([
      'legacy-platform',
      'super-admin',
    ]);
    expect(
      indexes.some(
        (index) => index.key.scope === 1 && index.key.occurredAt === -1,
      ),
    ).toBe(true);
  });
});
