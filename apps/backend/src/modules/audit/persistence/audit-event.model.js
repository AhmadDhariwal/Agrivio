const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
      set(value) {
        if (value === undefined || value === null || value === '') {
          return undefined;
        }
        if (!mongoose.isValidObjectId(value)) {
          return undefined;
        }
        return value;
      },
    },
    actorId: { type: String, required: true },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String },
    reason: { type: String },
    requestId: { type: String },
    metadata: { type: mongoose.Schema.Types.Mixed },
    occurredAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: false, collection: 'audit_events' },
);

auditEventSchema.index({ organizationId: 1, occurredAt: -1 });
auditEventSchema.index({ organizationId: 1, actorId: 1, occurredAt: -1 });
auditEventSchema.index({ organizationId: 1, resourceType: 1, resourceId: 1 });
auditEventSchema.index({ occurredAt: -1 });

const AuditEventModel =
  mongoose.models['AuditEvent'] || mongoose.model('AuditEvent', auditEventSchema);

function toQueryDoc(doc) {
  if (doc === null || doc === undefined) {
    return null;
  }
  return {
    _id: String(doc._id),
    organizationId:
      doc.organizationId === undefined || doc.organizationId === null
        ? null
        : String(doc.organizationId),
    actorId: doc.actorId,
    action: doc.action,
    resourceType: doc.resourceType,
    resourceId: doc.resourceId,
    reason: doc.reason,
    requestId: doc.requestId,
    metadata: doc.metadata,
    occurredAt: doc.occurredAt instanceof Date ? doc.occurredAt : new Date(doc.occurredAt),
  };
}

function createMongooseAuditEventStore() {
  return {
    async append(session, event) {
      const doc = { ...event };
      if (
        doc.organizationId !== undefined &&
        doc.organizationId !== null &&
        !mongoose.isValidObjectId(doc.organizationId)
      ) {
        doc.organizationId = undefined;
      }
      await AuditEventModel.create([doc], session ? { session } : undefined);
    },

    async query(filter) {
      const query = {};
      if (filter.organizationId !== undefined) {
        query.organizationId = filter.organizationId;
      }
      if (filter.actorId !== undefined) {
        query.actorId = filter.actorId;
      }
      if (filter.action !== undefined) {
        query.action = filter.action;
      }
      if (filter.resourceType !== undefined) {
        query.resourceType = filter.resourceType;
      }
      if (filter.resourceId !== undefined) {
        query.resourceId = filter.resourceId;
      }
      if (filter.reason !== undefined) {
        query.reason = { $regex: String(filter.reason).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      }
      if (filter.from !== undefined || filter.to !== undefined) {
        query.occurredAt = {};
        if (filter.from !== undefined) {
          query.occurredAt.$gte = filter.from;
        }
        if (filter.to !== undefined) {
          query.occurredAt.$lte = filter.to;
        }
      }
      const rows = await AuditEventModel.find(query).sort({ occurredAt: -1, _id: -1 }).lean().exec();
      return rows.map(toQueryDoc);
    },

    async queryPage(filter, pagination = {}) {
      const query = {};
      for (const field of ['organizationId', 'actorId', 'action', 'resourceType', 'resourceId']) if (filter[field] !== undefined) query[field] = filter[field];
      if (filter.reason !== undefined) query.reason = { $regex: String(filter.reason).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      if (filter.from !== undefined || filter.to !== undefined) {
        query.occurredAt = {};
        if (filter.from !== undefined) query.occurredAt.$gte = filter.from;
        if (filter.to !== undefined) query.occurredAt.$lte = filter.to;
      }
      const [total, rows] = await Promise.all([
        AuditEventModel.countDocuments(query).exec(),
        AuditEventModel.find(query).sort({ occurredAt: -1, _id: -1 }).skip(pagination.skip ?? 0).limit(pagination.pageSize ?? 25).lean().exec(),
      ]);
      return { items: rows.map(toQueryDoc), total };
    },

    async distinctValues(filter, field, options = {}) {
      const organizationId = mongoose.isValidObjectId(filter.organizationId)
        ? new mongoose.Types.ObjectId(filter.organizationId)
        : filter.organizationId;
      const valueMatch = { $type: 'string', $ne: '' };
      if (options.search) {
        valueMatch.$regex = String(options.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        valueMatch.$options = 'i';
      }
      const match = { organizationId, [field]: valueMatch };
      if (filter.from !== undefined) {
        match.occurredAt = { $gte: filter.from };
      }
      const rows = await AuditEventModel.aggregate([
        { $match: match },
        { $group: { _id: `$${field}` } },
        { $sort: { _id: 1 } },
        { $limit: options.limit ?? 20 },
      ]).exec();
      return rows.map((row) => row._id);
    },

    async findById(id) {
      if (!mongoose.isValidObjectId(id)) {
        return null;
      }
      const doc = await AuditEventModel.findById(id).lean().exec();
      return toQueryDoc(doc);
    },
  };
}

module.exports = {
  AuditEventModel,
  createMongooseAuditEventStore,
};
