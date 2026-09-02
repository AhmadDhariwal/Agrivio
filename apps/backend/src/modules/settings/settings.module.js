const {
  createMockTransactionSessionPort,
  createTransactionRunner,
} = require('../../platform/transactions/transaction-runner');
const { createAuditWriter } = require('../../platform/audit/audit-writer');
const { assertOptimisticVersion } = require('../../platform/validation/request-validation');
const { parseSettingsPatch, toSettingsDto } = require('./settings.validation');
const {
  createInMemorySettingsStore,
  createMongooseSettingsStore,
} = require('./settings.store');

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

function createSettingsService(deps) {
  const store = deps.store;
  const capabilityService = deps.capabilityService;
  const auditWriter = createAuditWriter({
    append: (session, event) => store.appendAuditEvent(session, event),
  });
  const transactionRunner = deps.transactionRunner;

  async function ensureSettings(organizationId, session) {
    const existing = await store.findByOrganizationId(organizationId);
    if (existing !== null) {
      return existing;
    }
    return store.insert(session, {
      organizationId,
      tradingName: '',
      contactPhone: '',
      contactEmail: '',
      addressLine: '',
      documentFooterNote: '',
      version: 1,
    });
  }

  return {
    async getSettings(organizationId) {
      const record = await ensureSettings(organizationId, null);
      return toSettingsDto(record);
    },

    async updateSettings(organizationId, body, actor) {
      const { expectedVersion, patch } = parseSettingsPatch(body);

      return transactionRunner.run(async (session) => {
        const current = await ensureSettings(organizationId, session);
        assertOptimisticVersion(current, expectedVersion);
        if (typeof capabilityService?.assertSettingsPatchAllowed === 'function') {
          await capabilityService.assertSettingsPatchAllowed(organizationId, current, patch);
        }

        const updated = await store.update(session, String(current['_id']), {
          ...patch,
          version: Number(current['version']) + 1,
        });

        await auditWriter.appendBusinessEvent(session, {
          organizationId,
          actorId: actor.actorId,
          action: 'organization_settings.updated',
          resourceType: 'organization_settings',
          resourceId: String(updated['_id']),
          metadata: { fields: Object.keys(patch) },
        });

        return toSettingsDto(updated);
      });
    },
  };
}

function createSettingsModule(options) {
  const persistence = options.persistence ?? 'memory';
  const store =
    options.store ??
    (persistence === 'mongoose' ? createMongooseSettingsStore() : createInMemorySettingsStore());

  const sessionPort =
    options.sessionPort ??
    (persistence === 'mongoose'
      ? createMongooseTransactionSessionPort()
      : createMockTransactionSessionPort().port);

  const transactionRunner = options.transactionRunner ?? createTransactionRunner(sessionPort);
  const settingsService = createSettingsService({
    store,
    transactionRunner,
    ...(options.capabilityService === undefined
      ? {}
      : { capabilityService: options.capabilityService }),
  });

  return {
    store,
    settingsService,
  };
}

module.exports = {
  createSettingsService,
  createSettingsModule,
  createInMemorySettingsStore,
  createMongooseSettingsStore,
};
