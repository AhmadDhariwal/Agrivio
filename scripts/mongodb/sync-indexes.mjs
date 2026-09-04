import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

try {
  const { loadEnvFile } = await import('node:process');
  if (loadEnvFile) {
    loadEnvFile('.env.local');
  }
} catch {}

const mongoose = require('mongoose');

// Import all models to register schemas
require('../../apps/backend/src/platform/idempotency/persistence/idempotency-record.model.js');
require('../../apps/backend/src/modules/suppliers/persistence/supplier.model.js');
require('../../apps/backend/src/modules/accounts-expenses/persistence/expense.model.js');
require('../../apps/backend/src/modules/accounts-expenses/persistence/expense-category.model.js');
require('../../apps/backend/src/modules/accounts-expenses/persistence/account.model.js');
require('../../apps/backend/src/modules/accounts-expenses/persistence/account-movement.model.js');
require('../../apps/backend/src/modules/subscriptions/persistence/subscription-billing-record.model.js');
require('../../apps/backend/src/modules/subscriptions/persistence/subscription-plan.model.js');
require('../../apps/backend/src/modules/subscriptions/persistence/subscription.model.js');
require('../../apps/backend/src/modules/settings/persistence/organization-settings.model.js');
require('../../apps/backend/src/modules/sales/persistence/sale.model.js');
require('../../apps/backend/src/modules/sales/persistence/invoice-sequence.model.js');
require('../../apps/backend/src/modules/returns-corrections/persistence/corrective-transaction.model.js');
require('../../apps/backend/src/modules/returns-corrections/persistence/return.model.js');
require('../../apps/backend/src/modules/purchases/persistence/purchase.model.js');
require('../../apps/backend/src/modules/payments-ledgers/persistence/payment.model.js');
require('../../apps/backend/src/modules/payments-ledgers/persistence/payment-allocation.model.js');
require('../../apps/backend/src/modules/payments-ledgers/persistence/ledger-effect.model.js');
require('../../apps/backend/src/modules/operations/persistence/backup-operation.model.js');
require('../../apps/backend/src/modules/operations/persistence/restore-operation.model.js');
require('../../apps/backend/src/modules/organizations/persistence/organization.model.js');
require('../../apps/backend/src/modules/locations/persistence/warehouse.model.js');
require('../../apps/backend/src/modules/locations/persistence/branch.model.js');
require('../../apps/backend/src/modules/locations/persistence/access-assignment.model.js');
require('../../apps/backend/src/modules/inventory/persistence/inventory-settings.model.js');
require('../../apps/backend/src/modules/inventory/persistence/product-batch.model.js');
require('../../apps/backend/src/modules/inventory/persistence/stock-adjustment.model.js');
require('../../apps/backend/src/modules/inventory/persistence/inventory-cost-state.model.js');
require('../../apps/backend/src/modules/inventory/persistence/stock-movement.model.js');
require('../../apps/backend/src/modules/inventory/persistence/warehouse-transfer.model.js');
require('../../apps/backend/src/modules/inventory/persistence/inventory-balance.model.js');
require('../../apps/backend/src/modules/imports/persistence/import-job.model.js');
require('../../apps/backend/src/modules/identity/persistence/navigation-preference.model.js');
require('../../apps/backend/src/modules/customers/persistence/customer.model.js');
require('../../apps/backend/src/modules/identity/persistence/identity.model.js');
require('../../apps/backend/src/modules/capabilities/persistence/organization-capability-policy.model.js');
require('../../apps/backend/src/modules/alerts/persistence/alert-settings.model.js');
require('../../apps/backend/src/modules/alerts/persistence/low-stock-threshold.model.js');
require('../../apps/backend/src/modules/alerts/persistence/notification-item.model.js');
require('../../apps/backend/src/modules/alerts/persistence/notification-read-state.model.js');
require('../../apps/backend/src/modules/catalog/persistence/product-category.model.js');
require('../../apps/backend/src/modules/catalog/persistence/product-packaging-unit.model.js');
require('../../apps/backend/src/modules/catalog/persistence/product-price.model.js');
require('../../apps/backend/src/modules/catalog/persistence/product.model.js');
require('../../apps/backend/src/modules/audit/persistence/audit-event.model.js');

async function main() {
  const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/Agrivio?replicaSet=rs0';
  const dbName = process.env.MONGODB_DB_NAME ?? 'Agrivio';
  console.log(`Connecting to ${uri} (db: ${dbName})...`);
  await mongoose.connect(uri, { dbName });

  console.log('\n--- MODEL INDEX INSPECTION & SYNCHRONIZATION ---');
  const models = mongoose.models;
  const results = [];

  for (const [modelName, model] of Object.entries(models)) {
    const collectionName = model.collection.name;
    let existingIndexes = [];
    try {
      existingIndexes = await model.collection.indexes();
    } catch (err) {
      if (err.codeName !== 'NamespaceNotFound') {
        console.error(`Error fetching indexes for ${collectionName}:`, err.message);
      }
    }

    const existingNames = existingIndexes.map(idx => idx.name);
    const schemaIndexes = model.schema.indexes();

    // Run syncIndexes safely
    const syncResult = await model.syncIndexes();

    // Fetch updated indexes
    let updatedIndexes = [];
    try {
      updatedIndexes = await model.collection.indexes();
    } catch {}

    const updatedNames = updatedIndexes.map(idx => idx.name);

    results.push({
      model: modelName,
      collection: collectionName,
      schemaIndexCount: schemaIndexes.length + 1, // +1 for _id
      beforeCount: existingIndexes.length,
      afterCount: updatedIndexes.length,
      beforeNames: existingNames,
      afterNames: updatedNames,
      syncResult: syncResult || 'synchronized',
    });
  }

  console.log(JSON.stringify(results, null, 2));

  // Special verification for critical indexes:
  console.log('\n--- CRITICAL INDEX SPOT-CHECK ---');
  
  // 1. BackupOperation partial unique
  const backupIndexes = await mongoose.models.BackupOperation.collection.indexes();
  const backupRunningUnique = backupIndexes.find(i => i.name === 'status_1' && i.unique && i.partialFilterExpression);
  console.log('1. BackupOperation partial unique running index:', backupRunningUnique ? 'PRESENT (ok)' : 'MISSING');
  if (backupRunningUnique) console.log('   Filter:', JSON.stringify(backupRunningUnique.partialFilterExpression));

  // 2. Audit indexes
  const auditIndexes = await mongoose.models.AuditEvent.collection.indexes();
  console.log('2. Audit indexes:', auditIndexes.map(i => i.name).join(', '));

  // 3. Idempotency indexes
  const idempIndexes = await mongoose.models.IdempotencyRecord.collection.indexes();
  console.log('3. Idempotency indexes:', idempIndexes.map(i => i.name).join(', '));

  // 4. Inventory balance scope unique
  const invIndexes = await mongoose.models.InventoryBalance.collection.indexes();
  const invBalanceUnique = invIndexes.find(i => i.name === 'inventory_balances_scope_unique');
  console.log('4. InventoryBalance scope unique:', invBalanceUnique ? 'PRESENT (ok)' : 'MISSING');

  // 5. Product batch scope unique
  const batchIndexes = await mongoose.models.ProductBatch.collection.indexes();
  console.log('5. ProductBatch indexes:', batchIndexes.map(i => i.name).join(', '));

  await mongoose.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
