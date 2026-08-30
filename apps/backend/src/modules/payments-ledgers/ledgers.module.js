const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { conflict, validationFailed } = require('../../platform/errors/app-error');
const {
  formatMoneyMinorUnits,
} = require('../../platform/primitives/money-and-time');
const {
  createInMemoryLedgersStore,
  createMongooseLedgersStore,
} = require('./ledgers.store');

function createMongooseTransactionSessionPort() {
  const mongoose = require('mongoose');
  return {
    async startSession() {
      return mongoose.startSession();
    },
    async withTransaction(session, work) {
      return session.withTransaction(async () => work(session));
    },
    async endSession(session) {
      await session.endSession();
    },
  };
}

function mapDuplicate(error, message) {
  if (error && error.agrivioDuplicate === true) {
    throw conflict(message);
  }
  throw error;
}

function toMoneyDto(amountMinorUnits) {
  return {
    amount: formatMoneyMinorUnits(BigInt(String(amountMinorUnits ?? '0'))),
    currency: 'PKR',
  };
}

function toLedgerEffectDto(record) {
  return {
    id: String(record['_id']),
    organizationId: String(record['organizationId']),
    partyType: String(record['partyType']),
    customerId: record['customerId'] ? String(record['customerId']) : null,
    supplierId: record['supplierId'] ? String(record['supplierId']) : null,
    effectKind: String(record['effectKind']),
    signedAmount: toMoneyDto(record['signedAmountMinorUnits']),
    currency: String(record['currency'] ?? 'PKR'),
    sourceType: String(record['sourceType']),
    sourceId: String(record['sourceId']),
    status: String(record['status']),
    postedAt:
      record['postedAt'] instanceof Date
        ? record['postedAt'].toISOString()
        : String(record['postedAt']),
    postedBy: String(record['postedBy']),
  };
}

