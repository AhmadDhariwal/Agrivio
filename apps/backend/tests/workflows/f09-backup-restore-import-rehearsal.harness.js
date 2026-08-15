const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createServer } = require('node:http');
const {
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
  readdirSync,
} = require('node:fs');
const { join } = require('node:path');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
const {
  API_ACCOUNTS_PATH,
  API_AUDIT_EVENTS_PATH,
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_BRANCHES_PATH,
  API_CSRF_HEADER,
  API_CUSTOMERS_PATH,
  API_DASHBOARD_PATH,
  API_IDEMPOTENCY_KEY_HEADER,
  API_IMPORTS_PATH,
  API_INVENTORY_OPENING_STOCK_PATH,
  API_INVENTORY_RECONCILIATION_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_OPERATIONS_BACKUPS_PATH,
  API_PLATFORM_OPERATIONS_RESTORES_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_PURCHASES_PATH,
  API_REPORTS_PATH,
  API_SALES_PATH,
  API_SUPPLIERS_PATH,
  API_WAREHOUSES_PATH,
} = require('@agrivio/api-contracts');
const { createApp } = require('../../src/app');
const { loadApiEnv } = require('../../src/platform/config/runtime-config');
const { createMongooseDatabaseLifecycle } = require('../../src/platform/database/mongo-connection');
const { renderImportWorkbook } = require('../../src/modules/imports/import-workbook');
const { reconcileInventoryState } = require('../../src/modules/inventory/reconciliation');
const {
  assertAllowedRehearsalDatabase,
  isAllowedRehearsalDatabaseName,
  rehearsalDatabaseNames,
  sanitizeCommand,
} = require('../../../../scripts/ops/rehearsal-db-policy.cjs');

const PASSWORD = 'a-strong-passphrase';
const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/?replicaSet=rs0';

function createCookieJar() {
  const cookies = new Map();
  return {
    absorb(headers) {
      const raw = headers.getSetCookie?.() ?? [];
      for (const entry of raw) {
        const [pair] = entry.split(';');
        const index = pair.indexOf('=');
        if (index > 0) {
          cookies.set(pair.slice(0, index), decodeURIComponent(pair.slice(index + 1)));
        }
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    },
  };
}

async function fetchJson(baseUrl, method, path, body, headers = {}, jar) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(jar === undefined ? {} : { cookie: jar.header() }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  jar?.absorb(response.headers);
  let json;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status, body: json };
}

async function issueCsrf(baseUrl, jar) {
  const response = await fetchJson(baseUrl, 'POST', API_AUTH_CSRF_PATH, {}, {}, jar);
  if (response.status !== 200) {
    throw new Error(`csrf ${response.status}`);
  }
  return response.body.data.csrfToken;
}

async function login(baseUrl, jar, email, password) {
  const response = await fetchJson(
    baseUrl,
    'POST',
    API_AUTH_LOGIN_PATH,
    { email, password },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  if (response.status !== 200) {
    throw new Error(`login ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data.session;
}

async function postJson(baseUrl, jar, path, body, idempotencyKey) {
  const headers = { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) };
  if (idempotencyKey) {
    headers[API_IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
  }
  return fetchJson(baseUrl, 'POST', path, body, headers, jar);
}

function requireOk(response, label, allowed = [200, 201]) {
  if (!allowed.includes(response.status)) {
    throw new Error(`${label} failed ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data;
}

async function createApprovedOwner(baseUrl, jar, input) {
  const requested = await fetchJson(
    baseUrl,
    'POST',
    API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
    {
      organizationName: input.organizationName,
      ownerEmail: input.ownerEmail,
      ownerDisplayName: input.ownerDisplayName ?? 'Owner',
    },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  if (requested.status !== 201) {
    throw new Error(`activation request ${requested.status}`);
  }
  const approved = await fetchJson(
    baseUrl,
    'POST',
    `${API_PLATFORM_ORGANIZATIONS_PATH}/${requested.body.data.organizationId}/approve`,
    {},
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      'X-Platform-Actor': 'super-admin',
    },
    jar,
  );
  if (approved.status !== 200) {
    throw new Error(`approve ${approved.status}`);
  }
  const activated = await fetchJson(
    baseUrl,
    'POST',
    '/api/v1/auth/activate',
    { token: approved.body.data.activationToken, password: input.password },
    { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
    jar,
  );
  if (activated.status !== 200) {
    throw new Error(`activate ${activated.status} ${JSON.stringify(activated.body)}`);
  }
  return {
    organizationId: requested.body.data.organizationId,
    membershipId: activated.body.data.session.activeContext.membershipId,
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(undefined));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve(undefined)));
  });
}

function findMongoTool(name) {
  const envKey = `AGRIVIO_${name.toUpperCase()}_PATH`;
  if (process.env[envKey] && existsSync(process.env[envKey])) {
    return process.env[envKey];
  }
  const locator = process.platform === 'win32' ? 'where' : 'which';
  const located = spawnSync(locator, [name], { encoding: 'utf8' });
  if (located.status === 0) {
    const first = located.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (first && existsSync(first)) {
      return first;
    }
  }
  const candidates =
    process.platform === 'win32'
      ? [
          `C:\\Program Files\\MongoDB\\Tools\\100\\bin\\${name}.exe`,
          `C:\\Program Files\\MongoDB\\Database Tools\\bin\\${name}.exe`,
          `C:\\Program Files\\MongoDB\\mongodb-database-tools-windows-x86_64-100.17.0\\bin\\${name}.exe`,
          `C:\\Program Files\\MongoDB\\Server\\8.2\\bin\\${name}.exe`,
          `C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\${name}.exe`,
          `C:\\Program Files\\MongoDB\\Server\\7.0\\bin\\${name}.exe`,
        ]
      : [`/usr/bin/${name}`, `/usr/local/bin/${name}`];
  return candidates.find((path) => existsSync(path)) ?? null;
}

