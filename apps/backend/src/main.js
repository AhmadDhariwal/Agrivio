const { createApp } = require('./app');
const {
  createMongooseDatabaseLifecycle,
  createMockDatabaseLifecycle,
} = require('./platform/database/mongo-connection');
const {
  loadApiEnv,
  redactSecrets,
  toSafeApiEnvSummary,
} = require('./platform/config/runtime-config');
const { createStructuredLogger } = require('./platform/logging/structured-logger');

let server;

let database;

async function shutdown(signal) {
  const logger = createStructuredLogger({ service: 'backend' });
  logger('info', 'shutdown signal received', { signal });

  if (server !== undefined) {
    await new Promise((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve(undefined)));
    });
  }

  if (database !== undefined) {
    await database.disconnect();
  }
  process.exit(0);
}

async function start() {
  const env = loadApiEnv();
  const logger = createStructuredLogger({ service: 'backend' });
  database = env.skipMongo
    ? createMockDatabaseLifecycle({ ready: true })
    : createMongooseDatabaseLifecycle();

  await database.connect(env);

  const app = createApp({ config: env, database, logger });
  server = app.listen(env.port, env.host, () => {
    const summary = toSafeApiEnvSummary(env);
    logger('info', 'backend ready', {
      ...summary,
      skipMongo: env.skipMongo === true,
      allowE2eBootstrap: env.allowE2eBootstrap === true,
    });
  });

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

start().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSecrets(message));
  process.exit(1);
});
