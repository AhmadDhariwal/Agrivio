const mongoose = require('mongoose');
const { LedgerEffectModel, CustomerFinancialVersionModel } = require('./persistence/ledger-effect.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) {
  return session ? { session } : {};
}

function isDuplicateKeyError(error) {
  return error && (error.code === 11000 || error.code === 11001);
}

function sumMinorUnits(records) {
  let total = 0n;
  for (const record of records) {
    total += BigInt(String(record.signedAmountMinorUnits ?? '0'));
  }
  return total.toString();
}

function createMongooseLedgersStore() {
  return {
    async bumpCustomerFinancialVersion(session, organizationId, customerId) {
      try {
        await CustomerFinancialVersionModel.findOneAndUpdate(
          { organizationId, customerId },
          { $inc: { version: 1 } },
          { upsert: true, new: true, ...withSession(session) },
        ).exec();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.hasErrorLabel = (label) => label === 'TransientTransactionError';
        }
        throw error;
      }
    },
    async insertLedgerEffect(session, doc) {
      try {
        const [created] = await LedgerEffectModel.create([doc], withSession(session));
        return created.toObject();
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          error.agrivioDuplicate = true;
        }
        throw error;
      }
    },

    async listEffectsByCustomer(organizationId, customerId) {
      if (!mongoose.isValidObjectId(customerId)) {
        return [];
      }
      return LedgerEffectModel.find({
        organizationId,
        customerId,
        status: 'posted',
      })
        .sort({ postedAt: -1 })
        .lean()
        .exec();
    },

    async listEffectsBySupplier(organizationId, supplierId) {
      if (!mongoose.isValidObjectId(supplierId)) {
        return [];
      }
      return LedgerEffectModel.find({
        organizationId,
        supplierId,
        status: 'posted',
      })
        .sort({ postedAt: -1 })
        .lean()
        .exec();
    },

    async listEffectsBySource(organizationId, sourceType, sourceId, session) {
      if (sourceId && !mongoose.isValidObjectId(sourceId)) {
        return [];
      }
      const query = LedgerEffectModel.find({
        organizationId,
        sourceType,
        sourceId,
        status: 'posted',
      }).sort({ postedAt: -1 });
      if (session) {
        query.session(session);
      }
      return query.lean().exec();
    },

    async sumPostedEffects(organizationId, filter, session) {
      const query = { organizationId, status: 'posted', ...filter };
      const find = LedgerEffectModel.find(query).select('signedAmountMinorUnits');
      if (session) {
        find.session(session);
      }
      return sumMinorUnits(await find.lean().exec());
    },

    async listLoanBalances(organizationId, customerId, session) {
      const query = {
        organizationId,
        partyType: 'customer',
        effectKind: 'loan_receivable',
        status: 'posted',
        loanId: { $ne: null },
      };
      if (customerId) query.customerId = customerId;
      const find = LedgerEffectModel.find(query).select('loanId signedAmountMinorUnits');
      if (session) find.session(session);
      const records = await find.lean().exec();
      const totals = new Map();
      for (const record of records) {
        const loanId = String(record.loanId);
        totals.set(loanId, (totals.get(loanId) ?? 0n) + BigInt(String(record.signedAmountMinorUnits)));
      }
      return totals;
    },

    async listLoanRepaymentTotals(organizationId, customerId, session) {
      const query = {
        organizationId,
        partyType: 'customer',
        effectKind: 'loan_receivable',
        status: 'posted',
        loanId: { $ne: null },
        sourceType: { $in: ['customer_loan_repayment', 'customer_loan_repayment_reversal'] },
      };
      if (customerId) query.customerId = customerId;
      const find = LedgerEffectModel.find(query).select('loanId signedAmountMinorUnits');
      if (session) find.session(session);
      const records = await find.lean().exec();
      const totals = new Map();
      for (const record of records) {
        const loanId = String(record.loanId);
        totals.set(loanId, (totals.get(loanId) ?? 0n) - BigInt(String(record.signedAmountMinorUnits)));
      }
      return totals;
    },

    async listPartyBalancesByEffectKind(organizationId, partyType, effectKind) {
      const partyField = partyType === 'customer' ? 'customerId' : 'supplierId';
      const query = {
        organizationId,
        partyType,
        effectKind,
        status: 'posted',
      };
      const records = await LedgerEffectModel.find(query)
        .select({ [partyField]: 1, signedAmountMinorUnits: 1 })
        .lean()
        .exec();
      const totals = new Map();
      for (const record of records) {
        const partyId = record[partyField] ? String(record[partyField]) : null;
        if (!partyId) {
          continue;
        }
        const current = totals.get(partyId) ?? 0n;
        totals.set(partyId, current + BigInt(String(record.signedAmountMinorUnits ?? '0')));
      }
      return [...totals.entries()].map(([partyId, signedAmountMinorUnits]) => ({
        partyId,
        signedAmountMinorUnits: signedAmountMinorUnits.toString(),
      }));
    },

    async countPostedOpenings(organizationId, partyType) {
      const sourceTypes =
        partyType === 'customer'
          ? ['customer_opening_receivable', 'customer_opening_advance']
          : ['supplier_opening_payable', 'supplier_opening_advance'];
      return LedgerEffectModel.countDocuments({
        organizationId,
        status: 'posted',
        sourceType: { $in: sourceTypes },
      }).exec();
    },

    async appendAuditEvent(session, event) {
      await AuditEventModel.create([event], withSession(session));
    },
  };
}

