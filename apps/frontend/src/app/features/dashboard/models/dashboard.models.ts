export interface MoneyDto {
  amount: string;
  currency: string;
}

export interface DashboardPayload {
  businessDate: string;
  period?: { fromDate: string; toDate: string };
  entitlements: { reportsExportsAllowed: boolean };
  todaysSales: MoneyDto;
  todaysPurchases: MoneyDto;
  todaysExpenses: MoneyDto;
  grossProfit: MoneyDto;
  periodSales?: MoneyDto;
  periodPurchases?: MoneyDto;
  periodGrossProfit?: MoneyDto;
  netSalesRevenue: MoneyDto;
  netCogs: MoneyDto;
  stockValuation?: MoneyDto;
  cashBalances: MoneyDto;
  bankBalances: MoneyDto;
  jazzCashBalance: MoneyDto;
  easypaisaBalance: MoneyDto;
  customerReceivables: MoneyDto;
  supplierPayables: MoneyDto;
  accountDistribution?: Array<{ key: string; label: string; balance: MoneyDto }>;
  salesVsPurchases?: Array<{ date: string; sales: MoneyDto; purchases: MoneyDto }>;
  grossProfitTrend?: Array<{ date: string; grossProfit: MoneyDto }>;
  lowStockCount: number;
  upcomingExpiryCount: number;
  expiredStockCount: number;
  deadStockSummary: {
    count: number;
    inactivityDays: number | null;
    items: Array<{ productId: string; sellableQuantityBase: string }>;
  };
  recentSales: Array<{
    id: string;
    invoiceNumber: string | null;
    saleDate: string;
    saleTotal: MoneyDto | null;
    customerId: string | null;
    warehouseId: string;
  }>;
  topSellingProducts: Array<{
    productId: string;
    productName: string;
    quantityBase: string;
    revenue: MoneyDto;
  }>;
}
