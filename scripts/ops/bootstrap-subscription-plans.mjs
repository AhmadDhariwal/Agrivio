import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { R1_CATALOG_ID } = require('../../apps/backend/src/modules/subscriptions/r1-plan-catalog');
const { syncR1Catalog } = require('../../apps/backend/src/modules/subscriptions/plan-catalog-sync');

function parseArguments(argv) {
  const dryRun = argv.includes('--dry-run');
  const apply = argv.includes('--apply');
  const confirmArg = argv.find((value) => value.startsWith('--confirm='));
  const confirmation = confirmArg?.slice('--confirm='.length) ?? null;
  if (dryRun === apply) {
    throw new Error('Specify exactly one of --dry-run or --apply');
  }
  if (apply && confirmation !== R1_CATALOG_ID) {
    throw new Error(`Applying requires --confirm=${R1_CATALOG_ID}`);
  }
  return { dryRun };
}

async function main() {
  try {
    const { loadEnvFile } = await import('node:process');
    loadEnvFile?.('.env.local');
  } catch {}

  const { dryRun } = parseArguments(process.argv.slice(2));
  const mongoose = require('mongoose');
  const { loadApiEnv } = require('../../apps/backend/src/platform/config/runtime-config');
  const {
    createSubscriptionModule,
  } = require('../../apps/backend/src/modules/subscriptions/subscription.module');
  const config = loadApiEnv();
  await mongoose.connect(config.mongodbUri, { dbName: config.mongodbDbName });
  try {
    const subscriptions = createSubscriptionModule({ persistence: 'mongoose', config });
    const result = await syncR1Catalog({
      store: subscriptions.store,
      subscriptionService: subscriptions.subscriptionService,
      dryRun,
      actorId: 'ops:r1-plan-catalog-sync',
    });
    console.log(JSON.stringify({ database: config.mongodbDbName, ...result }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`[plan-catalog-sync] ${error.message}`);
    process.exitCode = 1;
  });
}

export { parseArguments };
