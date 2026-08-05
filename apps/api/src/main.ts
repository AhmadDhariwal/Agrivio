import { createApp } from './app.js';
import { loadApiEnv, redactSecrets, toSafeApiEnvSummary } from './config/env.js';

try {
  const env = loadApiEnv();
  const app = createApp();

  app.listen(env.port, env.host, () => {
    const summary = toSafeApiEnvSummary(env);
    console.log(`[ ready ] http://${env.host}:${env.port}`);
    console.log(`[ config ] ${JSON.stringify(summary)}`);
  });
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSecrets(message));
  process.exit(1);
}
