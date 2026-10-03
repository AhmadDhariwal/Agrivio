import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';

const { createCustomerFinanceModule } = require('./customer-finance.module');
const { createLedgersModule } = require('../payments-ledgers/ledgers.module');
const { createAccountsModule } = require('../accounts-expenses/accounts.module');
const { CustomerLoanModel, CustomerLoanRepaymentModel, CustomerBalanceAdjustmentModel } = require('./persistence/customer-finance.model');
const { LedgerEffectModel, CustomerFinancialVersionModel } = require('../payments-ledgers/persistence/ledger-effect.model');
const { AccountModel } = require('../accounts-expenses/persistence/account.model');
const { AccountMovementModel } = require('../accounts-expenses/persistence/account-movement.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');
const { IdempotencyRecordModel } = require('../../platform/idempotency/persistence/idempotency-record.model');

async function replicaSetPrimary() {
  try { const hello = await mongoose.connection.db.admin().command({ hello: 1 }); return hello.setName === 'rs0' && hello.isWritablePrimary === true; } catch { return false; }
}

describe('customer finance real-Mongo atomicity and concurrency', () => {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const isolatedDb = `agrivio_test_customer_finance_${Date.now()}`;
  let ready = false;
  beforeAll(async () => {
    const parsed = new URL(uri); parsed.pathname = `/${isolatedDb}`;
    try { await mongoose.connect(parsed.toString(), { serverSelectionTimeoutMS: 5000 }); } catch { return; }
    ready = await replicaSetPrimary();
    if (!ready) { await mongoose.disconnect(); return; }
    await Promise.all([CustomerLoanModel, CustomerLoanRepaymentModel, CustomerBalanceAdjustmentModel, LedgerEffectModel, CustomerFinancialVersionModel, AccountModel, AccountMovementModel, AuditEventModel, IdempotencyRecordModel].map((model) => model.syncIndexes()));
  }, 60000);
  afterAll(async () => { if (ready) { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); } });

  function build() {
    const organizationId = new mongoose.Types.ObjectId().toString(); const customerId = new mongoose.Types.ObjectId().toString(); const actor = { actorId: new mongoose.Types.ObjectId().toString() };
    const customersService = { async getCustomer(org, id) { if (String(org) !== organizationId || String(id) !== customerId) { const error = new Error('Customer not found'); error.statusCode = 404; throw error; } return { id: customerId, status: 'active' }; }, async listCustomerSummariesByIds() { return []; } };
    const ledgers = createLedgersModule({ persistence: 'mongoose' });
    const accounts = createAccountsModule({ persistence: 'mongoose' });
    const holder = { financeService: null };
    const paymentsService = ledgers.createPaymentsService({ accountsService: accounts.accountsService, customersService, suppliersService: {}, listUnpaidSupplierPurchases: async () => [], listUnpaidCustomerSales: async () => [], listManualCustomerReceivableTargets: (...args) => holder.financeService?.listManualReceivableTargets(...args) ?? [], listCustomerTradeTargetAdjustments: (...args) => holder.financeService?.listTradeTargetAdjustments(...args) ?? [] });
    const finance = createCustomerFinanceModule({ persistence: 'mongoose', ledgersService: ledgers.ledgersService, accountsService: accounts.accountsService, customersService, paymentsService });
    holder.financeService = finance.customerFinanceService;
    return { organizationId, customerId, actor, ledgers, accounts, financeService: holder.financeService };
  }

  it('rolls back all loan effects when account posting fails', async ({ skip }) => {
    if (!ready) skip('Mongo replica set rs0 PRIMARY is required');
    const f = build(); const account = await f.accounts.accountsService.createAccount(f.organizationId, { name: 'Cash rollback', accountType: 'cash' }, f.actor);
    const original = f.accounts.accountsService.postAccountMovement;
    f.accounts.accountsService.postAccountMovement = async () => { throw new Error('forced account failure'); };
    await expect(f.financeService.createLoan(f.organizationId, { customerId: f.customerId, disbursementAccountId: account.id, principal: { amount: '100.00' }, businessDate: '2026-09-24' }, f.actor, 'rollback')).rejects.toThrow('forced account failure');
    f.accounts.accountsService.postAccountMovement = original;
    expect(await CustomerLoanModel.countDocuments({ organizationId: f.organizationId })).toBe(0);
    expect(await LedgerEffectModel.countDocuments({ organizationId: f.organizationId })).toBe(0);
    expect(await AccountMovementModel.countDocuments({ organizationId: f.organizationId })).toBe(0);
  });

  it('serializes competing repayments so total repayment cannot exceed outstanding', async ({ skip }) => {
    if (!ready) skip('Mongo replica set rs0 PRIMARY is required');
    const f = build(); const account = await f.accounts.accountsService.createAccount(f.organizationId, { name: 'Bank concurrency', accountType: 'bank', bankName: 'HBL' }, f.actor);
    const loan = (await f.financeService.createLoan(f.organizationId, { customerId: f.customerId, disbursementAccountId: account.id, principal: { amount: '100.00' }, businessDate: '2026-09-24' }, f.actor, 'loan')).data;
    const body = { accountId: account.id, amount: { amount: '70.00' }, businessDate: '2026-09-24' };
    const results = await Promise.allSettled([f.financeService.repayLoan(f.organizationId, loan.id, body, f.actor, 'repay-a'), f.financeService.repayLoan(f.organizationId, loan.id, body, f.actor, 'repay-b')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await f.financeService.getLoan(f.organizationId, loan.id)).outstanding.amount).toBe('30.00');
    expect(await CustomerLoanRepaymentModel.countDocuments({ organizationId: f.organizationId, loanId: loan.id, status: 'posted' })).toBe(1);
  });
});
