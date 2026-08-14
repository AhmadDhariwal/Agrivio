export interface MoneyDto {
  amount: string;
  currency: string;
}

export interface DashboardPayload {
  businessDate: string;
  entitlements: { reportsExportsAllowed: boolean };
  todaysSales: MoneyDto;
  todaysPurchases: MoneyDto;
  todaysExpenses: MoneyDto;
  grossProfit: MoneyDto;
  netSalesRevenue: MoneyDto;
  netCogs: MoneyDto;
  cashBalances: MoneyDto;
  bankBalances: MoneyDto;
  jazzCashBalance: MoneyDto;
  easypaisaBalance: MoneyDto;
  customerReceivables: MoneyDto;
  supplierPayables: MoneyDto;
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
