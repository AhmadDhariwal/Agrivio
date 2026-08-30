const { randomUUID } = require('node:crypto');

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createInMemorySubscriptionStore() {
  const plans = new Map();
  const subscriptions = new Map();
  const billingRecords = new Map();
  const auditEvents = [];

  return {
    async listPlans(filter = {}) {
      let rows = [...plans.values()].map(clone);
      if (filter.status !== undefined) {
        rows = rows.filter((row) => row.status === filter.status);
      }
      if (filter.planCode !== undefined) {
        rows = rows.filter((row) => row.planCode === filter.planCode);
      }
      rows.sort((a, b) => {
        if (a.planCode === b.planCode) {
          return b.planVersion - a.planVersion;
        }
        return String(a.planCode).localeCompare(String(b.planCode));
      });
      return rows;
    },

    async findPlanById(id) {
      const row = plans.get(String(id));
      return row === undefined ? null : clone(row);
    },

    async findPlanByCodeVersion(planCode, planVersion) {
      for (const row of plans.values()) {
        if (row.planCode === planCode && row.planVersion === planVersion) {
          return clone(row);
        }
      }
      return null;
    },

    async findActivePlanByCode(planCode) {
      for (const row of plans.values()) {
        if (row.planCode === planCode && row.status === 'active') {
          return clone(row);
        }
      }
      return null;
    },

    async nextPlanVersion(planCode) {
      let max = 0;
      for (const row of plans.values()) {
        if (row.planCode === planCode && row.planVersion > max) {
          max = row.planVersion;
        }
      }
      return max + 1;
    },

    async insertPlan(_session, doc) {
      const id = String(doc._id ?? randomUUID());
      const record = clone({ ...doc, _id: id });
      plans.set(id, record);
      return clone(record);
    },

    async updatePlan(_session, id, patch) {
      const existing = plans.get(String(id));
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, ...clone(patch) };
      plans.set(String(id), next);
      return clone(next);
    },

    async findSubscriptionById(id) {
      const row = subscriptions.get(String(id));
      return row === undefined ? null : clone(row);
    },

    async findSubscriptionByOrganizationId(organizationId) {
      for (const row of subscriptions.values()) {
        if (String(row.organizationId) === String(organizationId)) {
          return clone(row);
        }
      }
      return null;
    },

    async listSubscriptions() {
      return [...subscriptions.values()].map(clone);
    },

    async insertSubscription(_session, doc) {
      const id = String(doc._id ?? randomUUID());
      const record = clone({ ...doc, _id: id });
      subscriptions.set(id, record);
      return clone(record);
    },

    async updateSubscription(_session, id, patch) {
      const existing = subscriptions.get(String(id));
      if (existing === undefined) {
        return null;
      }
      const next = { ...existing, ...clone(patch) };
      subscriptions.set(String(id), next);
      return clone(next);
    },

    async findBillingRecordById(id) {
      const row = billingRecords.get(String(id));
      return row === undefined ? null : clone(row);
    },

    async listBillingRecords(filter = {}) {
      let rows = [...billingRecords.values()].map(clone);
      if (filter.organizationId !== undefined) {
        rows = rows.filter((row) => String(row.organizationId) === String(filter.organizationId));
      }
      if (filter.status !== undefined) {
        rows = rows.filter((row) => row.status === filter.status);
      }
      if (filter.q !== undefined && String(filter.q).trim() !== '') {
        const needle = String(filter.q).trim().toLowerCase();
        const organizationIdsForSearch = new Set(
          (filter.organizationIdsForSearch ?? []).map(String),
        );
        rows = rows.filter((row) => {
          const haystacks = [
            String(row.organizationId),
            String(row.paymentReferenceNormalized ?? ''),
            String(row.requestedPlanCode ?? ''),
            String(row.notes ?? ''),
          ];
          return (
            organizationIdsForSearch.has(String(row.organizationId)) ||
            haystacks.some((value) => value.toLowerCase().includes(needle))
          );
        });
      }
      rows.sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt)));
      const total = rows.length;
      const offset = Number.isInteger(filter.offset) && filter.offset > 0 ? filter.offset : 0;
      const limit = Number.isInteger(filter.limit) && filter.limit > 0 ? filter.limit : null;
      const items = limit === null ? rows.slice(offset) : rows.slice(offset, offset + limit);
      return { items, total, offset, limit };
    },

    async countBillingByPaymentReference(paymentMethod, paymentReferenceNormalized) {
      let count = 0;
      for (const row of billingRecords.values()) {
        if (
          row.paymentMethod === paymentMethod &&
          row.paymentReferenceNormalized === paymentReferenceNormalized
        ) {
          count += 1;
        }
      }
      return count;
    },

    async insertBillingRecord(_session, doc) {
      const id = String(doc._id ?? randomUUID());
      const record = clone({ ...doc, _id: id });
      billingRecords.set(id, record);
      return clone(record);
    },

    async updateBillingRecord(_session, id, patch, expectedVersion) {
      const existing = billingRecords.get(String(id));
      if (existing === undefined) {
        return null;
      }
      if (expectedVersion !== undefined && Number(existing.version) !== Number(expectedVersion)) {
        return null;
      }
      const next = { ...existing, ...clone(patch) };
      billingRecords.set(String(id), next);
      return clone(next);
    },

    async appendAuditEvent(_session, event) {
      auditEvents.push({ ...event, _immutable: true });
    },

    listAuditEventsForTest() {
      return auditEvents.map((event) => ({ ...event }));
    },
  };
}

module.exports = {
  createInMemorySubscriptionStore,
};
