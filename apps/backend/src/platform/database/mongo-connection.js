const mongoose = require('mongoose');
const {
  assertMongoConnectionContract,
  diagnoseMongoStartupFailure,
  assertConnectedReplicaSetReady,
} = require('./mongo-startup-diagnostics');

function createMongooseDatabaseLifecycle() {
  return {
    async connect(config) {
      if (config === undefined) {
        throw new Error('MongoDB configuration is required to connect');
      }

      const contract = assertMongoConnectionContract(config);
      if (!contract.ok) {
        const error = new Error(contract.message);
        error.code = contract.code;
        throw error;
      }

      if (mongoose.connection.readyState !== 0) {
        await assertConnectedReplicaSetReady(config);
        return;
      }

      try {
        await mongoose.connect(config.mongodbUri, {
          dbName: config.mongodbDbName,
          serverSelectionTimeoutMS: 10_000,
        });
        await assertConnectedReplicaSetReady(config);
      } catch (error) {
        if (mongoose.connection.readyState !== 0) {
          await mongoose.disconnect().catch(() => undefined);
        }

        if (error && typeof error === 'object' && error.code) {
          throw error;
        }

        const diagnosis = await diagnoseMongoStartupFailure(config, error);
        const wrapped = new Error(diagnosis.message);
        wrapped.code = diagnosis.code;
        wrapped.cause = error;
        throw wrapped;
      }
    },

    async disconnect() {
      if (mongoose.connection.readyState === 0) {
        return;
      }

      await mongoose.disconnect();
    },

    async isReady() {
      if (mongoose.connection.readyState !== 1) {
        return false;
      }

      try {
        if (mongoose.connection.db === undefined) {
          return false;
        }
        await mongoose.connection.db.admin().command({ ping: 1 });
        return true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * In-memory lifecycle adapter for unit tests.
 */
function createMockDatabaseLifecycle(options = {}) {
  let connected = false;
  const ready = options.ready ?? true;

  return {
    async connect() {
      connected = true;
    },
    async disconnect() {
      connected = false;
    },
    async isReady() {
      return connected && ready;
    },
  };
}

module.exports = {
  createMongooseDatabaseLifecycle,
  createMockDatabaseLifecycle,
  mongoose,
};
