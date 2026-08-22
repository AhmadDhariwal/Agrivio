const API_BASE = 'http://localhost:3000';

async function testFrontendApis() {
  console.log('=== LOGGING IN AS demo.owner@agrivio.test ===');
  
  // 1. Get CSRF
  const csrfRes = await fetch(`${API_BASE}/api/v1/auth/csrf`, { method: 'POST' });
  const csrfBody = await csrfRes.json();
  const csrfToken = csrfBody.data?.csrfToken;
  const initialCookie = csrfRes.headers.get('set-cookie');
  console.log('CSRF response:', csrfBody, 'Set-Cookie:', initialCookie);

  // 2. Login
  const loginRes = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      Cookie: initialCookie,
    },
    body: JSON.stringify({
      email: 'demo.owner@agrivio.test',
      password: 'DemoPassword123!',
    }),
  });
  const loginBody = await loginRes.json();
  const sessionCookie = loginRes.headers.get('set-cookie') || initialCookie;
  console.log('Login HTTP status:', loginRes.status);
  console.log('Login Body:', JSON.stringify(loginBody, null, 2));
  console.log('Session Cookie:', sessionCookie);

  const authHeaders = {
    'X-CSRF-Token': csrfToken,
    Cookie: sessionCookie,
  };

  // 3. Get Session (/api/v1/auth/session or /api/v1/auth/me)
  const sessionRes = await fetch(`${API_BASE}/api/v1/auth/session`, { headers: authHeaders });
  const sessionBody = await sessionRes.json();
  console.log('\n--- /api/v1/auth/session ---');
  console.log('HTTP Status:', sessionRes.status);
  console.log('Session Data:', JSON.stringify(sessionBody, null, 2));

  // 4. Test each frontend API with exact parameters
  console.log('\n--- 1. Dashboard: /api/v1/dashboard ---');
  const dashRes = await fetch(`${API_BASE}/api/v1/dashboard`, { headers: authHeaders });
  const dashBody = await dashRes.json();
  console.log('Dashboard HTTP Status:', dashRes.status);
  console.log('Dashboard Summary:', {
    todaySales: dashBody.data?.todaySales,
    totalReceivables: dashBody.data?.totalReceivables,
    totalPayables: dashBody.data?.totalPayables,
    lowStockCount: dashBody.data?.lowStockCount,
    expiringBatchesCount: dashBody.data?.expiringBatchesCount,
    salesVsPurchasesLength: dashBody.data?.salesVsPurchases?.length,
  });

  console.log('\n--- 2. Products: /api/v1/products?page=1&pageSize=20&status=active ---');
  const prodRes = await fetch(`${API_BASE}/api/v1/products?page=1&pageSize=20&status=active`, { headers: authHeaders });
  const prodBody = await prodRes.json();
  console.log('Products HTTP Status:', prodRes.status, 'Total Items:', prodBody.data?.items?.length, 'Total Count:', prodBody.data?.totalCount);
  console.log('Sample Product:', prodBody.data?.items?.[0]);

  console.log('\n--- 3. Customers: /api/v1/customers?page=1&pageSize=20&status=active ---');
  const custRes = await fetch(`${API_BASE}/api/v1/customers?page=1&pageSize=20&status=active`, { headers: authHeaders });
  const custBody = await custRes.json();
  console.log('Customers HTTP Status:', custRes.status, 'Total Items:', custBody.data?.items?.length, 'Total Count:', custBody.data?.totalCount);
  console.log('Sample Customer:', custBody.data?.items?.[0]);

  console.log('\n--- 4. Suppliers: /api/v1/suppliers?page=1&pageSize=20&status=active ---');
  const supRes = await fetch(`${API_BASE}/api/v1/suppliers?page=1&pageSize=20&status=active`, { headers: authHeaders });
  const supBody = await supRes.json();
  console.log('Suppliers HTTP Status:', supRes.status, 'Total Items:', supBody.data?.items?.length, 'Total Count:', supBody.data?.totalCount);
  console.log('Sample Supplier:', supBody.data?.items?.[0]);

  console.log('\n--- 5. Sales: /api/v1/sales?page=1&pageSize=20 ---');
  const salesRes = await fetch(`${API_BASE}/api/v1/sales?page=1&pageSize=20`, { headers: authHeaders });
  const salesBody = await salesRes.json();
  console.log('Sales HTTP Status:', salesRes.status, 'Total Items:', salesBody.data?.items?.length, 'Total Count:', salesBody.data?.totalCount);
  console.log('Sample Sale:', salesBody.data?.items?.[0]);

  console.log('\n--- 6. Purchases: /api/v1/purchases?page=1&pageSize=20 ---');
  const purRes = await fetch(`${API_BASE}/api/v1/purchases?page=1&pageSize=20`, { headers: authHeaders });
  const purBody = await purRes.json();
  console.log('Purchases HTTP Status:', purRes.status, 'Total Items:', purBody.data?.items?.length, 'Total Count:', purBody.data?.totalCount);
  console.log('Sample Purchase:', purBody.data?.items?.[0]);

  console.log('\n--- 7. Inventory Balances: /api/v1/inventory/balances?page=1&pageSize=20 ---');
  const invRes = await fetch(`${API_BASE}/api/v1/inventory/balances?page=1&pageSize=20`, { headers: authHeaders });
  const invBody = await invRes.json();
  console.log('Inventory HTTP Status:', invRes.status, 'Total Items:', invBody.data?.items?.length, 'Total Count:', invBody.data?.totalCount);
  console.log('Sample Stock Balance:', invBody.data?.items?.[0]);

  console.log('\n--- 8. Accounts: /api/v1/accounts ---');
  const accRes = await fetch(`${API_BASE}/api/v1/accounts`, { headers: authHeaders });
  const accBody = await accRes.json();
  console.log('Accounts HTTP Status:', accRes.status, 'Total Items:', accBody.data?.items?.length || accBody.data?.length);

  console.log('\n--- 9. Expenses: /api/v1/expenses?page=1&pageSize=20 ---');
  const expRes = await fetch(`${API_BASE}/api/v1/expenses?page=1&pageSize=20`, { headers: authHeaders });
  const expBody = await expRes.json();
  console.log('Expenses HTTP Status:', expRes.status, 'Total Items:', expBody.data?.items?.length, 'Total Count:', expBody.data?.totalCount);
}

testFrontendApis().catch(console.error);
