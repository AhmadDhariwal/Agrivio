import { createApp } from './app.js';
import { createMongooseDatabaseLifecycle } from './platform/database/mongo-connection.js';
import {
  loadApiEnv,
  redactSecrets,
  toSafeApiEnvSummary,
} from './platform/config/runtime-config.js';
import { createStructuredLogger } from './platform/logging/structured-logger.js';

/** @type {import('node:http').Server | undefined} */
let server;

/** @type {import('./platform/database/mongo-connection.js').MongoDatabaseLifecycle | undefined} */
let database;

/**
 * @param {NodeJS.Signals} signal
 */
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

try {
  const env = loadApiEnv();
  const logger = createStructuredLogger({ service: 'backend' });
  database = createMongooseDatabaseLifecycle();

  await database.connect(env);

  const app = createApp({ config: env, database, logger });
  server = app.listen(env.port, env.host, () => {
    const summary = toSafeApiEnvSummary(env);
    logger('info', 'backend ready', summary);
  });

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSecrets(message));
  process.exit(1);
}
