/**
 * Agrivio Demo Dataset - Tenant-Scoped Reset Utility.
 * Strictly cleans up ONLY Agrivio demo organizations and test users.
 */

const mongoose = require('mongoose');
const {
  DEMO_ORG_NAME,
  SECONDARY_TRIAL_ORG_NAME,
  SECONDARY_SUSPENDED_ORG_NAME,
} = require('./demo-constants');

function assertSafeDatabase(target) {
  let dbName = '';
  let host = '';

  if (typeof target === 'string') {
    try {
      const url = new URL(target);
      dbName = url.pathname.replace(/^\//, '');
      host = url.host;
    } catch {
      dbName = target;
    }
  } else if (target && typeof target === 'object') {
    dbName = String(target.name || '');
    host = String(target.host || '');
  } else if (mongoose.connection) {
    dbName = String(mongoose.connection.name || '');
    host = String(mongoose.connection.host || '');
  }

  if (
    process.env.NODE_ENV === 'production' ||
    process.env.AGRIVIO_APP_PROFILE === 'production'
  ) {
    throw new Error('[agrivio-safety] Demo reset/seeding is strictly prohibited in production environment.');
  }

  if (process.env.AGRIVIO_DEMO_SEED_ALLOWED !== 'true') {
    throw new Error(
      '[agrivio-safety] Demo seeding requires AGRIVIO_DEMO_SEED_ALLOWED=true environment variable.',
    );
  }

  if (dbName.toLowerCase().includes('prod') || host.toLowerCase().includes('prod')) {
    throw new Error(
      `[agrivio-safety] Refusing demo operation on database "${dbName}" containing "prod".`,
    );
  }
}

async function findDemoTenantIds() {
  const orgCollection = mongoose.connection.collection('organizations');
  const userCollection = mongoose.connection.collection('users');

  const demoOrgs = await orgCollection
    .find({
      name: {
        $in: [
          DEMO_ORG_NAME,
          SECONDARY_TRIAL_ORG_NAME,
          SECONDARY_SUSPENDED_ORG_NAME,
        ],
      },
    })
    .toArray();

  const organizationIds = demoOrgs.map((org) => org._id);

  const demoUsers = await userCollection
    .find({
      emailNormalized: { $regex: /@agrivio\.test$/ },
    })
    .toArray();

  const userIds = demoUsers.map((user) => user._id);

  return {
    demoOrgs,
    organizationIds,
    demoOrgIds: organizationIds,
    demoUsers,
    userIds,
    demoUserIds: userIds,
  };
}

async function resetDemoTenantData(target) {
  assertSafeDatabase(target || mongoose.connection);

  const { organizationIds, userIds } = await findDemoTenantIds();

  if (organizationIds.length === 0 && userIds.length === 0) {
    return 0;
  }

  const collections = [
    'organization_memberships',
    'access_assignments',
    'subscriptions',
    'subscription_billing_records',
    'branches',
    'warehouses',
    'product_categories',
    'products',
    'product_prices',
    'packaging_units',
    'inventory_batches',
    'inventory_balances',
    'inventory_movements',
    'stock_adjustments',
    'warehouse_transfers',
    'customers',
    'suppliers',
    'purchases',
    'purchase_lines',
    'sales',
    'sale_lines',
    'financial_accounts',
    'account_movements',
    'account_transactions',
    'account_transfers',
    'expense_categories',
    'expenses',
    'customer_ledgers',
    'supplier_ledgers',
    'customer_payments',
    'supplier_payments',
    'payment_allocations',
    'returns',
    'return_lines',
    'audit_events',
    'alerts',
    'notifications',
    'imports',
    'settings',
  ];

  let totalDeleted = 0;

  for (const colName of collections) {
    try {
      const col = mongoose.connection.collection(colName);
      if (organizationIds.length > 0) {
        const res = await col.deleteMany({
          organizationId: { $in: organizationIds },
        });
        totalDeleted += res.deletedCount;
      }
    } catch {
      // Ignore if collection does not exist
    }
  }

  // Delete demo users
  if (userIds.length > 0) {
    try {
      const uCol = mongoose.connection.collection('users');
      const uRes = await uCol.deleteMany({ _id: { $in: userIds } });
      totalDeleted += uRes.deletedCount;
    } catch {}

    try {
      const sCol = mongoose.connection.collection('sessions');
      const sRes = await sCol.deleteMany({ userId: { $in: userIds } });
      totalDeleted += sRes.deletedCount;
    } catch {}
  }

  // Delete demo organizations
  if (organizationIds.length > 0) {
    try {
      const oCol = mongoose.connection.collection('organizations');
      const oRes = await oCol.deleteMany({ _id: { $in: organizationIds } });
      totalDeleted += oRes.deletedCount;
    } catch {}

    try {
      const intCol = mongoose.connection.collection('organization_activation_requests');
      const intRes = await intCol.deleteMany({
        $or: [
          { organizationName: { $in: [DEMO_ORG_NAME, SECONDARY_TRIAL_ORG_NAME, SECONDARY_SUSPENDED_ORG_NAME] } },
          { ownerEmail: { $regex: /@agrivio\.test$/ } },
        ],
      });
      totalDeleted += intRes.deletedCount;
    } catch {}
  }

  return totalDeleted;
}

module.exports = {
  assertSafeDatabase,
  findDemoTenantIds,
  resetDemoTenantData,
};
