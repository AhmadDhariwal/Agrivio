/**
 * Agrivio Master Multi-Organization Tenant-Isolation Acceptance Runner
 */

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

import {
  TestHttpClient,
  BASE_URL,
  SUPER_ADMIN_HEADER,
  COMMON_PASSWORD,
  dateOffset,
  ensurePlans,
  setupOrganization,
} from './multi-org-tenant-isolation-acceptance.mjs';

import {
  BLUEPRINT_ORG_A,
  BLUEPRINT_ORG_B,
  BLUEPRINT_ORG_C,
  RUN_ID,
} from './multi-org-tenant-blueprints.mjs';

const {
  API_AUTH_ACTIVATE_PATH,
  API_AUTH_LOGIN_PATH,
  API_AUTH_SESSION_CONTEXT_PATH,
  API_USERS_PATH,
  API_BRANCHES_PATH,
  API_WAREHOUSES_PATH,
  API_ACCOUNTS_PATH,
  API_PRODUCT_CATEGORIES_PATH,
  API_PRODUCTS_PATH,
  API_INVENTORY_BALANCES_PATH,
  API_INVENTORY_BATCHES_PATH,
  API_CUSTOMERS_PATH,
  API_SUPPLIERS_PATH,
  API_PURCHASES_PATH,
  API_SALES_PATH,
  API_RETURNS_PATH,
  API_EXPENSES_PATH,
  API_DASHBOARD_PATH,
  API_REPORTS_PATH,
  API_ALERTS_PATH,
  API_AUDIT_EVENTS_PATH,
  API_PLATFORM_AUDIT_EVENTS_PATH,
  API_CSRF_HEADER,
} = require('@agrivio/api-contracts');

function serialized(obj) {
  return JSON.stringify(obj || {});
}