function toolVersion(bin) {
  const result = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  return (result.stdout || result.stderr || '').trim().split(/\r?\n/)[0] ?? 'unknown';
}

function directorySizeBytes(dir) {
  if (!existsSync(dir)) {
    return 0;
  }
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += directorySizeBytes(full);
    } else {
      total += statSync(full).size;
    }
  }
  return total;
}

function sumSigned(docs, field) {
  let total = 0n;
  for (const doc of docs) {
    if (String(doc.status ?? 'posted') !== 'posted') {
      continue;
    }
    total += BigInt(String(doc[field] ?? '0'));
  }
  return total.toString();
}

function sumKind(docs, kind) {
  let total = 0n;
  for (const doc of docs) {
    if (String(doc.status ?? 'posted') !== 'posted') {
      continue;
    }
    if (String(doc.effectKind) !== kind) {
      continue;
    }
    total += BigInt(String(doc.signedAmountMinorUnits ?? '0'));
  }
  return total.toString();
}

async function listCollectionCounts(db) {
  const names = (await db.listCollections().toArray()).map((item) => item.name).sort();
  const counts = {};
  for (const name of names) {
    counts[name] = await db.collection(name).countDocuments();
  }
  return { names, counts };
}

async function invariantSnapshot(db) {
  const movements = await db.collection('stock_movements').find({}).toArray();
  const balances = await db.collection('inventory_balances').find({}).toArray();
  const costStates = await db.collection('inventory_cost_states').find({}).toArray();
  const effects = await db.collection('ledger_effects').find({}).toArray();
  const accountMovements = await db.collection('account_movements').find({}).toArray();
  const inventory = reconcileInventoryState({ movements, balances, costStates });
  return {
    inventoryOk: inventory.ok,
    inventoryFindings: inventory.findings,
    inventoryQuantityFromMovements: inventory.ok,
    wacStates: costStates.map((row) => ({
      warehouseId: String(row.warehouseId),
      productId: String(row.productId),
      quantityBaseMinorUnits: String(row.quantityBaseMinorUnits),
      inventoryValueMinorUnits: String(row.inventoryValueMinorUnits),
      weightedAverageCostMinorUnits: String(row.weightedAverageCostMinorUnits),
    })),
    customerReceivable: sumKind(effects, 'receivable'),
    customerAdvance: sumKind(effects, 'advance'),
    supplierPayable: sumKind(effects, 'payable'),
    supplierAdvance: sumKind(effects, 'supplier_advance'),
    accountMovementSum: sumSigned(accountMovements, 'signedAmountMinorUnits'),
    stockMovementCount: movements.length,
    ledgerEffectCount: effects.length,
    accountMovementCount: accountMovements.length,
  };
}

async function captureHttpSnapshot(baseUrl, jar, supplierId) {
  const inventory = await fetchJson(baseUrl, 'GET', API_INVENTORY_RECONCILIATION_PATH, undefined, {}, jar);
  const dashboard = await fetchJson(baseUrl, 'GET', API_DASHBOARD_PATH, undefined, {}, jar);
  const sales = await fetchJson(
    baseUrl,
    'GET',
    `${API_REPORTS_PATH}/sales?fromDate=2026-08-01&toDate=2026-08-31`,
    undefined,
    {},
    jar,
  );
  const stockValuation = await fetchJson(baseUrl, 'GET', `${API_REPORTS_PATH}/stock-valuation`, undefined, {}, jar);
  const supplierRecon = await fetchJson(
    baseUrl,
    'GET',
    `${API_SUPPLIERS_PATH}/${supplierId}/reconciliation`,
    undefined,
    {},
    jar,
  );
  const audit = await fetchJson(baseUrl, 'GET', API_AUDIT_EVENTS_PATH, undefined, {}, jar);
  return {
    inventory: inventory.body?.data ?? inventory.body,
    dashboard: dashboard.body?.data ?? dashboard.body,
    salesReport: sales.body?.data ?? sales.body,
    stockValuation: stockValuation.body?.data ?? stockValuation.body,
    supplierReconciliation: supplierRecon.body?.data ?? supplierRecon.body,
    auditCount: audit.body?.data?.items?.length ?? 0,
    statuses: {
      inventory: inventory.status,
      dashboard: dashboard.status,
      sales: sales.status,
      stockValuation: stockValuation.status,
      supplierRecon: supplierRecon.status,
      audit: audit.status,
    },
  };
}

