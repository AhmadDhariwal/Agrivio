const { resolveBusinessDate } = require('../inventory/public');
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
const { evaluateFeatureEntitlement } = require('../subscriptions/entitlement');

function createReportingService(deps) {
  const salesService = deps.salesService;
  const purchasesService = deps.purchasesService;
  const accountsService = deps.accountsService;
  const paymentsService = deps.paymentsService;
  const alertsService = deps.alertsService;
  const returnsService = deps.returnsService;
  const resolveOrganizationTimezone = deps.resolveOrganizationTimezone;
  const resolvePlanEntitlements = deps.resolvePlanEntitlements;
  const now = deps.now ?? (() => new Date());

  async function resolveOrgBusinessDate(organizationId) {
    const timezone = await resolveOrganizationTimezone(organizationId);
    return resolveBusinessDate(timezone, now());
  }

  async function sumTodaySales(organizationId, businessDate, authContext) {
    const { items } = await salesService.listSales(
      organizationId,
      { status: 'posted' },
      authContext,
    );
    let total = 0n;
    for (const sale of items) {
      if (String(sale.saleDate) !== businessDate) {
        continue;
      }
      total += moneyAmountToMinor(sale.saleTotal);
    }
    return total;
  }

  async function sumTodayPurchases(organizationId, businessDate, authContext) {
    const { items } = await purchasesService.listPurchases(
      organizationId,
      { status: 'posted' },
      authContext,
    );
    let total = 0n;
    for (const purchase of items) {
      if (String(purchase.purchaseDate) !== businessDate) {
        continue;
      }
      total += moneyAmountToMinor(purchase.purchaseTotal);
    }
    return total;
  }

  async function sumTodayExpenses(organizationId, businessDate) {
    const { items } = await accountsService.listExpenses(organizationId);
    let total = 0n;
    for (const expense of items) {
      if (expense.status !== 'posted') {
        continue;
      }
      if (String(expense.expenseDate) !== businessDate) {
        continue;
      }
      total += moneyAmountToMinor(expense.amount);
    }
    return total;
  }

  async function computeGrossProfit(organizationId, authContext) {
    const { items: sales } = await salesService.listSales(
      organizationId,
      { status: 'posted' },
      authContext,
    );
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
      for (const row of returns) {
        const effect = salesReturnToGrossProfitEffect(row);
        if (effect) {
          effects.push(effect);
        }
      }
    }

    return computeGrossProfitFromEffects(effects);
  }

  async function sumAccountBalancesByType(organizationId) {
    const { items } = await accountsService.listAccounts(organizationId);
    const totals = {
      cash: 0n,
      bank: 0n,
      jazzcash: 0n,
      easypaisa: 0n,
    };
    for (const account of items) {
      if (account.status !== 'active') {
        continue;
      }
      const type = String(account.accountType);
      if (totals[type] === undefined) {
        continue;
      }
      totals[type] += moneyAmountToMinor(account.derivedBalances?.balance);
    }
    return {
      cashBalances: toMoneyDto(totals.cash),
      bankBalances: toMoneyDto(totals.bank),
      jazzCashBalance: toMoneyDto(totals.jazzcash),
      easypaisaBalance: toMoneyDto(totals.easypaisa),
    };
  }

  async function sumReceivablesPayables(organizationId) {
    const [customers, suppliers] = await Promise.all([
      paymentsService.listCustomerReceivableBalances(organizationId),
      paymentsService.listSupplierPayableBalances(organizationId),
    ]);
    let receivable = 0n;
    for (const item of customers.items ?? []) {
      receivable += BigInt(String(item.receivableMinorUnits ?? '0'));
    }
    let payable = 0n;
    for (const item of suppliers.items ?? []) {
      payable += BigInt(String(item.payableMinorUnits ?? '0'));
    }
    return {
      customerReceivables: toMoneyDto(receivable),
      supplierPayables: toMoneyDto(payable),
    };
  }

  async function recentSales(organizationId, authContext, limit = 10) {
    const { items } = await salesService.listSales(
      organizationId,
      { status: 'posted' },
      authContext,
    );
    const sorted = [...items].sort((a, b) => {
      const dateCmp = String(b.saleDate).localeCompare(String(a.saleDate));
      if (dateCmp !== 0) {
        return dateCmp;
      }
      return String(b.postedAt ?? '').localeCompare(String(a.postedAt ?? ''));
    });
    return sorted.slice(0, limit).map((sale) => ({
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      saleDate: sale.saleDate,
      saleTotal: sale.saleTotal,
      customerId: sale.customerId,
      warehouseId: sale.warehouseId,
    }));
  }

  async function topSellingProducts(organizationId, authContext, limit = 10) {
    const { items } = await salesService.listSales(
      organizationId,
      { status: 'posted' },
      authContext,
    );
    const qtyTotals = new Map();
    for (const sale of items) {
      for (const line of sale.lines ?? []) {
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
          // ignore malformed line quantity
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

    return ranked.slice(0, limit).map((item) => ({
      productId: item.productId,
      productName: item.productName,
      quantityBase: formatQuantityMinorUnits(item.quantityBaseMinorUnits),
      revenue: toMoneyDto(item.revenueMinorUnits),
    }));
  }

  return {
    computeGrossProfitFromEffects,
    async getDashboard(organizationId, authContext) {
      const entitlements =
        typeof resolvePlanEntitlements === 'function'
          ? await resolvePlanEntitlements(organizationId)
          : null;
      const reportsExports = evaluateFeatureEntitlement(
        entitlements ? { entitlements } : null,
        'reportsExports',
      );

      const businessDate = await resolveOrgBusinessDate(organizationId);
      const [
        todaySales,
        todayPurchases,
        todayExpenses,
        grossProfit,
        accountBalances,
        partyBalances,
        alertSummaries,
        recent,
        topProducts,
      ] = await Promise.all([
        sumTodaySales(organizationId, businessDate, authContext),
        sumTodayPurchases(organizationId, businessDate, authContext),
        sumTodayExpenses(organizationId, businessDate),
        computeGrossProfit(organizationId, authContext),
        sumAccountBalancesByType(organizationId),
        sumReceivablesPayables(organizationId),
        alertsService.getAlertSummaries(organizationId, authContext),
        recentSales(organizationId, authContext),
        topSellingProducts(organizationId, authContext),
      ]);

      return {
        businessDate,
        entitlements: {
          reportsExportsAllowed: reportsExports.allowed === true,
        },
        todaysSales: toMoneyDto(todaySales),
        todaysPurchases: toMoneyDto(todayPurchases),
        todaysExpenses: toMoneyDto(todayExpenses),
        grossProfit: grossProfit.grossProfit,
        netSalesRevenue: grossProfit.netSalesRevenue,
        netCogs: grossProfit.netCogs,
        ...accountBalances,
        ...partyBalances,
        lowStockCount: alertSummaries.lowStockCount,
        upcomingExpiryCount: alertSummaries.upcomingExpiryCount,
        expiredStockCount: alertSummaries.expiredStockCount,
        deadStockSummary: alertSummaries.deadStock,
        recentSales: recent,
        topSellingProducts: topProducts,
      };
    },
  };
}

module.exports = {
  createReportingService,
};