function createLedgersService(deps) {
  const store = deps.store;

  return {
    // Public Payments and Ledgers interface for signed party effects.
    async postLedgerEffect(session, input) {
      const partyType = input.partyType;
      if (partyType !== 'customer' && partyType !== 'supplier') {
        throw validationFailed('partyType must be customer or supplier', [
          { field: 'partyType', message: 'partyType must be customer or supplier' },
        ]);
      }
      if (partyType === 'customer' && !input.customerId) {
        throw validationFailed('customerId is required for customer ledger effects', [
          { field: 'customerId', message: 'customerId is required' },
        ]);
      }
      if (partyType === 'supplier' && !input.supplierId) {
        throw validationFailed('supplierId is required for supplier ledger effects', [
          { field: 'supplierId', message: 'supplierId is required' },
        ]);
      }

      try {
        const created = await store.insertLedgerEffect(session, {
          organizationId: input.organizationId,
          partyType,
          customerId: partyType === 'customer' ? input.customerId : null,
          supplierId: partyType === 'supplier' ? input.supplierId : null,
          effectKind: input.effectKind,
          signedAmountMinorUnits: String(input.signedAmountMinorUnits),
          currency: input.currency ?? 'PKR',
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          reversalOfId: input.reversalOfId ?? null,
          status: 'posted',
          postedAt: input.postedAt,
          postedBy: input.postedBy,
        });
        return created;
      } catch (error) {
        mapDuplicate(error, 'Opening ledger effect already exists for this party');
      }
    },

    async listCustomerEffects(organizationId, customerId) {
      const items = await store.listEffectsByCustomer(organizationId, customerId);
      return { items: items.map(toLedgerEffectDto) };
    },

    async listSupplierEffects(organizationId, supplierId) {
      const items = await store.listEffectsBySupplier(organizationId, supplierId);
      return { items: items.map(toLedgerEffectDto) };
    },

    async listEffectsBySource(organizationId, sourceType, sourceId, session) {
      const items = await store.listEffectsBySource(
        organizationId,
        sourceType,
        sourceId,
        session,
      );
      return items.map((item) => ({
        id: String(item['_id']),
        partyType: String(item.partyType),
        customerId: item.customerId ? String(item.customerId) : null,
        supplierId: item.supplierId ? String(item.supplierId) : null,
        effectKind: String(item.effectKind),
        signedAmountMinorUnits: String(item.signedAmountMinorUnits),
        currency: String(item.currency ?? 'PKR'),
        sourceType: String(item.sourceType),
        sourceId: String(item.sourceId),
        reversalOfId: item.reversalOfId ? String(item.reversalOfId) : null,
      }));
    },

    async sumCustomerReceivable(organizationId, customerId) {
      const minor = await store.sumPostedEffects(organizationId, {
        customerId,
        effectKind: 'receivable',
      });
      return toMoneyDto(minor);
    },

    async sumCustomerAdvance(organizationId, customerId) {
      const minor = await store.sumPostedEffects(organizationId, {
        customerId,
        effectKind: 'advance',
      });
      return toMoneyDto(minor);
    },

    async sumSupplierPayable(organizationId, supplierId) {
      const minor = await store.sumPostedEffects(organizationId, {
        supplierId,
        effectKind: 'payable',
      });
      return toMoneyDto(minor);
    },

    async sumSupplierAdvance(organizationId, supplierId) {
      const minor = await store.sumPostedEffects(organizationId, {
        supplierId,
        effectKind: 'supplier_advance',
      });
      return toMoneyDto(minor);
    },

    async mapPartyBalances(organizationId, partyType, effectKind) {
      const rows = await store.listPartyBalancesByEffectKind(
        organizationId,
        partyType,
        effectKind,
      );
      const map = new Map();
      for (const row of rows) {
        map.set(String(row.partyId), toMoneyDto(row.signedAmountMinorUnits));
      }
      return map;
    },

    async listCustomerReceivableBalances(organizationId) {
      const rows = await store.listPartyBalancesByEffectKind(
        organizationId,
        'customer',
        'receivable',
      );
      return {
        items: rows
          .map((row) => ({
            customerId: row.partyId,
            receivable: toMoneyDto(row.signedAmountMinorUnits),
            receivableMinorUnits: String(row.signedAmountMinorUnits),
          }))
          .filter((row) => BigInt(row.receivableMinorUnits) > 0n),
      };
    },

    async listSupplierPayableBalances(organizationId) {
      const rows = await store.listPartyBalancesByEffectKind(
        organizationId,
        'supplier',
        'payable',
      );
      return {
        items: rows
          .map((row) => ({
            supplierId: row.partyId,
            payable: toMoneyDto(row.signedAmountMinorUnits),
            payableMinorUnits: String(row.signedAmountMinorUnits),
          }))
          .filter((row) => BigInt(row.payableMinorUnits) > 0n),
      };
    },

    async countCustomerOpenings(organizationId) {
      return store.countPostedOpenings(organizationId, 'customer');
    },

    async countSupplierOpenings(organizationId) {
      return store.countPostedOpenings(organizationId, 'supplier');
    },

    toLedgerEffectDto,
  };
}

function createLedgersModule(options = {}) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseLedgersStore() : createInMemoryLedgersStore());

  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);

  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const ledgersService = createLedgersService({ store, transactionRunner });

  const {
    createInMemoryPaymentsStore,
    createMongoosePaymentsStore,
  } = require('./payments.store');
  const { createPaymentsService } = require('./payments.service');

  const paymentsStore =
    options.paymentsStore ??
    (persistence === 'mongoose' ? createMongoosePaymentsStore() : createInMemoryPaymentsStore());

  const paymentsService =
    options.paymentsService ??
    (options.accountsService && options.suppliersService
      ? createPaymentsService({
          store: paymentsStore,
          ledgersService,
          accountsService: options.accountsService,
          suppliersService: options.suppliersService,
          capabilityService: options.capabilityService,
          listUnpaidSupplierPurchases: options.listUnpaidSupplierPurchases,
          transactionRunner,
          persistence,
          ...(options.now === undefined ? {} : { now: options.now }),
        })
      : null);

  return {
    store,
    paymentsStore,
    ledgersService,
    paymentsService,
    transactionRunner,
    createPaymentsService(deps) {
      return createPaymentsService({
        store: paymentsStore,
        ledgersService,
        transactionRunner,
        persistence,
        ...(options.now === undefined ? {} : { now: options.now }),
        ...deps,
      });
    },
  };
}

module.exports = {
  createLedgersService,
  createLedgersModule,
  createInMemoryLedgersStore,
  createMongooseLedgersStore,
  toLedgerEffectDto,
};
