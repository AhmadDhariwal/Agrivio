import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { PaymentModel } from './persistence/payment.model';
import { PaymentAllocationModel } from './persistence/payment-allocation.model';
import { LedgerEffectModel } from './persistence/ledger-effect.model';
import { AccountModel } from '../accounts-expenses/persistence/account.model';
import { AccountMovementModel } from '../accounts-expenses/persistence/account-movement.model';
import { IdempotencyRecordModel } from '../../platform/idempotency/persistence/idempotency-record.model';
import { createAccountsModule } from '../accounts-expenses/accounts.module';
import { createLedgersModule } from './ledgers.module';

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('Frozen payment correction real-Mongo transaction', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_pay_correct_${Date.now()}`;
  let mongoReady = false;
  let mongoUri = '';
  let organizationId;
  let customerId;
  let accountId;
  let actorId;
  let accounts;
  let ledgers;
  let paymentsService;

  beforeAll(async () => {
    const parsed = new URL(uri);
    parsed.pathname = `/${isolatedDb}`;
    mongoUri = parsed.toString();
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    } catch {
      mongoReady = false;
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      return;
    }
    mongoReady = await isReplicaSetPrimary();
    if (!mongoReady) {
      await mongoose.disconnect();
      return;
    }
    await Promise.all([
      PaymentModel.syncIndexes(),
      PaymentAllocationModel.syncIndexes(),
      LedgerEffectModel.syncIndexes(),
      AccountModel.syncIndexes(),
      AccountMovementModel.syncIndexes(),
      IdempotencyRecordModel.syncIndexes(),
    ]);

    organizationId = new mongoose.Types.ObjectId().toString();
    customerId = new mongoose.Types.ObjectId().toString();
    actorId = new mongoose.Types.ObjectId().toString();

    accounts = createAccountsModule({ persistence: 'mongoose' });
    const account = await accounts.accountsService.createAccount(
      organizationId,
      { name: 'Mongo Correct Cash', accountType: 'cash' },
      { actorId },
    );
    accountId = account.id;

    ledgers = createLedgersModule({
      persistence: 'mongoose',
      accountsService: accounts.accountsService,
      suppliersService: {
        async getSupplier() {
          throw new Error('not used');
        },
      },
    });
    paymentsService = ledgers.createPaymentsService({
      accountsService: accounts.accountsService,
      customersService: {
        async getCustomer(orgId, id) {
          if (String(orgId) === organizationId && String(id) === customerId) {
            return { id: customerId, status: 'active' };
          }
          throw new Error('not found');
        },
      },
      suppliersService: {
        async getSupplier() {
          throw new Error('not used');
        },
      },
      listUnpaidCustomerSales: async () => [],
    });
  }, 60000);

  afterAll(async () => {
    if (!mongoReady) {
      return;
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it('rolls back a failed correction and enforces one correction per original', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required for payment correction proof');
    }

    const actor = { actorId };
    const posted = await paymentsService.postCustomerPayment(
      organizationId,
      {
        customerId,
        accountId,
        amount: { amount: '40.00', currency: 'PKR' },
        paymentDate: '2026-08-14',
        allocationMode: 'general',
      },
      actor,
      'mongo-pay-correct-post',
    );
    expect(posted.statusCode).toBe(201);
    const originalId = posted.data.id;
    const paymentsBefore = await PaymentModel.countDocuments({ organizationId });
    const movementsBefore = await AccountMovementModel.countDocuments({ organizationId });
    const effectsBefore = await LedgerEffectModel.countDocuments({ organizationId });

    const originalInsert = ledgers.paymentsStore.insertPayment.bind(ledgers.paymentsStore);
    ledgers.paymentsStore.insertPayment = async (session, doc) => {
      if (doc.correctionOfId) {
        throw new Error('simulated payment correction failure');
      }
      return originalInsert(session, doc);
    };

    await expect(
      paymentsService.correctPayment(
        organizationId,
        originalId,
        { reason: 'mongo rollback' },
        actor,
        'mongo-pay-correct-fail',
      ),
    ).rejects.toThrow('simulated payment correction failure');

    ledgers.paymentsStore.insertPayment = originalInsert;

    expect(await PaymentModel.countDocuments({ organizationId })).toBe(paymentsBefore);
    expect(await AccountMovementModel.countDocuments({ organizationId })).toBe(movementsBefore);
    expect(await LedgerEffectModel.countDocuments({ organizationId })).toBe(effectsBefore);

    const original = await PaymentModel.findById(originalId).lean().exec();
    expect(original.amountMinorUnits).toBe('4000');
    expect(original.correctionOfId).toBeFalsy();

    const corrected = await paymentsService.correctPayment(
      organizationId,
      originalId,
      { reason: 'mongo success' },
      actor,
      'mongo-pay-correct-ok',
    );
    expect(corrected.statusCode).toBe(200);
    expect(corrected.data.reversal.correctionOfId).toBe(originalId);

    await expect(
      PaymentModel.create({
        organizationId,
        partyType: 'customer',
        customerId,
        accountId,
        allocationMode: 'general',
        amountMinorUnits: '1',
        currency: 'PKR',
        paymentDate: '2026-08-14',
        status: 'posted',
        postedAt: new Date(),
        postedBy: actorId,
        correctionOfId: originalId,
        reason: 'duplicate link',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  }, 60000);
});