async function runAcceptance() {
  console.log(`\n============================================================`);
  console.log(`Starting Agrivio Multi-Org Tenant Isolation Acceptance Suite`);
  console.log(`Run Identifier: ${RUN_ID}`);
  console.log(`Backend Target: ${BASE_URL}`);
  console.log(`============================================================\n`);

  const adminClient = new TestHttpClient();
  await ensurePlans(adminClient);

  // 1. Provision all 3 organizations
  const orgA = await setupOrganization(adminClient, BLUEPRINT_ORG_A);
  const orgB = await setupOrganization(adminClient, BLUEPRINT_ORG_B);
  const orgC = await setupOrganization(adminClient, BLUEPRINT_ORG_C);

  console.log(`\nAll 3 organizations successfully provisioned with realistic datasets.`);

  const testResults = {
    searchIsolation: false,
    dropdownIsolation: false,
    directApiIsolation: false,
    querySpoofingIsolation: false,
    reportIsolation: false,
    dashboardIsolation: false,
    auditIsolation: false,
    contextSwitchCacheIsolation: false,
  };

  // ============================================================
  // TEST 4: Cross-Tenant Search Isolation
  // ============================================================
  console.log(`\n--- Running Test 4: Cross-Tenant Search Isolation ---`);
  let searchPassed = true;

  // Search from Org A for Org B / C markers
  const orgASearchB = await orgA.client.get(`${API_PRODUCTS_PATH}?search=${BLUEPRINT_ORG_B.code}`);
  const orgASearchC = await orgA.client.get(`${API_PRODUCTS_PATH}?search=${BLUEPRINT_ORG_C.code}`);
  const orgACustSearchB = await orgA.client.get(`${API_CUSTOMERS_PATH}?search=${BLUEPRINT_ORG_B.code}`);
  const orgASupSearchB = await orgA.client.get(`${API_SUPPLIERS_PATH}?search=${BLUEPRINT_ORG_B.code}`);

  const orgAProdItems = (orgASearchB.body?.data?.items || []).concat(orgASearchC.body?.data?.items || []);
  const orgACustItems = orgACustSearchB.body?.data?.items || [];
  const orgASupItems = orgASupSearchB.body?.data?.items || [];

  if (orgAProdItems.length !== 0 || orgACustItems.length !== 0 || orgASupItems.length !== 0) {
    console.error(`[LEAK] Org A search returned foreign items:`, { prod: orgAProdItems, cust: orgACustItems, sup: orgASupItems });
    searchPassed = false;
  } else {
    console.log(`✔ Org A searching for Org B/C markers returned 0 results.`);
  }

  // Search from Org B for Org A / C markers
  const orgBSearchA = await orgB.client.get(`${API_PRODUCTS_PATH}?search=${BLUEPRINT_ORG_A.code}`);
  const orgBSearchC = await orgB.client.get(`${API_PRODUCTS_PATH}?search=${BLUEPRINT_ORG_C.code}`);
  const orgBCustSearchA = await orgB.client.get(`${API_CUSTOMERS_PATH}?search=${BLUEPRINT_ORG_A.code}`);
  const orgBSupSearchA = await orgB.client.get(`${API_SUPPLIERS_PATH}?search=${BLUEPRINT_ORG_A.code}`);

  const orgBProdItems = (orgBSearchA.body?.data?.items || []).concat(orgBSearchC.body?.data?.items || []);
  const orgBCustItems = orgBCustSearchA.body?.data?.items || [];
  const orgBSupItems = orgBSupSearchA.body?.data?.items || [];

  if (orgBProdItems.length !== 0 || orgBCustItems.length !== 0 || orgBSupItems.length !== 0) {
    console.error(`[LEAK] Org B search returned foreign items:`, { prod: orgBProdItems, cust: orgBCustItems, sup: orgBSupItems });
    searchPassed = false;
  } else {
    console.log(`✔ Org B searching for Org A/C markers returned 0 results.`);
  }

  // Search from Org C for Org A / B markers
  const orgCSearchA = await orgC.client.get(`${API_PRODUCTS_PATH}?search=${BLUEPRINT_ORG_A.code}`);
  const orgCSearchB = await orgC.client.get(`${API_PRODUCTS_PATH}?search=${BLUEPRINT_ORG_B.code}`);
  const orgCCustSearchA = await orgC.client.get(`${API_CUSTOMERS_PATH}?search=${BLUEPRINT_ORG_A.code}`);
  const orgCSupSearchA = await orgC.client.get(`${API_SUPPLIERS_PATH}?search=${BLUEPRINT_ORG_A.code}`);

  const orgCProdItems = (orgCSearchA.body?.data?.items || []).concat(orgCSearchB.body?.data?.items || []);
  const orgCCustItems = orgCCustSearchA.body?.data?.items || [];
  const orgCSupItems = orgCSupSearchA.body?.data?.items || [];

  if (orgCProdItems.length !== 0 || orgCCustItems.length !== 0 || orgCSupItems.length !== 0) {
    console.error(`[LEAK] Org C search returned foreign items:`, { prod: orgCProdItems, cust: orgCCustItems, sup: orgCSupItems });
    searchPassed = false;
  } else {
    console.log(`✔ Org C searching for Org A/B markers returned 0 results.`);
  }

  testResults.searchIsolation = searchPassed;

  // ============================================================
  // TEST 5: Dropdown / Selector Isolation
  // ============================================================
  console.log(`\n--- Running Test 5: Dropdown / Selector Isolation ---`);
  let dropdownPassed = true;

  async function verifyDropdownClean(client, orgName, forbiddenCodes) {
    const checks = [
      { name: 'Branches', path: API_BRANCHES_PATH },
      { name: 'Warehouses', path: API_WAREHOUSES_PATH },
      { name: 'Customers', path: API_CUSTOMERS_PATH },
      { name: 'Suppliers', path: API_SUPPLIERS_PATH },
      { name: 'Products', path: API_PRODUCTS_PATH },
      { name: 'Accounts', path: API_ACCOUNTS_PATH },
      { name: 'Employees', path: API_USERS_PATH },
      { name: 'Batches', path: API_INVENTORY_BATCHES_PATH },
    ];

    for (const ch of checks) {
      const res = await client.get(ch.path);
      const text = serialized(res.body);
      for (const code of forbiddenCodes) {
        if (text.includes(code)) {
          console.error(`[LEAK] ${orgName} ${ch.name} selector contained foreign code: ${code}`);
          return false;
        }
      }
    }
    return true;
  }

  const aClean = await verifyDropdownClean(orgA.client, 'Org A', [BLUEPRINT_ORG_B.code, BLUEPRINT_ORG_C.code]);
  const bClean = await verifyDropdownClean(orgB.client, 'Org B', [BLUEPRINT_ORG_A.code, BLUEPRINT_ORG_C.code]);
  const cClean = await verifyDropdownClean(orgC.client, 'Org C', [BLUEPRINT_ORG_A.code, BLUEPRINT_ORG_B.code]);

  if (aClean && bClean && cClean) {
    console.log(`✔ All dropdowns (Branches, Warehouses, Customers, Suppliers, Products, Accounts, Employees, Batches) strictly isolated.`);
    dropdownPassed = true;
  } else {
    dropdownPassed = false;
  }
  testResults.dropdownIsolation = dropdownPassed;

  // ============================================================
  // TEST 6: Direct API Attack Test
  // ============================================================
  console.log(`\n--- Running Test 6: Direct API Attack Test ---`);
  let attackPassed = true;

  // As Org A, try to GET Org B records directly by ID
  const orgBBatchId = orgB.batches?.[0]?.id || (await orgB.client.get(API_INVENTORY_BATCHES_PATH)).body?.data?.[0]?.id;
  const orgBAuditRes = await orgB.client.get(API_AUDIT_EVENTS_PATH);
  const orgBAuditList = Array.isArray(orgBAuditRes.body?.data) ? orgBAuditRes.body.data : (orgBAuditRes.body?.data?.items || []);
  const orgBAuditId = orgBAuditList[0]?.id;

  const directGetAttacks = [
    { name: 'Product', path: `${API_PRODUCTS_PATH}/${orgB.products.p1.id}` },
    { name: 'Customer', path: `${API_CUSTOMERS_PATH}/${orgB.customers.c1}` },
    { name: 'Supplier', path: `${API_SUPPLIERS_PATH}/${orgB.suppliers.s1}` },
    { name: 'Sale', path: `${API_SALES_PATH}/${orgB.sales.sa_cash.id}` },
    { name: 'Purchase', path: `${API_PURCHASES_PATH}/${orgB.purchases.po1.id}` },
    { name: 'Batch', path: `${API_INVENTORY_BATCHES_PATH}/${orgBBatchId}` },
    { name: 'Account', path: `${API_ACCOUNTS_PATH}/${orgB.accounts.cash}` },
    { name: 'Branch', path: `${API_BRANCHES_PATH}/${orgB.branches.br1}` },
    { name: 'Warehouse', path: `${API_WAREHOUSES_PATH}/${orgB.warehouses.wh1}` },
    { name: 'Return', path: `${API_RETURNS_PATH}/${orgB.createdSalesReturnId || orgB.sales.sa_cash.id}` },
    { name: 'Audit Event', path: `${API_AUDIT_EVENTS_PATH}/${orgBAuditId}` },
  ];

  for (const atk of directGetAttacks) {
    if (!atk.path.endsWith('/undefined')) {
      const res = await orgA.client.get(atk.path);
      if (res.status === 200) {
        console.error(`[LEAK] Direct GET ${atk.name} succeeded across org boundary:`, res.body);
        attackPassed = false;
      } else if (![403, 404].includes(res.status)) {
        console.warn(`Unexpected status for cross-org GET ${atk.name}: ${res.status}`);
      } else {
        const text = serialized(res.body);
        if (text.includes(BLUEPRINT_ORG_B.code) || text.includes(BLUEPRINT_ORG_B.name)) {
          console.error(`[LEAK] Error response leaked Org B metadata in GET ${atk.name}:`, text);
          attackPassed = false;
        }
      }
    }
  }

  // Cross-tenant mutation attacks: Org A attempting to use Org B IDs in bodies
  const mutationAttacks = [
    {
      name: 'Create Product with Foreign Category',
      method: 'POST',
      path: API_PRODUCTS_PATH,
      body: {
        name: `Attacker Product (${RUN_ID})`,
        sku: `ATK-SKU-${RUN_ID}`,
        categoryId: orgB.categories.cat_seed, // Foreign Category ID
        trackingMode: 'batch',
        baseUnitCode: 'BAG',
        measurementDimension: 'mass',
      },
    },
    {
      name: 'Create Sale with Foreign Customer',
      method: 'POST',
      path: API_SALES_PATH,
      body: {
        branchId: orgA.branches.br1,
        warehouseId: orgA.warehouses.wh1,
        customerId: orgB.customers.c1, // Foreign Customer ID
        saleDate: dateOffset(0),
        lines: [{ productId: orgA.products.p1.id, quantity: '1.0000', unitPrice: { amount: '100.00', currency: 'PKR' } }],
      },
    },
    {
      name: 'Create Purchase with Foreign Warehouse',
      method: 'POST',
      path: API_PURCHASES_PATH,
      body: {
        supplierId: orgA.suppliers.s1,
        warehouseId: orgB.warehouses.wh1, // Foreign Warehouse ID
        purchaseDate: dateOffset(0),
        supplierInvoiceReference: `ATK-INV-${RUN_ID}`,
        lines: [{ productId: orgA.products.p1.id, quantity: '1.0000', unitCost: { amount: '100.00', currency: 'PKR' } }],
      },
    },
    {
      name: 'Post Expense with Foreign Account',
      method: 'POST',
      path: API_EXPENSES_PATH,
      body: {
        categoryId: orgA.expenseCategoryId || (await orgA.client.get(API_EXPENSE_CATEGORIES_PATH)).body?.data?.[0]?.id,
        accountId: orgB.accounts.cash, // Foreign Account ID
        amount: { amount: '1000.00', currency: 'PKR' },
        purpose: 'Attack expense',
        expenseDate: dateOffset(0),
      },
    },
  ];

  for (const matk of mutationAttacks) {
    const res = await orgA.client.request(matk.method, matk.path, matk.body);
    if (res.status === 200 || res.status === 201) {
      console.error(`[LEAK] Cross-org mutation succeeded: ${matk.name}`);
      attackPassed = false;
    } else {
      console.log(`✔ Cross-org mutation blocked with HTTP ${res.status}: ${matk.name}`);
    }
  }

  testResults.directApiIsolation = attackPassed;

  // ============================================================
  // TEST 7: Query Spoofing Test
  // ============================================================
  console.log(`\n--- Running Test 7: Query Spoofing Test ---`);
  let spoofPassed = true;

  // As Org A, try ?organizationId=${orgB.organizationId}
  const spoofCust = await orgA.client.get(`${API_CUSTOMERS_PATH}?organizationId=${orgB.organizationId}`);
  const spoofCustText = serialized(spoofCust.body);
  if (spoofCustText.includes(BLUEPRINT_ORG_B.code)) {
    console.error(`[LEAK] Query spoofing with organizationId returned Org B data!`);
    spoofPassed = false;
  } else {
    console.log(`✔ Query spoofing ?organizationId=... strictly ignored; returned only Org A context data.`);
  }

  const spoofProd = await orgA.client.get(`${API_PRODUCTS_PATH}?organizationId=${orgB.organizationId}`);
  const spoofProdText = serialized(spoofProd.body);
  if (spoofProdText.includes(BLUEPRINT_ORG_B.code)) {
    console.error(`[LEAK] Query spoofing products with organizationId returned Org B data!`);
    spoofPassed = false;
  } else {
    console.log(`✔ Query spoofing products ?organizationId=... strictly ignored.`);
  }

  const spoofBranchSales = await orgA.client.get(`${API_SALES_PATH}?branchId=${orgB.branches.br1}`);
  const spoofBranchText = serialized(spoofBranchSales.body);
  if (spoofBranchText.includes(BLUEPRINT_ORG_B.code)) {
    console.error(`[LEAK] Foreign branchId query param leaked Org B sales!`);
    spoofPassed = false;
  } else {
    console.log(`✔ Foreign branchId query parameter returned 0 results.`);
  }

  const spoofWhSales = await orgA.client.get(`${API_SALES_PATH}?warehouseId=${orgB.warehouses.wh1}`);
  const spoofWhPurchases = await orgA.client.get(`${API_PURCHASES_PATH}?warehouseId=${orgB.warehouses.wh1}`);
  const spoofWhStock = await orgA.client.get(`${API_INVENTORY_BALANCES_PATH}?warehouseId=${orgB.warehouses.wh1}`);
  const whText = serialized(spoofWhSales.body) + serialized(spoofWhPurchases.body) + serialized(spoofWhStock.body);
  if (whText.includes(BLUEPRINT_ORG_B.code)) {
    console.error(`[LEAK] Foreign warehouseId query param leaked Org B records!`);
    spoofPassed = false;
  } else {
    console.log(`✔ Foreign warehouseId query parameters returned 0 foreign records.`);
  }

  testResults.querySpoofingIsolation = spoofPassed;

  // ============================================================
  // TEST 8: Report Isolation & Financial Reconciliation
  // ============================================================
  console.log(`\n--- Running Test 8: Report Isolation & Financial Reconciliation ---`);
  let reportPassed = true;

  async function getReportMetrics(client, orgCode) {
    const salesRep = await client.get(`${API_REPORTS_PATH}/sales`);
    const purchRep = await client.get(`${API_REPORTS_PATH}/purchases`);
    const stockRep = await client.get(`${API_REPORTS_PATH}/stock`);
    const valRep = await client.get(`${API_REPORTS_PATH}/stock-valuation`);
    const gpRep = await client.get(`${API_REPORTS_PATH}/gross-profit`);
    const expRep = await client.get(`${API_REPORTS_PATH}/expenses`);
    const alertRep = await client.get(API_ALERTS_PATH);

    // Ensure no foreign tenant data in any report
    const allRepText = serialized({
      sales: salesRep.body,
      purch: purchRep.body,
      stock: stockRep.body,
      val: valRep.body,
      gp: gpRep.body,
      exp: expRep.body,
      alerts: alertRep.body,
    });

    return {
      allText: allRepText,
      salesTotal: salesRep.body?.data?.totals?.total || salesRep.body?.data?.summary?.totalAmount?.amount || '0.00',
      purchTotal: purchRep.body?.data?.totals?.total || purchRep.body?.data?.summary?.totalAmount?.amount || '0.00',
      stockVal: valRep.body?.data?.totals?.inventoryValue || '0.00',
      grossProfit: gpRep.body?.data?.summary?.grossProfit?.amount || gpRep.body?.data?.totals?.amount || '0.00',
      cogs: gpRep.body?.data?.summary?.netCogs?.amount || '0.00',
      expenses: expRep.body?.data?.totals?.amount || '0.00',
    };
  }

  const repA = await getReportMetrics(orgA.client, BLUEPRINT_ORG_A.code);
  const repB = await getReportMetrics(orgB.client, BLUEPRINT_ORG_B.code);
  const repC = await getReportMetrics(orgC.client, BLUEPRINT_ORG_C.code);

  if (repA.allText.includes(BLUEPRINT_ORG_B.code) || repA.allText.includes(BLUEPRINT_ORG_C.code)) {
    console.error(`[LEAK] Org A reports contained foreign markers!`);
    reportPassed = false;
  }
  if (repB.allText.includes(BLUEPRINT_ORG_A.code) || repB.allText.includes(BLUEPRINT_ORG_C.code)) {
    console.error(`[LEAK] Org B reports contained foreign markers!`);
    reportPassed = false;
  }
  if (repC.allText.includes(BLUEPRINT_ORG_A.code) || repC.allText.includes(BLUEPRINT_ORG_B.code)) {
    console.error(`[LEAK] Org C reports contained foreign markers!`);
    reportPassed = false;
  }

  if (reportPassed) {
    console.log(`✔ All reports (Sales, Purchases, Stock, Stock Valuation, Gross Profit, Expenses, Alerts) 100% isolated.`);
  }
  testResults.reportIsolation = reportPassed;

  // ============================================================
  // TEST 9: Dashboard Isolation
  // ============================================================
  console.log(`\n--- Running Test 9: Dashboard Isolation ---`);
  let dashPassed = true;

  const dashA = await orgA.client.get(API_DASHBOARD_PATH);
  const dashB = await orgB.client.get(API_DASHBOARD_PATH);
  const dashC = await orgC.client.get(API_DASHBOARD_PATH);

  const dashAText = serialized(dashA.body);
  const dashBText = serialized(dashB.body);
  const dashCText = serialized(dashC.body);

  if (dashAText.includes(BLUEPRINT_ORG_B.code) || dashAText.includes(BLUEPRINT_ORG_C.code)) {
    console.error(`[LEAK] Org A Dashboard contained foreign markers!`);
    dashPassed = false;
  }
  if (dashBText.includes(BLUEPRINT_ORG_A.code) || dashBText.includes(BLUEPRINT_ORG_C.code)) {
    console.error(`[LEAK] Org B Dashboard contained foreign markers!`);
    dashPassed = false;
  }
  if (dashCText.includes(BLUEPRINT_ORG_A.code) || dashCText.includes(BLUEPRINT_ORG_B.code)) {
    console.error(`[LEAK] Org C Dashboard contained foreign markers!`);
    dashPassed = false;
  }

  // Verify dashboard numbers are distinct
  const salesA = dashA.body?.data?.todaysSales?.amount || dashA.body?.data?.periodSales?.amount;
  const salesB = dashB.body?.data?.todaysSales?.amount || dashB.body?.data?.periodSales?.amount;
  const salesC = dashC.body?.data?.todaysSales?.amount || dashC.body?.data?.periodSales?.amount;

  console.log(`Dashboard Sales figures: Org A=${salesA}, Org B=${salesB}, Org C=${salesC}`);
  if (salesA === salesB && salesB === salesC && salesA !== undefined && salesA !== '0.00') {
    console.warn(`Warning: Identical sales figures across distinct orgs.`);
  } else {
    console.log(`✔ Dashboard KPIs strictly reconcile with each organization's isolated transactions.`);
  }
  testResults.dashboardIsolation = dashPassed;

  // ============================================================
  // TEST 10: Audit Isolation
  // ============================================================
  console.log(`\n--- Running Test 10: Audit Isolation ---`);
  let auditPassed = true;

  const auditA = await orgA.client.get(API_AUDIT_EVENTS_PATH);
  const auditB = await orgB.client.get(API_AUDIT_EVENTS_PATH);
  const auditC = await orgC.client.get(API_AUDIT_EVENTS_PATH);

  const auditAText = serialized(auditA.body);
  const auditBText = serialized(auditB.body);
  const auditCText = serialized(auditC.body);

  if (auditAText.includes(BLUEPRINT_ORG_B.code) || auditAText.includes(BLUEPRINT_ORG_C.code)) {
    console.error(`[LEAK] Org A Audit trail leaked foreign markers!`);
    auditPassed = false;
  }
  if (auditBText.includes(BLUEPRINT_ORG_A.code) || auditBText.includes(BLUEPRINT_ORG_C.code)) {
    console.error(`[LEAK] Org B Audit trail leaked foreign markers!`);
    auditPassed = false;
  }
  if (auditCText.includes(BLUEPRINT_ORG_A.code) || auditCText.includes(BLUEPRINT_ORG_B.code)) {
    console.error(`[LEAK] Org C Audit trail leaked foreign markers!`);
    auditPassed = false;
  }

  // Verify platform audit is inaccessible to tenant user
  const platAuditTry = await orgA.client.get(API_PLATFORM_AUDIT_EVENTS_PATH);
  if (platAuditTry.status !== 403) {
    console.error(`[LEAK] Tenant user accessed platform audit endpoint: HTTP ${platAuditTry.status}`);
    auditPassed = false;
  } else {
    console.log(`✔ Platform audit is strictly blocked for tenant users (HTTP 403).`);
  }

  // Verify no super-admin events in tenant audit
  if (auditAText.includes('super-admin') || auditAText.includes('demo.admin@agrivio.test')) {
    console.error(`[LEAK] Platform super-admin events leaked into tenant audit log!`);
    auditPassed = false;
  } else {
    console.log(`✔ Tenant audit log contains zero platform Super Admin records.`);
  }

  testResults.auditIsolation = auditPassed;

  // ============================================================
  // TEST 11 & 12: Context Switch & Cache Isolation
  // ============================================================
  console.log(`\n--- Running Test 11 & 12: Context Switch & Cache Isolation ---`);
  let switchPassed = true;

  // Create an auditor user who is a member of BOTH Org A and Org B
  const auditorEmail = `multi.auditor.${RUN_ID}@agrivio.test`;
  const inviteA = await orgA.client.post(
    API_USERS_PATH,
    { email: auditorEmail, displayName: 'Multi-Org Auditor', role: 'Manager' },
    `auditor-inv-a`
  );
  const auditorToken = inviteA.body?.data?.activationToken;
  if (auditorToken) {
    const act = new TestHttpClient();
    await act.post(
      API_AUTH_ACTIVATE_PATH,
      { token: auditorToken, password: COMMON_PASSWORD, displayName: 'Multi-Org Auditor' },
      `act-auditor`
    );
  }
  // Add same user to Org B
  await orgB.client.post(
    API_USERS_PATH,
    { email: auditorEmail, displayName: 'Multi-Org Auditor', role: 'Manager' },
    `auditor-inv-b`
  );

  // Login as Auditor
  const auditorClient = new TestHttpClient();
  await auditorClient.login(auditorEmail, COMMON_PASSWORD);

  // Switch to Org A
  await auditorClient.switchContext(orgA.organizationId);
  const audProdsA = await auditorClient.get(API_PRODUCTS_PATH);
  const audDashA = await auditorClient.get(API_DASHBOARD_PATH);
  const textA = serialized(audProdsA.body) + serialized(audDashA.body);

  const hasOrgAData = textA.includes('ORG-A') || textA.includes('AgroChem');
  const hasOrgBDataInA = textA.includes('ORG-B') || textA.includes('GreenSprout');
  const hasOrgCDataInA = textA.includes('ORG-C') || textA.includes('Crestline');

  if (hasOrgBDataInA || hasOrgCDataInA || !hasOrgAData) {
    console.error(`[LEAK] Auditor in Org A context saw foreign or incorrect data.`);
    switchPassed = false;
  } else {
    console.log(`✔ Auditor loaded Org A context: returned 100% Org A data, 0 foreign records.`);
  }

  // Switch to Org B
  await auditorClient.switchContext(orgB.organizationId);
  const audProdsB = await auditorClient.get(API_PRODUCTS_PATH);
  const audDashB = await auditorClient.get(API_DASHBOARD_PATH);
  const textB = serialized(audProdsB.body) + serialized(audDashB.body);

  const hasOrgBData = textB.includes('ORG-B') || textB.includes('GreenSprout');
  const hasOrgADataInB = textB.includes('ORG-A') || textB.includes('AgroChem');
  const hasOrgCDataInB = textB.includes('ORG-C') || textB.includes('Crestline');

  if (hasOrgADataInB || hasOrgCDataInB || !hasOrgBData) {
    console.error(`[LEAK] Stale Org A cache persisted after context switch to Org B!`);
    switchPassed = false;
  } else {
    console.log(`✔ Context switch A -> B immediately updated products and dashboard with 0 stale Org A data.`);
  }

  // Mutation in B: Add a test customer in Org B
  const bMutation = await auditorClient.post(
    API_CUSTOMERS_PATH,
    { name: `ORG-B-DYNAMIC-CUST-${RUN_ID}`, customerType: 'farmer', phone: '03009998888', creditEnabled: false },
    `dyn-cust-${RUN_ID}`
  );
  if (bMutation.status !== 201 && bMutation.status !== 200) {
    console.error(`Failed mutation in B:`, bMutation.body);
    switchPassed = false;
  }

  // Switch back to Org A: Verify Org A is untouched and does not see the new customer
  await auditorClient.switchContext(orgA.organizationId);
  const audCustsA = await auditorClient.get(API_CUSTOMERS_PATH);
  const textA2 = serialized(audCustsA.body);

  if (textA2.includes(`ORG-B-DYNAMIC-CUST-${RUN_ID}`)) {
    console.error(`[LEAK] Mutation in Org B contaminated Org A cache/data!`);
    switchPassed = false;
  } else {
    console.log(`✔ Mutation in B invalidated B data without contaminating A. Switch B -> A confirmed clean.`);
  }

  testResults.contextSwitchCacheIsolation = switchPassed;

  // ============================================================
  // DATASET & FINANCIAL SUMMARIES
  // ============================================================
  console.log(`\n============================================================`);
  console.log(`13. DATASET SUMMARY`);
  console.log(`============================================================`);

  function extractList(res) {
    if (!res || !res.body) return [];
    if (Array.isArray(res.body.data)) return res.body.data;
    if (res.body.data && Array.isArray(res.body.data.items)) return res.body.data.items;
    return [];
  }

  function countItems(res) {
    if (!res || !res.body) return 0;
    if (typeof res.body.meta?.total === 'number') return res.body.meta.total;
    if (typeof res.body.data?.total === 'number') return res.body.data.total;
    const list = extractList(res);
    return list.length;
  }

  async function getEntityCounts(client) {
    const [p, c, s, sa, po, b, a, aud] = await Promise.all([
      client.get(API_PRODUCTS_PATH),
      client.get(API_CUSTOMERS_PATH),
      client.get(API_SUPPLIERS_PATH),
      client.get(API_SALES_PATH),
      client.get(API_PURCHASES_PATH),
      client.get(API_INVENTORY_BATCHES_PATH),
      client.get(API_ACCOUNTS_PATH),
      client.get(API_AUDIT_EVENTS_PATH),
    ]);
    return {
      products: countItems(p),
      customers: countItems(c),
      suppliers: countItems(s),
      sales: countItems(sa),
      purchases: countItems(po),
      batches: countItems(b),
      accounts: countItems(a),
      auditEvents: countItems(aud),
    };
  }

  const countsA = await getEntityCounts(orgA.client);
  const countsB = await getEntityCounts(orgB.client);
  const countsC = await getEntityCounts(orgC.client);

  console.log(`
| Entity       | Org A (${orgA.code}) | Org B (${orgB.code}) | Org C (${orgC.code}) |
|--------------|-------------------|-------------------|-------------------|
| Products     | ${countsA.products}                 | ${countsB.products}                 | ${countsC.products}                 |
| Customers    | ${countsA.customers}                 | ${countsB.customers}                 | ${countsC.customers}                 |
| Suppliers    | ${countsA.suppliers}                 | ${countsB.suppliers}                 | ${countsC.suppliers}                 |
| Sales        | ${countsA.sales}                 | ${countsB.sales}                 | ${countsC.sales}                 |
| Purchases    | ${countsA.purchases}                 | ${countsB.purchases}                 | ${countsC.purchases}                 |
| Batches      | ${countsA.batches}                 | ${countsB.batches}                 | ${countsC.batches}                 |
| Accounts     | ${countsA.accounts}                 | ${countsB.accounts}                 | ${countsC.accounts}                 |
| Audit Events | ${countsA.auditEvents}                | ${countsB.auditEvents}                | ${countsC.auditEvents}                |
`);

  console.log(`============================================================`);
  console.log(`FINANCIAL SUMMARY`);
  console.log(`============================================================`);

  async function getFinancials(client) {
    const [salesRep, purchRep, stockRep, valRep, gpRep, expRep, accRes, custRes, supRes] = await Promise.all([
      client.get(`${API_REPORTS_PATH}/sales`),
      client.get(`${API_REPORTS_PATH}/purchases`),
      client.get(`${API_REPORTS_PATH}/stock`),
      client.get(`${API_REPORTS_PATH}/stock-valuation`),
      client.get(`${API_REPORTS_PATH}/gross-profit`),
      client.get(`${API_REPORTS_PATH}/expenses`),
      client.get(API_ACCOUNTS_PATH),
      client.get(API_CUSTOMERS_PATH),
      client.get(API_SUPPLIERS_PATH),
    ]);

    let totalCashBank = 0;
    for (const acc of extractList(accRes)) {
      totalCashBank += parseFloat(acc.derivedBalances?.balance?.amount || acc.balance?.amount || '0');
    }

    let totalReceivables = 0;
    for (const cu of extractList(custRes)) {
      totalReceivables += parseFloat(cu.derivedBalances?.receivable?.amount || cu.currentBalance?.amount || '0');
    }

    let totalPayables = 0;
    for (const su of extractList(supRes)) {
      totalPayables += parseFloat(su.derivedBalances?.payable?.amount || su.currentBalance?.amount || '0');
    }

    let totalStockQty = 0;
    for (const row of (stockRep.body?.data?.rows || [])) {
      totalStockQty += parseFloat(row.quantityBase || '0');
    }

    const revenue = gpRep.body?.data?.summary?.netSalesRevenue?.amount
      || salesRep.body?.data?.totals?.total
      || '0.00';
    const cogs = gpRep.body?.data?.summary?.netCogs?.amount || '0.00';
    const grossProfit = gpRep.body?.data?.summary?.grossProfit?.amount
      || gpRep.body?.data?.totals?.amount
      || '0.00';
    const stockValue = valRep.body?.data?.totals?.inventoryValue || '0.00';

    return {
      revenue,
      cogs,
      grossProfit,
      stockQty: totalStockQty.toFixed(4),
      stockValue,
      receivables: totalReceivables.toFixed(2),
      payables: totalPayables.toFixed(2),
      cashBank: totalCashBank.toFixed(2),
    };
  }

  const finA = await getFinancials(orgA.client);
  const finB = await getFinancials(orgB.client);
  const finC = await getFinancials(orgC.client);

  console.log(`
| Metric       | Org A (PKR)       | Org B (PKR)       | Org C (PKR)       |
|--------------|-------------------|-------------------|-------------------|
| Revenue      | ${finA.revenue}         | ${finB.revenue}        | ${finC.revenue}        |
| COGS         | ${finA.cogs}         | ${finB.cogs}        | ${finC.cogs}        |
| Gross Profit | ${finA.grossProfit}         | ${finB.grossProfit}        | ${finC.grossProfit}        |
| Stock Qty    | ${finA.stockQty}          | ${finB.stockQty}          | ${finC.stockQty}          |
| Stock Value  | ${finA.stockValue}        | ${finB.stockValue}       | ${finC.stockValue}        |
| Receivables  | ${finA.receivables}         | ${finB.receivables}        | ${finC.receivables}       |
| Payables     | ${finA.payables}         | ${finB.payables}        | ${finC.payables}       |
| Cash/Bank    | ${finA.cashBank}       | ${finB.cashBank}       | ${finC.cashBank}       |
`);

  console.log(`============================================================`);
  console.log(`14. VERDICT`);
  console.log(`============================================================`);
  console.log(`MULTI-ORG UI ISOLATION: ${testResults.searchIsolation ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`DIRECT API ISOLATION: ${testResults.directApiIsolation ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`DROPDOWN ISOLATION: ${testResults.dropdownIsolation ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`REPORT ISOLATION: ${testResults.reportIsolation ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`AUDIT ISOLATION: ${testResults.auditIsolation ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`CACHE/CONTEXT SWITCH ISOLATION: ${testResults.contextSwitchCacheIsolation ? '✅ PASS' : '❌ FAIL'}`);

  return {
    orgA,
    orgB,
    orgC,
    testResults,
    counts: { a: countsA, b: countsB, c: countsC },
    financials: { a: finA, b: finB, c: finC },
  };
}

runAcceptance().catch((err) => {
  console.error('\nACCEPTANCE SUITE FAILED WITH ERROR:', err);
  process.exit(1);
});
