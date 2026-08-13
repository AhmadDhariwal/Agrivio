const mongoose = require('mongoose');
const { LedgerEffectModel } = require('./persistence/ledger-effect.model');
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

    async sumPostedEffects(organizationId, filter) {
      const query = { organizationId, status: 'posted', ...filter };
      const records = await LedgerEffectModel.find(query).select('signedAmountMinorUnits').lean().exec();
      return sumMinorUnits(records);
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
