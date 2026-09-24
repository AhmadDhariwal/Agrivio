const mongoose = require('mongoose');
const {
  CustomerLoanModel,
  CustomerLoanRepaymentModel,
  CustomerBalanceAdjustmentModel,
} = require('./persistence/customer-finance.model');
const { AuditEventModel } = require('../audit/persistence/audit-event.model');

function sessionOptions(session) { return session ? { session } : {}; }
function sessionQuery(query, session) { if (session) query.session(session); return query; }

function createMongooseCustomerFinanceStore() {
  return {
    allocateId() { return new mongoose.Types.ObjectId(); },
    async insertLoan(session, doc) { const [row] = await CustomerLoanModel.create([doc], sessionOptions(session)); return row.toObject(); },
    async findLoan(organizationId, id, session) { if (!mongoose.isValidObjectId(id)) return null; return sessionQuery(CustomerLoanModel.findOne({ _id: id, organizationId }), session).lean().exec(); },
    async updateLoan(session, organizationId, id, filter, patch) { return CustomerLoanModel.findOneAndUpdate({ _id: id, organizationId, ...filter }, { $set: patch }, { new: true, ...sessionOptions(session) }).lean().exec(); },
    async listLoans(organizationId, filter, pagination) {
      if (filter.customerId && !mongoose.isValidObjectId(filter.customerId)) {
        return { total: 0, items: [] };
      }
      const query = { organizationId };
      if (filter.customerId) query.customerId = filter.customerId;
      if (filter.fromDate || filter.toDate) { query.businessDate = {}; if (filter.fromDate) query.businessDate.$gte = filter.fromDate; if (filter.toDate) query.businessDate.$lte = filter.toDate; }
      if (filter.dueDateFrom || filter.dueDateTo) { query.dueDate = {}; if (filter.dueDateFrom) query.dueDate.$gte = filter.dueDateFrom; if (filter.dueDateTo) query.dueDate.$lte = filter.dueDateTo; }
      const search = String(filter.search ?? '').trim();
      if (search) query.$or = [{ reference: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }, { notes: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }];
      const [total, items] = await Promise.all([CustomerLoanModel.countDocuments(query), CustomerLoanModel.find(query).sort({ businessDate: -1, _id: -1 }).skip(pagination.skip).limit(pagination.pageSize).lean()]);
      return { total, items };
    },
    async insertRepayment(session, doc) { const [row] = await CustomerLoanRepaymentModel.create([doc], sessionOptions(session)); return row.toObject(); },
    async findRepayment(organizationId, id, session) { if (!mongoose.isValidObjectId(id)) return null; return sessionQuery(CustomerLoanRepaymentModel.findOne({ _id: id, organizationId }), session).lean().exec(); },
    async updateRepayment(session, organizationId, id, filter, patch) { return CustomerLoanRepaymentModel.findOneAndUpdate({ _id: id, organizationId, ...filter }, { $set: patch }, { new: true, ...sessionOptions(session) }).lean().exec(); },
    async countActiveRepayments(organizationId, loanId, session) { return sessionQuery(CustomerLoanRepaymentModel.countDocuments({ organizationId, loanId, status: 'posted' }), session).exec(); },
    async listRepayments(organizationId, loanId) { return CustomerLoanRepaymentModel.find({ organizationId, loanId }).sort({ createdAt: -1, _id: -1 }).lean().exec(); },
    async insertAdjustment(session, doc) { const [row] = await CustomerBalanceAdjustmentModel.create([doc], sessionOptions(session)); return row.toObject(); },
    async findAdjustment(organizationId, id, session) { if (!mongoose.isValidObjectId(id)) return null; return sessionQuery(CustomerBalanceAdjustmentModel.findOne({ _id: id, organizationId }), session).lean().exec(); },
    async findAdjustmentReversal(organizationId, reversalOfId, session) { if (!mongoose.isValidObjectId(reversalOfId)) return null; return sessionQuery(CustomerBalanceAdjustmentModel.findOne({ organizationId, reversalOfId }), session).lean().exec(); },
    async listCustomerTradeAdjustments(organizationId, customerId) { return CustomerBalanceAdjustmentModel.find({ organizationId, customerId, balanceType: 'trade_receivable' }).select('targetEffects deltaMinorUnits businessDate reference createdAt reversalOfId').lean().exec(); },
    async listAdjustmentsForReporting(organizationId) { return CustomerBalanceAdjustmentModel.find({ organizationId }).sort({ businessDate: -1, createdAt: -1, _id: -1 }).lean().exec(); },
    async appendAuditEvent(session, event) { await AuditEventModel.create([event], sessionOptions(session)); },
  };
}

