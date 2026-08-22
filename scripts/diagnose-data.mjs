import { MongoClient } from 'mongodb';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
const DB_NAME = 'Agrivio';
const API_BASE = 'http://localhost:3000';

async function diagnose() {
  console.log('=== 1. MONGO DATABASE DIAGNOSTIC ===');
  console.log(`Connecting to: ${MONGO_URI}, DB: ${DB_NAME}`);
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  const orgs = await db.collection('organizations').find({}).toArray();
  console.log(`Organizations in DB (${orgs.length}):`);
  for (const o of orgs) {
    console.log(`  - ID: ${o._id}, Name: "${o.name}", Status: ${o.status}`);
  }

  const primaryOrg = orgs.find(o => o.name === 'Agrivio Demo Agrochemicals (Pvt) Ltd');
  if (!primaryOrg) {
    console.error('ERROR: Primary demo organization not found in DB!');
    await client.close();
    return;
  }
  const orgId = primaryOrg._id;
  console.log(`Primary Demo Org ID: ${orgId}`);

  const counts = {
    products: await db.collection('products').countDocuments({ organizationId: orgId }),
    customers: await db.collection('customers').countDocuments({ organizationId: orgId }),
    suppliers: await db.collection('suppliers').countDocuments({ organizationId: orgId }),
    branches: await db.collection('branches').countDocuments({ organizationId: orgId }),
    warehouses: await db.collection('warehouses').countDocuments({ organizationId: orgId }),
    accounts: await db.collection('financial_accounts').countDocuments({ organizationId: orgId }),
    sales: await db.collection('sales').countDocuments({ organizationId: orgId }),
    purchases: await db.collection('purchases').countDocuments({ organizationId: orgId }),
    inventory_balances: await db.collection('inventory_balances').countDocuments({ organizationId: orgId }),
    expenses: await db.collection('expenses').countDocuments({ organizationId: orgId }),
    stock_movements: await db.collection('stock_movements').countDocuments({ organizationId: orgId }),
    users: await db.collection('users').countDocuments({}),
    memberships: await db.collection('organization_memberships').countDocuments({ organizationId: orgId }),
  };
  console.log('Primary Demo Org Counts in DB:', JSON.stringify(counts, null, 2));

  const ownerUser = await db.collection('users').findOne({ email: 'demo.owner@agrivio.test' });
  console.log('Owner User in DB:', ownerUser ? { id: ownerUser._id, email: ownerUser.email, status: ownerUser.status } : 'NOT FOUND');

  const ownerMembership = ownerUser ? await db.collection('organization_memberships').findOne({ userId: ownerUser._id, organizationId: orgId }) : null;
  console.log('Owner Membership:', ownerMembership ? { role: ownerMembership.role, status: ownerMembership.status, branches: ownerMembership.branchIds } : 'NOT FOUND');

  await client.close();

  console.log('\n=== 2. HTTP FRONTEND API DIAGNOSTIC (as demo.owner@agrivio.test) ===');
  // 1. Get CSRF token
  const csrfRes = await fetch(`${API_BASE}/api/v1/auth/csrf`, { method: 'POST' });
  const csrfBody = await csrfRes.json();
  const csrfToken = csrfBody.data?.csrfToken;
  const setCookie = csrfRes.headers.get('set-cookie');
  console.log('CSRF Token:', csrfToken ? 'OK' : 'MISSING', 'Set-Cookie:', setCookie ? 'PRESENT' : 'MISSING');

  // 2. Login
  const loginRes = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      Cookie: setCookie || '',
    },
    body: JSON.stringify({
      email: 'demo.owner@agrivio.test',
      password: 'DemoPassword123!',
    }),
  });
  const loginSetCookie = loginRes.headers.get('set-cookie') || setCookie;
  const loginBody = await loginRes.json();
  console.log('Login Status:', loginRes.status, 'User:', loginBody.data?.user?.email, 'Active Org:', loginBody.data?.activeOrganization?.name, 'Role:', loginBody.data?.activeOrganization?.role);

  const authHeaders = {
    'X-CSRF-Token': csrfToken,
    Cookie: loginSetCookie,
  };

  // Inspect Angular endpoints
  const endpoints = [
    { name: 'Dashboard (/api/v1/reports/dashboard)', url: `${API_BASE}/api/v1/reports/dashboard` },
    { name: 'Dashboard (/api/v1/dashboard)', url: `${API_BASE}/api/v1/dashboard` },
    { name: 'Products (/api/v1/products)', url: `${API_BASE}/api/v1/products?page=1&pageSize=50&status=active` },
    { name: 'Customers (/api/v1/customers)', url: `${API_BASE}/api/v1/customers?page=1&pageSize=50&status=active` },
    { name: 'Suppliers (/api/v1/suppliers)', url: `${API_BASE}/api/v1/suppliers?page=1&pageSize=50&status=active` },
    { name: 'Branches (/api/v1/branches)', url: `${API_BASE}/api/v1/branches` },
    { name: 'Warehouses (/api/v1/warehouses)', url: `${API_BASE}/api/v1/warehouses` },
    { name: 'Accounts (/api/v1/accounts)', url: `${API_BASE}/api/v1/accounts` },
    { name: 'Sales (/api/v1/sales)', url: `${API_BASE}/api/v1/sales?page=1&pageSize=50` },
    { name: 'Purchases (/api/v1/purchases)', url: `${API_BASE}/api/v1/purchases?page=1&pageSize=50` },
    { name: 'Inventory Balances (/api/v1/inventory/balances)', url: `${API_BASE}/api/v1/inventory/balances?page=1&pageSize=50` },
    { name: 'Expenses (/api/v1/expenses)', url: `${API_BASE}/api/v1/expenses?page=1&pageSize=50` },
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep.url, { headers: authHeaders });
      const body = await res.json();
      const count = body.data?.items ? body.data.items.length : (Array.isArray(body.data) ? body.data.length : (body.data?.totalCount ?? (body.data ? 'OBJECT' : 'EMPTY')));
      console.log(`Endpoint ${ep.name}: HTTP ${res.status}, Count/Type: ${count}`);
    } catch (err) {
      console.log(`Endpoint ${ep.name}: ERROR ${err.message}`);
    }
  }
}

diagnose().catch(console.error);