function createInMemoryLedgersStore() {
  const effects = new Map();
  const audits = [];
  let seq = 1;

  function matchesFilter(record, filter) {
    for (const [key, value] of Object.entries(filter)) {
      if (String(record[key] ?? '') !== String(value)) {
        return false;
      }
    }
    return true;
  }

  return {
    async bumpCustomerFinancialVersion() { return undefined; },
    async insertLedgerEffect(_session, doc) {
      for (const existing of effects.values()) {
        if (
          String(existing.organizationId) === String(doc.organizationId) &&
          existing.sourceType === doc.sourceType &&
          String(existing.sourceId) === String(doc.sourceId) &&
          existing.status === 'posted'
        ) {
          const error = new Error('Duplicate opening ledger effect');
          error.agrivioDuplicate = true;
          throw error;
        }
      }
      const id = `ledger-effect-${seq++}`;
      const record = { _id: id, ...doc };
      effects.set(id, record);
      return { ...record };
    },

    async listEffectsByCustomer(organizationId, customerId) {
      return [...effects.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            String(item.customerId) === String(customerId) &&
            item.status === 'posted',
        )
        .map((item) => ({ ...item }))
        .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
    },

    async listEffectsBySupplier(organizationId, supplierId) {
      return [...effects.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            String(item.supplierId) === String(supplierId) &&
            item.status === 'posted',
        )
        .map((item) => ({ ...item }))
        .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
    },

    async listEffectsBySource(organizationId, sourceType, sourceId) {
      return [...effects.values()]
        .filter(
          (item) =>
            String(item.organizationId) === String(organizationId) &&
            String(item.sourceType) === String(sourceType) &&
            String(item.sourceId) === String(sourceId) &&
            item.status === 'posted',
        )
        .map((item) => ({ ...item }))
        .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
    },

    async sumPostedEffects(organizationId, filter) {
      const records = [...effects.values()].filter(
        (item) =>
          String(item.organizationId) === String(organizationId) &&
          item.status === 'posted' &&
          matchesFilter(item, filter),
      );
      return sumMinorUnits(records);
    },

    async listLoanBalances(organizationId, customerId) {
      const totals = new Map();
      for (const item of effects.values()) {
        if (
          String(item.organizationId) !== String(organizationId) ||
          item.partyType !== 'customer' ||
          item.effectKind !== 'loan_receivable' ||
          item.status !== 'posted' ||
          !item.loanId ||
          (customerId && String(item.customerId) !== String(customerId))
        ) continue;
        const loanId = String(item.loanId);
        totals.set(loanId, (totals.get(loanId) ?? 0n) + BigInt(String(item.signedAmountMinorUnits)));
      }
      return totals;
    },

    async listLoanRepaymentTotals(organizationId, customerId) {
      const totals = new Map();
      for (const item of effects.values()) {
        if (
          String(item.organizationId) !== String(organizationId) ||
          item.effectKind !== 'loan_receivable' ||
          !['customer_loan_repayment', 'customer_loan_repayment_reversal'].includes(item.sourceType) ||
          !item.loanId ||
          (customerId && String(item.customerId) !== String(customerId))
        ) continue;
        const loanId = String(item.loanId);
        totals.set(loanId, (totals.get(loanId) ?? 0n) - BigInt(String(item.signedAmountMinorUnits)));
      }
      return totals;
    },

    async listPartyBalancesByEffectKind(organizationId, partyType, effectKind) {
      const partyField = partyType === 'customer' ? 'customerId' : 'supplierId';
      const totals = new Map();
      for (const item of effects.values()) {
        if (String(item.organizationId) !== String(organizationId)) {
          continue;
        }
        if (item.status !== 'posted') {
          continue;
        }
        if (item.partyType !== partyType || item.effectKind !== effectKind) {
          continue;
        }
        const partyId = item[partyField] ? String(item[partyField]) : null;
        if (!partyId) {
          continue;
        }
        const current = totals.get(partyId) ?? 0n;
        totals.set(partyId, current + BigInt(String(item.signedAmountMinorUnits ?? '0')));
      }
      return [...totals.entries()].map(([partyId, signedAmountMinorUnits]) => ({
        partyId,
        signedAmountMinorUnits: signedAmountMinorUnits.toString(),
      }));
    },

    async countPostedOpenings(organizationId, partyType) {
      const sourceTypes =
        partyType === 'customer'
          ? ['customer_opening_receivable', 'customer_opening_advance']
          : ['supplier_opening_payable', 'supplier_opening_advance'];
      return [...effects.values()].filter(
        (item) =>
          String(item.organizationId) === String(organizationId) &&
          item.status === 'posted' &&
          sourceTypes.includes(item.sourceType),
      ).length;
    },

    async appendAuditEvent(_session, event) {
      audits.push({ ...event });
    },

    listAuditsForTest() {
      return [...audits];
    },

    listEffectsForTest() {
      return [...effects.values()].map((item) => ({ ...item }));
    },
  };
}

module.exports = {
  createMongooseLedgersStore,
  createInMemoryLedgersStore,
};