async function seedPlan(baseUrl, jar) {
  const response = await fetchJson(
    baseUrl,
    'POST',
    '/api/v1/platform/subscription-plans',
    {
      planCode: 'Starter',
      activate: true,
      monthlyPriceMinorUnits: 1000,
      entitlements: { reportsExports: true, imports: true, auditHistory: 'unlimited' },
    },
    {
      [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
      'X-Platform-Actor': 'super-admin',
    },
    jar,
  );
  if (![200, 201].includes(response.status)) {
    throw new Error(`plan seed failed ${response.status} ${JSON.stringify(response.body)}`);
  }
}

async function bootApp(dbName) {
  assertAllowedRehearsalDatabase(dbName, 'connect');
  const config = loadApiEnv({
    NODE_ENV: 'test',
    AGRIVIO_APP_PROFILE: 'test',
    MONGODB_DB_NAME: dbName,
    MONGODB_URI: MONGO_URI,
    MONGODB_REPLICA_SET: 'rs0',
    SESSION_SECRET: 'test-session-secret-for-f09-rehearsal-ok',
  });
  const database = createMongooseDatabaseLifecycle();
  await database.connect(config);
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (hello.setName !== 'rs0' || hello.isWritablePrimary !== true) {
    await database.disconnect();
    throw new Error('Mongo replica set rs0 PRIMARY is required');
  }
  if (mongoose.connection.name !== dbName) {
    await database.disconnect();
    throw new Error(`Connected database ${mongoose.connection.name} does not match ${dbName}`);
  }
  const app = createApp({
    config,
    database,
    onboardingPersistence: 'mongoose',
  });
  const server = createServer(app);
  await listen(server);
  const address = server.address();
  return {
    app,
    server,
    database,
    baseUrl: `http://127.0.0.1:${address.port}`,
    jar: createCookieJar(),
    hello,
  };
}

async function shutdownApp(ctx) {
  if (ctx?.server) {
    await closeServer(ctx.server);
  }
  if (ctx?.database) {
    await ctx.database.disconnect();
  }
}

async function seedRepresentativeOrg(baseUrl, jar, suffix) {
  await seedPlan(baseUrl, jar);
  const ownerEmail = `f09-reh-owner-${suffix}@example.com`;
  const owner = await createApprovedOwner(baseUrl, jar, {
    organizationName: `F09 Rehearsal Org ${suffix}`,
    ownerEmail,
    password: PASSWORD,
  });
  await login(baseUrl, jar, ownerEmail, PASSWORD);

  const branch = requireOk(
    await postJson(baseUrl, jar, API_BRANCHES_PATH, { name: 'Main Branch', invoicePrefix: 'RH' }),
    'branch',
  );
  const warehouse = requireOk(
    await postJson(baseUrl, jar, API_WAREHOUSES_PATH, { name: 'Main Warehouse', code: 'WH1' }),
    'warehouse',
  );
  const cash = requireOk(
    await postJson(baseUrl, jar, API_ACCOUNTS_PATH, { name: 'Till Cash', accountType: 'cash' }),
    'account',
  );
  requireOk(
    await postJson(
      baseUrl,
      jar,
      `${API_ACCOUNTS_PATH}/${cash.id}/opening-balance`,
      { amount: { amount: '100000.00', currency: 'PKR' } },
      `cash-open-${suffix}`,
    ),
    'cash opening',
  );
  const category = requireOk(
    await postJson(baseUrl, jar, API_PRODUCT_CATEGORIES_PATH, {
      name: 'Rehearsal General',
      productClass: 'general',
    }),
    'category',
  );
  const seedCategory = requireOk(
    await postJson(baseUrl, jar, API_PRODUCT_CATEGORIES_PATH, {
      name: 'Rehearsal Seed',
      productClass: 'seed',
    }),
    'seed category',
  );
  const product = requireOk(
    await postJson(baseUrl, jar, API_PRODUCTS_PATH, {
      name: 'Urea 50kg',
      sku: 'UREA-50',
      categoryId: category.id,
      trackingMode: 'none',
      baseUnitCode: 'KG',
      measurementDimension: 'mass',
    }),
    'product',
  );
  const batched = requireOk(
    await postJson(baseUrl, jar, API_PRODUCTS_PATH, {
      name: 'Seed Lot',
      sku: 'SEED-1',
      categoryId: seedCategory.id,
      trackingMode: 'batch_expiry',
      baseUnitCode: 'KG',
      measurementDimension: 'mass',
    }),
    'batched product',
  );
  requireOk(
    await fetchJson(
      baseUrl,
      'PUT',
      `${API_PRODUCTS_PATH}/${product.id}/prices`,
      {
        expectedVersion: product.version,
        items: [{ priceTier: 'retail', price: { amount: '120.00', currency: 'PKR' } }],
      },
      { [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar) },
      jar,
    ),
    'prices',
    [200],
  );
  requireOk(
    await postJson(
      baseUrl,
      jar,
      API_INVENTORY_OPENING_STOCK_PATH,
      {
        warehouseId: warehouse.id,
        productId: product.id,
        quantity: '100',
        inventoryValue: { amount: '5000.00', currency: 'PKR' },
      },
      `open-stock-${suffix}`,
    ),
    'opening stock',
  );
  requireOk(
    await postJson(
      baseUrl,
      jar,
      API_INVENTORY_OPENING_STOCK_PATH,
      {
        warehouseId: warehouse.id,
        productId: batched.id,
        quantity: '20',
        inventoryValue: { amount: '800.00', currency: 'PKR' },
        batchNumber: 'LOT-A',
        expiryDate: '2027-12-31',
        manufacturingDate: '2026-01-15',
      },
      `open-batch-${suffix}`,
    ),
    'batched opening stock',
  );

  const customerAr = requireOk(
    await postJson(baseUrl, jar, API_CUSTOMERS_PATH, {
      name: 'Farmer Receivable',
      customerType: 'farmer',
    }),
    'customer AR',
  );
  const customerAdv = requireOk(
    await postJson(baseUrl, jar, API_CUSTOMERS_PATH, {
      name: 'Farmer Advance',
      customerType: 'farmer',
    }),
    'customer advance',
  );
  requireOk(
    await postJson(
      baseUrl,
      jar,
      `${API_CUSTOMERS_PATH}/${customerAr.id}/opening-balance`,
      { kind: 'receivable', amount: { amount: '1500.00', currency: 'PKR' } },
      `cust-ar-${suffix}`,
    ),
    'customer receivable',
  );
  requireOk(
    await postJson(
      baseUrl,
      jar,
      `${API_CUSTOMERS_PATH}/${customerAdv.id}/opening-balance`,
      { kind: 'advance', amount: { amount: '250.00', currency: 'PKR' } },
      `cust-adv-${suffix}`,
    ),
    'customer advance opening',
  );

  const supplierAp = requireOk(
    await postJson(baseUrl, jar, API_SUPPLIERS_PATH, { name: 'Supply Payable Co' }),
    'supplier AP',
  );
  const supplierAdv = requireOk(
    await postJson(baseUrl, jar, API_SUPPLIERS_PATH, { name: 'Supply Advance Co' }),
    'supplier advance',
  );
  requireOk(
    await postJson(
      baseUrl,
      jar,
      `${API_SUPPLIERS_PATH}/${supplierAp.id}/opening-balance`,
      { kind: 'payable', amount: { amount: '2200.00', currency: 'PKR' } },
      `sup-ap-${suffix}`,
    ),
    'supplier payable',
  );
  requireOk(
    await postJson(
      baseUrl,
      jar,
      `${API_SUPPLIERS_PATH}/${supplierAdv.id}/opening-balance`,
      { kind: 'advance', amount: { amount: '300.00', currency: 'PKR' } },
      `sup-adv-${suffix}`,
    ),
    'supplier advance opening',
  );

  const purchaseDraft = requireOk(
    await postJson(baseUrl, jar, API_PURCHASES_PATH, {
      warehouseId: warehouse.id,
      supplierId: supplierAp.id,
      purchaseDate: '2026-08-10',
      lines: [{ productId: product.id, quantity: '10', unitCost: { amount: '50.00', currency: 'PKR' } }],
    }),
    'purchase draft',
  );
  requireOk(
    await postJson(
      baseUrl,
      jar,
      `${API_PURCHASES_PATH}/${purchaseDraft.id}/post`,
      { expectedVersion: purchaseDraft.version, payments: [] },
      `purch-post-${suffix}`,
    ),
    'purchase post',
    [200],
  );

  const saleDraft = requireOk(
    await postJson(baseUrl, jar, API_SALES_PATH, {
      branchId: branch.id,
      warehouseId: warehouse.id,
      customerId: customerAr.id,
      saleDate: '2026-08-12',
      lines: [{ productId: product.id, quantity: '2', unitPrice: { amount: '120.00', currency: 'PKR' } }],
    }),
    'sale draft',
  );
  requireOk(
    await postJson(
      baseUrl,
      jar,
      `${API_SALES_PATH}/${saleDraft.id}/post`,
      {
        expectedVersion: saleDraft.version,
        payments: [{ accountId: cash.id, amount: { amount: '240.00', currency: 'PKR' } }],
      },
      `sale-post-${suffix}`,
    ),
    'sale post',
    [200],
  );

  return {
    ownerEmail,
    organizationId: owner.organizationId,
    warehouseId: warehouse.id,
    supplierId: supplierAp.id,
    customerId: customerAr.id,
  };
}

async function runImportJob(baseUrl, jar, importType, rows, key) {
  const created = requireOk(await postJson(baseUrl, jar, API_IMPORTS_PATH, { importType }), `create ${importType}`);
  const csrf = await issueCsrf(baseUrl, jar);
  const upload = await fetch(`${baseUrl}${API_IMPORTS_PATH}/${created.id}/upload`, {
    method: 'POST',
    headers: {
      'content-type': 'application/vnd.ms-excel',
      cookie: jar.header(),
      [API_CSRF_HEADER]: csrf,
    },
    body: renderImportWorkbook(importType, rows),
  });
  if (![200, 201].includes(upload.status)) {
    throw new Error(`upload ${importType} ${upload.status}`);
  }
  const preview = requireOk(
    await postJson(baseUrl, jar, `${API_IMPORTS_PATH}/${created.id}/validate`, {}),
    `validate ${importType}`,
    [200],
  );
  const confirmed = await postJson(baseUrl, jar, `${API_IMPORTS_PATH}/${created.id}/confirm`, {});
  if (confirmed.status !== 200) {
    return { jobId: created.id, preview, confirmed, executed: null };
  }
  const executed = await postJson(baseUrl, jar, `${API_IMPORTS_PATH}/${created.id}/execute`, {}, key);
  return {
    jobId: created.id,
    preview,
    confirmed: confirmed.body.data,
    executed: executed.body?.data ?? null,
    executeStatus: executed.status,
  };
}

async function dropIfRehearsal(client, name) {
  if (!isAllowedRehearsalDatabaseName(name)) {
    throw new Error(`Refusing drop of non-rehearsal database ${name}`);
  }
  assertAllowedRehearsalDatabase(name, 'drop');
  await client.db(name).dropDatabase();
}

async function runF09BackupRestoreImportRehearsal() {
  const mongodumpBin = findMongoTool('mongodump');
  const mongorestoreBin = findMongoTool('mongorestore');
  const names = rehearsalDatabaseNames(`${Date.now()}`);
  const dumpRoot = join(os.tmpdir(), `agrivio-rehearsal-dump-${names.runId}`);
  mkdirSync(dumpRoot, { recursive: true });

  const report = {
    status: 'failed',
    rehearsalEnvironment: {
      os: `${os.platform()} ${os.release()}`,
      node: process.version,
      mongodbUriSanitized: sanitizeCommand(MONGO_URI),
    },
    databases: names,
    sourceDbSafety: {
      sourceMatchesPolicy: isAllowedRehearsalDatabaseName(names.source, 'source'),
      restoredMatchesPolicy: isAllowedRehearsalDatabaseName(names.restored, 'restored'),
      importMatchesPolicy: isAllowedRehearsalDatabaseName(names.importDb, 'import'),
      agrivioRefused: true,
    },
    localTechnicalRehearsal: 'pending',
    productionTargetVendorBackupVerification: 'pending',
    relG08: mongodumpBin && mongorestoreBin ? 'pending' : 'blocked',
    relG09: mongodumpBin && mongorestoreBin ? 'pending' : 'blocked',
    relG10: 'pending',
    backupTools: { mongodumpBin, mongorestoreBin },
  };

  if (!mongodumpBin || !mongorestoreBin) {
    report.reason = 'mongodump/mongorestore unavailable on host PATH';
  }

  const admin = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  let sourceCtx;
  let restoredCtx;
  let importCtx;

  try {
    await admin.connect();

    sourceCtx = await bootApp(names.source);
    const seeded = await seedRepresentativeOrg(sourceCtx.baseUrl, sourceCtx.jar, names.runId);
    const sourceCounts = await listCollectionCounts(mongoose.connection.db);
    const sourceInvariants = await invariantSnapshot(mongoose.connection.db);
    const sourceHttp = await captureHttpSnapshot(sourceCtx.baseUrl, sourceCtx.jar, seeded.supplierId);
    report.representativeSourceDataset = {
      organizationId: seeded.organizationId,
      collections: sourceCounts.counts,
    };
    report.sourcePreBackupReconciliation = {
      inventoryOk: sourceInvariants.inventoryOk,
      findings: sourceInvariants.inventoryFindings,
      customerReceivable: sourceInvariants.customerReceivable,
      customerAdvance: sourceInvariants.customerAdvance,
      supplierPayable: sourceInvariants.supplierPayable,
      supplierAdvance: sourceInvariants.supplierAdvance,
      accountMovementSum: sourceInvariants.accountMovementSum,
      http: {
        inventoryOk: sourceHttp.inventory?.ok,
        dashboardStatus: sourceHttp.statuses.dashboard,
        salesStatus: sourceHttp.statuses.sales,
        supplierReconOk: sourceHttp.supplierReconciliation?.ok,
      },
    };
    if (!sourceInvariants.inventoryOk) {
      throw new Error(`Source inventory reconciliation failed: ${JSON.stringify(sourceInvariants.inventoryFindings)}`);
    }

    let refusedAgrivio = false;
    try {
      assertAllowedRehearsalDatabase('Agrivio', 'restore');
    } catch {
      refusedAgrivio = true;
    }
    if (!refusedAgrivio) {
      throw new Error('Safety policy failed to refuse Agrivio');
    }

    if (!mongodumpBin || !mongorestoreBin) {
      report.backup = { blocked: true, reason: 'mongodump/mongorestore unavailable on host' };
      report.restoreFailureDetection = {
        agrivioRestoreRefused: true,
        missingArtifactNotSuccess: null,
        note: 'Missing-path mongorestore not executed because tools are unavailable',
      };
      const orgRestoreBlocked = await fetchJson(
        sourceCtx.baseUrl,
        'POST',
        API_PLATFORM_OPERATIONS_RESTORES_PATH,
        { reason: 'org user must not restore' },
        { [API_CSRF_HEADER]: await issueCsrf(sourceCtx.baseUrl, sourceCtx.jar) },
        sourceCtx.jar,
      );
      report.authorizationAudit = { orgUserRestoreStatus: orgRestoreBlocked.status };
      if (orgRestoreBlocked.status !== 403) {
        throw new Error('Organization user restore was not denied');
      }
      await shutdownApp(sourceCtx);
      sourceCtx = null;
    } else {
    await sourceCtx.app.agrivio.operations.operationsService.recordBackupOutcome({
      status: 'success',
      policyRef: 'local-technical-mongodump',
      providerRef: 'host-mongodump',
    });

    const dumpComparisonSnapshot = await listCollectionCounts(mongoose.connection.db);
    report.dumpComparisonSnapshot = {
      capturedAt: 'immediately-before-mongodump',
      afterBackupCoordinationRecord: true,
      collections: dumpComparisonSnapshot.counts,
    };

    const dumpDbDir = join(dumpRoot, names.source);
    const dumpArgs = ['--uri', MONGO_URI, '--db', names.source, '--out', dumpRoot];
    const dumpStarted = new Date().toISOString();
    const dumpResult = spawnSync(mongodumpBin, dumpArgs, { encoding: 'utf8' });
    const dumpEnded = new Date().toISOString();
    const artifactSize = directorySizeBytes(dumpDbDir);
    report.backup = {
      tool: 'mongodump',
      version: toolVersion(mongodumpBin),
      command: sanitizeCommand(`${mongodumpBin} --uri=<replica-set-uri> --db=<sourceDb> --out=<dumpDir>`),
      exactSanitizedCommand: sanitizeCommand([mongodumpBin, ...dumpArgs].join(' ')),
      sourceDb: names.source,
      start: dumpStarted,
      end: dumpEnded,
      exitStatus: dumpResult.status,
      artifactPath: dumpDbDir,
      artifactSizeBytes: artifactSize,
      expectedNamespace: names.source,
      stderr: (dumpResult.stderr || '').slice(0, 2000),
      nonEmptyArtifact: artifactSize > 0 && existsSync(dumpDbDir),
    };
    if (dumpResult.status !== 0 || !report.backup.nonEmptyArtifact) {
      throw new Error(`mongodump failed status=${dumpResult.status} size=${artifactSize}`);
    }
    report.relG08 = 'pass';

    const existing = await admin.db().admin().listDatabases();
    const existingNames = existing.databases.map((item) => item.name);
    if (existingNames.includes(names.restored)) {
      await dropIfRehearsal(admin, names.restored);
    }
    assertAllowedRehearsalDatabase(names.restored, 'restore', 'restored');
    if (names.restored === names.source) {
      throw new Error('Restore target must differ from source');
    }

    const restoreArgs = [
      '--uri',
      MONGO_URI,
      '--nsFrom',
      `${names.source}.*`,
      '--nsTo',
      `${names.restored}.*`,
      '--dir',
      dumpRoot,
    ];
    const restoreResult = spawnSync(mongorestoreBin, restoreArgs, { encoding: 'utf8' });
    report.restore = {
      tool: 'mongorestore',
      version: toolVersion(mongorestoreBin),
      command: sanitizeCommand(
        `${mongorestoreBin} --uri=<replica-set-uri> --nsFrom=<sourceDb>.* --nsTo=<restoredDb>.* --dir=<dumpDir>`,
      ),
      exactSanitizedCommand: sanitizeCommand([mongorestoreBin, ...restoreArgs].join(' ')),
      exitStatus: restoreResult.status,
      restoredDatabase: names.restored,
      stderr: (restoreResult.stderr || '').slice(0, 4000),
      warnings: (restoreResult.stderr || '')
        .split(/\r?\n/)
        .filter((line) => /warn/i.test(line))
        .slice(0, 20),
    };
    if (restoreResult.status !== 0) {
      throw new Error(`mongorestore failed status=${restoreResult.status}`);
    }

    const restoredDb = admin.db(names.restored);
    const restoredCounts = await listCollectionCounts(restoredDb);
    const restoredInvariants = await invariantSnapshot(restoredDb);
    report.restore.collections = restoredCounts.counts;
    report.restore.comparedAgainst = 'dumpComparisonSnapshot';
    report.restore.documentCountsMatchSource =
      JSON.stringify(restoredCounts.counts) === JSON.stringify(dumpComparisonSnapshot.counts);
    if (!report.restore.documentCountsMatchSource) {
      throw new Error(
        `Restored counts differ from dump cut point: dump=${JSON.stringify(dumpComparisonSnapshot.counts)} restored=${JSON.stringify(restoredCounts.counts)}`,
      );
    }
    if (!restoredInvariants.inventoryOk) {
      throw new Error(`Restored inventory reconciliation failed: ${JSON.stringify(restoredInvariants.inventoryFindings)}`);
    }

    await shutdownApp(sourceCtx);
    sourceCtx = null;
    restoredCtx = await bootApp(names.restored);
    await login(restoredCtx.baseUrl, restoredCtx.jar, seeded.ownerEmail, PASSWORD);
    const restoredHttp = await captureHttpSnapshot(restoredCtx.baseUrl, restoredCtx.jar, seeded.supplierId);

    report.inventoryReconciliation = {
      sourceOk: sourceInvariants.inventoryOk,
      restoredOk: restoredInvariants.inventoryOk,
      match: JSON.stringify(sourceInvariants.inventoryFindings) === JSON.stringify(restoredInvariants.inventoryFindings),
    };
    report.valuationWacReconciliation = {
      source: sourceInvariants.wacStates,
      restored: restoredInvariants.wacStates,
      match: JSON.stringify(sourceInvariants.wacStates) === JSON.stringify(restoredInvariants.wacStates),
    };
    report.ledgerReconciliation = {
      customerReceivable: {
        source: sourceInvariants.customerReceivable,
        restored: restoredInvariants.customerReceivable,
      },
      customerAdvance: {
        source: sourceInvariants.customerAdvance,
        restored: restoredInvariants.customerAdvance,
      },
      supplierPayable: {
        source: sourceInvariants.supplierPayable,
        restored: restoredInvariants.supplierPayable,
      },
      supplierAdvance: {
        source: sourceInvariants.supplierAdvance,
        restored: restoredInvariants.supplierAdvance,
      },
      match:
        sourceInvariants.customerReceivable === restoredInvariants.customerReceivable &&
        sourceInvariants.customerAdvance === restoredInvariants.customerAdvance &&
        sourceInvariants.supplierPayable === restoredInvariants.supplierPayable &&
        sourceInvariants.supplierAdvance === restoredInvariants.supplierAdvance,
    };
    report.accountReconciliation = {
      source: sourceInvariants.accountMovementSum,
      restored: restoredInvariants.accountMovementSum,
      match: sourceInvariants.accountMovementSum === restoredInvariants.accountMovementSum,
    };
    report.reportReconciliation = {
      dashboardMatch:
        JSON.stringify(sourceHttp.dashboard) === JSON.stringify(restoredHttp.dashboard),
      salesMatch: JSON.stringify(sourceHttp.salesReport) === JSON.stringify(restoredHttp.salesReport),
      stockValuationMatch:
        JSON.stringify(sourceHttp.stockValuation) === JSON.stringify(restoredHttp.stockValuation),
      supplierReconMatch:
        JSON.stringify(sourceHttp.supplierReconciliation) === JSON.stringify(restoredHttp.supplierReconciliation),
    };
    if (
      !report.inventoryReconciliation.match ||
      !report.valuationWacReconciliation.match ||
      !report.ledgerReconciliation.match ||
      !report.accountReconciliation.match ||
      !report.reportReconciliation.dashboardMatch ||
      !report.reportReconciliation.salesMatch
    ) {
      throw new Error('Source vs restored reconciliation mismatch');
    }
    report.relG09 = 'pass';

    const missingRestore = spawnSync(
      mongorestoreBin,
      ['--uri', MONGO_URI, '--nsFrom', `${names.source}.*`, '--nsTo', `${names.restored}.*`, '--dir', join(dumpRoot, 'missing-backup')],
      { encoding: 'utf8' },
    );
    let refusedAgrivio = false;
    try {
      assertAllowedRehearsalDatabase('Agrivio', 'restore');
    } catch {
      refusedAgrivio = true;
    }
    report.restoreFailureDetection = {
      missingArtifactExitStatus: missingRestore.status,
      missingArtifactNotSuccess: missingRestore.status !== 0,
      agrivioRestoreRefused: refusedAgrivio,
      targetNotVerified: missingRestore.status !== 0,
    };
    if (missingRestore.status === 0 || !refusedAgrivio) {
      throw new Error('Restore failure detection did not prove failure');
    }

    const orgRestore = await fetchJson(
      restoredCtx.baseUrl,
      'POST',
      API_PLATFORM_OPERATIONS_RESTORES_PATH,
      { reason: 'org user must not restore' },
      { [API_CSRF_HEADER]: await issueCsrf(restoredCtx.baseUrl, restoredCtx.jar) },
      restoredCtx.jar,
    );
    const restoreActor = {
      actorId: 'ops-rehearsal',
      permissions: ['operations.restore.execute'],
    };
    const coordination = await restoredCtx.app.agrivio.operations.operationsService.initiateRestoreCoordination(
      { reason: 'F09 local technical restore rehearsal', targetRef: names.restored },
      restoreActor,
    );
    const backups = await fetchJson(
      restoredCtx.baseUrl,
      'GET',
      API_PLATFORM_OPERATIONS_BACKUPS_PATH,
      undefined,
      { 'X-Platform-Actor': 'super-admin' },
      restoredCtx.jar,
    );
    report.authorizationAudit = {
      orgUserRestoreStatus: orgRestore.status,
      coordinationOnly: coordination.coordinationOnly === true,
      productionRestoreExecuted: coordination.productionRestoreExecuted === false,
      backupListStatus: backups.status,
    };
    if (orgRestore.status !== 403 || coordination.productionRestoreExecuted !== false) {
      throw new Error('Authorization/audit evidence failed');
    }

    await shutdownApp(restoredCtx);
    restoredCtx = null;
    }

    importCtx = await bootApp(names.importDb);
    const importSeed = await seedPlan(importCtx.baseUrl, importCtx.jar);
    void importSeed;
    const importOwnerEmail = `f09-imp-owner-${names.runId}@example.com`;
    await createApprovedOwner(importCtx.baseUrl, importCtx.jar, {
      organizationName: `F09 Import Org ${names.runId}`,
      ownerEmail: importOwnerEmail,
      password: PASSWORD,
    });
    await login(importCtx.baseUrl, importCtx.jar, importOwnerEmail, PASSWORD);
    requireOk(
      await postJson(importCtx.baseUrl, importCtx.jar, API_WAREHOUSES_PATH, {
        name: 'Import Warehouse',
        code: 'WH1',
      }),
      'import warehouse',
    );
    requireOk(
      await postJson(importCtx.baseUrl, importCtx.jar, API_ACCOUNTS_PATH, {
        name: 'Import Till',
        accountType: 'cash',
      }),
      'import cash',
    );

    const importTypes = [];
    const cat = await runImportJob(
      importCtx.baseUrl,
      importCtx.jar,
      'product_categories',
      [{ name: 'Imported Seed', productClass: 'general' }],
      `imp-cat-${names.runId}`,
    );
    importTypes.push({
      type: 'product_categories',
      validRows: cat.preview.preview.validRows,
      executed: cat.executed?.status,
      createdCount: cat.executed?.result?.createdCount,
    });
    const products = await runImportJob(
      importCtx.baseUrl,
      importCtx.jar,
      'products',
      [
        {
          sku: 'IMP-SEED-1',
          name: 'Imported Wheat',
          categoryName: 'Imported Seed',
          trackingMode: 'none',
          baseUnitCode: 'KG',
          measurementDimension: 'mass',
        },
      ],
      `imp-prod-${names.runId}`,
    );
    importTypes.push({
      type: 'products',
      validRows: products.preview.preview.validRows,
      createdCount: products.executed?.result?.createdCount,
    });
    const customers = await runImportJob(
      importCtx.baseUrl,
      importCtx.jar,
      'customers',
      [{ name: 'Imported Farmer', customerType: 'farmer' }],
      `imp-cust-${names.runId}`,
    );
    const suppliers = await runImportJob(
      importCtx.baseUrl,
      importCtx.jar,
      'suppliers',
      [{ name: 'Imported Supplier' }],
      `imp-sup-${names.runId}`,
    );
    const ar = await runImportJob(
      importCtx.baseUrl,
      importCtx.jar,
      'customer_opening_receivables',
      [{ customerName: 'Imported Farmer', amount: '75.00' }],
      `imp-ar-${names.runId}`,
    );
    const ap = await runImportJob(
      importCtx.baseUrl,
      importCtx.jar,
      'supplier_opening_payables',
      [{ supplierName: 'Imported Supplier', amount: '90.00' }],
      `imp-ap-${names.runId}`,
    );
    const cashOpen = await runImportJob(
      importCtx.baseUrl,
      importCtx.jar,
      'cash_opening_balances',
      [{ accountName: 'Import Till', amount: '500.00' }],
      `imp-cash-${names.runId}`,
    );
    const stock = await runImportJob(
      importCtx.baseUrl,
      importCtx.jar,
      'opening_stock',
      [
        {
          productSku: 'IMP-SEED-1',
          warehouseCode: 'WH1',
          quantity: '8',
          inventoryValue: '80.00',
        },
      ],
      `imp-stock-${names.runId}`,
    );
    importTypes.push(
      { type: 'customers', createdCount: customers.executed?.result?.createdCount },
      { type: 'suppliers', createdCount: suppliers.executed?.result?.createdCount },
      { type: 'customer_opening_receivables', createdCount: ar.executed?.result?.createdCount },
      { type: 'supplier_opening_payables', createdCount: ap.executed?.result?.createdCount },
      { type: 'cash_opening_balances', createdCount: cashOpen.executed?.result?.createdCount },
      { type: 'opening_stock', createdCount: stock.executed?.result?.createdCount },
    );

    const beforeInvalid = await invariantSnapshot(mongoose.connection.db);
    const invalid = await runImportJob(
      importCtx.baseUrl,
      importCtx.jar,
      'product_categories',
      [{ name: '', productClass: 'general' }],
      `imp-bad-${names.runId}`,
    );
    const errors = await fetchJson(
      importCtx.baseUrl,
      'GET',
      `${API_IMPORTS_PATH}/${invalid.jobId}/errors`,
      undefined,
      {},
      importCtx.jar,
    );
    const afterInvalid = await invariantSnapshot(mongoose.connection.db);
    report.importTypesRehearsed = importTypes.map((item) => item.type);
    report.validImport = {
      types: importTypes,
      allExecuted: importTypes.every((item) => Number(item.createdCount ?? 0) >= 1 || item.type === undefined),
    };
    const executedCounts = importTypes.map((item) => Number(item.createdCount ?? 0));
    report.validImport.allExecuted = executedCounts.every((count) => count >= 1);
    report.invalidPreview = {
      invalidRows: invalid.preview.preview.invalidRows,
      confirmHttpStatus: invalid.confirmed?.status ?? invalid.confirmed,
      executed: invalid.executed,
      errorField: errors.body?.data?.items?.[0]?.field,
      errorRow: errors.body?.data?.items?.[0]?.row,
      errorCode: errors.body?.data?.items?.[0]?.code,
      ledgerUnchanged: beforeInvalid.ledgerEffectCount === afterInvalid.ledgerEffectCount,
      accountUnchanged: beforeInvalid.accountMovementCount === afterInvalid.accountMovementCount,
    };
    const importInvariants = await invariantSnapshot(mongoose.connection.db);
    report.importReconciliation = {
      inventoryOk: importInvariants.inventoryOk,
      customerReceivable: importInvariants.customerReceivable,
      supplierPayable: importInvariants.supplierPayable,
      accountMovementSum: importInvariants.accountMovementSum,
      previewAcceptedRows: importTypes.reduce((sum, item) => sum + Number(item.validRows ?? item.createdCount ?? 0), 0),
    };
    if (!report.validImport.allExecuted) {
      throw new Error(`Valid import did not create rows: ${JSON.stringify(importTypes)}`);
    }
    if (
      Number(invalid.preview.preview.invalidRows) < 1 ||
      invalid.executed !== null ||
      (invalid.confirmed?.status ?? 0) === 200 ||
      !report.invalidPreview.ledgerUnchanged ||
      !report.invalidPreview.accountUnchanged
    ) {
      throw new Error(`Invalid import rehearsal failed: ${JSON.stringify(report.invalidPreview)}`);
    }
    if (!importInvariants.inventoryOk) {
      throw new Error('Import inventory reconciliation failed');
    }
    report.relG10 = 'pass';
    report.localTechnicalRehearsal =
      report.relG08 === 'pass' && report.relG09 === 'pass' && report.relG10 === 'pass'
        ? 'passed'
        : report.relG08 === 'blocked' || report.relG09 === 'blocked'
          ? 'blocked'
          : 'failed';
    report.status = report.localTechnicalRehearsal === 'passed' ? 'passed' : report.localTechnicalRehearsal === 'blocked' ? 'blocked' : 'failed';
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    report.status =
      report.relG08 === 'pass' && report.relG09 === 'pass' && report.relG10 === 'pass'
        ? 'passed'
        : report.relG08 === 'blocked' || report.relG09 === 'blocked'
          ? 'blocked'
          : 'failed';
  } finally {
    await shutdownApp(sourceCtx).catch(() => undefined);
    await shutdownApp(restoredCtx).catch(() => undefined);
    await shutdownApp(importCtx).catch(() => undefined);
    try {
      await dropIfRehearsal(admin, names.source);
      await dropIfRehearsal(admin, names.restored);
      await dropIfRehearsal(admin, names.importDb);
    } catch {
      // cleanup best-effort after evidence captured
    }
    await admin.close().catch(() => undefined);
    rmSync(dumpRoot, { recursive: true, force: true });
    try {
      writeFileSync(
        join(process.cwd(), 'docs', 'ops', 'F09-R1-F09-005-REHEARSAL-EVIDENCE.json'),
        `${JSON.stringify(report, null, 2)}\n`,
      );
    } catch {
      // evidence write is best-effort
    }
  }

  return report;
}

module.exports = {
  runF09BackupRestoreImportRehearsal,
  findMongoTool,
};
