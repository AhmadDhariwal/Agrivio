/**
 * Operational CLI: Agrivio Deterministic Pre-Pilot Demo Dataset Seeder.
 *
 * Populates all Release 1 modules with a rich, interconnected, realistic demo dataset
 * for UI review, testing, and demonstration.
 *
 * Usage:
 *   npm run seed:demo
 *   npm run seed:demo -- --reset
 *   npm run seed:demo -- --reset --ref-date=2026-08-17
 */

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const backendRoot = join(repoRoot, 'apps', 'backend');

const {
  loadLocalDevelopmentEnv,
} = require(join(backendRoot, 'src/platform/config/load-local-env.js'));
const { loadApiEnv, redactSecrets } = require(join(backendRoot, 'src/platform/config/runtime-config.js'));
const {
  createMongooseDatabaseLifecycle,
} = require(join(backendRoot, 'src/platform/database/mongo-connection.js'));
const {
  createMongooseAuthStore,
} = require(join(backendRoot, 'src/modules/identity/auth.mongoose-store.js'));
const {
  bootstrapSuperAdmin,
} = require(join(backendRoot, 'src/modules/identity/bootstrap-super-admin.service.js'));
const { createApp } = require(join(backendRoot, 'src/app.js'));

const {
  DEMO_ORG_NAME,
  SECONDARY_TRIAL_ORG_NAME,
  SECONDARY_SUSPENDED_ORG_NAME,
  DEMO_PASSWORD,
  DEMO_USERS,
  resolveReferenceDate,
} = require(join(scriptDir, 'lib/demo-seed/demo-constants.js'));
const { runDemoSeed } = require(join(scriptDir, 'lib/demo-seed/seed-engine.js'));

function printUsage() {
  console.log(`
Agrivio Deterministic Pre-Pilot Demo Dataset Seeder
===================================================
Usage:
  npm run seed:demo
  npm run seed:demo -- --reset
  npm run seed:demo -- --reset --ref-date <YYYY-MM-DD>

Options:
  --reset          Remove existing Agrivio demo tenant records and re-seed cleanly
  --ref-date       Explicit reference business date (defaults to today / AGRIVIO_DEMO_REFERENCE_DATE)
  --help           Show this help message

Safety Guardrails:
  - Strictly forbidden in production (NODE_ENV !== production)
  - Requires explicit AGRIVIO_DEMO_SEED_ALLOWED=true (automatically set by this CLI)
  - Only removes records tagged to stable demo tenant/user identifiers on reset
  - Uses domain endpoints & transactions; preserves all financial and stock ledger invariants
`);
}

function parseArgs(argv) {
  const args = {
    reset: false,
    refDate: undefined,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      args.help = true;
    } else if (token === '--reset') {
      args.reset = true;
    } else if (token.startsWith('--ref-date=')) {
      args.refDate = token.slice('--ref-date='.length).trim();
    } else if (token === '--ref-date') {
      args.refDate = argv[i + 1]?.trim();
      i += 1;
    }
  }

  return args;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (err) => {
      if (err) reject(err);
      else resolve(server);
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // Enforce safety variable
  process.env.AGRIVIO_DEMO_SEED_ALLOWED = 'true';

  loadLocalDevelopmentEnv({ backendRoot });

  const config = loadApiEnv();

  if (config.nodeEnv === 'production') {
    console.error('[agrivio-seed] ERROR: Demo dataset seeding is strictly prohibited in production.');
    process.exit(1);
  }

  console.log(`[agrivio-seed] Starting demo seeder against ${config.mongodbUri.replace(/\/\/.*@/, '//***@')}`);

  const database = createMongooseDatabaseLifecycle();

  await database.connect(config);

  let server;
  try {
    // 1. Bootstrap Platform Super Admin
    const authStore = createMongooseAuthStore();
    await bootstrapSuperAdmin(
      { store: authStore },
      {
        email: DEMO_USERS.superAdmin.email,
        displayName: DEMO_USERS.superAdmin.displayName,
        password: DEMO_PASSWORD,
      },
    );

    // 2. Start in-process Express application
    const app = createApp({ config, database });
    server = createServer(app);
    await listen(server);
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    // 3. Run Demo Seed Engine
    const result = await runDemoSeed({
      mongoUri: config.mongodbUri,
      baseUrl,
      reset: args.reset,
      referenceDate: args.refDate,
    });

    // 4. Output Formatted Summary Report
    console.log(`
================================================================================
                    AGRIVIO DEMO DATASET SEED REPORT
================================================================================
Demo Organization  : ${result.organizationName} (${result.organizationId})
Reference Date     : ${result.referenceDate}
Subscription Plan  : Enterprise (All R1 modules & entitlements active)

Entity Counts:
  - Branches            : ${result.counts.branches} (Multan Main, Khanewal Sub-Branch)
  - Warehouses          : ${result.counts.warehouses} (Central Hub, Transit Depot, Cold Storage)
  - Users / Staff       : ${result.counts.users} (Owner, Manager, Cashier, Store Keeper)
  - Product Categories  : ${result.counts.categories}
  - Catalog Products    : ${result.counts.products} (Fertilizers, Pesticides, Seeds, Tools)
  - Customers           : ${result.counts.customers} (Farmers, Dealers, Corporate, Walk-ins)
  - Suppliers           : ${result.counts.suppliers} (FFC, Engro, Syngenta, Bayer, Fatima, ICI)
  - Financial Accounts  : ${result.counts.accounts} (Cash Drawers, HBL, Meezan, JazzCash, Easypaisa)
  - Sales Transactions  : ${result.counts.sales} (Cash, Credit, Partial, Mixed, Returns)
  - Purchase Orders     : ${result.counts.purchases} (Paid, Partial, Credit, Cancelled)
  - Expense Postings    : ${result.counts.expenses} (Rent, Utilities, Freight, Maintenance)

Reconciliation Verification:
  - Stock vs Movements  : ${result.reconciliation.inventoryReconciled ? 'PASSED [OK]' : 'FAILED'}
  - Account Balances    : ${result.reconciliation.accountsReconciled ? 'PASSED [OK]' : 'FAILED'}
  - Delete / Deactivate : ${result.reconciliation.deleteCoverageVerified ? 'PASSED [OK]' : 'FAILED'}
  - Dashboard Endpoint  : ${result.reconciliation.dashboardFunctional ? 'PASSED [OK]' : 'FAILED'}

Demo Logins (Password for all: ${DEMO_PASSWORD}):
  - Platform Super Admin : ${DEMO_USERS.superAdmin.email}
  - Primary Owner        : ${DEMO_USERS.owner.email}
  - Branch Manager       : ${DEMO_USERS.manager.email}
  - POS Cashier          : ${DEMO_USERS.cashier.email}
  - Store Keeper         : ${DEMO_USERS.storeKeeper.email}
  - Secondary Trial Org  : ${DEMO_USERS.trialOwner.email} (${SECONDARY_TRIAL_ORG_NAME})
  - Suspended Demo Org   : ${DEMO_USERS.suspendedOwner.email} (${SECONDARY_SUSPENDED_ORG_NAME})
================================================================================
`);
  } finally {
    if (server) {
      await closeServer(server);
    }
    await database.disconnect();
  }
}

main().catch((err) => {
  console.error('[agrivio-seed] FATAL ERROR:', err);
  process.exit(1);
});
