// @ts-check
const mongoose = require('mongoose');
/**
 * @typedef {import('../config/runtime-config').ApiEnv} ApiEnv
 * @typedef {{
 *   connect: (config?: ApiEnv) => Promise<void>;
 *   disconnect: () => Promise<void>;
 *   isReady: () => Promise<boolean>;
 * }} MongoDatabaseLifecycle
 */

/**
 * @returns {MongoDatabaseLifecycle}
 */
function createMongooseDatabaseLifecycle() {
  return {
    async connect(config) {
      if (config === undefined) {
        throw new Error('MongoDB configuration is required to connect');
      }
      if (mongoose.connection.readyState !== 0) {
        return;
      }

      await mongoose.connect(config.mongodbUri, {
        dbName: config.mongodbDbName,
        serverSelectionTimeoutMS: 10_000,
      });
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
 * @param {{ ready?: boolean }} [options]
 * @returns {MongoDatabaseLifecycle}
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
