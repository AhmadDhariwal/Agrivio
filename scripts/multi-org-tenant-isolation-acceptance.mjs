/**
 * Agrivio Multi-Organization Data & Tenant-Isolation Acceptance Test
 *
 * Populates 3 distinct organizations (Agrochemical Retailer, Seed & Fertilizer Dealer, Wholesale Distributor)
 * with fully isolated realistic datasets and executes deep tenant isolation attack and reconciliation tests.
 *
 * Usage:
 *   node scripts/multi-org-tenant-isolation-acceptance.mjs
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const {
  API_AUTH_CSRF_PATH,
  API_AUTH_ACTIVATE_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_SESSION_PATH,
  API_AUTH_SESSION_CONTEXT_PATH,
  API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
  API_PLATFORM_ORGANIZATIONS_PATH,
  API_PLATFORM_SUBSCRIPTIONS_PATH,
  API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
  API_PLATFORM_AUDIT_EVENTS_PATH,
  API_PLATFORM_ACTOR_HEADER,
  API_USERS_PATH,
  API_BRANCHES_PATH,
  API_WAREHOUSES_PATH,
  API_ACCOUNTS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_INVENTORY_OPENING_STOCK_PATH,
  API_INVENTORY_BALANCES_PATH,
  API_INVENTORY_BATCHES_PATH,
  API_CUSTOMERS_PATH,
  API_SUPPLIERS_PATH,
  API_CUSTOMER_PAYMENTS_PATH,
  API_SUPPLIER_PAYMENTS_PATH,
  API_PURCHASES_PATH,
  API_SALES_PATH,
  API_RETURNS_PATH,
  API_STOCK_ADJUSTMENTS_PATH,
  API_WAREHOUSE_TRANSFERS_PATH,
  API_EXPENSE_CATEGORIES_PATH,
  API_EXPENSES_PATH,
  API_DASHBOARD_PATH,
  API_REPORTS_PATH,
  API_ALERTS_PATH,
  API_AUDIT_EVENTS_PATH,
  API_CSRF_HEADER,
  API_IDEMPOTENCY_KEY_HEADER,
} = require('@agrivio/api-contracts');

const BASE_URL = process.env.AGRIVIO_PUBLIC_API_BASE_URL || 'http://localhost:3000';
const SUPER_ADMIN_HEADER = { [API_PLATFORM_ACTOR_HEADER]: 'super-admin' };
const COMMON_PASSWORD = 'TestPassword123!';

class TestHttpClient {
  constructor(baseUrl = BASE_URL) {
    this.baseUrl = baseUrl;
    this.cookies = new Map();
  }

  absorb(headers) {
    const raw = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
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

  clear() {
    this.cookies.clear();
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
    const body = await res.json().catch(() => ({}));
    return body.data?.csrfToken || '';
  }

  async request(method, path, body = undefined, customHeaders = {}) {
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json',
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
    const headers = { ...extraHeaders };
    if (idempotencyKey) {
      headers[API_IDEMPOTENCY_KEY_HEADER] = idempotencyKey;
    }
    return this.request('DELETE', path, undefined, headers);
  }

  async login(email, password) {
    const csrf = await this.issueCsrf();
    const res = await this.post(
      API_AUTH_LOGIN_PATH,
      { email, password },
      null,
      { [API_CSRF_HEADER]: csrf }
    );
    if (res.status !== 200) {
      throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }

  async switchContext(organizationId) {
    const csrf = await this.issueCsrf();
    const res = await this.post(
      API_AUTH_SESSION_CONTEXT_PATH,
      { contextType: 'organization', organizationId },
      null,
      { [API_CSRF_HEADER]: csrf }
    );
    if (res.status !== 200) {
      throw new Error(`Context switch failed for org ${organizationId}: ${JSON.stringify(res.body)}`);
    }
    return res.body;
  }
}

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Ensure platform subscription plans exist
async function ensurePlans(client) {
  const plansRes = await client.get(API_PLATFORM_SUBSCRIPTION_PLANS_PATH, SUPER_ADMIN_HEADER);
  const items = plansRes.body?.data?.items || [];
  if (!items.find((p) => p.planCode === 'Enterprise')) {
    await client.post(
      API_PLATFORM_SUBSCRIPTION_PLANS_PATH,
      {
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
      },
      'plan-enterprise-setup',
      SUPER_ADMIN_HEADER
    );
  }
}

// Upgrade organization to Enterprise plan
async function upgradeOrgToEnterprise(client, orgId) {
  const plansList = await client.get(API_PLATFORM_SUBSCRIPTION_PLANS_PATH, SUPER_ADMIN_HEADER);
  const enterprisePlan = (plansList.body?.data?.items || []).find((p) => p.planCode === 'Enterprise');
  const subsList = await client.get(API_PLATFORM_SUBSCRIPTIONS_PATH, SUPER_ADMIN_HEADER);
  const orgSub = (subsList.body?.data?.items || []).find((s) => s.organizationId === orgId);

  if (orgSub?.id && enterprisePlan) {
    await client.post(
      `${API_PLATFORM_SUBSCRIPTIONS_PATH}/${orgSub.id}/change-plan`,
      {
        expectedVersion: orgSub.version,
        planCode: 'Enterprise',
        planVersion: enterprisePlan.planVersion || 1,
      },
      `upgrade-${orgId}`,
      SUPER_ADMIN_HEADER
    );
  }
}

// Provision one complete organization
async function setupOrganization(adminClient, blueprint) {
  console.log(`\n============================================================`);
  console.log(`Setting up Organization [${blueprint.code}]: ${blueprint.name}`);
  console.log(`============================================================`);

  // 1. Submit activation request
  const intakeRes = await adminClient.post(
    API_ORGANIZATION_ACTIVATION_REQUESTS_PATH,
    {
      organizationName: blueprint.name,
      ownerEmail: blueprint.owner.email,
      ownerDisplayName: blueprint.owner.name,
      notes: `${blueprint.code} Multi-Org Tenant Isolation Acceptance Suite`,
    },
    `intake-${blueprint.code}`
  );
  if (!intakeRes.body?.data?.organizationId) {
    throw new Error(`Failed intake for ${blueprint.code}: ${JSON.stringify(intakeRes.body)}`);
  }
  const orgId = intakeRes.body.data.organizationId;
  console.log(`[${blueprint.code}] Created organization ID: ${orgId}`);

  // 2. Super Admin approve
  const approveRes = await adminClient.post(
    `${API_PLATFORM_ORGANIZATIONS_PATH}/${orgId}/approve`,
    {},
    `approve-${blueprint.code}`,
    SUPER_ADMIN_HEADER
  );
  const activationToken = approveRes.body?.data?.activationToken;
  if (!activationToken) {
    throw new Error(`No activation token for ${blueprint.code}: ${JSON.stringify(approveRes.body)}`);
  }

  // 3. Activate owner
  const actClient = new TestHttpClient();
  await actClient.post(
    API_AUTH_ACTIVATE_PATH,
    {
      token: activationToken,
      password: COMMON_PASSWORD,
      displayName: blueprint.owner.name,
    },
    `act-owner-${blueprint.code}`
  );
  console.log(`[${blueprint.code}] Owner activated: ${blueprint.owner.email}`);

  // 4. Upgrade to Enterprise plan
  await upgradeOrgToEnterprise(adminClient, orgId);
  console.log(`[${blueprint.code}] Upgraded to Enterprise plan`);

  // 5. Login as Owner
  const ownerClient = new TestHttpClient();
  await ownerClient.login(blueprint.owner.email, COMMON_PASSWORD);
  await ownerClient.switchContext(orgId);

  // 6. Create Branches
  const branches = {};
  for (const b of blueprint.branches) {
    const res = await ownerClient.post(
      API_BRANCHES_PATH,
      { name: b.name, code: b.code, invoicePrefix: b.code },
      `branch-${b.code}`
    );
    if (!res.body?.data?.id) {
      throw new Error(`Failed to create branch ${b.code}: ${JSON.stringify(res.body)}`);
    }
    branches[b.key] = res.body.data.id;
  }
  console.log(`[${blueprint.code}] Created 2 branches`);

  // 7. Create Warehouses
  const warehouses = {};
  for (const w of blueprint.warehouses) {
    const res = await ownerClient.post(
      API_WAREHOUSES_PATH,
      { name: w.name, code: w.code, branchId: branches[w.branchKey] },
      `wh-${w.code}`
    );
    if (!res.body?.data?.id) {
      throw new Error(`Failed to create warehouse ${w.code}: ${JSON.stringify(res.body)}`);
    }
    warehouses[w.key] = res.body.data.id;
  }
  console.log(`[${blueprint.code}] Created 2 warehouses`);

  // 8. Create Employees (Manager, Cashier, StoreKeeper)
  const users = { owner: blueprint.owner.email };
  for (const emp of blueprint.employees) {
    const res = await ownerClient.post(
      API_USERS_PATH,
      { email: emp.email, displayName: emp.name, role: emp.role },
      `emp-${emp.email}`
    );
    const token = res.body?.data?.activationToken;
    const empId = res.body?.data?.id;
    if (token) {
      const empClient = new TestHttpClient();
      await empClient.post(
        API_AUTH_ACTIVATE_PATH,
        { token, password: COMMON_PASSWORD, displayName: emp.name },
        `act-${emp.email}`
      );
    }
    if (empId) {
      await ownerClient.put(
        `${API_USERS_PATH}/${empId}/access-assignments`,
        {
          branchIds: Object.values(branches),
          warehouseIds: Object.values(warehouses),
        },
        `access-${emp.email}`
      );
    }
    users[emp.role] = empId;
  }
  console.log(`[${blueprint.code}] Created and activated Manager, Cashier, StoreKeeper`);

  // 9. Create Accounts & Opening Balances
  const accounts = {};
  for (const acc of blueprint.accounts) {
    const payload = {
      name: acc.name,
      accountType: acc.type,
      ...(acc.bankName ? { bankName: acc.bankName } : {}),
      ...(acc.mask ? { accountNumberMasked: acc.mask } : {}),
    };
    const res = await ownerClient.post(API_ACCOUNTS_PATH, payload, `acc-${acc.name}`);
    const accId = res.body?.data?.id;
    accounts[acc.key] = accId;
    if (acc.openingBalance) {
      await ownerClient.post(
        `${API_ACCOUNTS_PATH}/${accId}/opening-balance`,
        { amount: { amount: acc.openingBalance, currency: 'PKR' } },
        `ob-acc-${accId}`
      );
    }
  }
  console.log(`[${blueprint.code}] Created Cash and Bank accounts with opening balances`);

  // 10. Create Categories
  const categories = {};
  for (const cat of blueprint.categories) {
    const res = await ownerClient.post(
      API_PRODUCT_CATEGORIES_PATH,
      { name: cat.name, productClass: cat.productClass },
      `cat-${cat.name}`
    );
    if (!res.body?.data?.id) {
      throw new Error(`Failed to create category ${cat.name}: HTTP ${res.status} ${JSON.stringify(res.body)}`);
    }
    categories[cat.key] = res.body.data.id;
  }
  console.log(`[${blueprint.code}] Created categories`);

  // 11. Create Products & Prices
  const products = {};
  for (const prod of blueprint.products) {
    const res = await ownerClient.post(
      API_PRODUCTS_PATH,
      {
        name: prod.name,
        sku: prod.sku,
        categoryId: categories[prod.categoryKey],
        trackingMode: prod.trackingMode,
        baseUnitCode: prod.baseUnitCode,
        measurementDimension: prod.measurementDimension,
      },
      `prod-${prod.sku}`
    );
    if (!res.body?.data?.id) {
      throw new Error(`Failed to create product ${prod.sku}: HTTP ${res.status} ${JSON.stringify(res.body)}`);
    }
    const prodData = res.body.data;
    products[prod.key] = prodData;

    // Set prices
    if (prod.prices && prodData?.id) {
      const items = Object.entries(prod.prices).map(([tier, priceStr]) => ({
        priceTier: tier,
        price: { amount: priceStr, currency: 'PKR' },
      }));
      await ownerClient.put(
        `${API_PRODUCTS_PATH}/${prodData.id}/prices`,
        { expectedVersion: prodData.version || 1, items },
        `price-${prod.sku}`
      );
    }
  }
  console.log(`[${blueprint.code}] Created products and multi-tier pricing`);

  // 12. Seed Opening Stock & Batches
  for (const st of blueprint.openingStock) {
    const p = products[st.productKey];
    const whId = warehouses[st.warehouseKey];
    await ownerClient.post(
      API_INVENTORY_OPENING_STOCK_PATH,
      {
        warehouseId: whId,
        productId: p.id,
        quantity: st.quantity,
        batchNumber: st.batchNumber,
        expiryDate: st.expiryOffset ? dateOffset(st.expiryOffset) : undefined,
        inventoryValue: { amount: st.value, currency: 'PKR' },
      },
      `open-stock-${p.sku}-${st.batchNumber || 'nobatch'}`
    );
  }
  console.log(`[${blueprint.code}] Seeded opening stock balances and inventory batches`);

  // 13. Create Customers & Opening Balances
  const customers = {};
  for (const c of blueprint.customers) {
    const res = await ownerClient.post(
      API_CUSTOMERS_PATH,
      {
        name: c.name,
        customerType: c.type,
        priceTier: c.priceTier || 'retail',
        phone: c.phone,
        creditEnabled: c.creditEnabled,
        creditLimit: c.creditLimit ? { amount: c.creditLimit, currency: 'PKR' } : undefined,
        creditLimitBehaviour: c.creditLimit ? 'warning' : 'block',
      },
      `cust-${c.name}`
    );
    const custId = res.body?.data?.id;
    customers[c.key] = custId;
    if (c.openingReceivable && custId) {
      await ownerClient.post(
        `${API_CUSTOMERS_PATH}/${custId}/opening-balance`,
        { kind: 'receivable', amount: { amount: c.openingReceivable, currency: 'PKR' } },
        `ob-cust-${custId}`
      );
    }
  }
  console.log(`[${blueprint.code}] Created customers with credit limits and opening receivables`);

  // 14. Create Suppliers & Opening Balances
  const suppliers = {};
  for (const s of blueprint.suppliers) {
    const res = await ownerClient.post(
      API_SUPPLIERS_PATH,
      { name: s.name, phone: s.phone, email: s.email, address: s.address, contactPerson: s.contactPerson },
      `sup-${s.name}`
    );
    const supId = res.body?.data?.id;
    suppliers[s.key] = supId;
    if (s.openingPayable && supId) {
      await ownerClient.post(
        `${API_SUPPLIERS_PATH}/${supId}/opening-balance`,
        { kind: 'payable', amount: { amount: s.openingPayable, currency: 'PKR' } },
        `ob-sup-${supId}`
      );
    }
  }
  console.log(`[${blueprint.code}] Created suppliers with opening payables`);

  // 15. Purchases with Landed Costs
  const purchases = {};
  for (const po of blueprint.purchases) {
    const pRes = await ownerClient.post(
      API_PURCHASES_PATH,
      {
        supplierId: suppliers[po.supplierKey],
        warehouseId: warehouses[po.warehouseKey],
        purchaseDate: dateOffset(po.dateOffsetDays || 0),
        supplierInvoiceReference: po.invoiceRef,
        landedCosts: po.landedFreight ? { freight: { amount: po.landedFreight, currency: 'PKR' } } : undefined,
        lines: [
          {
            productId: products[po.productKey].id,
            quantity: po.quantity,
            unitCost: { amount: po.unitCost, currency: 'PKR' },
            batchNumber: po.batchNumber,
            expiryDate: po.expiryOffset ? dateOffset(po.expiryOffset) : undefined,
          },
        ],
      },
      `po-${po.invoiceRef}`
    );
    const poData = pRes.body?.data;
    purchases[po.key] = poData;

    // Post purchase
    const payments = [];
    if (po.payAmount && po.accountKey) {
      payments.push({
        accountId: accounts[po.accountKey],
        amount: { amount: po.payAmount, currency: 'PKR' },
      });
    }
    await ownerClient.post(
      `${API_PURCHASES_PATH}/${poData.id}/post`,
      { expectedVersion: poData.version || 1, payments },
      `po-post-${po.invoiceRef}`
    );
  }
  console.log(`[${blueprint.code}] Posted purchases with landed cost allocations and payments`);

  // 16. Sales (Cash, Credit, Partial)
  const sales = {};
  for (const sa of blueprint.sales) {
    const sRes = await ownerClient.post(
      API_SALES_PATH,
      {
        branchId: branches[sa.branchKey],
        warehouseId: warehouses[sa.warehouseKey],
        customerId: customers[sa.customerKey],
        saleDate: dateOffset(sa.dateOffsetDays || 0),
        lines: [
          {
            productId: products[sa.productKey].id,
            quantity: sa.quantity,
            unitPrice: { amount: sa.unitPrice, currency: 'PKR' },
          },
        ],
      },
      `sale-${sa.key}`
    );
    const sData = sRes.body?.data;
    sales[sa.key] = sData;

    // Post sale
    const payments = [];
    if (sa.payAmount && sa.accountKey) {
      payments.push({
        accountId: accounts[sa.accountKey],
        amount: { amount: sa.payAmount, currency: 'PKR' },
      });
    }
    await ownerClient.post(
      `${API_SALES_PATH}/${sData.id}/post`,
      { expectedVersion: sData.version || 1, payments },
      `sale-post-${sa.key}`
    );
  }
  console.log(`[${blueprint.code}] Posted cash, credit, and partial sales`);

  // 17. Standalone Customer Payment
  if (blueprint.customerPayment) {
    const cp = blueprint.customerPayment;
    await ownerClient.post(
      API_CUSTOMER_PAYMENTS_PATH,
      {
        customerId: customers[cp.customerKey],
        accountId: accounts[cp.accountKey],
        paymentDate: dateOffset(0),
        amount: { amount: cp.amount, currency: 'PKR' },
        allocationMode: 'general',
        notes: cp.notes,
      },
      `cp-${blueprint.code}`
    );
    console.log(`[${blueprint.code}] Recorded standalone customer payment`);
  }

  // 18. Standalone Supplier Payment
  if (blueprint.supplierPayment) {
    const sp = blueprint.supplierPayment;
    await ownerClient.post(
      API_SUPPLIER_PAYMENTS_PATH,
      {
        supplierId: suppliers[sp.supplierKey],
        accountId: accounts[sp.accountKey],
        paymentDate: dateOffset(0),
        amount: { amount: sp.amount, currency: 'PKR' },
        allocationMode: 'general',
        notes: sp.notes,
      },
      `sp-${blueprint.code}`
    );
    console.log(`[${blueprint.code}] Recorded standalone supplier payment`);
  }

  // 19. Operating Expense Posting
  let expenseCategoryId = null;
  if (blueprint.expense) {
    const exp = blueprint.expense;
    const catRes = await ownerClient.post(
      API_EXPENSE_CATEGORIES_PATH,
      { name: exp.categoryName },
      `exp-cat-${blueprint.code}`
    );
    const catId = catRes.body?.data?.id;
    expenseCategoryId = catId;
    const expRes = await ownerClient.post(
      API_EXPENSES_PATH,
      {
        categoryId: catId,
        accountId: accounts[exp.accountKey],
        amount: { amount: exp.amount, currency: 'PKR' },
        purpose: exp.purpose,
        expenseDate: dateOffset(0),
        reference: exp.reference,
      },
      `exp-${blueprint.code}`
    );
    if (expRes.body?.data?.id) {
      await ownerClient.post(
        `${API_EXPENSES_PATH}/${expRes.body.data.id}/post`,
        { expectedVersion: 1 },
        `exp-post-${blueprint.code}`
      );
    }
    console.log(`[${blueprint.code}] Recorded operating expense`);
  }

  // 20. Inventory Batches lookup for Stock Adjustment and Warehouse Transfer
  const batchesRes = await ownerClient.get(API_INVENTORY_BATCHES_PATH);
  const allBatches = batchesRes.body?.data?.items || [];

  // Stock Adjustment
  if (blueprint.stockAdjustment) {
    const sa = blueprint.stockAdjustment;
    const prodId = products[sa.productKey].id;
    const batch = allBatches.find((b) => b.productId === prodId);
    const adjRes = await ownerClient.post(
      API_STOCK_ADJUSTMENTS_PATH,
      {
        warehouseId: warehouses[sa.warehouseKey],
        productId: prodId,
        batchId: batch?.id,
        adjustmentType: sa.type,
        direction: sa.direction,
        quantity: sa.quantity,
        ...(sa.inventoryValue ? { inventoryValue: { amount: sa.inventoryValue, currency: 'PKR' } } : {}),
        reason: sa.reason,
      },
      `adj-${blueprint.code}`
    );
    if (adjRes.body?.data?.id) {
      await ownerClient.post(
        `${API_STOCK_ADJUSTMENTS_PATH}/${adjRes.body.data.id}/post`,
        { reason: sa.reason },
        `adj-post-${blueprint.code}`
      );
    }
    console.log(`[${blueprint.code}] Processed inventory stock adjustment`);
  }

  // Warehouse Transfer
  if (blueprint.warehouseTransfer) {
    const wt = blueprint.warehouseTransfer;
    const prodId = products[wt.productKey].id;
    const batch = allBatches.find((b) => b.productId === prodId);
    const trRes = await ownerClient.post(
      API_WAREHOUSE_TRANSFERS_PATH,
      {
        sourceWarehouseId: warehouses[wt.sourceWarehouseKey],
        destinationWarehouseId: warehouses[wt.destWarehouseKey],
        productId: prodId,
        batchId: batch?.id,
        quantity: wt.quantity,
        reason: wt.reason,
      },
      `tr-${blueprint.code}`
    );
    if (trRes.body?.data?.id) {
      await ownerClient.post(
        `${API_WAREHOUSE_TRANSFERS_PATH}/${trRes.body.data.id}/post`,
        {},
        `tr-post-${blueprint.code}`
      );
    }
    console.log(`[${blueprint.code}] Processed warehouse transfer`);
  }

  // 21. Sales Return
  let createdSalesReturnId = null;
  if (blueprint.salesReturn) {
    const sr = blueprint.salesReturn;
    const saleId = sales[sr.saleKey]?.id;
    if (saleId) {
      const draftRes = await ownerClient.post(
        `${API_SALES_PATH}/${saleId}/returns`,
        { lines: [{ originalLineIndex: 0, quantity: sr.quantity, stockCondition: 'sellable' }] },
        `sr-draft-${blueprint.code}`
      );
      if (draftRes.body?.data?.id) {
        createdSalesReturnId = draftRes.body.data.id;
        await ownerClient.post(
          `${API_RETURNS_PATH}/${draftRes.body.data.id}/post`,
          {
            expectedVersion: draftRes.body.data.version || 1,
            reason: sr.reason,
            resolution: 'account_refund',
            refundAccountId: accounts[sr.accountKey],
          },
          `sr-post-${blueprint.code}`
        );
        console.log(`[${blueprint.code}] Processed sales return`);
      }
    }
  }

  // 22. Purchase Return
  let createdPurchaseReturnId = null;
  if (blueprint.purchaseReturn) {
    const pr = blueprint.purchaseReturn;
    const poId = purchases[pr.purchaseKey]?.id;
    if (poId) {
      const draftRes = await ownerClient.post(
        `${API_PURCHASES_PATH}/${poId}/returns`,
        { lines: [{ originalLineIndex: 0, quantity: pr.quantity }] },
        `pr-draft-${blueprint.code}`
      );
      if (draftRes.body?.data?.id) {
        createdPurchaseReturnId = draftRes.body.data.id;
        await ownerClient.post(
          `${API_RETURNS_PATH}/${draftRes.body.data.id}/post`,
          {
            expectedVersion: draftRes.body.data.version || 1,
            reason: pr.reason,
            resolution: 'ledger_adjustment',
          },
          `pr-post-${blueprint.code}`
        );
        console.log(`[${blueprint.code}] Processed purchase return`);
      }
    }
  }

  return {
    code: blueprint.code,
    name: blueprint.name,
    organizationId: orgId,
    ownerEmail: blueprint.owner.email,
    branches,
    warehouses,
    accounts,
    categories,
    products,
    customers,
    suppliers,
    purchases,
    sales,
    createdSalesReturnId,
    createdPurchaseReturnId,
    expenseCategoryId,
    batches: allBatches,
    client: ownerClient,
  };
}

export {
  TestHttpClient,
  BASE_URL,
  SUPER_ADMIN_HEADER,
  COMMON_PASSWORD,
  dateOffset,
  ensurePlans,
  setupOrganization,
};
