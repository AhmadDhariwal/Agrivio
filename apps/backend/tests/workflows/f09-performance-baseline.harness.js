const os = require('node:os');
const { createServer } = require('node:http');
const mongoose = require('mongoose');
const {
  API_ACCOUNTS_PATH,
  API_AUTH_CSRF_PATH,
  API_AUTH_LOGIN_PATH,
  API_BRANCHES_PATH,
  API_CSRF_HEADER,
  API_CUSTOMERS_PATH,
  API_DASHBOARD_PATH,
  API_IDEMPOTENCY_KEY_HEADER,
  API_IMPORTS_PATH,
  API_INVENTORY_BALANCES_PATH,
  API_INVENTORY_MOVEMENTS_PATH,
  API_INVENTORY_OPENING_STOCK_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
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
const { ProductModel } = require('../../src/modules/catalog/persistence/product.model');
const { ProductPriceModel } = require('../../src/modules/catalog/persistence/product-price.model');
const { CustomerModel } = require('../../src/modules/customers/persistence/customer.model');
const { SupplierModel } = require('../../src/modules/suppliers/persistence/supplier.model');
const { renderImportWorkbook } = require('../../src/modules/imports/import-workbook');
const { SaleModel } = require('../../src/modules/sales/persistence/sale.model');
const { StockMovementModel } = require('../../src/modules/inventory/persistence/stock-movement.model');
const {
  AccountMovementModel,
} = require('../../src/modules/accounts-expenses/persistence/account-movement.model');

const MIXED_VIRTUAL_USERS = 20;
const MIXED_SALE_POSTING_USERS = 5;
const MIXED_SALE_POSTS_PER_USER = 2;
const MIXED_READ_ROUNDS = 6;
const MAX_NORMAL_REQUEST_ERROR_RATE = 0.01;

const ACCEPTED_PLANNING_THRESHOLDS_MS = {
  posProductSearchIndexed: 300,
  tenantCustomerList: 500,
  tenantSupplierList: 500,
  posCatalogListLoad: 500,
  inventoryBalances: 500,
  inventoryMovements: 500,
  dashboardLoad: 1000,
  salePosting: 1000,
  purchasePosting: 1000,
  standardReportSales: 2000,
  importPreview: 5000,
  importExecute: 5000,
};

const PASSWORD = 'a-strong-passphrase';

function createCookieJar() {
  const cookies = new Map();
  let frozen = false;
  return {
    freeze() {
      frozen = true;
    },
    unfreeze() {
      frozen = false;
    },
    absorb(headers) {
      if (frozen) {
        return;
      }
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
    throw new Error(`login ${response.status}`);
  }
  return response.body.data.session;
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

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(sorted, p) {
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function summarizeSamples(samples, failures) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    sampleCount: samples.length,
    min: sorted[0] ?? null,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? null,
    failureCount: failures,
    samplesMs: sorted,
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

async function isReplicaSetPrimary() {
  try {
    const status = await mongoose.connection.db.admin().command({ hello: 1 });
    return status.setName === 'rs0' && status.isWritablePrimary === true;
  } catch {
    return false;
  }
}

function environmentBlock(dbName, hello) {
  return {
    os: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    cpus: os.cpus()[0]?.model,
    cpuCount: os.cpus().length,
    totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
    node: process.version,
    databaseTopology: hello
      ? {
          replicaSet: hello.setName ?? null,
          isWritablePrimary: hello.isWritablePrimary === true,
          hosts: hello.hosts ?? [],
        }
      : { replicaSet: 'rs0', connected: false },
    mongodbDbName: dbName,
    note: 'Developer workstation / non-production. Do not treat as production capacity.',
  };
}

async function seedScalePlan(baseUrl, jar) {
  const response = await fetchJson(
    baseUrl,
    'POST',
    '/api/v1/platform/subscription-plans',
    {
      planCode: 'Starter',
      activate: true,
      monthlyPriceMinorUnits: 1000,
      limits: {
        products: 20000,
        customers: 20000,
        suppliers: 20000,
        warehouses: 50,
        branches: 50,
        activeUsers: 50,
      },
      entitlements: { reportsExports: true, imports: true, auditHistory: '90d' },
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

async function postJson(baseUrl, jar, path, body, idempotencyKey, csrfToken) {
  const headers = { [API_CSRF_HEADER]: csrfToken ?? (await issueCsrf(baseUrl, jar)) };
  if (idempotencyKey) {
    headers[API_IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
  }
  return fetchJson(baseUrl, 'POST', path, body, headers, jar);
}

async function measure(options) {
  const { warmup, samples, run } = options;
  for (let i = 0; i < warmup; i += 1) {
    await run();
  }
  const times = [];
  let failures = 0;
  for (let i = 0; i < samples; i += 1) {
    try {
      const started = Date.now();
      await run();
      times.push(Date.now() - started);
    } catch {
      failures += 1;
    }
  }
  return { ...summarizeSamples(times, failures), warmUpPolicy: `${warmup} discarded requests` };
}

function evaluateAcceptedThresholds(report) {
  const rows = [];
  let within = true;
  for (const [scenarioKey, thresholdMs] of Object.entries(ACCEPTED_PLANNING_THRESHOLDS_MS)) {
    const scenario = report.scenarios[scenarioKey];
    const measured = scenario?.p95 ?? null;
    const passed = measured !== null && measured <= thresholdMs && (scenario?.failureCount ?? 1) === 0;
    if (!passed) {
      within = false;
    }
    rows.push({
      scenario: scenario?.operation ?? scenarioKey,
      percentile: 'p95',
      measuredResultMs: measured,
      acceptedThresholdMs: thresholdMs,
      status: passed ? 'within' : 'exceeded',
    });
  }
  return { rows, within };
}

async function runF09PerformanceBaseline() {
  const sizes = {
    products: envInt('F09_PERF_PRODUCTS', 2000),
    customers: envInt('F09_PERF_CUSTOMERS', 500),
    suppliers: envInt('F09_PERF_SUPPLIERS', 150),
    branches: 2,
    warehouses: 3,
    openingStock: envInt('F09_PERF_OPENING', 24),
    postedSales: envInt('F09_PERF_SALES', 12),
    postedPurchases: envInt('F09_PERF_PURCHASES', 8),
    importPreviewRows: envInt('F09_PERF_IMPORT_PREVIEW', 500),
    importExecuteRows: envInt('F09_PERF_IMPORT_EXECUTE', 200),
  };
  const dbName = `agrivio_test_f09_perf_${Date.now()}`;
  const config = loadApiEnv({
    NODE_ENV: 'test',
    AGRIVIO_APP_PROFILE: 'test',
    MONGODB_DB_NAME: dbName,
    MONGODB_URI: process.env['MONGODB_URI'] ?? 'mongodb://127.0.0.1:27017/?replicaSet=rs0',
    MONGODB_REPLICA_SET: 'rs0',
    SESSION_SECRET: 'test-session-secret-for-perf-baseline-ok',
  });
  const database = createMongooseDatabaseLifecycle();
  try {
    await database.connect(config);
  } catch (error) {
    return {
      status: 'mongo_unavailable',
      error: error instanceof Error ? error.message : String(error),
      environment: environmentBlock(dbName, null),
    };
  }
  if (!(await isReplicaSetPrimary())) {
    await database.disconnect();
    return {
      status: 'mongo_unavailable',
      error: 'Mongo replica set rs0 PRIMARY is required',
      environment: environmentBlock(dbName, null),
    };
  }

  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  const app = createApp({
    config,
    database,
    onboardingPersistence: 'mongoose',
  });
  const server = createServer(app);
  await listen(server);
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const jar = createCookieJar();
  const report = {
    status: 'measured',
    dataset: sizes,
    environment: environmentBlock(dbName, hello),
    methodology: {
      warmUpPolicy: 'per-scenario discarded warm-up requests; cold process start excluded',
      timingClass: 'A. server/application HTTP round-trip',
      browserVisible:
        'B. SPA route navigation to usable primary content is measured in Playwright `f09-perf-navigation.e2e.spec.ts` from navigation start including required API work on the E2E stack; not mixed into replica-set HTTP samples',
    },
    scenarios: {},
    concurrency: {},
    correctness: {},
    queryNotes: [],
  };

  try {
    await ProductModel.syncIndexes();
    await ProductPriceModel.syncIndexes();
    await CustomerModel.syncIndexes();
    await SupplierModel.syncIndexes();
    await seedScalePlan(baseUrl, jar);
    const ownerEmail = `f09-perf-owner-${Date.now()}@example.com`;
    const owner = await createApprovedOwner(baseUrl, jar, {
      organizationName: 'F09 Perf Org',
      ownerEmail,
      password: PASSWORD,
    });
    await login(baseUrl, jar, ownerEmail, PASSWORD);

    const foreignEmail = `f09-perf-foreign-${Date.now()}@example.com`;
    const foreign = await createApprovedOwner(baseUrl, jar, {
      organizationName: 'F09 Perf Foreign Org',
      ownerEmail: foreignEmail,
      password: PASSWORD,
    });
    const foreignProductId = new mongoose.Types.ObjectId();
    await ProductModel.create({
      _id: foreignProductId,
      organizationId: foreign.organizationId,
      categoryId: new mongoose.Types.ObjectId(),
      name: 'Foreign Only Product',
      nameNormalized: 'foreign only product',
      sku: 'FOREIGN-LEAK-001',
      trackingMode: 'none',
      baseUnitCode: 'KG',
      measurementDimension: 'mass',
      status: 'active',
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await login(baseUrl, jar, ownerEmail, PASSWORD);

    const branchA = await postJson(baseUrl, jar, API_BRANCHES_PATH, {
      name: 'Perf Branch A',
      invoicePrefix: 'PFA',
    });
    await postJson(baseUrl, jar, API_BRANCHES_PATH, {
      name: 'Perf Branch B',
      invoicePrefix: 'PFB',
    });
    const warehouses = [];
    for (const name of ['WH North', 'WH South', 'WH East']) {
      warehouses.push(await postJson(baseUrl, jar, API_WAREHOUSES_PATH, { name }));
    }
    const cash = await postJson(baseUrl, jar, API_ACCOUNTS_PATH, {
      name: 'Perf Cash',
      accountType: 'cash',
    });
    await postJson(
      baseUrl,
      jar,
      `${API_ACCOUNTS_PATH}/${cash.body.data.id}/opening-balance`,
      { amount: { amount: '5000000.00', currency: 'PKR' } },
      'perf-cash-open',
    );
    const category = await postJson(baseUrl, jar, API_PRODUCT_CATEGORIES_PATH, {
      name: 'Perf General',
      productClass: 'general',
    });
    const orgId = owner.organizationId;
    const categoryId = category.body.data.id;
    const now = new Date();

    const productDocs = [];
    const priceDocs = [];
    for (let i = 0; i < sizes.products; i += 1) {
      const id = new mongoose.Types.ObjectId();
      productDocs.push({
        _id: id,
        organizationId: orgId,
        categoryId,
        name: `Perf Product ${i}`,
        nameNormalized: `perf product ${i}`,
        sku: `PERF-${String(i).padStart(4, '0')}`,
        trackingMode: 'none',
        baseUnitCode: 'KG',
        measurementDimension: 'mass',
        status: 'active',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
      priceDocs.push({
        organizationId: orgId,
        productId: id,
        priceTier: 'retail',
        amountMinorUnits: '10000',
        currency: 'PKR',
        status: 'active',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ProductModel.insertMany(productDocs, { ordered: true });
    await ProductPriceModel.insertMany(priceDocs, { ordered: true });

    const customerDocs = [];
    for (let i = 0; i < sizes.customers; i += 1) {
      customerDocs.push({
        organizationId: orgId,
        name: `Perf Customer ${i}`,
        nameNormalized: `perf customer ${i}`,
        phone: `0301${String(i).padStart(7, '0')}`,
        phoneNormalized: `0301${String(i).padStart(7, '0')}`,
        customerType: 'farmer',
        priceTier: 'retail',
        creditEnabled: true,
        creditLimitAmountMinorUnits: '10000000',
        creditLimitCurrency: 'PKR',
        creditLimitBehaviour: 'warning',
        status: 'active',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    await CustomerModel.insertMany(customerDocs, { ordered: true });

    const supplierDocs = [];
    for (let i = 0; i < sizes.suppliers; i += 1) {
      supplierDocs.push({
        organizationId: orgId,
        name: `Perf Supplier ${i}`,
        nameNormalized: `perf supplier ${i}`,
        phone: `0302${String(i).padStart(7, '0')}`,
        phoneNormalized: `0302${String(i).padStart(7, '0')}`,
        contactName: '',
        email: '',
        status: 'active',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    }
    await SupplierModel.insertMany(supplierDocs, { ordered: true });

    const listedCustomers = await fetchJson(baseUrl, 'GET', API_CUSTOMERS_PATH, undefined, {}, jar);
    const listedSuppliers = await fetchJson(baseUrl, 'GET', API_SUPPLIERS_PATH, undefined, {}, jar);
    const customerId = listedCustomers.body.data.items[0].id;
    const supplierId = listedSuppliers.body.data.items[0].id;
    const productIds = productDocs.slice(0, Math.max(sizes.openingStock, 8)).map((doc) => String(doc._id));
    const warehouseId = warehouses[0].body.data.id;
    const branchId = branchA.body.data.id;

    for (let i = 0; i < sizes.openingStock; i += 1) {
      const opening = await postJson(
        baseUrl,
        jar,
        API_INVENTORY_OPENING_STOCK_PATH,
        {
          warehouseId,
          productId: productIds[i],
          quantity: '500',
          inventoryValue: { amount: '25000.00', currency: 'PKR' },
        },
        `perf-open-${i}`,
      );
      if (opening.status !== 201) {
        throw new Error(`opening stock failed ${opening.status} ${JSON.stringify(opening.body)}`);
      }
    }

    async function postSaleSample(index, keyPrefix, csrfToken) {
      const draft = await postJson(
        baseUrl,
        jar,
        API_SALES_PATH,
        {
          branchId,
          warehouseId,
          customerId,
          saleDate: '2026-08-12',
          lines: [
            {
              productId: productIds[index % productIds.length],
              quantity: '1',
              unitPrice: { amount: '100.00', currency: 'PKR' },
            },
          ],
        },
        undefined,
        csrfToken,
      );
      if (draft.status !== 201) {
        throw new Error(`sale draft failed ${draft.status} ${JSON.stringify(draft.body)}`);
      }
      const posted = await postJson(
        baseUrl,
        jar,
        `${API_SALES_PATH}/${draft.body.data.id}/post`,
        {
          expectedVersion: draft.body.data.version,
          payments: [{ accountId: cash.body.data.id, amount: { amount: '100.00', currency: 'PKR' } }],
        },
        `${keyPrefix}-${index}`,
        csrfToken,
      );
      if (posted.status !== 200) {
        throw new Error(`sale post failed ${posted.status} ${JSON.stringify(posted.body)}`);
      }
      return posted;
    }

    async function postPurchaseSample(index, keyPrefix) {
      const draft = await postJson(baseUrl, jar, API_PURCHASES_PATH, {
        warehouseId,
        supplierId,
        purchaseDate: '2026-08-11',
        lines: [
          {
            productId: productIds[index % productIds.length],
            quantity: '2',
            unitCost: { amount: '40.00', currency: 'PKR' },
          },
        ],
      });
      if (draft.status !== 201) {
        throw new Error(`purchase draft failed ${draft.status} ${JSON.stringify(draft.body)}`);
      }
      const posted = await postJson(
        baseUrl,
        jar,
        `${API_PURCHASES_PATH}/${draft.body.data.id}/post`,
        { expectedVersion: draft.body.data.version, payments: [] },
        `${keyPrefix}-${index}`,
      );
      if (posted.status !== 200) {
        throw new Error(`purchase post failed ${posted.status} ${JSON.stringify(posted.body)}`);
      }
      return posted;
    }

    for (let i = 0; i < sizes.postedSales; i += 1) {
      await postSaleSample(i, 'hist-sale');
    }
    for (let i = 0; i < sizes.postedPurchases; i += 1) {
      await postPurchaseSample(i, 'hist-purch');
    }

    const skuExplain = await ProductModel.find({ organizationId: orgId, sku: 'PERF-0100' }).explain(
      'executionStats',
    );
    report.queryNotes.push({
      operation: 'POS SKU equality',
      winningPlan: skuExplain.queryPlanner?.winningPlan,
      docsExamined: skuExplain.executionStats?.totalDocsExamined,
      nReturned: skuExplain.executionStats?.nReturned,
    });

    report.scenarios.posProductSearchIndexed = {
      datasetSize: sizes.products,
      operation: 'GET /api/v1/products?q=PERF-0100&limit=25',
      concurrencyLevel: 1,
      ...(await measure({
        warmup: 2,
        samples: 11,
        run: async () => {
          const response = await fetchJson(
            baseUrl,
            'GET',
            `${API_PRODUCTS_PATH}?q=PERF-0100&limit=25`,
            undefined,
            {},
            jar,
          );
          if (response.status !== 200) {
            throw new Error(`search ${response.status}`);
          }
        },
      })),
    };

    report.scenarios.posCatalogListLoad = {
      datasetSize: sizes.products,
      operation: 'GET /api/v1/products (full tenant catalog; current POS list load)',
      concurrencyLevel: 1,
      ...(await measure({
        warmup: 2,
        samples: 7,
        run: async () => {
          const response = await fetchJson(baseUrl, 'GET', API_PRODUCTS_PATH, undefined, {}, jar);
          if (response.status !== 200) {
            throw new Error(`list products ${response.status}`);
          }
        },
      })),
    };

    report.scenarios.tenantCustomerList = {
      datasetSize: sizes.customers,
      operation: 'GET /api/v1/customers',
      concurrencyLevel: 1,
      ...(await measure({
        warmup: 2,
        samples: 11,
        run: async () => {
          const response = await fetchJson(baseUrl, 'GET', API_CUSTOMERS_PATH, undefined, {}, jar);
          if (response.status !== 200) {
            throw new Error(`customers ${response.status}`);
          }
        },
      })),
    };

    report.scenarios.tenantSupplierList = {
      datasetSize: sizes.suppliers,
      operation: 'GET /api/v1/suppliers',
      concurrencyLevel: 1,
      ...(await measure({
        warmup: 2,
        samples: 11,
        run: async () => {
          const response = await fetchJson(baseUrl, 'GET', API_SUPPLIERS_PATH, undefined, {}, jar);
          if (response.status !== 200) {
            throw new Error(`suppliers ${response.status}`);
          }
        },
      })),
    };

    report.scenarios.inventoryBalances = {
      datasetSize: sizes.openingStock,
      operation: 'GET /api/v1/inventory/balances',
      concurrencyLevel: 1,
      ...(await measure({
        warmup: 2,
        samples: 11,
        run: async () => {
          const response = await fetchJson(
            baseUrl,
            'GET',
            API_INVENTORY_BALANCES_PATH,
            undefined,
            {},
            jar,
          );
          if (response.status !== 200) {
            throw new Error(`balances ${response.status}`);
          }
        },
      })),
    };

    report.scenarios.inventoryMovements = {
      datasetSize: sizes.openingStock,
      operation: 'GET /api/v1/inventory/movements',
      concurrencyLevel: 1,
      ...(await measure({
        warmup: 2,
        samples: 11,
        run: async () => {
          const response = await fetchJson(
            baseUrl,
            'GET',
            API_INVENTORY_MOVEMENTS_PATH,
            undefined,
            {},
            jar,
          );
          if (response.status !== 200) {
            throw new Error(`movements ${response.status}`);
          }
        },
      })),
    };

    report.scenarios.dashboardLoad = {
      datasetSize: {
        products: sizes.products,
        postedSales: sizes.postedSales,
        postedPurchases: sizes.postedPurchases,
      },
      operation: 'GET /api/v1/dashboard',
      concurrencyLevel: 1,
      ...(await measure({
        warmup: 2,
        samples: 11,
        run: async () => {
          const response = await fetchJson(baseUrl, 'GET', API_DASHBOARD_PATH, undefined, {}, jar);
          if (response.status !== 200) {
            throw new Error(`dashboard ${response.status}`);
          }
        },
      })),
    };

    report.scenarios.standardReportSales = {
      datasetSize: sizes.postedSales,
      operation: 'GET /api/v1/reports/sales?fromDate=2026-01-01&toDate=2026-12-31',
      concurrencyLevel: 1,
      ...(await measure({
        warmup: 2,
        samples: 7,
        run: async () => {
          const response = await fetchJson(
            baseUrl,
            'GET',
            `${API_REPORTS_PATH}/sales?fromDate=2026-01-01&toDate=2026-12-31`,
            undefined,
            {},
            jar,
          );
          if (response.status !== 200) {
            throw new Error(`report ${response.status} ${JSON.stringify(response.body)}`);
          }
        },
      })),
    };

    report.scenarios.salePosting = {
      datasetSize: sizes.openingStock,
      operation: 'POST /api/v1/sales (draft) + POST /api/v1/sales/:id/post',
      concurrencyLevel: 1,
      ...(await measure({
        warmup: 1,
        samples: 7,
        run: async () => postSaleSample(0, `timed-sale-${Date.now()}`),
      })),
    };

    report.scenarios.purchasePosting = {
      datasetSize: sizes.openingStock,
      operation: 'POST /api/v1/purchases (draft) + POST /api/v1/purchases/:id/post',
      concurrencyLevel: 1,
      ...(await measure({
        warmup: 1,
        samples: 5,
        run: async () => postPurchaseSample(1, `timed-purch-${Date.now()}`),
      })),
    };

    async function previewImport(rowCount, suffix) {
      const job = await postJson(baseUrl, jar, API_IMPORTS_PATH, { importType: 'product_categories' });
      if (job.status !== 201) {
        throw new Error(`import job ${job.status}`);
      }
      const rows = [];
      for (let i = 0; i < rowCount; i += 1) {
        rows.push({ name: `Imp Cat ${suffix}-${i}`, productClass: 'general' });
      }
      const buffer = renderImportWorkbook('product_categories', rows);
      const binary = await fetch(`${baseUrl}${API_IMPORTS_PATH}/${job.body.data.id}/upload`, {
        method: 'POST',
        headers: {
          cookie: jar.header(),
          [API_CSRF_HEADER]: await issueCsrf(baseUrl, jar),
          'content-type': 'application/vnd.ms-excel',
        },
        body: buffer,
      });
      jar.absorb(binary.headers);
      if (binary.status !== 200) {
        throw new Error(`upload ${binary.status}`);
      }
      const validated = await postJson(baseUrl, jar, `${API_IMPORTS_PATH}/${job.body.data.id}/validate`, {});
      if (validated.status !== 200) {
        throw new Error(`validate ${validated.status} ${JSON.stringify(validated.body)}`);
      }
      return job.body.data.id;
    }

    report.scenarios.importPreview = {
      datasetSize: sizes.importPreviewRows,
      operation: 'import create + upload + validate (product_categories)',
      concurrencyLevel: 1,
      ...(await measure({
        warmup: 1,
        samples: 3,
        run: async () => {
          await previewImport(sizes.importPreviewRows, `p${Date.now()}`);
        },
      })),
    };

    report.scenarios.importExecute = {
      datasetSize: sizes.importExecuteRows,
      operation: 'import preview + POST confirm',
      concurrencyLevel: 1,
      ...(await measure({
        warmup: 0,
        samples: 2,
        run: async () => {
          const jobId = await previewImport(sizes.importExecuteRows, `x${Date.now()}`);
          const confirmed = await postJson(baseUrl, jar, `${API_IMPORTS_PATH}/${jobId}/confirm`, {});
          if (confirmed.status !== 200) {
            throw new Error(`confirm ${confirmed.status} ${JSON.stringify(confirmed.body)}`);
          }
        },
      })),
    };

    const csrf = await issueCsrf(baseUrl, jar);
    jar.freeze();

    const saleCountBefore = await SaleModel.countDocuments({
      organizationId: orgId,
      status: 'posted',
    });
    const stockBefore = await StockMovementModel.countDocuments({
      organizationId: orgId,
      sourceType: 'sale',
    });
    const paymentsBefore = await AccountMovementModel.countDocuments({
      organizationId: orgId,
      sourceType: 'customer_payment',
    });

    const readOps = [
      () => fetchJson(baseUrl, 'GET', `${API_PRODUCTS_PATH}?q=PERF-0001&limit=25`, undefined, {}, jar),
      () => fetchJson(baseUrl, 'GET', API_CUSTOMERS_PATH, undefined, {}, jar),
      () => fetchJson(baseUrl, 'GET', API_SUPPLIERS_PATH, undefined, {}, jar),
      () => fetchJson(baseUrl, 'GET', API_INVENTORY_BALANCES_PATH, undefined, {}, jar),
      () => fetchJson(baseUrl, 'GET', API_INVENTORY_MOVEMENTS_PATH, undefined, {}, jar),
      () => fetchJson(baseUrl, 'GET', API_DASHBOARD_PATH, undefined, {}, jar),
      () =>
        fetchJson(
          baseUrl,
          'GET',
          `${API_REPORTS_PATH}/sales?fromDate=2026-01-01&toDate=2026-12-31`,
          undefined,
          {},
          jar,
        ),
    ];

    const mixedReadTimes = [];
    let mixedFailures = 0;
    let mixedSaleFailures = 0;
    let mixedRequests = 0;
    const mixedInvoices = [];

    const saleUsers = Array.from({ length: MIXED_SALE_POSTING_USERS }, (_, userIndex) =>
      (async () => {
        for (let round = 0; round < MIXED_SALE_POSTS_PER_USER; round += 1) {
          mixedRequests += 1;
          try {
            const posted = await postSaleSample(
              userIndex + round + 2,
              `mix-sale-${userIndex}-${round}-${Date.now()}`,
              csrf,
            );
            mixedInvoices.push(posted.body.data.invoiceNumber);
          } catch {
            mixedSaleFailures += 1;
            mixedFailures += 1;
          }
        }
      })(),
    );

    const readerCount = MIXED_VIRTUAL_USERS - MIXED_SALE_POSTING_USERS;
    const readers = Array.from({ length: readerCount }, (_, userIndex) =>
      (async () => {
        for (let round = 0; round < MIXED_READ_ROUNDS; round += 1) {
          mixedRequests += 1;
          const started = Date.now();
          try {
            const response = await readOps[(userIndex + round) % readOps.length]();
            mixedReadTimes.push(Date.now() - started);
            if (response.status !== 200) {
              mixedFailures += 1;
            }
          } catch {
            mixedFailures += 1;
            mixedReadTimes.push(Date.now() - started);
          }
        }
      })(),
    );

    const mixedStarted = Date.now();
    await Promise.all([...saleUsers, ...readers]);
    jar.unfreeze();

    const mixedReadSummary = summarizeSamples(mixedReadTimes, 0);
    const saleCountAfter = await SaleModel.countDocuments({
      organizationId: orgId,
      status: 'posted',
    });
    const stockAfter = await StockMovementModel.countDocuments({
      organizationId: orgId,
      sourceType: 'sale',
    });
    const paymentsAfter = await AccountMovementModel.countDocuments({
      organizationId: orgId,
      sourceType: 'customer_payment',
    });
    const expectedSaleDelta = MIXED_SALE_POSTING_USERS * MIXED_SALE_POSTS_PER_USER - mixedSaleFailures;
    const postedDelta = saleCountAfter - saleCountBefore;
    const uniqueInvoiceCount = new Set(mixedInvoices).size;
    const leakProbe = await fetchJson(
      baseUrl,
      'GET',
      `${API_PRODUCTS_PATH}?q=FOREIGN-LEAK-001&limit=25`,
      undefined,
      {},
      jar,
    );
    const leakItems = leakProbe.body?.data?.items ?? [];
    const errorRate = mixedRequests === 0 ? 1 : mixedFailures / mixedRequests;

    report.concurrency.mixedWorkload = {
      virtualUsers: MIXED_VIRTUAL_USERS,
      salePostingUsers: MIXED_SALE_POSTING_USERS,
      elapsedMs: Date.now() - mixedStarted,
      requestCount: mixedRequests,
      failureCount: mixedFailures,
      errorRate,
      readP95Ms: mixedReadSummary.p95,
      idlePosSearchP95Ms: report.scenarios.posProductSearchIndexed.p95,
      idleCustomerListP95Ms: report.scenarios.tenantCustomerList.p95,
      readLatencyDegradationMs: {
        vsIdlePosSearch:
          mixedReadSummary.p95 === null || report.scenarios.posProductSearchIndexed.p95 === null
            ? null
            : mixedReadSummary.p95 - report.scenarios.posProductSearchIndexed.p95,
        vsIdleCustomerList:
          mixedReadSummary.p95 === null || report.scenarios.tenantCustomerList.p95 === null
            ? null
            : mixedReadSummary.p95 - report.scenarios.tenantCustomerList.p95,
      },
    };

    report.correctness.noDuplicateInvoices =
      mixedInvoices.length === uniqueInvoiceCount && postedDelta === mixedInvoices.length;
    report.correctness.noLostStockUpdates = stockAfter - stockBefore === mixedInvoices.length;
    report.correctness.noPartialFinancialOrStockEffects =
      paymentsAfter - paymentsBefore === mixedInvoices.length &&
      stockAfter - stockBefore === mixedInvoices.length &&
      postedDelta === mixedInvoices.length;
    report.correctness.noTenantLeakage =
      leakProbe.status === 200 &&
      leakItems.every((item) => item.sku !== 'FOREIGN-LEAK-001' && item.organizationId !== foreign.organizationId);
    report.correctness.normalRequestErrorRateBelowOnePercent = errorRate < MAX_NORMAL_REQUEST_ERROR_RATE;
    report.correctness.expectedSaleDelta = expectedSaleDelta;
    report.correctness.postedDelta = postedDelta;

    const evaluated = evaluateAcceptedThresholds(report);
    report.acceptedPlanningThresholds = evaluated.rows;
    report.acceptedPlanningThresholdsNote =
      'Non-SLA controlled non-production acceptance targets. Not a contractual production capacity or hosting SLA.';
    const correctnessOk = Object.entries(report.correctness)
      .filter(([key]) => key.startsWith('no') || key === 'normalRequestErrorRateBelowOnePercent')
      .every(([, value]) => value === true);
    report.relG06 =
      evaluated.within && correctnessOk
        ? 'measured_within_accepted_planning_thresholds'
        : 'measured_outside_accepted_planning_thresholds';
    report.status = report.relG06 === 'measured_within_accepted_planning_thresholds' ? 'measured' : 'thresholds_exceeded';
    return report;
  } finally {
    if (server) {
      await closeServer(server);
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.dropDatabase().catch(() => undefined);
      await mongoose.disconnect().catch(() => undefined);
    }
  }
}

module.exports = {
  runF09PerformanceBaseline,
  summarizeSamples,
  ACCEPTED_PLANNING_THRESHOLDS_MS,
  MIXED_VIRTUAL_USERS,
  MIXED_SALE_POSTING_USERS,
};
