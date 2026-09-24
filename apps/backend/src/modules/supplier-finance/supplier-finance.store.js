const mongoose = require('mongoose');
const { SupplierRefundModel, SupplierBalanceAdjustmentModel } = require('./persistence/supplier-finance.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function withSession(session) { return session ? { session } : {}; }
function querySession(query, session) { if (session) query.session(session); return query; }

function createMongooseSupplierFinanceStore() {
  return {
    allocateId() { return new mongoose.Types.ObjectId(); },
    async insertRefund(session, doc) { const [row] = await SupplierRefundModel.create([doc], withSession(session)); return row.toObject(); },
    async findRefund(organizationId, id, session) { if (!mongoose.isValidObjectId(id)) return null; return querySession(SupplierRefundModel.findOne({ _id: id, organizationId }), session).lean().exec(); },
    async updateRefund(session, organizationId, id, filter, patch) { return SupplierRefundModel.findOneAndUpdate({ _id: id, organizationId, ...filter }, { $set: patch }, { new: true, ...withSession(session) }).lean().exec(); },
    async listRefunds(organizationId, filter, pagination) {
      const query = { organizationId };
      if (filter.supplierId) { if (!mongoose.isValidObjectId(filter.supplierId)) return { items: [], total: 0 }; query.supplierId = filter.supplierId; }
      if (filter.status) query.status = filter.status;
      if (filter.fromDate || filter.toDate) { query.businessDate = {}; if (filter.fromDate) query.businessDate.$gte = filter.fromDate; if (filter.toDate) query.businessDate.$lte = filter.toDate; }
      const [items, total] = await Promise.all([SupplierRefundModel.find(query).sort({ businessDate: -1, _id: -1 }).skip(pagination.skip).limit(pagination.pageSize).lean(), SupplierRefundModel.countDocuments(query)]);
      return { items, total };
    },
    async insertAdjustment(session, doc) { const [row] = await SupplierBalanceAdjustmentModel.create([doc], withSession(session)); return row.toObject(); },
    async findAdjustment(organizationId, id, session) { if (!mongoose.isValidObjectId(id)) return null; return querySession(SupplierBalanceAdjustmentModel.findOne({ _id: id, organizationId }), session).lean().exec(); },
    async findAdjustmentReversal(organizationId, id, session) { if (!mongoose.isValidObjectId(id)) return null; return querySession(SupplierBalanceAdjustmentModel.findOne({ organizationId, reversalOfId: id }), session).lean().exec(); },
    async listPayableAdjustments(organizationId, supplierId, session) { return querySession(SupplierBalanceAdjustmentModel.find({ organizationId, supplierId, balanceType: 'supplier_payable' }).select('targetEffects deltaMinorUnits businessDate reference createdAt reversalOfId'), session).lean().exec(); },
    async appendAuditEvent(session, event) { await AuditEventModel.create([event], withSession(session)); },
  };
}

function createInMemorySupplierFinanceStore() {
  const refunds = new Map(); const adjustments = new Map(); const audits = []; let seq = 1;
  const allocateId = () => `supplier-finance-${seq++}`;
  const own = (map, org, id) => { const row = map.get(String(id)); return row && String(row.organizationId) === String(org) ? { ...row } : null; };
  return {
    allocateId,
    async insertRefund(_s, doc) { const row = { ...doc, _id: doc._id ?? allocateId(), createdAt: new Date() }; refunds.set(String(row._id), row); return { ...row }; },
    async findRefund(org, id) { return own(refunds, org, id); },
    async updateRefund(_s, org, id, filter, patch) { const row = own(refunds, org, id); if (!row || Object.entries(filter).some(([k, v]) => String(row[k]) !== String(v))) return null; const next = { ...row, ...patch }; refunds.set(String(id), next); return { ...next }; },
    async listRefunds(org, filter, pagination) { let rows = [...refunds.values()].filter((r) => String(r.organizationId) === String(org)); if (filter.supplierId) rows = rows.filter((r) => String(r.supplierId) === String(filter.supplierId)); if (filter.status) rows = rows.filter((r) => r.status === filter.status); if (filter.fromDate) rows = rows.filter((r) => r.businessDate >= filter.fromDate); if (filter.toDate) rows = rows.filter((r) => r.businessDate <= filter.toDate); rows.sort((a, b) => String(b.businessDate).localeCompare(String(a.businessDate))); return { items: rows.slice(pagination.skip, pagination.skip + pagination.pageSize).map((r) => ({ ...r })), total: rows.length }; },
    async insertAdjustment(_s, doc) { const row = { ...doc, _id: doc._id ?? allocateId(), createdAt: new Date() }; if (row.reversalOfId && [...adjustments.values()].some((r) => String(r.organizationId) === String(row.organizationId) && String(r.reversalOfId) === String(row.reversalOfId))) { const error = new Error('duplicate'); error.code = 11000; throw error; } adjustments.set(String(row._id), row); return { ...row }; },
    async findAdjustment(org, id) { return own(adjustments, org, id); },
    async findAdjustmentReversal(org, id) { const row = [...adjustments.values()].find((r) => String(r.organizationId) === String(org) && String(r.reversalOfId) === String(id)); return row ? { ...row } : null; },
    async listPayableAdjustments(org, supplierId) { return [...adjustments.values()].filter((r) => String(r.organizationId) === String(org) && String(r.supplierId) === String(supplierId) && r.balanceType === 'supplier_payable').map((r) => ({ ...r, targetEffects: r.targetEffects.map((e) => ({ ...e })) })); },
    async appendAuditEvent(_s, event) { audits.push({ ...event }); },
    listForTest() { return { refunds: [...refunds.values()], adjustments: [...adjustments.values()], audits }; },
  };
}

module.exports = { createMongooseSupplierFinanceStore, createInMemorySupplierFinanceStore };
