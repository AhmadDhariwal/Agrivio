import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

const { AccountModel } = require('./persistence/account.model');
const { AccountMovementModel } = require('./persistence/account-movement.model');
const { ExpenseCategoryModel } = require('./persistence/expense-category.model');
const { ExpenseModel } = require('./persistence/expense.model');
const { createAccountsModule } = require('./accounts.module');
const {
  createIdempotencyService,
  createMongooseIdempotencyStore,
} = require('../../platform/idempotency/idempotency-service');
const { IdempotencyRecordModel } = require('../../platform/idempotency/persistence/idempotency-record.model');

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

describe('F07 P3 real-Mongo transfer/reversal/expense atomicity', () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_f07p3_${Date.now()}`;
  let mongoReady = false;
  let mongoUri = '';

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
      AccountModel.syncIndexes(),
      AccountMovementModel.syncIndexes(),
      ExpenseCategoryModel.syncIndexes(),
      ExpenseModel.syncIndexes(),
      IdempotencyRecordModel.syncIndexes(),
    ]);
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

  async function ensureConnection() {
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === isolatedDb) {
      return;
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  }

  function buildModule() {
    const organizationId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();
    const accounts = createAccountsModule({
      persistence: 'mongoose',
      idempotency: createIdempotencyService(createMongooseIdempotencyStore()),
    });
    const actor = { actorId };
    return { organizationId, actorId, accounts, actor };
  }

  async function seedAccounts(module) {
    const { organizationId, accounts, actor } = module;
    const source = await accounts.accountsService.createAccount(
      organizationId,
      { name: 'P3 Source', accountType: 'cash' },
      actor,
    );
    const destination = await accounts.accountsService.createAccount(
      organizationId,
      { name: 'P3 Dest', accountType: 'bank', bankName: 'HBL' },
      actor,
    );
    return { sourceId: source.id, destinationId: destination.id };
  }

  it('forced transfer failure rolls back both legs', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required');
    }
    await ensureConnection();

    const module = buildModule();
    const { organizationId, accounts, actor } = module;
    const { sourceId, destinationId } = await seedAccounts(module);
    const movementsBefore = await AccountMovementModel.countDocuments({ organizationId });

    const originalInsert = accounts.store.insertAccountMovement.bind(accounts.store);
    let calls = 0;
    accounts.store.insertAccountMovement = async (...args) => {
      calls += 1;
      if (calls === 2) {
        throw new Error('simulated transfer inbound failure');
      }
      return originalInsert(...args);
    };

    await expect(
      accounts.accountsService.postAccountTransfer(
        organizationId,
        {
          sourceAccountId: sourceId,
          destinationAccountId: destinationId,
          amount: { amount: '25.00', currency: 'PKR' },
        },
        actor,
        'f07p3-mongo-transfer-fail',
      ),
    ).rejects.toThrow(/simulated transfer inbound failure/);

    expect(await AccountMovementModel.countDocuments({ organizationId })).toBe(movementsBefore);
    accounts.store.insertAccountMovement = originalInsert;
  }, 120000);

  it('transfer reversal and expense correction are atomic and idempotent', async ({ skip }) => {
    if (!mongoReady) {
      skip('Mongo replica set rs0 PRIMARY is required');
    }
    await ensureConnection();

    const module = buildModule();
    const { organizationId, accounts, actor } = module;
    const { sourceId, destinationId } = await seedAccounts(module);

    const transfer = await accounts.accountsService.postAccountTransfer(
      organizationId,
      {
        sourceAccountId: sourceId,
        destinationAccountId: destinationId,
        amount: { amount: '40.00', currency: 'PKR' },
        purpose: 'Mongo transfer',
      },
      actor,
      'f07p3-mongo-transfer',
    );
    expect(transfer.data.outboundMovementId).toBeTruthy();

    const replayTransfer = await accounts.accountsService.postAccountTransfer(
      organizationId,
      {
        sourceAccountId: sourceId,
        destinationAccountId: destinationId,
        amount: { amount: '40.00', currency: 'PKR' },
        purpose: 'Mongo transfer',
      },
      actor,
      'f07p3-mongo-transfer',
    );
    expect(replayTransfer.replay).toBe(true);
    expect(
      await AccountMovementModel.countDocuments({
        organizationId,
        sourceType: { $in: ['account_transfer_out', 'account_transfer_in'] },
      }),
    ).toBe(2);

    const reversed = await accounts.accountsService.reverseAccountTransfer(
      organizationId,
      transfer.data.id,
      { reason: 'Mongo reverse transfer' },
      actor,
      'f07p3-mongo-transfer-reverse',
    );
    expect(reversed.data.reversalOutboundMovementId).toBeTruthy();
    expect(reversed.data.reversalInboundMovementId).toBeTruthy();

    const reverseReplay = await accounts.accountsService.reverseAccountTransfer(
      organizationId,
      transfer.data.id,
      { reason: 'Mongo reverse transfer' },
      actor,
      'f07p3-mongo-transfer-reverse',
    );
    expect(reverseReplay.replay).toBe(true);
    expect(
      await AccountMovementModel.countDocuments({
        organizationId,
        sourceType: { $in: ['account_transfer_out_reversal', 'account_transfer_in_reversal'] },
      }),
    ).toBe(2);

    const category = await accounts.accountsService.createExpenseCategory(
      organizationId,
      { name: 'Mongo Utilities' },
      actor,
    );
    const draft = await accounts.accountsService.createExpenseDraft(
      organizationId,
      {
        categoryId: category.id,
        accountId: sourceId,
        amount: { amount: '12.00', currency: 'PKR' },
        purpose: 'Mongo expense',
        expenseDate: '2026-08-13',
      },
      actor,
    );
    const posted = await accounts.accountsService.postExpense(
      organizationId,
      draft.id,
      { expectedVersion: draft.version },
      actor,
      'f07p3-mongo-expense',
    );
    expect(posted.data.status).toBe('posted');

    const movementsBeforeCorrect = await AccountMovementModel.countDocuments({ organizationId });
    const expensesBeforeCorrect = await ExpenseModel.countDocuments({ organizationId });
    const originalInsert = accounts.store.insertAccountMovement.bind(accounts.store);
    accounts.store.insertAccountMovement = async (session, doc) => {
      if (doc.sourceType === 'expense_correction') {
        throw new Error('simulated expense correction failure');
      }
      return originalInsert(session, doc);
    };

    await expect(
      accounts.accountsService.correctExpense(
        organizationId,
        posted.data.id,
        { expectedVersion: posted.data.version, reason: 'Forced fail' },
        actor,
        'f07p3-mongo-expense-fail',
      ),
    ).rejects.toThrow(/simulated expense correction failure/);

    expect(await AccountMovementModel.countDocuments({ organizationId })).toBe(movementsBeforeCorrect);
    expect(await ExpenseModel.countDocuments({ organizationId })).toBe(expensesBeforeCorrect);
    const stillPosted = await ExpenseModel.findById(posted.data.id).lean().exec();
    expect(stillPosted.status).toBe('posted');
    expect(stillPosted.purpose).toBe('Mongo expense');
    expect(stillPosted.correctedByExpenseId).toBeNull();

    accounts.store.insertAccountMovement = originalInsert;

    const corrected = await accounts.accountsService.correctExpense(
      organizationId,
      posted.data.id,
      { expectedVersion: posted.data.version, reason: 'Mongo correct' },
      actor,
      'f07p3-mongo-expense-correct',
    );
    expect(corrected.data.status).toBe('corrected');
    const correctReplay = await accounts.accountsService.correctExpense(
      organizationId,
      posted.data.id,
      { expectedVersion: posted.data.version, reason: 'Mongo correct' },
      actor,
      'f07p3-mongo-expense-correct',
    );
    expect(correctReplay.replay).toBe(true);
    expect(
      await ExpenseModel.countDocuments({ organizationId, correctionOfId: posted.data.id }),
    ).toBe(1);
    expect(
      await AccountMovementModel.countDocuments({
        organizationId,
        sourceType: 'expense_correction',
      }),
    ).toBe(1);
  }, 120000);
});
