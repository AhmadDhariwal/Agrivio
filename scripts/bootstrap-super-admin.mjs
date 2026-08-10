/**
 * Operational CLI: create the initial platform Super Admin.
 * Not an HTTP endpoint. Loads repo .env.local, connects to Mongo, hashes password with Argon2id.
 *
 * Usage:
 *   npm run bootstrap:super-admin -- --email admin@example.com --display-name "Platform Admin" --password "..."
 *
 * Password may also be supplied via AGRIVIO_BOOTSTRAP_SUPER_ADMIN_PASSWORD (never written to disk by this tool).
 */
import { createRequire } from 'node:module';
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

function printUsage() {
  console.log(`Usage:
  npm run bootstrap:super-admin -- --email <email> --display-name <name> --password <password>

Options:
  --email            Super Admin email (required)
  --display-name     Display name (required)
  --password         Initial password (min 12 chars); or set AGRIVIO_BOOTSTRAP_SUPER_ADMIN_PASSWORD
  --help             Show this help

Notes:
  - Operational CLI only (not a public HTTP API)
  - Idempotent when the same email is already a Super Admin
  - Refuses to promote existing organization/Owner users
  - Password is Argon2id-hashed; plaintext is never persisted
  - Sign in afterwards at /login, then select platform context`);
}

function parseArgs(argv) {
  const args = {
    email: undefined,
    displayName: undefined,
    password: undefined,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--email') {
      args.email = argv[++i];
      continue;
    }
    if (token === '--display-name') {
      args.displayName = argv[++i];
      continue;
    }
    if (token === '--password') {
      args.password = argv[++i];
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  loadLocalDevelopmentEnv({ backendRoot });
  const config = loadApiEnv();

  if (config.skipMongo) {
    throw new Error('Super Admin bootstrap requires MongoDB (AGRIVIO_SKIP_MONGO is not allowed)');
  }

  const password =
    args.password ??
    process.env.AGRIVIO_BOOTSTRAP_SUPER_ADMIN_PASSWORD ??
    undefined;

  if (typeof password !== 'string' || password === '') {
    throw new Error(
      'Password is required via --password or AGRIVIO_BOOTSTRAP_SUPER_ADMIN_PASSWORD',
    );
  }

  const database = createMongooseDatabaseLifecycle();
  await database.connect(config);

  try {
    const store = createMongooseAuthStore();
    const result = await bootstrapSuperAdmin(
      { store },
      {
        email: args.email,
        displayName: args.displayName,
        password,
      },
    );

    if (result.created) {
      console.log('[agrivio] Super Admin created');
    } else {
      console.log('[agrivio] Super Admin already exists (idempotent)');
    }
    console.log(`[agrivio] email: ${result.email}`);
    console.log(`[agrivio] userId: ${result.userId}`);
    console.log('[agrivio] Next: sign in at /login, select platform context, open /app/platform/organizations');
  } finally {
    await database.disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redactSecrets(`[agrivio] Super Admin bootstrap failed: ${message}`));
  process.exit(1);
});
