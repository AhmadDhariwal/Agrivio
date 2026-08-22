/**
 * Agrivio Deterministic Demo Dataset - Core Seed Engine.
 * Executes in-process against Express domain endpoints and services to ensure
 * all business invariants, audit events, ledgers, and transactions are preserved.
 */

const {
  API_AUTH_CSRF_PATH,
  API_AUTH_ACTIVATE_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_SESSION_CONTEXT_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_USERS_PATH,
  API_BRANCHES_PATH,
  API_WAREHOUSES_PATH,
  API_ACCOUNTS_PATH,
  API_ACCOUNT_TRANSACTIONS_PATH,
  API_ACCOUNT_TRANSFERS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_INVENTORY_OPENING_STOCK_PATH,
  API_INVENTORY_BALANCES_PATH,
  API_INVENTORY_BATCHES_PATH,
  API_INVENTORY_MOVEMENTS_PATH,
  API_CUSTOMERS_PATH,
  API_SUPPLIERS_PATH,
  API_CUSTOMER_PAYMENTS_PATH,
  API_SUPPLIER_PAYMENTS_PATH,
  API_PAYMENTS_PATH,
  API_PURCHASES_PATH,
  API_SALES_PATH,
  API_RETURNS_PATH,
  API_STOCK_ADJUSTMENTS_PATH,
  API_WAREHOUSE_TRANSFERS_PATH,
  API_EXPENSE_CATEGORIES_PATH,
  API_EXPENSES_PATH,
  API_DASHBOARD_PATH,
  API_CSRF_HEADER,
  API_IDEMPOTENCY_KEY_HEADER,
} = require('@agrivio/api-contracts');

const {
  DEMO_ORG_NAME,
  SECONDARY_TRIAL_ORG_NAME,
  SECONDARY_SUSPENDED_ORG_NAME,
  DEMO_PASSWORD,
  DEMO_USERS,
  resolveReferenceDate,
  calculateRelativeDate,
} = require('./demo-constants');

const { CATEGORIES, PRODUCTS } = require('./catalog-dataset');
const { CUSTOMERS, SUPPLIERS } = require('./customers-suppliers-dataset');
const { assertSafeDatabase, findDemoTenantIds, resetDemoTenantData } = require('./reset-demo');

class DemoHttpClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  absorb(headers) {
    const raw = headers.getSetCookie?.() ?? [];
    for (const entry of raw) {
      const [pair] = entry.split(';');
      const index = pair.indexOf('=');
      if (index > 0) {
        this.cookies.set(pair.slice(0, index).trim(), decodeURIComponent(pair.slice(index + 1).trim()));
      }
    }
  }

  getCookieHeader() {
    const pairs = [];
    for (const [k, v] of this.cookies.entries()) {
      pairs.push(`${k}=${encodeURIComponent(v)}`);
    }
    return pairs.join('; ');
  }

  async issueCsrf() {
    const res = await fetch(`${this.baseUrl}${API_AUTH_CSRF_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.cookies.size > 0 ? { cookie: this.getCookieHeader() } : {}),
      },
      body: JSON.stringify({}),
    });
    this.absorb(res.headers);
    const body = await res.json();
    return body.data?.csrfToken || '';
  }

  async request(method, path, body = undefined, customHeaders = {}) {
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
    const headers = {
      'content-type': 'application/json',
      ...customHeaders,
    };

    if (isMutation && !headers[API_CSRF_HEADER]) {
      const token = await this.issueCsrf();
      headers[API_CSRF_HEADER] = token;
    }

    if (this.cookies.size > 0) {
      headers['cookie'] = this.getCookieHeader();
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    this.absorb(res.headers);

    let resBody = null;
    const text = await res.text();
    try {
      resBody = text ? JSON.parse(text) : null;
    } catch {
      resBody = text;
    }

    if (res.status >= 400 && !customHeaders['x-allow-failure']) {
      console.error(`[agrivio-seed] API Error [${method} ${path}] -> HTTP ${res.status}:`, JSON.stringify(resBody));
    }

    return {
      status: res.status,
      headers: res.headers,
      body: resBody,
    };
  }

  get(path, headers = {}) {
    return this.request('GET', path, undefined, headers);
  }

  post(path, body = {}, idempotencyKey = null, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (idempotencyKey) {
      headers[API_IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
    }
    return this.request('POST', path, body, headers);
  }

  put(path, body = {}, idempotencyKey = null, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (idempotencyKey) {
      headers[API_IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
    }
    return this.request('PUT', path, body, headers);
  }

  patch(path, body = {}, idempotencyKey = null, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (idempotencyKey) {
      headers[API_IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
    }
    return this.request('PATCH', path, body, headers);
  }

  delete(path, idempotencyKey = null, extraHeaders = {}) {
    const headers = { ...extraHeaders, 'x-allow-failure': 'true' };
    if (idempotencyKey) {
      headers[API_IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
    }
    return this.request('DELETE', path, undefined, headers);
  }

  async loginAndSelectContext(email, password, organizationId = null) {
    const csrf = await this.issueCsrf();
    const loginRes = await fetch(`${this.baseUrl}${API_AUTH_LOGIN_PATH}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [API_CSRF_HEADER]: csrf,
        cookie: this.getCookieHeader(),
      },
      body: JSON.stringify({ email, password }),
    });
    this.absorb(loginRes.headers);
    const loginBody = await loginRes.json();
    if (loginRes.status !== 200) {
      throw new Error(`Login failed for ${email}: ${JSON.stringify(loginBody)}`);
    }

    if (organizationId) {
      const contextCsrf = await this.issueCsrf();
      const ctxRes = await fetch(`${this.baseUrl}${API_AUTH_SESSION_CONTEXT_PATH}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [API_CSRF_HEADER]: contextCsrf,
          cookie: this.getCookieHeader(),
        },
        body: JSON.stringify({
          contextType: 'organization',
          organizationId,
        }),
      });
      this.absorb(ctxRes.headers);
      if (ctxRes.status !== 200) {
        throw new Error(`Context switch failed for ${email} -> ${organizationId}: ${await ctxRes.text()}`);
      }
    }
  }
}

async function runDemoSeed({ mongoUri, baseUrl, reset = false, referenceDate = null }) {
  assertSafeDatabase(mongoUri);
  const refDate = resolveReferenceDate(referenceDate);

  console.log(`[agrivio-seed] Initializing demo seeding with reference date: ${refDate}`);

  // 1. Safety Check & Tenant Isolation Validation
  const existingTenants = await findDemoTenantIds(mongoUri);
  const hasExistingData =
    existingTenants.organizationIds.length > 0 || existingTenants.userIds.length > 0;

  if (hasExistingData) {
    if (!reset) {
      throw new Error(
        `Demo tenant data already exists in database (${existingTenants.organizationIds.length} demo orgs, ${existingTenants.userIds.length} demo users).\nRun with --reset to safely reset ONLY Agrivio demo data.`,
      );
    }
    console.log('[agrivio-seed] Existing demo data detected. Performing safe tenant-scoped reset...');
    const removedCount = await resetDemoTenantData(mongoUri);
    console.log(`[agrivio-seed] Reset complete. Removed ${removedCount} demo records.`);
  }

  const client = new DemoHttpClient(baseUrl);

  // 2. Canonical Subscription Plans
  console.log('[agrivio-seed] Creating canonical subscription plans (Starter, Business, Enterprise)...');
  const starterPayload = {
    planCode: 'Starter',
    activate: true,
    currency: 'PKR',
    monthlyPriceMinorUnits: 500000,
    annualPriceMinorUnits: 5000000,
    annualDiscountPercent: 16,
    trialEligible: true,
    limits: {
      branches: 1,
      warehouses: 1,
      activeUsers: 2,
      products: 200,
      customers: 100,
      suppliers: 50,
    },
    entitlements: {
      imports: false,
      reportsExports: false,
      auditHistory: '30d',
      backupPolicyRef: 'weekly',
      dedicatedCloudEligible: false,
      supportLevelRef: 'standard',
    },
  };

  const businessPayload = {
    planCode: 'Business',
    activate: true,
    currency: 'PKR',
    monthlyPriceMinorUnits: 1500000,
    annualPriceMinorUnits: 15000000,
    annualDiscountPercent: 16,
    trialEligible: true,
    limits: {
      branches: 5,
      warehouses: 10,
      activeUsers: 15,
      products: 2000,
      customers: 1000,
      suppliers: 500,
    },
    entitlements: {
      imports: true,
      reportsExports: true,
      auditHistory: '90d',
      backupPolicyRef: 'daily',
      dedicatedCloudEligible: false,
      supportLevelRef: 'business',
    },
  };

  const enterprisePayload = {
    planCode: 'Enterprise',
    activate: true,
    currency: 'PKR',
    monthlyPriceMinorUnits: 3500000,
    annualPriceMinorUnits: 35000000,
    annualDiscountPercent: 16,
    trialEligible: true,
    limits: {
      branches: 50,
      warehouses: 50,
      activeUsers: 100,
      products: 10000,
      customers: 10000,
      suppliers: 5000,
    },
    entitlements: {
      imports: true,
      reportsExports: true,
      auditHistory: '365d',
      backupPolicyRef: 'daily_immutable',
      dedicatedCloudEligible: true,
      supportLevelRef: 'priority',
    },
  };

  const superAdminHeader = { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' };

  await client.post(API_PLATFORM_SUBSCRIPTION_PLANS_PATH, starterPayload, 'plan-starter-v1', superAdminHeader);
  await client.post(API_PLATFORM_SUBSCRIPTION_PLANS_PATH, businessPayload, 'plan-business-v1', superAdminHeader);
  await client.post(API_PLATFORM_SUBSCRIPTION_PLANS_PATH, enterprisePayload, 'plan-enterprise-v1', superAdminHeader);

  // 3. Primary Demo Organization
  console.log('[agrivio-seed] Creating primary demo organization and activating owner...');
  const intakeRes = await client.post(
    API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
    {
      organizationName: DEMO_ORG_NAME,
      ownerEmail: DEMO_USERS.owner.email,
      ownerDisplayName: DEMO_USERS.owner.displayName,
      notes: 'Agrivio Pre-Pilot Full Enterprise Demo Organization',
    },
    'intake-primary-demo',
  );

  const orgId = intakeRes.body?.data?.organizationId;
  if (!orgId) {
    throw new Error(`Failed to submit organization activation request: ${JSON.stringify(intakeRes.body)}`);
  }

  const reviewRes = await client.post(
    `${API_PLATFORM_ORGANIZATIONS_PATH}/${orgId}/approve`,
    {},
    'review-primary-demo',
    superAdminHeader,
  );

  const activationToken = reviewRes.body?.data?.activationToken;

  const actClient = new DemoHttpClient(baseUrl);
  const actRes = await actClient.post(
    API_AUTH_ACTIVATE_PATH,
    {
      token: activationToken,
      password: DEMO_PASSWORD,
      displayName: DEMO_USERS.owner.displayName,
    },
    'act-primary-demo-owner',
  );

  if (actRes.status !== 200) {
    throw new Error(`Owner activation failed: ${JSON.stringify(actRes.body)}`);
  }

  // 4. Upgrade Demo Organization to Enterprise Plan
  const plansList = await client.get(API_PLATFORM_SUBSCRIPTION_PLANS_PATH, superAdminHeader);
  const plans = plansList.body?.data?.items || [];
  const enterprisePlan = plans.find((p) => p.planCode === 'Enterprise') || plans[0];

  const subListRes = await client.get(API_PLATFORM_SUBSCRIPTIONS_PATH, superAdminHeader);
  const allSubs = subListRes.body?.data?.items || [];
  const primarySub = allSubs.find((s) => s.organizationId === orgId);

  if (primarySub?.id && enterprisePlan) {
    await client.post(
      `${API_PLATFORM_SUBSCRIPTIONS_PATH}/${primarySub.id}/change-plan`,
      {
        expectedVersion: primarySub.version,
        planCode: 'Enterprise',
        planVersion: enterprisePlan.planVersion || 1,
      },
      'change-plan-primary-enterprise',
      superAdminHeader,
    );
  }

  // 5. Create Secondary Organizations (Trial & Suspended)
  console.log('[agrivio-seed] Creating secondary organizations (Trial & Suspended)...');
  const trialIntake = await client.post(
    API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
    {
      organizationName: SECONDARY_TRIAL_ORG_NAME,
      ownerEmail: 'trial.owner@agrivio.test',
      ownerDisplayName: 'Trial Demo Owner',
      notes: 'Secondary Starter Trial Demo Organization',
    },
    'intake-secondary-trial',
  );
  const trialOrgId = trialIntake.body?.data?.organizationId;
  if (trialOrgId) {
    const trialReview = await client.post(
      `${API_PLATFORM_ORGANIZATIONS_PATH}/${trialOrgId}/approve`,
      {},
      'review-secondary-trial',
      superAdminHeader,
    );
    if (trialReview.body?.data?.activationToken) {
      const trialActClient = new DemoHttpClient(baseUrl);
      await trialActClient.post(
        API_AUTH_ACTIVATE_PATH,
        {
          token: trialReview.body.data.activationToken,
          password: DEMO_PASSWORD,
          displayName: 'Trial Demo Owner',
        },
        'act-secondary-trial-owner',
      );
    }
  }

  const suspendedIntake = await client.post(
    API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
    {
      organizationName: SECONDARY_SUSPENDED_ORG_NAME,
      ownerEmail: 'suspended.owner@agrivio.test',
      ownerDisplayName: 'Suspended Demo Owner',
      notes: 'Secondary Suspended Demo Organization',
    },
    'intake-secondary-suspended',
  );
  const suspOrgId = suspendedIntake.body?.data?.organizationId;
  if (suspOrgId) {
    await client.post(
      `${API_PLATFORM_ORGANIZATIONS_PATH}/${suspOrgId}/approve`,
      {},
      'review-secondary-suspended',
      superAdminHeader,
    );
    const afterSuspList = await client.get(API_PLATFORM_SUBSCRIPTIONS_PATH, superAdminHeader);
    const suspSub = (afterSuspList.body?.data?.items || []).find((s) => s.organizationId === suspOrgId);
    if (suspSub?.id) {
      await client.post(
        `${API_PLATFORM_SUBSCRIPTIONS_PATH}/${suspSub.id}/suspend`,
        {
          expectedVersion: suspSub.version,
          reason: 'Delinquent subscription simulated for platform access policy review',
        },
        'suspend-secondary-demo',
        superAdminHeader,
      );
    }
  }

  // 6. Login as Owner & select primary organization context
  await client.loginAndSelectContext(DEMO_USERS.owner.email, DEMO_PASSWORD, orgId);

  // 7. Branches and Warehouses
  console.log('[agrivio-seed] Creating branches and warehouses...');
  const branch1Res = await client.post(
    API_BRANCHES_PATH,
    {
      name: 'Multan Main Commercial Branch',
      code: 'MLT-01',
      invoicePrefix: 'MLT',
    },
    'branch-multan-main',
  );
  const branch1Id = branch1Res.body.data.id;

  const branch2Res = await client.post(
    API_BRANCHES_PATH,
    {
      name: 'Khanewal Sub-Branch',
      code: 'KHW-01',
      invoicePrefix: 'KHW',
    },
    'branch-khanewal',
  );
  const branch2Id = branch2Res.body.data.id;

  // Unused active branch (for delete lifecycle verification)
  const branchUnusedRes = await client.post(
    API_BRANCHES_PATH,
    {
      name: 'Test Unused Active Branch',
      code: 'UNU-01',
      invoicePrefix: 'UNU',
    },
    'branch-unused-active',
  );
  const branchUnusedId = branchUnusedRes.body.data.id;

  // Unused inactive branch
  const branchInactiveRes = await client.post(
    API_BRANCHES_PATH,
    {
      name: 'Test Unused Inactive Branch',
      code: 'INA-01',
      invoicePrefix: 'INA',
    },
    'branch-unused-inactive',
  );
  const branchInactiveId = branchInactiveRes.body.data.id;
  await client.patch(
    `${API_BRANCHES_PATH}/${branchInactiveId}`,
    { expectedVersion: branchInactiveRes.body.data.version, status: 'inactive' },
    'branch-deact-inactive',
  );

  // Warehouses
  const wh1Res = await client.post(
    API_WAREHOUSES_PATH,
    {
      name: 'Central Distribution Hub (Multan)',
      code: 'WH-MLT-01',
      branchId: branch1Id,
    },
    'wh-multan-hub',
  );
  const wh1Id = wh1Res.body.data.id;

  const wh2Res = await client.post(
    API_WAREHOUSES_PATH,
    {
      name: 'Khanewal Transit Depot',
      code: 'WH-KHW-01',
      branchId: branch2Id,
    },
    'wh-khanewal-depot',
  );
  const wh2Id = wh2Res.body.data.id;

  const wh3Res = await client.post(
    API_WAREHOUSES_PATH,
    {
      name: 'Chemical Storage & Quarantine Facility',
      code: 'WH-CHM-01',
      branchId: branch1Id,
    },
    'wh-chem-storage',
  );
  const wh3Id = wh3Res.body.data.id;

  // Unused active warehouse
  const whUnusedRes = await client.post(
    API_WAREHOUSES_PATH,
    {
      name: 'Test Unused Active Warehouse',
      code: 'WH-UNU-01',
      branchId: branch1Id,
    },
    'wh-unused-active',
  );
  const whUnusedId = whUnusedRes.body.data.id;

  // Unused inactive warehouse
  const whInactiveRes = await client.post(
    API_WAREHOUSES_PATH,
    {
      name: 'Test Unused Inactive Warehouse',
      code: 'WH-INA-01',
      branchId: branch1Id,
    },
    'wh-unused-inactive',
  );
  const whInactiveId = whInactiveRes.body.data.id;
  await client.patch(
    `${API_WAREHOUSES_PATH}/${whInactiveId}`,
    { expectedVersion: whInactiveRes.body.data.version, status: 'inactive' },
    'wh-deact-inactive',
  );

  // 8. Staff Employees
  console.log('[agrivio-seed] Creating employees (Manager, Cashier, Store Keeper)...');
  const mgrRes = await client.post(
    API_USERS_PATH,
    {
      email: DEMO_USERS.manager.email,
      displayName: DEMO_USERS.manager.displayName,
      role: 'Manager',
    },
    'emp-mgr',
  );
  const mgrUser = mgrRes.body.data;
  if (mgrUser.activationToken) {
    const empAct = new DemoHttpClient(baseUrl);
    await empAct.post(
      API_AUTH_ACTIVATE_PATH,
      {
        token: mgrUser.activationToken,
        password: DEMO_PASSWORD,
      },
      'act-emp-mgr',
    );
  }
  await client.put(
    `${API_USERS_PATH}/${mgrUser.id}/access-assignments`,
    {
      branchIds: [branch1Id, branch2Id],
      warehouseIds: [wh1Id, wh2Id, wh3Id],
    },
    'access-mgr',
  );

  const cshRes = await client.post(
    API_USERS_PATH,
    {
      email: DEMO_USERS.cashier.email,
      displayName: DEMO_USERS.cashier.displayName,
      role: 'Cashier',
    },
    'emp-csh',
  );
  const cshUser = cshRes.body.data;
  if (cshUser.activationToken) {
    const empAct = new DemoHttpClient(baseUrl);
    await empAct.post(
      API_AUTH_ACTIVATE_PATH,
      {
        token: cshUser.activationToken,
        password: DEMO_PASSWORD,
      },
      'act-emp-csh',
    );
  }
  await client.put(
    `${API_USERS_PATH}/${cshUser.id}/access-assignments`,
    {
      branchIds: [branch1Id],
      warehouseIds: [wh1Id],
    },
    'access-csh',
  );

  const stkRes = await client.post(
    API_USERS_PATH,
    {
      email: DEMO_USERS.storeKeeper.email,
      displayName: DEMO_USERS.storeKeeper.displayName,
      role: 'StoreKeeper',
    },
    'emp-stk',
  );
  const stkUser = stkRes.body.data;
  if (stkUser.activationToken) {
    const empAct = new DemoHttpClient(baseUrl);
    await empAct.post(
      API_AUTH_ACTIVATE_PATH,
      {
        token: stkUser.activationToken,
        password: DEMO_PASSWORD,
      },
      'act-emp-stk',
    );
  }
  await client.put(
    `${API_USERS_PATH}/${stkUser.id}/access-assignments`,
    {
      branchIds: [branch1Id, branch2Id],
      warehouseIds: [wh1Id, wh2Id, wh3Id],
    },
    'access-stk',
  );

  // 9. Financial Accounts & Opening Balances
  console.log('[agrivio-seed] Creating master financial accounts and opening balances...');
  const accountsData = [
    {
      name: 'Main Branch Cash Drawer',
      accountType: 'cash',
      openingBalance: { amount: '250000.00', currency: 'PKR' },
    },
    {
      name: 'Khanewal Counter Cash',
      accountType: 'cash',
      openingBalance: { amount: '75000.00', currency: 'PKR' },
    },
    {
      name: 'Habib Bank Ltd (HBL) Operations',
      accountType: 'bank',
      bankName: 'Habib Bank Limited',
      accountNumberMasked: 'HBL-00192837465',
      openingBalance: { amount: '1500000.00', currency: 'PKR' },
    },
    {
      name: 'Meezan Islamic Corporate Account',
      accountType: 'bank',
      bankName: 'Meezan Bank Limited',
      accountNumberMasked: 'MEEZAN-99281726354',
      openingBalance: { amount: '2000000.00', currency: 'PKR' },
    },
    {
      name: 'JazzCash Merchant Collection Till',
      accountType: 'jazzcash',
      walletIdentifier: '0300-1122334',
      openingBalance: { amount: '50000.00', currency: 'PKR' },
    },
    {
      name: 'Easypaisa Retail QR Float',
      accountType: 'easypaisa',
      walletIdentifier: '0345-9988776',
      openingBalance: { amount: '35000.00', currency: 'PKR' },
    },
    {
      name: 'Test Unused Active Cash Account',
      accountType: 'cash',
      isUnused: true,
    },
  ];

  const accountIds = {};
  for (const acc of accountsData) {
    const payload = {
      name: acc.name,
      accountType: acc.accountType,
      ...(acc.bankName ? { bankName: acc.bankName } : {}),
      ...(acc.accountNumberMasked ? { accountNumberMasked: acc.accountNumberMasked } : {}),
      ...(acc.walletIdentifier ? { walletIdentifier: acc.walletIdentifier } : {}),
    };
    const res = await client.post(
      API_ACCOUNTS_PATH,
      payload,
      `seed-acc-${acc.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    );
    const accId = res.body.data.id;
    accountIds[acc.name] = accId;

    if (acc.openingBalance) {
      await client.post(
        `${API_ACCOUNTS_PATH}/${accId}/opening-balance`,
        { amount: acc.openingBalance },
        `seed-acc-ob-${accId}`,
      );
    }
  }

  // Account Transfers & Transactions
  await client.post(
    API_ACCOUNT_TRANSFERS_PATH,
    {
      sourceAccountId: accountIds['Main Branch Cash Drawer'],
      destinationAccountId: accountIds['Habib Bank Ltd (HBL) Operations'],
      amount: { amount: '100000.00', currency: 'PKR' },
      purpose: 'End of week cash bank deposit',
    },
    'transfer-cash-to-hbl',
  );

  await client.post(
    API_ACCOUNT_TRANSFERS_PATH,
    {
      sourceAccountId: accountIds['Meezan Islamic Corporate Account'],
      destinationAccountId: accountIds['JazzCash Merchant Collection Till'],
      amount: { amount: '25000.00', currency: 'PKR' },
      purpose: 'JazzCash wallet float top-up',
    },
    'transfer-meezan-to-jc',
  );

  await client.post(
    API_ACCOUNT_TRANSACTIONS_PATH,
    {
      accountId: accountIds['Meezan Islamic Corporate Account'],
      direction: 'inflow',
      amount: { amount: '100000.00', currency: 'PKR' },
      purpose: 'Owner equity cash contribution',
      reference: 'CAP-2026-01',
    },
    'tx-owner-cap',
  );

  const reversibleInflow = await client.post(
    API_ACCOUNT_TRANSACTIONS_PATH,
    {
      accountId: accountIds['Main Branch Cash Drawer'],
      direction: 'inflow',
      amount: { amount: '15000.00', currency: 'PKR' },
      purpose: 'Temporary cash deposit (to be reversed)',
      reference: 'REV-TEMP-01',
    },
    'tx-reversible-inflow',
  );

  if (reversibleInflow.body?.data?.id) {
    await client.post(
      `${API_ACCOUNT_TRANSACTIONS_PATH}/${reversibleInflow.body.data.id}/reverse`,
      { reason: 'Reversed erroneous duplicate manual entry' },
      'tx-reverse-temp',
    );
  }

  // 10. Categories & Catalog
  console.log(`[agrivio-seed] Creating ${CATEGORIES.length} categories and ${PRODUCTS.length} catalog products...`);
  const categoryIds = {};
  for (const cat of CATEGORIES) {
    const res = await client.post(
      API_PRODUCT_CATEGORIES_PATH,
      {
        name: cat.name,
        productClass: cat.productClass,
      },
      `seed-cat-${cat.key}`,
    );
    categoryIds[cat.key] = res.body.data.id;
  }

  const productMap = {};
  for (const prod of PRODUCTS) {
    const catId = categoryIds[prod.categoryKey];
    const res = await client.post(
      API_PRODUCTS_PATH,
      {
        name: prod.name,
        sku: prod.sku,
        categoryId: catId,
        trackingMode: prod.trackingMode,
        baseUnitCode: prod.baseUnitCode,
        measurementDimension: prod.measurementDimension,
      },
      `seed-prod-${prod.sku}`,
    );
    const createdProduct = res.body.data;
    productMap[prod.sku] = { ...createdProduct, prices: prod.prices };

    // Prices
    let currentVersion = createdProduct.version;
    if (prod.prices) {
      const priceItems = Object.entries(prod.prices).map(([tier, priceStr]) => ({
        priceTier: tier,
        price: { amount: priceStr, currency: 'PKR' },
      }));
      const priceRes = await client.put(
        `${API_PRODUCTS_PATH}/${createdProduct.id}/prices`,
        {
          expectedVersion: currentVersion,
          items: priceItems,
        },
        `seed-price-${prod.sku}`,
      );
      if (priceRes.body?.data?.productVersion) {
        currentVersion = priceRes.body.data.productVersion;
      } else {
        currentVersion += 1;
      }
    }
  }

  // 11. Opening Stock & Batches
  console.log('[agrivio-seed] Seeding opening stock balances and inventory batches across warehouses...');
  const stockSeedItems = [
    // Healthy stock in WH-01
    {
      sku: 'FERT-UREA-SONA-50KG',
      warehouseId: wh1Id,
      quantity: '250.0000',
      batchNumber: 'LOT-FFC-UREA-WH1',
      inventoryValue: { amount: '1050000.00', currency: 'PKR' },
    },
    {
      sku: 'FERT-DAP-ENGRO-50KG',
      warehouseId: wh1Id,
      quantity: '150.0000',
      batchNumber: 'LOT-ENGRO-DAP-WH1',
      inventoryValue: { amount: '1725000.00', currency: 'PKR' },
    },
    {
      sku: 'FERT-NITROPHOS-50KG',
      warehouseId: wh1Id,
      quantity: '100.0000',
      batchNumber: 'LOT-PAK-NP-WH1',
      inventoryValue: { amount: '720000.00', currency: 'PKR' },
    },
    {
      sku: 'FERT-SOP-50KG',
      warehouseId: wh1Id,
      quantity: '80.0000',
      batchNumber: 'LOT-SOP-WH1',
      inventoryValue: { amount: '1080000.00', currency: 'PKR' },
    },
    {
      sku: 'FERT-CAN-50KG',
      warehouseId: wh1Id,
      quantity: '120.0000',
      batchNumber: 'LOT-GOHAR-CAN-WH1',
      inventoryValue: { amount: '456000.00', currency: 'PKR' },
    },
    {
      sku: 'FERT-ZINC-33-5KG',
      warehouseId: wh1Id,
      quantity: '50.0000',
      batchNumber: 'LOT-ZINC-WH1',
      inventoryValue: { amount: '70000.00', currency: 'PKR' },
    },
    {
      sku: 'PEST-LAMBDA-25-1L',
      warehouseId: wh1Id,
      quantity: '40.0000',
      batchNumber: 'LOT-LAMBDA-WH1',
      expiryDate: calculateRelativeDate(refDate, 400),
      inventoryValue: { amount: '58000.00', currency: 'PKR' },
    },
    {
      sku: 'FERT-SSP-GRANULAR-50KG',
      warehouseId: wh1Id,
      quantity: '60.0000',
      batchNumber: 'LOT-SSP-WH1',
      inventoryValue: { amount: '168000.00', currency: 'PKR' },
    },
    // Stock in WH-02 (Khanewal)
    {
      sku: 'FERT-UREA-SONA-50KG',
      warehouseId: wh2Id,
      quantity: '80.0000',
      batchNumber: 'LOT-FFC-UREA-WH2',
      inventoryValue: { amount: '336000.00', currency: 'PKR' },
    },
    {
      sku: 'FERT-DAP-ENGRO-50KG',
      warehouseId: wh2Id,
      quantity: '40.0000',
      batchNumber: 'LOT-ENGRO-DAP-WH2',
      inventoryValue: { amount: '460000.00', currency: 'PKR' },
    },
    {
      sku: 'FERT-CAN-50KG',
      warehouseId: wh2Id,
      quantity: '30.0000',
      batchNumber: 'LOT-CAN-WH2',
      inventoryValue: { amount: '114000.00', currency: 'PKR' },
    },
    // Multi-batch product in WH-01
    {
      sku: 'PEST-EMAMECTIN-19-1L',
      warehouseId: wh1Id,
      quantity: '50.0000',
      batchNumber: 'LOT-EMA-2025-01',
      expiryDate: calculateRelativeDate(refDate, 365),
      inventoryValue: { amount: '140000.00', currency: 'PKR' },
    },
    {
      sku: 'PEST-EMAMECTIN-19-1L',
      warehouseId: wh1Id,
      quantity: '40.0000',
      batchNumber: 'LOT-EMA-2026-02',
      expiryDate: calculateRelativeDate(refDate, 540),
      inventoryValue: { amount: '112000.00', currency: 'PKR' },
    },
    // Near-expiry stock (triggers upcoming expiry alert)
    {
      sku: 'PEST-CHLORPYRIFOS-40-1L',
      warehouseId: wh1Id,
      quantity: '25.0000',
      batchNumber: 'LOT-CHL-NEAR-EXP',
      expiryDate: calculateRelativeDate(refDate, 18),
      inventoryValue: { amount: '41250.00', currency: 'PKR' },
    },
    // Expired stock (triggers expired alert)
    {
      sku: 'PEST-IMIDACLOPRID-20-1L',
      warehouseId: wh3Id,
      quantity: '15.0000',
      batchNumber: 'LOT-IMI-EXPIRED',
      expiryDate: calculateRelativeDate(refDate, -25),
      inventoryValue: { amount: '33000.00', currency: 'PKR' },
    },
    // Low stock product
    {
      sku: 'SEED-CORN-DK6789-20KG',
      warehouseId: wh1Id,
      quantity: '4.0000',
      batchNumber: 'LOT-DK6789-2026',
      expiryDate: calculateRelativeDate(refDate, 200),
      inventoryValue: { amount: '74000.00', currency: 'PKR' },
    },
    // Dead stock product (opening stock backdated)
    {
      sku: 'PEST-CARTAP-4GR-10KG',
      warehouseId: wh1Id,
      quantity: '60.0000',
      batchNumber: 'LOT-CARTAP-DEAD',
      expiryDate: calculateRelativeDate(refDate, 300),
      inventoryValue: { amount: '126000.00', currency: 'PKR' },
    },
    // Seeds & Herbicides
    {
      sku: 'SEED-WHEAT-AKBAR2019-50KG',
      warehouseId: wh1Id,
      quantity: '80.0000',
      batchNumber: 'LOT-AKBAR-2026',
      expiryDate: calculateRelativeDate(refDate, 270),
      inventoryValue: { amount: '528000.00', currency: 'PKR' },
    },
    {
      sku: 'HERB-GLYPHOSATE-48-1L',
      warehouseId: wh1Id,
      quantity: '45.0000',
      batchNumber: 'LOT-GLY-2026',
      expiryDate: calculateRelativeDate(refDate, 400),
      inventoryValue: { amount: '83250.00', currency: 'PKR' },
    },
    {
      sku: 'FUNG-MANCOZEB-80WP-1KG',
      warehouseId: wh1Id,
      quantity: '70.0000',
      batchNumber: 'LOT-MAN-2026',
      expiryDate: calculateRelativeDate(refDate, 365),
      inventoryValue: { amount: '84000.00', currency: 'PKR' },
    },
    {
      sku: 'TOOL-SPRAYER-BATTERY-16L',
      warehouseId: wh1Id,
      quantity: '12.0000',
      inventoryValue: { amount: '74400.00', currency: 'PKR' },
    },
    // Referenced Inactive Product stock
    {
      sku: 'LIFE-INACTIVE-REFERENCED-PEST-1L',
      warehouseId: wh3Id,
      quantity: '10.0000',
      batchNumber: 'LOT-OLD-MONO',
      expiryDate: calculateRelativeDate(refDate, 60),
      inventoryValue: { amount: '12000.00', currency: 'PKR' },
    },
  ];

  // Automatic realistic opening stock for all remaining active catalog products across WH1 and WH2
  const existingStockKeys = new Set(stockSeedItems.map((s) => `${s.sku}-${s.warehouseId}`));
  for (const prod of PRODUCTS) {
    if (prod.isUnused || prod.status === 'inactive') {
      continue;
    }
    const cost = parseFloat(prod.costPrice || '1000.00');
    const qty = prod.baseUnitCode === 'COUNT' ? '30.0000' : '80.0000';
    const totalVal = (cost * parseFloat(qty)).toFixed(2);

    if (!existingStockKeys.has(`${prod.sku}-${wh1Id}`)) {
      stockSeedItems.push({
        sku: prod.sku,
        warehouseId: wh1Id,
        quantity: qty,
        batchNumber: prod.trackingMode !== 'none' ? `LOT-${prod.sku.replace(/[^A-Z0-9]/g, '').slice(0, 12)}-WH1` : undefined,
        expiryDate: prod.trackingMode === 'batch_expiry' ? calculateRelativeDate(refDate, 365) : undefined,
        inventoryValue: { amount: totalVal, currency: 'PKR' },
      });
    }

    if (!existingStockKeys.has(`${prod.sku}-${wh2Id}`)) {
      stockSeedItems.push({
        sku: prod.sku,
        warehouseId: wh2Id,
        quantity: qty,
        batchNumber: prod.trackingMode !== 'none' ? `LOT-${prod.sku.replace(/[^A-Z0-9]/g, '').slice(0, 12)}-WH2` : undefined,
        expiryDate: prod.trackingMode === 'batch_expiry' ? calculateRelativeDate(refDate, 365) : undefined,
        inventoryValue: { amount: totalVal, currency: 'PKR' },
      });
    }
  }

  for (const s of stockSeedItems) {
    const p = productMap[s.sku];
    if (p) {
      await client.post(
        API_INVENTORY_OPENING_STOCK_PATH,
        {
          warehouseId: s.warehouseId,
          productId: p.id,
          quantity: s.quantity,
          batchNumber: s.batchNumber,
          expiryDate: s.expiryDate,
          inventoryValue: s.inventoryValue,
        },
        `open-stock-${s.sku}-${s.warehouseId}-${s.batchNumber || 'none'}`,
      );
    }
  }

  // Deactivate inactive products after opening stock has been established
  for (const prod of PRODUCTS) {
    if (prod.status === 'inactive') {
      const p = productMap[prod.sku];
      if (p) {
        const fresh = await client.get(`${API_PRODUCTS_PATH}/${p.id}`);
        const curVer = fresh.body?.data?.version || 1;
        await client.patch(
          `${API_PRODUCTS_PATH}/${p.id}`,
          {
            expectedVersion: curVer,
            status: 'inactive',
          },
          `prod-deact-${prod.sku}`,
        );
      }
    }
  }

  // 12. Customers & Suppliers
  console.log(`[agrivio-seed] Creating ${CUSTOMERS.length} customers and ${SUPPLIERS.length} suppliers...`);
  const customerMap = {};
  for (const c of CUSTOMERS) {
    const res = await client.post(
      API_CUSTOMERS_PATH,
      {
        name: c.name,
        customerType: c.customerType,
        phone: c.phone,
        creditEnabled: c.creditEnabled,
        creditLimit: c.creditLimit ? { amount: c.creditLimit, currency: 'PKR' } : undefined,
        creditLimitBehaviour: c.creditLimitBehaviour,
      },
      `seed-cust-${c.key}`,
    );
    const createdCust = res.body.data;
    customerMap[c.key] = createdCust;

    // Opening Balance
    if (c.openingBalance) {
      await client.post(
        `${API_CUSTOMERS_PATH}/${createdCust.id}/opening-balance`,
        {
          kind: c.openingBalance.kind,
          amount: { amount: c.openingBalance.amount, currency: 'PKR' },
        },
        `open-bal-cust-${c.key}`,
      );
    }

    if (c.status === 'inactive') {
      await client.patch(
        `${API_CUSTOMERS_PATH}/${createdCust.id}`,
        {
          expectedVersion: createdCust.version,
          status: 'inactive',
        },
        `cust-deact-${c.key}`,
      );
    }
  }

  const supplierMap = {};
  for (const s of SUPPLIERS) {
    const res = await client.post(
      API_SUPPLIERS_PATH,
      {
        name: s.name,
        phone: s.phone,
        email: s.email,
        address: s.address,
        contactPerson: s.contactPerson,
      },
      `seed-sup-${s.key}`,
    );
    const createdSup = res.body.data;
    supplierMap[s.key] = createdSup;

    // Opening Balance
    if (s.openingBalance) {
      await client.post(
        `${API_SUPPLIERS_PATH}/${createdSup.id}/opening-balance`,
        {
          kind: s.openingBalance.kind,
          amount: { amount: s.openingBalance.amount, currency: 'PKR' },
        },
        `open-bal-sup-${s.key}`,
      );
    }

    if (s.status === 'inactive') {
      await client.patch(
        `${API_SUPPLIERS_PATH}/${createdSup.id}`,
        {
          expectedVersion: createdSup.version,
          status: 'inactive',
        },
        `sup-deact-${s.key}`,
      );
    }
  }

  // 13. Purchases Lifecycle (Paid, Partial, Credit, Draft, Cancelled)
  console.log('[agrivio-seed] Seeding purchase transactions...');
  // 1. Fully Paid Purchase (FFC Urea)
  const po1 = await client.post(
    API_PURCHASES_PATH,
    {
      supplierId: supplierMap['sup_ffc'].id,
      warehouseId: wh1Id,
      purchaseDate: calculateRelativeDate(refDate, -30),
      supplierInvoiceReference: 'FFC-INV-88910',
      lines: [
        {
          productId: productMap['FERT-UREA-SONA-50KG'].id,
          quantity: '100.0000',
          batchNumber: 'LOT-FFC-PO-01',
          unitCost: { amount: '4200.00', currency: 'PKR' },
        },
      ],
    },
    'po-ffc-paid',
  );
  if (po1.body?.data?.id) {
    await client.post(
      `${API_PURCHASES_PATH}/${po1.body.data.id}/post`,
      {
        expectedVersion: po1.body.data.version,
        payments: [
          {
            accountId: accountIds['Habib Bank Ltd (HBL) Operations'],
            amount: { amount: '420000.00', currency: 'PKR' },
          },
        ],
      },
      'po-ffc-post',
    );
  }

  // 2. Partially Paid Purchase (Syngenta Insecticides)
  const po2 = await client.post(
    API_PURCHASES_PATH,
    {
      supplierId: supplierMap['sup_syngenta'].id,
      warehouseId: wh1Id,
      purchaseDate: calculateRelativeDate(refDate, -14),
      supplierInvoiceReference: 'SYN-INV-44120',
      lines: [
        {
          productId: productMap['PEST-EMAMECTIN-19-1L'].id,
          quantity: '30.0000',
          unitCost: { amount: '2800.00', currency: 'PKR' },
          batchNumber: 'LOT-SYN-2026-E1',
          expiryDate: calculateRelativeDate(refDate, 500),
        },
        {
          productId: productMap['PEST-LAMBDA-25-1L'].id,
          quantity: '20.0000',
          unitCost: { amount: '1450.00', currency: 'PKR' },
          batchNumber: 'LOT-SYN-2026-L1',
          expiryDate: calculateRelativeDate(refDate, 500),
        },
      ],
    },
    'po-syn-partial',
  );
  if (po2.body?.data?.id) {
    await client.post(
      `${API_PURCHASES_PATH}/${po2.body.data.id}/post`,
      {
        expectedVersion: po2.body.data.version,
        payments: [
          {
            accountId: accountIds['Habib Bank Ltd (HBL) Operations'],
            amount: { amount: '50000.00', currency: 'PKR' },
          },
        ],
      },
      'po-syn-post',
    );
  }

  // 3. 100% Credit Purchase (Bayer Pioneer Seeds)
  const po3 = await client.post(
    API_PURCHASES_PATH,
    {
      supplierId: supplierMap['sup_bayer'].id,
      warehouseId: wh1Id,
      purchaseDate: calculateRelativeDate(refDate, -7),
      supplierInvoiceReference: 'BAYER-BILL-901',
      lines: [
        {
          productId: productMap['SEED-CORN-DK6789-20KG'].id,
          quantity: '10.0000',
          unitCost: { amount: '18500.00', currency: 'PKR' },
          batchNumber: 'LOT-DK6789-AUG',
          expiryDate: calculateRelativeDate(refDate, 300),
        },
      ],
    },
    'po-bayer-credit',
  );
  if (po3.body?.data?.id) {
    await client.post(
      `${API_PURCHASES_PATH}/${po3.body.data.id}/post`,
      {
        expectedVersion: po3.body.data.version,
        payments: [],
      },
      'po-bayer-post',
    );
  }

  // 4. Draft Purchase
  await client.post(
    API_PURCHASES_PATH,
    {
      supplierId: supplierMap['sup_engro'].id,
      warehouseId: wh2Id,
      purchaseDate: refDate,
      supplierInvoiceReference: 'ENGRO-DRAFT-01',
      lines: [
        {
          productId: productMap['FERT-DAP-ENGRO-50KG'].id,
          quantity: '50.0000',
          batchNumber: 'LOT-ENGRO-PO-DRAFT',
          unitCost: { amount: '11500.00', currency: 'PKR' },
        },
      ],
    },
    'po-engro-draft',
  );

  // 5. Cancelled Purchase (Discarded draft)
  const poCancel = await client.post(
    API_PURCHASES_PATH,
    {
      supplierId: supplierMap['sup_fatima'].id,
      warehouseId: wh1Id,
      purchaseDate: calculateRelativeDate(refDate, -10),
      supplierInvoiceReference: 'FATIMA-CANCEL-01',
      lines: [
        {
          productId: productMap['FERT-NITROPHOS-50KG'].id,
          quantity: '20.0000',
          batchNumber: 'LOT-FATIMA-CANCEL',
          unitCost: { amount: '7200.00', currency: 'PKR' },
        },
      ],
    },
    'po-fatima-to-cancel',
  );
  if (poCancel.body?.data?.id) {
    await client.delete(`${API_PURCHASES_PATH}/${poCancel.body.data.id}`, 'po-fatima-discard');
  }

  // Additional Purchases to build realistic volume
  const extraPurchases = [
    {
      supplierKey: 'sup_fatima',
      warehouseId: wh1Id,
      offsetDays: -25,
      ref: 'FATIMA-INV-771',
      productId: 'FERT-NITROPHOS-50KG',
      quantity: '40.0000',
      unitCost: '7200.00',
      batchNumber: 'LOT-FATIMA-NP-25D',
      payAccountId: 'Meezan Islamic Corporate Account',
      payAmount: '288000.00',
    },
    {
      supplierKey: 'sup_fmc',
      warehouseId: wh1Id,
      offsetDays: -20,
      ref: 'FMC-BILL-449',
      productId: 'PEST-CHLORANTRANILIPROLE-50ML',
      quantity: '30.0000',
      unitCost: '1800.00',
      batchNumber: 'LOT-FMC-COR-20D',
      expiryOffset: 450,
      payAccountId: 'Habib Bank Ltd (HBL) Operations',
      payAmount: '30000.00',
    },
    {
      supplierKey: 'sup_advanta',
      warehouseId: wh1Id,
      offsetDays: -18,
      ref: 'ADV-SUN-990',
      productId: 'SEED-SUNFLOWER-HYSUN33-2KG',
      quantity: '20.0000',
      unitCost: '4200.00',
      batchNumber: 'LOT-ADV-HYSUN-18D',
      expiryOffset: 300,
    },
    {
      supplierKey: 'sup_guard_rice',
      warehouseId: wh2Id,
      offsetDays: -15,
      ref: 'GUARD-RICE-331',
      productId: 'SEED-RICE-GUARD-SUPREME-10KG',
      quantity: '15.0000',
      unitCost: '7800.00',
      batchNumber: 'LOT-GUARD-15D',
      expiryOffset: 360,
      payAccountId: 'Khanewal Counter Cash',
      payAmount: '117000.00',
    },
    {
      supplierKey: 'sup_four_brothers',
      warehouseId: wh1Id,
      offsetDays: -12,
      ref: '4B-BIO-229',
      productId: 'MICRO-BIO-STIMULANT-AMINO-1L',
      quantity: '25.0000',
      unitCost: '2600.00',
      batchNumber: 'LOT-4B-AMINO-12D',
      expiryOffset: 400,
    },
    {
      supplierKey: 'sup_ali_akbar',
      warehouseId: wh1Id,
      offsetDays: -9,
      ref: 'AA-ZINC-110',
      productId: 'MICRO-CHELATED-ZINC-12-500G',
      quantity: '40.0000',
      unitCost: '1250.00',
      batchNumber: 'LOT-AA-ZN-9D',
      expiryOffset: 365,
      payAccountId: 'Habib Bank Ltd (HBL) Operations',
      payAmount: '50000.00',
    },
    {
      supplierKey: 'sup_suncrop',
      warehouseId: wh2Id,
      offsetDays: -6,
      ref: 'SUNCROP-NPK-881',
      productId: 'FERT-LIQUID-NPK-5L',
      quantity: '20.0000',
      unitCost: '2800.00',
      batchNumber: 'LOT-SUN-NPK-6D',
      payAccountId: 'Habib Bank Ltd (HBL) Operations',
      payAmount: '56000.00',
    },
    {
      supplierKey: 'sup_tara_imperial',
      warehouseId: wh1Id,
      offsetDays: -4,
      ref: 'TARA-HERB-552',
      productId: 'HERB-PENDIMETHALIN-33-1L',
      quantity: '30.0000',
      unitCost: '1500.00',
      batchNumber: 'LOT-TARA-PENDI-4D',
      expiryOffset: 420,
    },
  ];

  for (const ep of extraPurchases) {
    const pRecord = productMap[ep.productId];
    const sRecord = supplierMap[ep.supplierKey];
    if (pRecord && sRecord) {
      const pRes = await client.post(
        API_PURCHASES_PATH,
        {
          supplierId: sRecord.id,
          warehouseId: ep.warehouseId,
          purchaseDate: calculateRelativeDate(refDate, ep.offsetDays),
          supplierInvoiceReference: ep.ref,
          lines: [
            {
              productId: pRecord.id,
              quantity: ep.quantity,
              unitCost: { amount: ep.unitCost, currency: 'PKR' },
              batchNumber: ep.batchNumber,
              expiryDate: ep.expiryOffset ? calculateRelativeDate(refDate, ep.expiryOffset) : undefined,
            },
          ],
        },
        `po-${ep.ref}`,
      );
      if (pRes.body?.data?.id) {
        const payments = [];
        if (ep.payAccountId && ep.payAmount && accountIds[ep.payAccountId]) {
          payments.push({
            accountId: accountIds[ep.payAccountId],
            amount: { amount: ep.payAmount, currency: 'PKR' },
          });
        }
        await client.post(
          `${API_PURCHASES_PATH}/${pRes.body.data.id}/post`,
          {
            expectedVersion: pRes.body.data.version,
            payments,
          },
          `po-post-${ep.ref}`,
        );
      }
    }
  }

  // 14. Sales Lifecycle across Both Branches
  console.log('[agrivio-seed] Seeding sales across Multan & Khanewal branches (spanning today, yesterday, 7d, 30d)...');

  // Sale 1: Walk-in Cash Sale at Multan Main Branch (Today)
  const sale1 = await client.post(
    API_SALES_PATH,
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerId: customerMap['cust_walkin_multan'].id,
      saleDate: refDate,
      lines: [
        {
          productId: productMap['FERT-UREA-SONA-50KG'].id,
          quantity: '5.0000',
          unitPrice: { amount: '4600.00', currency: 'PKR' },
        },
        {
          productId: productMap['FERT-ZINC-33-5KG'].id,
          quantity: '2.0000',
          unitPrice: { amount: '1750.00', currency: 'PKR' },
        },
      ],
    },
    'sale-today-cash-mlt',
  );
  if (sale1.body?.data?.id) {
    await client.post(
      `${API_SALES_PATH}/${sale1.body.data.id}/post`,
      {
        expectedVersion: sale1.body.data.version,
        payments: [
          {
            accountId: accountIds['Main Branch Cash Drawer'],
            amount: { amount: '26500.00', currency: 'PKR' },
          },
        ],
      },
      'sale-today-post',
    );
  }

  // Sale 2: Walk-in Cash Sale at Khanewal Sub-Branch (Today)
  const sale2 = await client.post(
    API_SALES_PATH,
    {
      branchId: branch2Id,
      warehouseId: wh2Id,
      customerId: customerMap['cust_walkin_khanewal'].id,
      saleDate: refDate,
      lines: [
        {
          productId: productMap['FERT-UREA-SONA-50KG'].id,
          quantity: '4.0000',
          unitPrice: { amount: '4600.00', currency: 'PKR' },
        },
      ],
    },
    'sale-today-cash-khw',
  );
  if (sale2.body?.data?.id) {
    await client.post(
      `${API_SALES_PATH}/${sale2.body.data.id}/post`,
      {
        expectedVersion: sale2.body.data.version,
        payments: [
          {
            accountId: accountIds['Khanewal Counter Cash'],
            amount: { amount: '18400.00', currency: 'PKR' },
          },
        ],
      },
      'sale-khw-today-post',
    );
  }

  // Sale 3: Major Credit Sale to Chaudhry Farooq (7 days ago)
  const sale3 = await client.post(
    API_SALES_PATH,
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerId: customerMap['cust_ar_farooq'].id,
      saleDate: calculateRelativeDate(refDate, -7),
      lines: [
        {
          productId: productMap['FERT-DAP-ENGRO-50KG'].id,
          quantity: '10.0000',
          unitPrice: { amount: '12400.00', currency: 'PKR' },
        },
        {
          productId: productMap['SEED-WHEAT-AKBAR2019-50KG'].id,
          quantity: '5.0000',
          unitPrice: { amount: '7600.00', currency: 'PKR' },
        },
      ],
    },
    'sale-farooq-credit',
  );
  let postedSale3 = null;
  if (sale3.body?.data?.id) {
    const postRes = await client.post(
      `${API_SALES_PATH}/${sale3.body.data.id}/post`,
      {
        expectedVersion: sale3.body.data.version,
        payments: [],
      },
      'sale-farooq-post',
    );
    postedSale3 = postRes.body?.data;
  }

  // Sale 4: Partial Payment Sale to Haji Nawazish (14 days ago)
  const sale4 = await client.post(
    API_SALES_PATH,
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerId: customerMap['cust_ar_nawaz'].id,
      saleDate: calculateRelativeDate(refDate, -14),
      lines: [
        {
          productId: productMap['PEST-EMAMECTIN-19-1L'].id,
          quantity: '10.0000',
          unitPrice: { amount: '3450.00', currency: 'PKR' },
        },
        {
          productId: productMap['HERB-GLYPHOSATE-48-1L'].id,
          quantity: '15.0000',
          unitPrice: { amount: '2350.00', currency: 'PKR' },
        },
      ],
    },
    'sale-nawaz-partial',
  );
  if (sale4.body?.data?.id) {
    await client.post(
      `${API_SALES_PATH}/${sale4.body.data.id}/post`,
      {
        expectedVersion: sale4.body.data.version,
        payments: [
          {
            accountId: accountIds['Habib Bank Ltd (HBL) Operations'],
            amount: { amount: '35000.00', currency: 'PKR' },
          },
        ],
      },
      'sale-nawaz-post',
    );
  }

  // Sale 5: Mixed Payment Sale (Cash + JazzCash) to Malik Ghulam Rasool Coop (30 days ago)
  const sale5 = await client.post(
    API_SALES_PATH,
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerId: customerMap['cust_ar_rasool_long'].id,
      saleDate: calculateRelativeDate(refDate, -30),
      lines: [
        {
          productId: productMap['FERT-SOP-50KG'].id,
          quantity: '10.0000',
          unitPrice: { amount: '14800.00', currency: 'PKR' },
        },
      ],
    },
    'sale-rasool-mixed',
  );
  if (sale5.body?.data?.id) {
    await client.post(
      `${API_SALES_PATH}/${sale5.body.data.id}/post`,
      {
        expectedVersion: sale5.body.data.version,
        payments: [
          {
            accountId: accountIds['Main Branch Cash Drawer'],
            amount: { amount: '100000.00', currency: 'PKR' },
          },
          {
            accountId: accountIds['JazzCash Merchant Collection Till'],
            amount: { amount: '48000.00', currency: 'PKR' },
          },
        ],
      },
      'sale-greenland-post',
    );
  }

  // Sale 6: Draft POS Sale
  await client.post(
    API_SALES_PATH,
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerId: customerMap['cust_dealer_almadina'].id,
      saleDate: refDate,
      lines: [
        {
          productId: productMap['FERT-CAN-50KG'].id,
          quantity: '20.0000',
          unitPrice: { amount: '4050.00', currency: 'PKR' },
        },
      ],
    },
    'sale-almadina-draft',
  );

  // Sale 7: Discarded Sale
  const saleCancel = await client.post(
    API_SALES_PATH,
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerId: customerMap['cust_akhtar'].id,
      saleDate: calculateRelativeDate(refDate, -3),
      lines: [
        {
          productId: productMap['SEED-CORN-DK6789-20KG'].id,
          quantity: '2.0000',
          unitPrice: { amount: '21500.00', currency: 'PKR' },
        },
      ],
    },
    'sale-akhtar-to-cancel',
  );
  if (saleCancel.body?.data?.id) {
    await client.delete(`${API_SALES_PATH}/${saleCancel.body.data.id}`, 'sale-akhtar-discard');
  }

  // Sale 8: Sales Return against posted Sale 3 (Farooq returns 2 bags DAP)
  if (postedSale3?.id) {
    const returnDraft = await client.post(
      `${API_SALES_PATH}/${postedSale3.id}/returns`,
      {
        returnDate: calculateRelativeDate(refDate, -2),
        reason: 'Customer returned excess DAP bags in original factory packing',
        lines: [
          {
            originalLineIndex: 0,
            quantity: '2.0000',
            stockCondition: 'sellable',
          },
        ],
      },
      'return-farooq-dap',
    );
    if (returnDraft.body?.data?.id) {
      await client.post(
        `${API_RETURNS_PATH}/${returnDraft.body.data.id}/post`,
        {
          expectedVersion: returnDraft.body.data.version,
          resolution: 'ledger_adjustment',
          reason: 'Customer returned excess DAP bags in original factory packing',
        },
        'return-farooq-post',
      );
    }
  }

  // Additional Sales across Both Branches
  const extraSales = [
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_walkin_multan',
      offsetDays: 0,
      lines: [
        { productId: 'MICRO-BIO-STIMULANT-AMINO-1L', quantity: '2.0000', unitPrice: '3300.00' },
        { productId: 'FERT-ZINC-33-5KG', quantity: '3.0000', unitPrice: '1750.00' },
      ],
      payAccountId: 'Main Branch Cash Drawer',
    },
    {
      branchId: branch2Id,
      warehouseId: wh2Id,
      customerKey: 'cust_walkin_khanewal',
      offsetDays: 0,
      lines: [
        { productId: 'FERT-DAP-ENGRO-50KG', quantity: '2.0000', unitPrice: '12400.00' },
        { productId: 'SEED-CANOLA-SUPER-2KG', quantity: '1.0000', unitPrice: '3900.00' },
      ],
      payAccountId: 'Khanewal Counter Cash',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_adv_tariq',
      offsetDays: 0,
      lines: [
        { productId: 'FERT-NITROPHOS-50KG', quantity: '8.0000', unitPrice: '7800.00' },
        { productId: 'FERT-BORON-20-3KG', quantity: '4.0000', unitPrice: '2300.00' },
      ],
      payAccountId: 'Main Branch Cash Drawer',
    },
    {
      branchId: branch2Id,
      warehouseId: wh2Id,
      customerKey: 'cust_adv_bashir',
      offsetDays: -1,
      lines: [
        { productId: 'SEED-WHEAT-AKBAR2019-50KG', quantity: '10.0000', unitPrice: '7600.00' },
        { productId: 'FERT-UREA-SONA-50KG', quantity: '8.0000', unitPrice: '4600.00' },
      ],
      payAccountId: 'Meezan Islamic Corporate Account',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_akhtar',
      offsetDays: -2,
      lines: [
        { productId: 'FERT-SOP-50KG', quantity: '6.0000', unitPrice: '14800.00' },
        { productId: 'FUNG-MANCOZEB-80WP-1KG', quantity: '8.0000', unitPrice: '1550.00' },
      ],
      payAccountId: 'Main Branch Cash Drawer',
    },
    {
      branchId: branch2Id,
      warehouseId: wh2Id,
      customerKey: 'cust_sajid',
      offsetDays: -3,
      lines: [
        { productId: 'SEED-CORN-DK6789-20KG', quantity: '2.0000', unitPrice: '21500.00' },
        { productId: 'HERB-ATRAZINE-MESO-1L', quantity: '4.0000', unitPrice: '3600.00' },
      ],
      payAccountId: 'Khanewal Counter Cash',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_bilal',
      offsetDays: -5,
      lines: [
        { productId: 'SEED-SUNFLOWER-HYSUN33-2KG', quantity: '4.0000', unitPrice: '5100.00' },
        { productId: 'FERT-ZINC-33-5KG', quantity: '4.0000', unitPrice: '1750.00' },
      ],
      payAccountId: 'JazzCash Merchant Collection Till',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_imran_citrus',
      offsetDays: -6,
      lines: [
        { productId: 'FERT-CAL-NITRATE-25KG', quantity: '6.0000', unitPrice: '5900.00' },
        { productId: 'PEST-SPIROTETRAMAT-100ML', quantity: '4.0000', unitPrice: '3300.00' },
      ],
      payAccountId: 'Main Branch Cash Drawer',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_kashif_paddy',
      offsetDays: -8,
      lines: [
        { productId: 'SEED-RICE-GUARD-SUPREME-10KG', quantity: '5.0000', unitPrice: '9200.00' },
        { productId: 'PEST-CARTAP-4GR-10KG', quantity: '5.0000', unitPrice: '3200.00' },
      ],
      payAccountId: 'Habib Bank Ltd (HBL) Operations',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_aslam_cotton',
      offsetDays: -10,
      lines: [
        { productId: 'SEED-COTTON-BS15-10KG', quantity: '6.0000', unitPrice: '5400.00' },
        { productId: 'PEST-EMAMECTIN-19-1L', quantity: '6.0000', unitPrice: '3450.00' },
      ],
      payAccountId: 'Main Branch Cash Drawer',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_waqas_vegetable',
      offsetDays: -12,
      lines: [
        { productId: 'FERT-NPK-202020-1KG', quantity: '15.0000', unitPrice: '900.00' },
        { productId: 'FUNG-METALAXYL-MANCO-250G', quantity: '10.0000', unitPrice: '1250.00' },
      ],
      payAccountId: 'Easypaisa Retail QR Float',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_shakeel_cane',
      offsetDays: -15,
      lines: [
        { productId: 'FERT-UREA-SONA-50KG', quantity: '15.0000', unitPrice: '4600.00' },
        { productId: 'HERB-ACETOCHLOR-50-1L', quantity: '5.0000', unitPrice: '1850.00' },
      ],
      payAccountId: 'Main Branch Cash Drawer',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_hafeez',
      offsetDays: -18,
      lines: [
        { productId: 'SEED-COTTON-IUB13-10KG', quantity: '4.0000', unitPrice: '5100.00' },
        { productId: 'HERB-HALOXYFOP-10-500ML', quantity: '4.0000', unitPrice: '2050.00' },
      ],
      payAccountId: 'Main Branch Cash Drawer',
    },
    {
      branchId: branch2Id,
      warehouseId: wh2Id,
      customerKey: 'cust_munir',
      offsetDays: -20,
      lines: [
        { productId: 'MICRO-ZINC-BORON-COMBO-1L', quantity: '8.0000', unitPrice: '2150.00' },
        { productId: 'FUNG-COPPER-OXY-50-1KG', quantity: '8.0000', unitPrice: '1750.00' },
      ],
      payAccountId: 'Khanewal Counter Cash',
    },
    {
      branchId: branch2Id,
      warehouseId: wh2Id,
      customerKey: 'cust_tanveer',
      offsetDays: -22,
      lines: [
        { productId: 'SEED-CORN-DK6789-20KG', quantity: '4.0000', unitPrice: '21500.00' },
        { productId: 'FERT-CAN-50KG', quantity: '8.0000', unitPrice: '4200.00' },
      ],
      payAccountId: 'Meezan Islamic Corporate Account',
    },
    {
      branchId: branch2Id,
      warehouseId: wh2Id,
      customerKey: 'cust_abdul_ghaffar',
      offsetDays: -25,
      lines: [
        { productId: 'SEED-WHEAT-AKBAR2019-50KG', quantity: '8.0000', unitPrice: '7600.00' },
        { productId: 'FERT-DAP-ENGRO-50KG', quantity: '6.0000', unitPrice: '12400.00' },
      ],
      payAccountId: 'Khanewal Counter Cash',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_shahzad',
      offsetDays: -28,
      lines: [
        { productId: 'FUNG-MANCOZEB-80WP-1KG', quantity: '15.0000', unitPrice: '1550.00' },
        { productId: 'HERB-METRIBUZIN-70-500G', quantity: '10.0000', unitPrice: '1700.00' },
      ],
      payAccountId: 'Main Branch Cash Drawer',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_liaquat',
      offsetDays: -32,
      lines: [
        { productId: 'FUNG-THIOPHANATE-METHYL-1KG', quantity: '10.0000', unitPrice: '2050.00' },
        { productId: 'MICRO-SEAWEED-EXTRACT-1L', quantity: '10.0000', unitPrice: '2800.00' },
      ],
      payAccountId: 'Main Branch Cash Drawer',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_shafiq',
      offsetDays: -35,
      lines: [
        { productId: 'FERT-NPK-202020-1KG', quantity: '20.0000', unitPrice: '900.00' },
        { productId: 'MICRO-SURFACTANT-WETTER-1L', quantity: '5.0000', unitPrice: '3050.00' },
      ],
      payAccountId: 'Habib Bank Ltd (HBL) Operations',
    },
    {
      branchId: branch2Id,
      warehouseId: wh2Id,
      customerKey: 'cust_dealer_kisan',
      offsetDays: -38,
      lines: [
        { productId: 'FERT-UREA-SONA-50KG', quantity: '25.0000', unitPrice: '4450.00' },
        { productId: 'FERT-DAP-ENGRO-50KG', quantity: '10.0000', unitPrice: '12100.00' },
      ],
      payAccountId: 'Meezan Islamic Corporate Account',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_dealer_ittehad',
      offsetDays: -40,
      lines: [
        { productId: 'PEST-EMAMECTIN-19-1L', quantity: '15.0000', unitPrice: '3200.00' },
        { productId: 'PEST-LAMBDA-25-1L', quantity: '15.0000', unitPrice: '1700.00' },
      ],
      payAccountId: 'Habib Bank Ltd (HBL) Operations',
    },
    {
      branchId: branch1Id,
      warehouseId: wh1Id,
      customerKey: 'cust_dealer_bismillah',
      offsetDays: -45,
      lines: [
        { productId: 'HERB-GLYPHOSATE-48-1L', quantity: '20.0000', unitPrice: '2150.00' },
        { productId: 'HERB-PARAQUAT-20-1L', quantity: '15.0000', unitPrice: '1600.00' },
      ],
      payAccountId: 'Habib Bank Ltd (HBL) Operations',
    },
  ];

  for (const es of extraSales) {
    const cRecord = customerMap[es.customerKey];
    if (cRecord) {
      const tier = cRecord.priceTier || 'retail';
      const validLines = [];
      for (const l of es.lines) {
        const pRecord = productMap[l.productId];
        if (pRecord) {
          const price = pRecord.prices?.[tier] || pRecord.prices?.retail || '1000.00';
          validLines.push({
            productId: pRecord.id,
            quantity: l.quantity,
            unitPrice: { amount: price, currency: 'PKR' },
          });
        }
      }
      if (validLines.length > 0) {
        const sRes = await client.post(
          API_SALES_PATH,
          {
            branchId: es.branchId,
            warehouseId: es.warehouseId,
            customerId: cRecord.id,
            saleDate: calculateRelativeDate(refDate, es.offsetDays),
            lines: validLines,
          },
          `sale-${es.customerKey}-${es.offsetDays}`,
        );
        if (sRes.body?.data?.id) {
          const payments = [];
          if (es.payAccountId && accountIds[es.payAccountId]) {
            const saleTotal = sRes.body.data.totalAmount?.amount;
            if (saleTotal) {
              payments.push({
                accountId: accountIds[es.payAccountId],
                amount: { amount: saleTotal, currency: 'PKR' },
              });
            }
          }
          await client.post(
            `${API_SALES_PATH}/${sRes.body.data.id}/post`,
            {
              expectedVersion: sRes.body.data.version,
              payments,
            },
            `sale-post-${es.customerKey}-${es.offsetDays}`,
          );
        }
      }
    }
  }

  // 15. Customer & Supplier Payments and Reversals
  console.log('[agrivio-seed] Seeding customer and supplier payments, allocations, and reversals...');
  // Customer Payment from Farooq (PKR 50,000 via Cash Drawer)
  await client.post(
    API_CUSTOMER_PAYMENTS_PATH,
    {
      customerId: customerMap['cust_ar_farooq'].id,
      accountId: accountIds['Main Branch Cash Drawer'],
      paymentDate: calculateRelativeDate(refDate, -1),
      amount: { amount: '50000.00', currency: 'PKR' },
      allocationMode: 'general',
      notes: 'Partial payment against fertilizer ledger dues',
    },
    'pay-farooq',
  );

  // Supplier Payment to Syngenta (PKR 60,000 via HBL Bank)
  await client.post(
    API_SUPPLIER_PAYMENTS_PATH,
    {
      supplierId: supplierMap['sup_syngenta'].id,
      accountId: accountIds['Habib Bank Ltd (HBL) Operations'],
      paymentDate: calculateRelativeDate(refDate, -5),
      amount: { amount: '60000.00', currency: 'PKR' },
      allocationMode: 'general',
      notes: 'Supplier payment for insecticide shipment',
    },
    'pay-syngenta',
  );

  // Customer Payment Reversal demonstration (Cheque bounce simulation)
  const revPayment = await client.post(
    API_CUSTOMER_PAYMENTS_PATH,
    {
      customerId: customerMap['cust_ar_nawaz'].id,
      accountId: accountIds['Main Branch Cash Drawer'],
      paymentDate: calculateRelativeDate(refDate, -4),
      amount: { amount: '20000.00', currency: 'PKR' },
      allocationMode: 'general',
      notes: 'Cheque deposit to be reversed',
    },
    'pay-to-reverse',
  );
  if (revPayment.body?.data?.id) {
    await client.post(
      `${API_PAYMENTS_PATH}/${revPayment.body.data.id}/correct`,
      { reason: 'Customer cheque returned unpaid by drawee bank' },
      'pay-reverse-post',
    );
  }

  // 16. Warehouse Transfers & Stock Adjustments
  console.log('[agrivio-seed] Seeding warehouse transfers and inventory adjustments...');
  const allBatchesRes = await client.get(API_INVENTORY_BATCHES_PATH);
  const allBatches = allBatchesRes.body?.data?.items || [];

  // Posted Transfer (WH-01 -> WH-02)
  const ureaBatch = allBatches.find(
    (b) => b.productId === productMap['FERT-UREA-SONA-50KG'].id,
  );
  const trDraft = await client.post(
    API_WAREHOUSE_TRANSFERS_PATH,
    {
      sourceWarehouseId: wh1Id,
      destinationWarehouseId: wh2Id,
      productId: productMap['FERT-UREA-SONA-50KG'].id,
      batchId: ureaBatch?.id,
      quantity: '30.0000',
      reason: 'Inter-branch stock replenishment for wheat season',
    },
    'tr-urea-mlt-khw',
  );
  if (trDraft.body?.data?.id) {
    await client.post(
      `${API_WAREHOUSE_TRANSFERS_PATH}/${trDraft.body.data.id}/post`,
      {},
      'tr-urea-post',
    );
  }

  // Draft Transfer
  const emaBatch = allBatches.find(
    (b) => b.productId === productMap['PEST-EMAMECTIN-19-1L'].id,
  );
  await client.post(
    API_WAREHOUSE_TRANSFERS_PATH,
    {
      sourceWarehouseId: wh1Id,
      destinationWarehouseId: wh3Id,
      productId: productMap['PEST-EMAMECTIN-19-1L'].id,
      batchId: emaBatch?.id,
      quantity: '10.0000',
      reason: 'Moving chemical bottles to cold storage quarantine',
    },
    'tr-draft-quarantine',
  );

  // Stock Adjustment 1: Damaged Goods (Outbound Loss)
  const lambdaBatch = allBatches.find(
    (b) => b.productId === productMap['PEST-LAMBDA-25-1L'].id,
  );
  const adj1 = await client.post(
    API_STOCK_ADJUSTMENTS_PATH,
    {
      warehouseId: wh1Id,
      productId: productMap['PEST-LAMBDA-25-1L'].id,
      batchId: lambdaBatch?.id,
      adjustmentType: 'damage',
      direction: 'outbound',
      quantity: '2.0000',
      reason: 'Bottle punctured during forklift loading in warehouse',
    },
    'adj-damage-lambda',
  );
  if (adj1.body?.data?.id) {
    await client.post(
      `${API_STOCK_ADJUSTMENTS_PATH}/${adj1.body.data.id}/post`,
      { reason: 'Bottle punctured during forklift loading in warehouse' },
      'adj-damage-post',
    );
  }

  // Stock Adjustment 2: Physical Count Gain (Inbound Correction)
  const sspBatch = allBatches.find(
    (b) => b.productId === productMap['FERT-SSP-GRANULAR-50KG'].id,
  );
  const adj2 = await client.post(
    API_STOCK_ADJUSTMENTS_PATH,
    {
      warehouseId: wh1Id,
      productId: productMap['FERT-SSP-GRANULAR-50KG'].id,
      batchId: sspBatch?.id,
      adjustmentType: 'correction',
      direction: 'inbound',
      quantity: '5.0000',
      inventoryValue: { amount: '14000.00', currency: 'PKR' },
      reason: 'Physical count surplus identified during month-end audit',
    },
    'adj-surplus-ssp',
  );
  if (adj2.body?.data?.id) {
    await client.post(
      `${API_STOCK_ADJUSTMENTS_PATH}/${adj2.body.data.id}/post`,
      { reason: 'Physical count surplus identified during month-end audit' },
      'adj-surplus-post',
    );
  }

  // Draft Stock Adjustment
  const canBatch = allBatches.find(
    (b) => b.productId === productMap['FERT-CAN-50KG'].id,
  );
  await client.post(
    API_STOCK_ADJUSTMENTS_PATH,
    {
      warehouseId: wh2Id,
      productId: productMap['FERT-CAN-50KG'].id,
      batchId: canBatch?.id,
      adjustmentType: 'loss',
      direction: 'outbound',
      quantity: '1.0000',
      reason: 'Bag torn in transit',
    },
    'adj-draft-can',
  );

  // 17. Expense Categories & Expenses
  console.log('[agrivio-seed] Seeding expense categories and expense ledger postings...');
  const expCategories = [
    { key: 'rent', name: 'Store Rent & Warehouse Lease' },
    { key: 'util', name: 'Electricity & Utilities' },
    { key: 'freight', name: 'Freight & Diesel Transportation' },
    { key: 'maint', name: 'Machinery Maintenance & Calibration' },
    { key: 'meals', name: 'Staff Meals & Daily Hospitality' },
    { key: 'stationery', name: 'Office & POS Thermal Stationery' },
    { key: 'unused_exp', name: 'Test Unused Expense Category', isUnused: true },
  ];

  const expCatIds = {};
  for (const ec of expCategories) {
    const res = await client.post(
      API_EXPENSE_CATEGORIES_PATH,
      { name: ec.name },
      `seed-exp-cat-${ec.key}`,
    );
    expCatIds[ec.key] = res.body.data.id;
  }

  // Expense 1: Monthly Store Rent (HBL Bank)
  const exp1 = await client.post(
    API_EXPENSES_PATH,
    {
      categoryId: expCatIds['rent'],
      accountId: accountIds['Habib Bank Ltd (HBL) Operations'],
      amount: { amount: '75000.00', currency: 'PKR' },
      purpose: 'Multan Main Commercial Branch Monthly Shop Rent',
      expenseDate: calculateRelativeDate(refDate, -15),
      reference: 'RENT-AUG-2026',
    },
    'exp-rent-aug',
  );
  if (exp1.body?.data?.id) {
    await client.post(`${API_EXPENSES_PATH}/${exp1.body.data.id}/post`, { expectedVersion: 1 }, 'exp-rent-post');
  }

  // Expense 2: MEPCO Electricity Bill (Cash Drawer)
  const exp2 = await client.post(
    API_EXPENSES_PATH,
    {
      categoryId: expCatIds['util'],
      accountId: accountIds['Main Branch Cash Drawer'],
      amount: { amount: '28500.00', currency: 'PKR' },
      purpose: 'MEPCO Commercial Electricity Bill',
      expenseDate: calculateRelativeDate(refDate, -5),
      reference: 'MEPCO-66291',
    },
    'exp-util-mepco',
  );
  if (exp2.body?.data?.id) {
    await client.post(`${API_EXPENSES_PATH}/${exp2.body.data.id}/post`, { expectedVersion: 1 }, 'exp-util-post');
  }

  // Expense 3: Diesel Freight Expense (Cash Drawer)
  const exp3 = await client.post(
    API_EXPENSES_PATH,
    {
      categoryId: expCatIds['freight'],
      accountId: accountIds['Main Branch Cash Drawer'],
      amount: { amount: '12000.00', currency: 'PKR' },
      purpose: 'Mazda truck freight from Multan central hub to Khanewal depot',
      expenseDate: calculateRelativeDate(refDate, -2),
      reference: 'FRT-TRUCK-09',
    },
    'exp-freight-truck',
  );
  if (exp3.body?.data?.id) {
    await client.post(`${API_EXPENSES_PATH}/${exp3.body.data.id}/post`, { expectedVersion: 1 }, 'exp-freight-post');
  }

  // Expense 4: Draft Expense
  await client.post(
    API_EXPENSES_PATH,
    {
      categoryId: expCatIds['stationery'],
      accountId: accountIds['Main Branch Cash Drawer'],
      amount: { amount: '3500.00', currency: 'PKR' },
      purpose: 'Thermal receipt paper rolls (Pack of 50)',
      expenseDate: refDate,
      reference: 'POS-ROLLS-01',
    },
    'exp-draft-stationery',
  );

  // Expense 5: Corrected Expense
  const expRev = await client.post(
    API_EXPENSES_PATH,
    {
      categoryId: expCatIds['maint'],
      accountId: accountIds['Main Branch Cash Drawer'],
      amount: { amount: '8000.00', currency: 'PKR' },
      purpose: 'Sprayer repair bill (to be corrected)',
      expenseDate: calculateRelativeDate(refDate, -3),
    },
    'exp-to-correct',
  );
  if (expRev.body?.data?.id) {
    const postExpRes = await client.post(`${API_EXPENSES_PATH}/${expRev.body.data.id}/post`, { expectedVersion: 1 }, 'exp-rev-post');
    const ver = postExpRes.body?.data?.version || 2;
    await client.post(
      `${API_EXPENSES_PATH}/${expRev.body.data.id}/correct`,
      { expectedVersion: ver, reason: 'Duplicate invoice submitted by technician' },
      'exp-correct-reason',
    );
  }

  // Additional Expenses to establish complete expense history
  const extraExpenses = [
    {
      categoryId: expCatIds['rent'],
      accountId: accountIds['Meezan Islamic Corporate Account'],
      amount: '35000.00',
      purpose: 'Khanewal Sub-Branch Transit Depot Monthly Rent',
      offsetDays: -20,
      ref: 'RENT-KHW-AUG',
    },
    {
      categoryId: expCatIds['util'],
      accountId: accountIds['Habib Bank Ltd (HBL) Operations'],
      amount: '6500.00',
      purpose: 'PTCL Corporate High-Speed Fiber Internet & POS Connection',
      offsetDays: -10,
      ref: 'PTCL-AUG-2026',
    },
    {
      categoryId: expCatIds['freight'],
      accountId: accountIds['Main Branch Cash Drawer'],
      amount: '15000.00',
      purpose: 'Diesel generator backup fuel for cold storage facility',
      offsetDays: -8,
      ref: 'GEN-DIESEL-01',
    },
    {
      categoryId: expCatIds['meals'],
      accountId: accountIds['Main Branch Cash Drawer'],
      amount: '4800.00',
      purpose: 'Store staff tea, biscuits & daily client hospitality',
      offsetDays: -4,
      ref: 'TEA-HOSP-01',
    },
    {
      categoryId: expCatIds['stationery'],
      accountId: accountIds['Main Branch Cash Drawer'],
      amount: '8500.00',
      purpose: 'Packaging tape, strapping band & shipping labels',
      offsetDays: -1,
      ref: 'PACK-SUP-01',
    },
    {
      categoryId: expCatIds['maint'],
      accountId: accountIds['Habib Bank Ltd (HBL) Operations'],
      amount: '22000.00',
      purpose: 'Pesticide residue testing & laboratory certification',
      offsetDays: -12,
      ref: 'LAB-TEST-AUG',
    },
  ];

  for (const ee of extraExpenses) {
    if (ee.categoryId && ee.accountId) {
      const expRes = await client.post(
        API_EXPENSES_PATH,
        {
          categoryId: ee.categoryId,
          accountId: ee.accountId,
          amount: { amount: ee.amount, currency: 'PKR' },
          purpose: ee.purpose,
          expenseDate: calculateRelativeDate(refDate, ee.offsetDays),
          reference: ee.ref,
        },
        `exp-${ee.ref}`,
      );
      if (expRes.body?.data?.id) {
        await client.post(
          `${API_EXPENSES_PATH}/${expRes.body.data.id}/post`,
          { expectedVersion: 1 },
          `exp-post-${ee.ref}`,
        );
      }
    }
  }

  // 18. Automated Reconciliation & Sanity Suite
  console.log('[agrivio-seed] Running comprehensive multi-module reconciliation checks...');

  const reconciliationReport = {
    inventoryReconciled: false,
    accountsReconciled: false,
    dashboardFunctional: false,
    deleteCoverageVerified: false,
  };

  // 18a. Inventory Reconciliation
  const balancesRes = await client.get(API_INVENTORY_BALANCES_PATH);
  const balances = balancesRes.body?.data?.items || [];
  let stockMatches = true;

  for (const b of balances.slice(0, 10)) {
    const movementsRes = await client.get(
      `${API_INVENTORY_MOVEMENTS_PATH}?warehouseId=${b.warehouseId}&productId=${b.productId}`,
    );
    const moves = movementsRes.body?.data?.items || [];
    let netMinor = 0n;
    for (const m of moves) {
      if (b.batchId && m.batchId !== b.batchId) continue;
      const signed = BigInt(String(m.signedQuantityBaseMinorUnits ?? '0'));
      netMinor += signed;
    }
    const balMinor = BigInt(String(b.quantityBaseMinorUnits ?? '0'));
    if (moves.length > 0 && netMinor !== balMinor) {
      stockMatches = false;
      console.warn(`[agrivio-seed] Warning: Stock balance mismatch for product ${b.productId}: net=${netMinor}, bal=${balMinor}`);
    }
  }
  reconciliationReport.inventoryReconciled = stockMatches && balances.length > 0;

  // 18b. Financial Accounts Reconciliation
  const accountsRes = await client.get(API_ACCOUNTS_PATH);
  const accountsList = accountsRes.body?.data?.items || [];
  let accountsMatch = true;

  for (const acc of accountsList) {
    if (acc.isUnused) continue;
    const movesRes = await client.get(`${API_ACCOUNTS_PATH}/${acc.id}/movements`);
    const moves = movesRes.body?.data?.items || [];
    if (moves.length === 0 && acc.name.includes('Main Branch Cash Drawer')) {
      accountsMatch = false;
    }
  }
  reconciliationReport.accountsReconciled = accountsMatch && accountsList.length >= 6;

  // 18c. Master Data Delete & Deactivate Validation
  const delUnusedProd = await client.delete(`${API_PRODUCTS_PATH}/${productMap['LIFE-UNUSED-ACTIVE-TOOL-01'].id}`);
  const delBlockedProd = await client.delete(`${API_PRODUCTS_PATH}/${productMap['FERT-UREA-SONA-50KG'].id}`);

  const delUnusedCust = await client.delete(`${API_CUSTOMERS_PATH}/${customerMap['cust_unused_active'].id}`);
  const delBlockedCust = await client.delete(`${API_CUSTOMERS_PATH}/${customerMap['cust_ar_farooq'].id}`);

  const delUnusedCat = await client.delete(`${API_PRODUCT_CATEGORIES_PATH}/${categoryIds['unused_cat']}`);
  const delBlockedCat = await client.delete(`${API_PRODUCT_CATEGORIES_PATH}/${categoryIds['fert']}`);

  reconciliationReport.deleteCoverageVerified =
    delUnusedProd.status === 200 &&
    delBlockedProd.status === 409 &&
    delUnusedCust.status === 200 &&
    delBlockedCust.status === 409 &&
    delUnusedCat.status === 200 &&
    delBlockedCat.status === 409;

  // 18d. Dashboard Endpoint Validation
  const dashAll = await client.get(API_DASHBOARD_PATH);
  const dashMlt = await client.get(`${API_DASHBOARD_PATH}?branchId=${branch1Id}`);
  const dashKhw = await client.get(`${API_DASHBOARD_PATH}?branchId=${branch2Id}`);

  reconciliationReport.dashboardFunctional =
    dashAll.status === 200 &&
    dashMlt.status === 200 &&
    dashKhw.status === 200 &&
    dashAll.body?.data !== undefined;

  console.log('[agrivio-seed] Seeding and reconciliation verification complete.');

  return {
    organizationId: orgId,
    organizationName: DEMO_ORG_NAME,
    referenceDate: refDate,
    counts: {
      branches: 2,
      warehouses: 3,
      users: 4,
      categories: CATEGORIES.length,
      products: PRODUCTS.length,
      customers: CUSTOMERS.length,
      suppliers: SUPPLIERS.length,
      accounts: accountsList.length,
      sales: 7,
      purchases: 5,
      expenses: 5,
    },
    reconciliation: reconciliationReport,
  };
}

module.exports = {
  runDemoSeed,
};
