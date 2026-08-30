async function exists(Model, filter) {
  if (!Model || typeof Model.exists !== 'function') {
    return false;
  }
  const found = await Model.exists(filter);
  return found !== null;
}

function createMongooseMasterReferenceQueries() {
  const { SaleModel } = require('../../modules/sales/persistence/sale.model');
  const { PurchaseModel } = require('../../modules/purchases/persistence/purchase.model');
  const { ReturnModel } = require('../../modules/returns-corrections/persistence/return.model');
  const { StockMovementModel } = require('../../modules/inventory/persistence/stock-movement.model');
  const { ProductBatchModel } = require('../../modules/inventory/persistence/product-batch.model');
  const {
    InventoryBalanceModel,
  } = require('../../modules/inventory/persistence/inventory-balance.model');
  const {
    StockAdjustmentModel,
  } = require('../../modules/inventory/persistence/stock-adjustment.model');
  const {
    WarehouseTransferModel,
  } = require('../../modules/inventory/persistence/warehouse-transfer.model');
  const { PaymentModel } = require('../../modules/payments-ledgers/persistence/payment.model');
  const {
    LedgerEffectModel,
  } = require('../../modules/payments-ledgers/persistence/ledger-effect.model');
  const {
    AccountMovementModel,
  } = require('../../modules/accounts-expenses/persistence/account-movement.model');
  const { ExpenseModel } = require('../../modules/accounts-expenses/persistence/expense.model');
  const { ProductModel } = require('../../modules/catalog/persistence/product.model');
  const {
    AccessAssignmentModel,
  } = require('../../modules/locations/persistence/access-assignment.model');

  async function collect(checks) {
    const reasons = [];
    for (const check of checks) {
      if (await exists(check.model, check.filter)) {
        reasons.push(check.label);
      }
    }
    return reasons;
  }

  return {
    async listProductReferences(organizationId, productId) {
      const org = { organizationId, productId };
      const line = { organizationId, 'lines.productId': productId };
      return collect([
        { model: StockMovementModel, filter: org, label: 'stock movements' },
        { model: ProductBatchModel, filter: org, label: 'batches' },
        { model: InventoryBalanceModel, filter: org, label: 'stock balances' },
        { model: StockAdjustmentModel, filter: org, label: 'stock adjustments' },
        { model: WarehouseTransferModel, filter: org, label: 'warehouse transfers' },
        { model: SaleModel, filter: line, label: 'sales' },
        { model: PurchaseModel, filter: line, label: 'purchases' },
        { model: ReturnModel, filter: { organizationId, 'lines.productId': productId }, label: 'returns' },
      ]);
    },

    async listCategoryReferences(organizationId, categoryId) {
      return collect([
        { model: ProductModel, filter: { organizationId, categoryId }, label: 'products' },
      ]);
    },

    async listCustomerReferences(organizationId, customerId) {
      return collect([
        { model: SaleModel, filter: { organizationId, customerId }, label: 'sales' },
        { model: PaymentModel, filter: { organizationId, customerId }, label: 'payments' },
        { model: LedgerEffectModel, filter: { organizationId, customerId }, label: 'ledger history' },
        { model: ReturnModel, filter: { organizationId, customerId }, label: 'returns' },
      ]);
    },

    async listSupplierReferences(organizationId, supplierId) {
      return collect([
        { model: PurchaseModel, filter: { organizationId, supplierId }, label: 'purchases' },
        { model: PaymentModel, filter: { organizationId, supplierId }, label: 'payments' },
        { model: LedgerEffectModel, filter: { organizationId, supplierId }, label: 'ledger history' },
        { model: ReturnModel, filter: { organizationId, supplierId }, label: 'returns' },
      ]);
    },

    async listWarehouseReferences(organizationId, warehouseId) {
      return collect([
        { model: StockMovementModel, filter: { organizationId, warehouseId }, label: 'stock movements' },
        { model: InventoryBalanceModel, filter: { organizationId, warehouseId }, label: 'stock balances' },
        { model: SaleModel, filter: { organizationId, warehouseId }, label: 'sales' },
        { model: PurchaseModel, filter: { organizationId, warehouseId }, label: 'purchases' },
        { model: ReturnModel, filter: { organizationId, warehouseId }, label: 'returns' },
        { model: StockAdjustmentModel, filter: { organizationId, warehouseId }, label: 'adjustments' },
        {
          model: WarehouseTransferModel,
          filter: {
            organizationId,
            $or: [{ sourceWarehouseId: warehouseId }, { destinationWarehouseId: warehouseId }],
          },
          label: 'transfers',
        },
        {
          model: AccessAssignmentModel,
          filter: { organizationId, assignmentType: 'warehouse', targetId: warehouseId, status: 'active' },
          label: 'access assignments',
        },
      ]);
    },

    async listBranchReferences(organizationId, branchId) {
      return collect([
        { model: SaleModel, filter: { organizationId, branchId }, label: 'sales' },
        { model: PurchaseModel, filter: { organizationId, branchId }, label: 'purchases' },
        {
          model: AccessAssignmentModel,
          filter: { organizationId, assignmentType: 'branch', targetId: branchId, status: 'active' },
          label: 'access assignments',
        },
      ]);
    },

    async listAccountReferences(organizationId, accountId) {
      return collect([
        { model: AccountMovementModel, filter: { organizationId, accountId }, label: 'account movements' },
        { model: ExpenseModel, filter: { organizationId, accountId }, label: 'expenses' },
        { model: PaymentModel, filter: { organizationId, accountId }, label: 'payments' },
        {
          model: SaleModel,
          filter: { organizationId, 'paymentSnapshots.accountId': accountId },
          label: 'sales',
        },
        {
          model: PurchaseModel,
          filter: { organizationId, 'paymentSnapshots.accountId': accountId },
          label: 'purchases',
        },
      ]);
    },

    async listExpenseCategoryReferences(organizationId, categoryId) {
      return collect([
        { model: ExpenseModel, filter: { organizationId, categoryId }, label: 'expenses' },
      ]);
    },
  };
}

module.exports = {
  createMongooseMasterReferenceQueries,
};