function createInMemoryCustomerFinanceStore() {
  const loans = new Map(); const repayments = new Map(); const adjustments = new Map(); const audits = []; let seq = 1;
  const allocateId = () => `customer-finance-${seq++}`;
  const own = (map, org, id) => { const row = map.get(String(id)); return row && String(row.organizationId) === String(org) ? { ...row } : null; };
  return {
    allocateId,
    async insertLoan(_s, doc) { const row = { ...doc, _id: doc._id ?? allocateId(), createdAt: new Date() }; loans.set(String(row._id), row); return { ...row }; },
    async findLoan(org, id) { return own(loans, org, id); },
    async updateLoan(_s, org, id, filter, patch) { const row = own(loans, org, id); if (!row || Object.entries(filter).some(([k,v]) => String(row[k]) !== String(v))) return null; const next = { ...row, ...patch }; loans.set(String(id), next); return { ...next }; },
    async listLoans(org, filter, pagination) { let rows = [...loans.values()].filter((r) => String(r.organizationId) === String(org)); if (filter.customerId) rows = rows.filter((r) => String(r.customerId) === String(filter.customerId)); if (filter.fromDate) rows = rows.filter((r) => r.businessDate >= filter.fromDate); if (filter.toDate) rows = rows.filter((r) => r.businessDate <= filter.toDate); if (filter.dueDateFrom) rows = rows.filter((r) => r.dueDate && r.dueDate >= filter.dueDateFrom); if (filter.dueDateTo) rows = rows.filter((r) => r.dueDate && r.dueDate <= filter.dueDateTo); if (filter.search) rows = rows.filter((r) => `${r.reference ?? ''} ${r.notes ?? ''}`.toLowerCase().includes(filter.search.toLowerCase())); rows.sort((a,b) => String(b.businessDate).localeCompare(String(a.businessDate))); return { total: rows.length, items: rows.slice(pagination.skip, pagination.skip + pagination.pageSize).map((r) => ({ ...r })) }; },
    async insertRepayment(_s, doc) { const row = { ...doc, _id: doc._id ?? allocateId(), createdAt: new Date() }; repayments.set(String(row._id), row); return { ...row }; },
    async findRepayment(org, id) { return own(repayments, org, id); },
    async updateRepayment(_s, org, id, filter, patch) { const row = own(repayments, org, id); if (!row || Object.entries(filter).some(([k,v]) => String(row[k]) !== String(v))) return null; const next = { ...row, ...patch }; repayments.set(String(id), next); return { ...next }; },
    async countActiveRepayments(org, loanId) { return [...repayments.values()].filter((r) => String(r.organizationId) === String(org) && String(r.loanId) === String(loanId) && r.status === 'posted').length; },
    async listRepayments(org, loanId) { return [...repayments.values()].filter((r) => String(r.organizationId) === String(org) && String(r.loanId) === String(loanId)).map((r) => ({ ...r })).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))); },
    async insertAdjustment(_s, doc) { const row = { ...doc, _id: doc._id ?? allocateId(), createdAt: new Date() }; if (row.reversalOfId && [...adjustments.values()].some((r) => String(r.organizationId) === String(row.organizationId) && String(r.reversalOfId) === String(row.reversalOfId))) { const e = new Error('duplicate'); e.code = 11000; throw e; } adjustments.set(String(row._id), row); return { ...row }; },
    async findAdjustment(org, id) { return own(adjustments, org, id); },
    async findAdjustmentReversal(org, reversalOfId) { const row = [...adjustments.values()].find((r) => String(r.organizationId) === String(org) && String(r.reversalOfId) === String(reversalOfId)); return row ? { ...row } : null; },
    async listCustomerTradeAdjustments(org, customerId) { return [...adjustments.values()].filter((r) => String(r.organizationId) === String(org) && String(r.customerId) === String(customerId) && r.balanceType === 'trade_receivable').map((r) => ({ ...r, targetEffects: r.targetEffects.map((e) => ({ ...e })) })); },
    async listAdjustmentsForReporting(org) { return [...adjustments.values()].filter((r) => String(r.organizationId) === String(org)).map((r) => ({ ...r })).sort((a, b) => String(b.businessDate).localeCompare(String(a.businessDate))); },
    async appendAuditEvent(_s, event) { audits.push({ ...event }); },
    listForTest() { return { loans: [...loans.values()], repayments: [...repayments.values()], adjustments: [...adjustments.values()], audits }; },
  };
}
module.exports = { createMongooseCustomerFinanceStore, createInMemoryCustomerFinanceStore };
