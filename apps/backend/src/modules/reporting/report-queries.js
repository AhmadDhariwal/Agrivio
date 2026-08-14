const {
  formatQuantityMinorUnits,
  parseQuantityMinorUnits,
} = require('../../platform/primitives/money-and-time');
const {
  computeGrossProfitFromEffects,
  moneyAmountToMinor,
  saleToGrossProfitEffect,
  salesReturnToGrossProfitEffect,
  toMoneyDto,
} = require('./gross-profit');
const { deriveDocumentPaymentStatus, inDateRange } = require('./report-filters');
const { REPORT_BY_KEY } = require('./report-catalog');

function moneyText(money) {
  if (money && typeof money.amount === 'string') {
    return money.amount;
  }
  return '0.00';
}

function quantityText(value) {
  if (value === null || value === undefined) {
    return '0.0000';
  }
  return String(value);
}

function documentMatchesPaymentMethod(payments, paymentMethod) {
  if (!paymentMethod) {
    return true;
  }
  return (payments ?? []).some(
    (payment) => String(payment.accountTypeSnapshot) === paymentMethod,
  );
}

function createReportQueries(deps) {
  const salesService = deps.salesService;
  const purchasesService = deps.purchasesService;
  const accountsService = deps.accountsService;
  const paymentsService = deps.paymentsService;
  const alertsService = deps.alertsService;
  const returnsService = deps.returnsService;
  const inventoryService = deps.inventoryService;
  const catalogService = deps.catalogService;
  const customersService = deps.customersService;

  async function productCategoryMap(organizationId) {
    if (!catalogService || typeof catalogService.listProducts !== 'function') {
      return new Map();
    }
    const { items } = await catalogService.listProducts(organizationId);
    return new Map(items.map((item) => [String(item.id), String(item.categoryId)]));
  }

  async function customerTypeMap(organizationId) {
    if (!customersService || typeof customersService.listCustomers !== 'function') {
      return new Map();
    }
    const { items } = await customersService.listCustomers(organizationId);
    return new Map(items.map((item) => [String(item.id), String(item.customerType)]));
  }

  async function loadPostedSales(organizationId, filters, authContext) {
    const { items } = await salesService.listSales(organizationId, { status: 'posted' }, authContext);
    const categories = await productCategoryMap(organizationId);
    const customerTypes = await customerTypeMap(organizationId);
    return items.filter((sale) => saleMatches(sale, filters, categories, customerTypes));
  }

  function saleMatches(sale, filters, categories, customerTypes) {
    if (!inDateRange(sale.saleDate, filters.fromDate, filters.toDate)) {
      return false;
    }
    if (filters.branchId && String(sale.branchId) !== filters.branchId) {
      return false;
    }
    if (filters.warehouseId && String(sale.warehouseId) !== filters.warehouseId) {
      return false;
    }
    if (filters.customerId && String(sale.customerId ?? '') !== filters.customerId) {
      return false;
    }
    if (filters.priceTier && String(sale.priceTierSnapshot ?? '') !== filters.priceTier) {
      return false;
    }
    if (filters.employeeId && String(sale.postedBy ?? '') !== filters.employeeId) {
      return false;
    }
    if (filters.customerType) {
      const type = customerTypes.get(String(sale.customerId ?? ''));
      if (type !== filters.customerType) {
        return false;
      }
    }
    const paymentStatus = deriveDocumentPaymentStatus(
      moneyAmountToMinor(sale.paidTotal),
      moneyAmountToMinor(sale.receivableTotal),
    );
    if (filters.paymentStatus && paymentStatus !== filters.paymentStatus) {
      return false;
    }
    if (!documentMatchesPaymentMethod(sale.payments, filters.paymentMethod)) {
      return false;
    }
    if (filters.productId || filters.categoryId) {
      const lines = sale.lines ?? [];
      const hasProduct = lines.some((line) => {
        if (filters.productId && String(line.productId) !== filters.productId) {
          return false;
        }
        if (filters.categoryId && categories.get(String(line.productId)) !== filters.categoryId) {
          return false;
        }
        return true;
      });
      if (!hasProduct) {
        return false;
      }
    }
    return true;
  }

  async function loadPostedPurchases(organizationId, filters, authContext) {
    const { items } = await purchasesService.listPurchases(
      organizationId,
      { status: 'posted' },
      authContext,
    );
    const categories = await productCategoryMap(organizationId);
    return items.filter((purchase) => purchaseMatches(purchase, filters, categories));
  }

  function purchaseMatches(purchase, filters, categories) {
    if (!inDateRange(purchase.purchaseDate, filters.fromDate, filters.toDate)) {
      return false;
    }
    if (filters.branchId && String(purchase.branchId ?? '') !== filters.branchId) {
      return false;
    }
    if (filters.warehouseId && String(purchase.warehouseId) !== filters.warehouseId) {
      return false;
    }
    if (filters.supplierId && String(purchase.supplierId) !== filters.supplierId) {
      return false;
    }
    const paymentStatus = deriveDocumentPaymentStatus(
      moneyAmountToMinor(purchase.paidTotal),
      moneyAmountToMinor(purchase.payableTotal),
    );
    if (filters.paymentStatus && paymentStatus !== filters.paymentStatus) {
      return false;
    }
    if (!documentMatchesPaymentMethod(purchase.payments, filters.paymentMethod)) {
      return false;
    }
    if (filters.productId || filters.categoryId) {
      const hasProduct = (purchase.lines ?? []).some((line) => {
        if (filters.productId && String(line.productId) !== filters.productId) {
          return false;
        }
        if (filters.categoryId && categories.get(String(line.productId)) !== filters.categoryId) {
          return false;
        }
        return true;
      });
      if (!hasProduct) {
        return false;
      }
    }
    return true;
  }

  async function collectGrossProfitEffects(organizationId, filters, authContext) {
    const sales = await loadPostedSales(organizationId, filters, authContext);
    const effects = [];
    for (const sale of sales) {
      const effect = saleToGrossProfitEffect(sale);
      if (effect) {
        effects.push(effect);
      }
    }
    if (returnsService && typeof returnsService.listReturns === 'function') {
      const { items: returns } = await returnsService.listReturns(
        organizationId,
        { status: 'posted' },
        authContext,
      );
      const categories = await productCategoryMap(organizationId);
      for (const row of returns) {
        if (row.returnType !== 'sales' && row.returnType !== 'sales_without_invoice') {
          continue;
        }
        if (!inDateRange(row.postedAt, filters.fromDate, filters.toDate)) {
          continue;
        }
        if (filters.warehouseId && String(row.warehouseId) !== filters.warehouseId) {
          continue;
        }
        if (filters.customerId && String(row.customerId ?? '') !== filters.customerId) {
          continue;
        }
        if (filters.productId || filters.categoryId) {
          const hasProduct = (row.lines ?? []).some((line) => {
            if (filters.productId && String(line.productId) !== filters.productId) {
              return false;
            }
            if (filters.categoryId && categories.get(String(line.productId)) !== filters.categoryId) {
              return false;
            }
            return true;
          });
          if (!hasProduct) {
            continue;
          }
        }
        const effect = salesReturnToGrossProfitEffect(row);
        if (effect) {
          effects.push(effect);
        }
      }
    }
    return effects;
  }

  function salesDataset(title, sales, groupBy, categories) {
    if (groupBy === 'product' || groupBy === 'category' || groupBy === 'branch' || groupBy === 'day') {
      const buckets = new Map();
      for (const sale of sales) {
        if (groupBy === 'branch' || groupBy === 'day') {
          const key = groupBy === 'branch' ? String(sale.branchId) : String(sale.saleDate);
          const current = buckets.get(key) ?? {
            key,
            label:
              groupBy === 'branch'
                ? (sale.branchNameSnapshot ?? sale.branchId)
                : String(sale.saleDate),
            amountMinor: 0n,
            cogsMinor: 0n,
          };
          current.amountMinor += moneyAmountToMinor(sale.saleTotal);
          current.cogsMinor += moneyAmountToMinor(sale.cogsTotal);
          buckets.set(key, current);
        } else {
          for (const line of sale.lines ?? []) {
            const categoryId = categories.get(String(line.productId)) ?? '';
            const key = groupBy === 'product' ? String(line.productId) : categoryId;
            const current = buckets.get(key) ?? {
              key,
              label: groupBy === 'product' ? (line.productNameSnapshot ?? line.productId) : key,
              amountMinor: 0n,
              cogsMinor: 0n,
            };
            current.amountMinor += moneyAmountToMinor(line.lineProductAmount);
            current.cogsMinor += moneyAmountToMinor(line.cogsTotal);
            buckets.set(key, current);
          }
        }
      }
      const rows = [...buckets.values()].map((item) => ({
        groupKey: item.key,
        groupLabel: item.label,
        total: toMoneyDto(item.amountMinor).amount,
        cogs: toMoneyDto(item.cogsMinor).amount,
      }));
      const totalMinor = [...buckets.values()].reduce((sum, item) => sum + item.amountMinor, 0n);
      return {
        columns: [
          { key: 'groupKey', label: 'Key' },
          { key: 'groupLabel', label: 'Group' },
          { key: 'total', label: 'Total' },
          { key: 'cogs', label: 'COGS' },
        ],
        rows,
        totals: { total: toMoneyDto(totalMinor).amount },
      };
    }

    const rows = sales.map((sale) => ({
      id: sale.id,
      invoiceNumber: sale.invoiceNumber ?? '',
      saleDate: sale.saleDate,
      customer: sale.customerNameSnapshot ?? sale.customerId ?? '',
      branchId: sale.branchId,
      warehouseId: sale.warehouseId,
      employeeId: sale.postedBy ?? '',
      total: moneyText(sale.saleTotal),
      paid: moneyText(sale.paidTotal),
      receivable: moneyText(sale.receivableTotal),
      cogs: moneyText(sale.cogsTotal),
    }));
    const totalMinor = sales.reduce((sum, sale) => sum + moneyAmountToMinor(sale.saleTotal), 0n);
    return {
      columns: [
        { key: 'invoiceNumber', label: 'Invoice' },
        { key: 'saleDate', label: 'Date' },
        { key: 'customer', label: 'Customer' },
        { key: 'total', label: 'Total' },
        { key: 'cogs', label: 'COGS' },
      ],
      rows,
      totals: { total: toMoneyDto(totalMinor).amount },
    };
  }

  function purchasesDataset(purchases, groupBy, categories) {
    if (groupBy === 'product' || groupBy === 'category' || groupBy === 'branch' || groupBy === 'day') {
      const buckets = new Map();
      for (const purchase of purchases) {
        if (groupBy === 'branch' || groupBy === 'day') {
          const key = groupBy === 'branch' ? String(purchase.branchId ?? '') : String(purchase.purchaseDate);
          const current = buckets.get(key) ?? {
            key,
            label:
              groupBy === 'branch'
                ? (purchase.branchNameSnapshot ?? purchase.branchId ?? '')
                : String(purchase.purchaseDate),
            amountMinor: 0n,
          };
          current.amountMinor += moneyAmountToMinor(purchase.purchaseTotal);
          buckets.set(key, current);
        } else {
          for (const line of purchase.lines ?? []) {
            const categoryId = categories.get(String(line.productId)) ?? '';
            const key = groupBy === 'product' ? String(line.productId) : categoryId;
            const current = buckets.get(key) ?? {
              key,
              label: groupBy === 'product' ? (line.productNameSnapshot ?? line.productId) : key,
              amountMinor: 0n,
            };
            current.amountMinor += moneyAmountToMinor(line.lineProductAmount);
            buckets.set(key, current);
          }
        }
      }
      const rows = [...buckets.values()].map((item) => ({
        groupKey: item.key,
        groupLabel: item.label,
        total: toMoneyDto(item.amountMinor).amount,
      }));
      const totalMinor = [...buckets.values()].reduce((sum, item) => sum + item.amountMinor, 0n);
      return {
        columns: [
          { key: 'groupKey', label: 'Key' },
          { key: 'groupLabel', label: 'Group' },
          { key: 'total', label: 'Total' },
        ],
        rows,
        totals: { total: toMoneyDto(totalMinor).amount },
      };
    }
    const rows = purchases.map((purchase) => ({
      id: purchase.id,
      purchaseDate: purchase.purchaseDate,
      supplier: purchase.supplierNameSnapshot ?? purchase.supplierId,
      total: moneyText(purchase.purchaseTotal),
      paid: moneyText(purchase.paidTotal),
      payable: moneyText(purchase.payableTotal),
    }));
    const totalMinor = purchases.reduce(
      (sum, purchase) => sum + moneyAmountToMinor(purchase.purchaseTotal),
      0n,
    );
    return {
      columns: [
        { key: 'id', label: 'Purchase' },
        { key: 'purchaseDate', label: 'Date' },
        { key: 'supplier', label: 'Supplier' },
        { key: 'total', label: 'Total' },
      ],
      rows,
      totals: { total: toMoneyDto(totalMinor).amount },
    };
  }

  async function querySales(organizationId, filters, authContext) {
    const sales = await loadPostedSales(organizationId, filters, authContext);
    const categories = await productCategoryMap(organizationId);
    return {
      reportKey: 'sales',
      title: REPORT_BY_KEY.sales.title,
      ...salesDataset(REPORT_BY_KEY.sales.title, sales, filters.groupBy, categories),
    };
  }

  async function queryPurchases(organizationId, filters, authContext) {
    const purchases = await loadPostedPurchases(organizationId, filters, authContext);
    const categories = await productCategoryMap(organizationId);
    return {
      reportKey: 'purchases',
      title: REPORT_BY_KEY.purchases.title,
      ...purchasesDataset(purchases, filters.groupBy, categories),
    };
  }

  async function queryGrossProfit(organizationId, filters, authContext) {
    const effects = await collectGrossProfitEffects(organizationId, filters, authContext);
    const computed = computeGrossProfitFromEffects(effects);
    return {
      reportKey: 'gross-profit',
      title: REPORT_BY_KEY['gross-profit'].title,
      columns: [
        { key: 'metric', label: 'Metric' },
        { key: 'amount', label: 'Amount' },
      ],
      rows: [
        { metric: 'netSalesRevenue', amount: computed.netSalesRevenue.amount },
        { metric: 'netCogs', amount: computed.netCogs.amount },
        { metric: 'grossProfit', amount: computed.grossProfit.amount },
      ],
      totals: { amount: computed.grossProfit.amount },
      summary: {
        netSalesRevenue: computed.netSalesRevenue,
        netCogs: computed.netCogs,
        grossProfit: computed.grossProfit,
      },
      netSalesRevenue: computed.netSalesRevenue,
      netCogs: computed.netCogs,
      grossProfit: computed.grossProfit,
    };
  }

  function filterByProductCategory(items, filters, categories, productKey = 'productId') {
    return items.filter((item) => {
      if (filters.warehouseId && String(item.warehouseId) !== filters.warehouseId) {
        return false;
      }
      if (filters.productId && String(item[productKey]) !== filters.productId) {
        return false;
      }
      if (filters.categoryId && categories.get(String(item[productKey])) !== filters.categoryId) {
        return false;
      }
      return true;
    });
  }

  async function queryStock(organizationId, filters, authContext) {
    const { items } = await inventoryService.listBalances(organizationId, {}, authContext);
    const categories = await productCategoryMap(organizationId);
    const scoped = filterByProductCategory(items, filters, categories);
    const grouped = new Map();
    for (const item of scoped) {
      const key = `${item.warehouseId}::${item.productId}`;
      const current = grouped.get(key) ?? {
        warehouseId: item.warehouseId,
        productId: item.productId,
        quantityMinor: 0n,
        unsellableMinor: 0n,
      };
      try {
        current.quantityMinor += parseQuantityMinorUnits(String(item.quantityBase ?? '0'));
        current.unsellableMinor += parseQuantityMinorUnits(String(item.unsellableQuantityBase ?? '0'));
      } catch {
        // ignore malformed quantity
      }
      grouped.set(key, current);
    }
    const rows = [...grouped.values()].map((item) => ({
      warehouseId: item.warehouseId,
      productId: item.productId,
      quantityBase: formatQuantityMinorUnits(item.quantityMinor),
      unsellableQuantityBase: formatQuantityMinorUnits(item.unsellableMinor),
    }));
    return {
      reportKey: 'stock',
      title: REPORT_BY_KEY.stock.title,
      columns: [
        { key: 'warehouseId', label: 'Warehouse' },
        { key: 'productId', label: 'Product' },
        { key: 'quantityBase', label: 'Quantity' },
        { key: 'unsellableQuantityBase', label: 'Unsellable' },
      ],
      rows,
      totals: {},
    };
  }

  async function queryStockValuation(organizationId, filters, authContext) {
    const { items } = await inventoryService.listBalances(organizationId, {}, authContext);
    const categories = await productCategoryMap(organizationId);
    const scoped = filterByProductCategory(items, filters, categories);
    const grouped = new Map();
    for (const item of scoped) {
      const key = `${item.warehouseId}::${item.productId}`;
      if (grouped.has(key)) {
        continue;
      }
      grouped.set(key, {
        warehouseId: item.warehouseId,
        productId: item.productId,
        quantityBase: item.valuation?.warehouseProductQuantityBase ?? '0.0000',
        inventoryValue: moneyText(item.valuation?.inventoryValue),
        weightedAverageCost: moneyText(item.valuation?.weightedAverageCost),
        inventoryValueMinor: moneyAmountToMinor(item.valuation?.inventoryValue),
      });
    }
    const rows = [...grouped.values()].map((item) => ({
      warehouseId: item.warehouseId,
      productId: item.productId,
      quantityBase: quantityText(item.quantityBase),
      inventoryValue: item.inventoryValue,
      weightedAverageCost: item.weightedAverageCost,
    }));
    const totalMinor = [...grouped.values()].reduce((sum, item) => sum + item.inventoryValueMinor, 0n);
    return {
      reportKey: 'stock-valuation',
      title: REPORT_BY_KEY['stock-valuation'].title,
      columns: [
        { key: 'warehouseId', label: 'Warehouse' },
        { key: 'productId', label: 'Product' },
        { key: 'quantityBase', label: 'Quantity' },
        { key: 'weightedAverageCost', label: 'WAC' },
        { key: 'inventoryValue', label: 'Inventory value' },
      ],
      rows,
      totals: { inventoryValue: toMoneyDto(totalMinor).amount },
    };
  }

  async function queryStockMovements(organizationId, filters, authContext) {
    const { items } = await inventoryService.listMovements(organizationId, {}, authContext);
    const categories = await productCategoryMap(organizationId);
    const scoped = filterByProductCategory(items, filters, categories).filter((item) =>
      inDateRange(item.postedAt, filters.fromDate, filters.toDate),
    );
    const rows = scoped.map((item) => ({
      id: item.id,
      postedAt: item.postedAt,
      warehouseId: item.warehouseId,
      productId: item.productId,
      direction: item.direction,
      quantityBase: quantityText(item.quantityBase),
      inventoryValue: moneyText(item.inventoryValue),
      sourceType: item.sourceType,
      sourceId: item.sourceId,
    }));
    return {
      reportKey: 'stock-movements',
      title: REPORT_BY_KEY['stock-movements'].title,
      columns: [
        { key: 'postedAt', label: 'Posted at' },
        { key: 'warehouseId', label: 'Warehouse' },
        { key: 'productId', label: 'Product' },
        { key: 'direction', label: 'Direction' },
        { key: 'quantityBase', label: 'Quantity' },
        { key: 'sourceType', label: 'Source' },
      ],
      rows,
      totals: {},
    };
  }

  async function queryCustomerLedger(organizationId, filters) {
    const ledger = await paymentsService.listCustomerLedger(organizationId, filters.customerId);
    const items = (ledger.items ?? []).filter((item) =>
      inDateRange(item.postedAt, filters.fromDate, filters.toDate),
    );
    let running = 0n;
    const rows = items.map((item) => {
      running += moneyAmountToMinor(item.signedAmount);
      return {
        id: item.id,
        postedAt: item.postedAt,
        effectKind: item.effectKind,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        signedAmount: moneyText(item.signedAmount),
        runningBalance: toMoneyDto(running).amount,
      };
    });
    return {
      reportKey: 'customer-ledger',
      title: REPORT_BY_KEY['customer-ledger'].title,
      columns: [
        { key: 'postedAt', label: 'Posted at' },
        { key: 'effectKind', label: 'Kind' },
        { key: 'sourceType', label: 'Source' },
        { key: 'signedAmount', label: 'Signed amount' },
        { key: 'runningBalance', label: 'Running' },
      ],
      rows,
      totals: { signedAmount: toMoneyDto(running).amount },
    };
  }

  async function querySupplierLedger(organizationId, filters) {
    const ledger = await paymentsService.listSupplierLedger(organizationId, filters.supplierId);
    const items = (ledger.items ?? []).filter((item) =>
      inDateRange(item.postedAt, filters.fromDate, filters.toDate),
    );
    let running = 0n;
    const rows = items.map((item) => {
      running += moneyAmountToMinor(item.signedAmount);
      return {
        id: item.id,
        postedAt: item.postedAt,
        effectKind: item.effectKind,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        signedAmount: moneyText(item.signedAmount),
        runningBalance: toMoneyDto(running).amount,
      };
    });
    return {
      reportKey: 'supplier-ledger',
      title: REPORT_BY_KEY['supplier-ledger'].title,
      columns: [
        { key: 'postedAt', label: 'Posted at' },
        { key: 'effectKind', label: 'Kind' },
        { key: 'sourceType', label: 'Source' },
        { key: 'signedAmount', label: 'Signed amount' },
        { key: 'runningBalance', label: 'Running' },
      ],
      rows,
      totals: { signedAmount: toMoneyDto(running).amount },
    };
  }

  async function queryAccountCashBook(organizationId, filters) {
    const { items: accounts } = await accountsService.listAccounts(organizationId);
    const selected = filters.accountId
      ? accounts.filter((account) => String(account.id) === filters.accountId)
      : accounts;
    const rows = [];
    let totalMinor = 0n;
    for (const account of selected) {
      const movements = await accountsService.listAccountMovements(organizationId, account.id);
      for (const movement of movements.items ?? []) {
        if (movement.status && movement.status !== 'posted') {
          continue;
        }
        if (!inDateRange(movement.postedAt, filters.fromDate, filters.toDate)) {
          continue;
        }
        const signed = moneyAmountToMinor(movement.signedAmount);
        totalMinor += signed;
        rows.push({
          accountId: account.id,
          accountName: account.name ?? account.id,
          accountType: account.accountType ?? '',
          postedAt: movement.postedAt,
          sourceType: movement.sourceType,
          signedAmount: moneyText(movement.signedAmount),
        });
      }
    }
    return {
      reportKey: 'account-cash-book',
      title: REPORT_BY_KEY['account-cash-book'].title,
      columns: [
        { key: 'accountName', label: 'Account' },
        { key: 'accountType', label: 'Type' },
        { key: 'postedAt', label: 'Posted at' },
        { key: 'sourceType', label: 'Source' },
        { key: 'signedAmount', label: 'Signed amount' },
      ],
      rows,
      totals: { signedAmount: toMoneyDto(totalMinor).amount },
    };
  }

  async function queryExpenses(organizationId, filters) {
    const { items } = await accountsService.listExpenses(organizationId);
    const posted = items.filter(
      (expense) =>
        expense.status === 'posted' && inDateRange(expense.expenseDate, filters.fromDate, filters.toDate),
    );
    const totalMinor = posted.reduce((sum, expense) => sum + moneyAmountToMinor(expense.amount), 0n);
    return {
      reportKey: 'expenses',
      title: REPORT_BY_KEY.expenses.title,
      columns: [
        { key: 'id', label: 'Expense' },
        { key: 'expenseDate', label: 'Date' },
        { key: 'purpose', label: 'Purpose' },
        { key: 'amount', label: 'Amount' },
      ],
      rows: posted.map((expense) => ({
        id: expense.id,
        expenseDate: expense.expenseDate,
        purpose: expense.purpose ?? '',
        amount: moneyText(expense.amount),
      })),
      totals: { amount: toMoneyDto(totalMinor).amount },
    };
  }

  async function queryAlertFamily(organizationId, authContext, filters, reportKey, pick) {
    const alerts = await alertsService.listAlerts(organizationId, authContext);
    const categories = await productCategoryMap(organizationId);
    const items = filterByProductCategory(pick(alerts), filters, categories);
    return {
      reportKey,
      title: REPORT_BY_KEY[reportKey].title,
      columns: [
        { key: 'productId', label: 'Product' },
        { key: 'warehouseId', label: 'Warehouse' },
        { key: 'detail', label: 'Detail' },
      ],
      rows: items.map((item) => ({
        productId: item.productId ?? '',
        warehouseId: item.warehouseId ?? '',
        detail: item.body ?? item.title ?? item.alertType,
      })),
      totals: {},
      summary: { count: items.length },
    };
  }

  async function queryTopProducts(organizationId, filters, authContext) {
    const sales = await loadPostedSales(organizationId, filters, authContext);
    const categories = await productCategoryMap(organizationId);
    const qtyTotals = new Map();
    for (const sale of sales) {
      for (const line of sale.lines ?? []) {
        if (filters.categoryId && categories.get(String(line.productId)) !== filters.categoryId) {
          continue;
        }
        const productId = String(line.productId);
        const current = qtyTotals.get(productId) ?? {
          productId,
          productName: line.productNameSnapshot ?? productId,
          quantityBaseMinorUnits: 0n,
          revenueMinorUnits: 0n,
        };
        try {
          current.quantityBaseMinorUnits += parseQuantityMinorUnits(String(line.quantityBase ?? '0'));
        } catch {
          // ignore
        }
        current.revenueMinorUnits += moneyAmountToMinor(line.lineProductAmount);
        qtyTotals.set(productId, current);
      }
    }
    const ranked = [...qtyTotals.values()].sort((a, b) => {
      if (b.quantityBaseMinorUnits === a.quantityBaseMinorUnits) {
        return b.revenueMinorUnits > a.revenueMinorUnits ? 1 : -1;
      }
      return b.quantityBaseMinorUnits > a.quantityBaseMinorUnits ? 1 : -1;
    });
    return {
      reportKey: 'top-products',
      title: REPORT_BY_KEY['top-products'].title,
      columns: [
        { key: 'productName', label: 'Product' },
        { key: 'quantityBase', label: 'Quantity' },
        { key: 'revenue', label: 'Revenue' },
      ],
      rows: ranked.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantityBase: formatQuantityMinorUnits(item.quantityBaseMinorUnits),
        revenue: toMoneyDto(item.revenueMinorUnits).amount,
      })),
      totals: {
        revenue: toMoneyDto(
          ranked.reduce((sum, item) => sum + item.revenueMinorUnits, 0n),
        ).amount,
      },
    };
  }

  async function queryTopCustomers(organizationId, filters, authContext) {
    const sales = await loadPostedSales(organizationId, filters, authContext);
    const buckets = new Map();
    for (const sale of sales) {
      const customerId = String(sale.customerId ?? 'walk-in');
      const current = buckets.get(customerId) ?? {
        customerId,
        customerName: sale.customerNameSnapshot ?? customerId,
        revenueMinor: 0n,
      };
      current.revenueMinor += moneyAmountToMinor(sale.saleTotal);
      buckets.set(customerId, current);
    }
    const ranked = [...buckets.values()].sort((a, b) =>
      b.revenueMinor > a.revenueMinor ? 1 : -1,
    );
    return {
      reportKey: 'top-customers',
      title: REPORT_BY_KEY['top-customers'].title,
      columns: [
        { key: 'customerName', label: 'Customer' },
        { key: 'revenue', label: 'Revenue' },
      ],
      rows: ranked.map((item) => ({
        customerId: item.customerId,
        customerName: item.customerName,
        revenue: toMoneyDto(item.revenueMinor).amount,
      })),
      totals: {
        revenue: toMoneyDto(ranked.reduce((sum, item) => sum + item.revenueMinor, 0n)).amount,
      },
    };
  }

  async function queryEmployeeSales(organizationId, filters, authContext) {
    const sales = await loadPostedSales(organizationId, filters, authContext);
    const buckets = new Map();
    for (const sale of sales) {
      const employeeId = String(sale.postedBy ?? '');
      const current = buckets.get(employeeId) ?? {
        employeeId,
        revenueMinor: 0n,
        count: 0,
      };
      current.revenueMinor += moneyAmountToMinor(sale.saleTotal);
      current.count += 1;
      buckets.set(employeeId, current);
    }
    const rows = [...buckets.values()].map((item) => ({
      employeeId: item.employeeId,
      saleCount: String(item.count),
      revenue: toMoneyDto(item.revenueMinor).amount,
    }));
    return {
      reportKey: 'employee-sales',
      title: REPORT_BY_KEY['employee-sales'].title,
      columns: [
        { key: 'employeeId', label: 'Employee' },
        { key: 'saleCount', label: 'Sales' },
        { key: 'revenue', label: 'Revenue' },
      ],
      rows,
      totals: {
        revenue: toMoneyDto(rows.reduce((sum, row) => sum + moneyAmountToMinor({ amount: row.revenue }), 0n))
          .amount,
      },
    };
  }

  async function queryReport(organizationId, reportKey, filters, authContext) {
    switch (reportKey) {
      case 'sales':
        return querySales(organizationId, filters, authContext);
      case 'purchases':
        return queryPurchases(organizationId, filters, authContext);
      case 'gross-profit':
        return queryGrossProfit(organizationId, filters, authContext);
      case 'stock':
        return queryStock(organizationId, filters, authContext);
      case 'stock-valuation':
        return queryStockValuation(organizationId, filters, authContext);
      case 'stock-movements':
        return queryStockMovements(organizationId, filters, authContext);
      case 'customer-ledger':
        return queryCustomerLedger(organizationId, filters);
      case 'supplier-ledger':
        return querySupplierLedger(organizationId, filters);
      case 'account-cash-book':
        return queryAccountCashBook(organizationId, filters);
      case 'expenses':
        return queryExpenses(organizationId, filters);
      case 'low-stock':
        return queryAlertFamily(
          organizationId,
          authContext,
          filters,
          'low-stock',
          (alerts) => alerts.lowStock?.items ?? [],
        );
      case 'expiry':
        return queryAlertFamily(organizationId, authContext, filters, 'expiry', (alerts) => [
          ...(alerts.upcomingExpiry?.items ?? []),
          ...(alerts.expiredStock?.items ?? []),
        ]);
      case 'dead-stock':
        return queryAlertFamily(
          organizationId,
          authContext,
          filters,
          'dead-stock',
          (alerts) => alerts.deadStock?.items ?? [],
        );
      case 'top-products':
        return queryTopProducts(organizationId, filters, authContext);
      case 'top-customers':
        return queryTopCustomers(organizationId, filters, authContext);
      case 'employee-sales':
        return queryEmployeeSales(organizationId, filters, authContext);
      default:
        return { reportKey, title: reportKey, columns: [], rows: [], totals: {} };
    }
  }

  return {
    collectGrossProfitEffects,
    queryGrossProfit,
    queryReport,
  };
}

module.exports = {
  createReportQueries,
};
