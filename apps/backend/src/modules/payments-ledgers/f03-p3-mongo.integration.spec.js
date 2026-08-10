import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { LedgerEffectModel } from './persistence/ledger-effect.model';
import { AccountMovementModel } from '../accounts-expenses/persistence/account-movement.model';

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('F03 P3 openings Mongo indexes/transactions', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f03p3_${Date.now()}`;
  let mongoReady = false;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    try {
      await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 });
      mongoReady = await isReplicaSetPrimary();
      if (!mongoReady) {
        await mongoose.disconnect();
        return;
      }
      await Promise.all([LedgerEffectModel.syncIndexes(), AccountMovementModel.syncIndexes()]);
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

  it('enforces unique opening ledger effects and account movements', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for real-Mongo index proof');
    }

    const organizationId = new mongoose.Types.ObjectId();
    const customerId = new mongoose.Types.ObjectId();
    const accountId = new mongoose.Types.ObjectId();
    const actorId = new mongoose.Types.ObjectId();
    const postedAt = new Date();

    await LedgerEffectModel.create({
      organizationId,
      partyType: 'customer',
      customerId,
      effectKind: 'receivable',
      signedAmountMinorUnits: '10000',
      currency: 'PKR',
      sourceType: 'customer_opening_receivable',
      sourceId: customerId,
      status: 'posted',
      postedAt,
      postedBy: actorId,
    });

    await expect(
      LedgerEffectModel.create({
        organizationId,
        partyType: 'customer',
        customerId,
        effectKind: 'receivable',
        signedAmountMinorUnits: '20000',
        currency: 'PKR',
        sourceType: 'customer_opening_receivable',
        sourceId: customerId,
        status: 'posted',
        postedAt,
        postedBy: actorId,
      }),
    ).rejects.toMatchObject({ code: 11000 });

    await AccountMovementModel.create({
      organizationId,
      accountId,
      signedAmountMinorUnits: '500000',
      currency: 'PKR',
      sourceType: 'account_opening',
      sourceId: accountId,
      status: 'posted',
      postedAt,
      postedBy: actorId,
    });

    await expect(
      AccountMovementModel.create({
        organizationId,
        accountId,
        signedAmountMinorUnits: '1',
        currency: 'PKR',
        sourceType: 'account_opening',
        sourceId: accountId,
        status: 'posted',
        postedAt,
        postedBy: actorId,
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });
});
