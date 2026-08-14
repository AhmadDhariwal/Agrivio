export interface AlertSummaries {
  lowStockCount: number;
  upcomingExpiryCount: number;
  expiredStockCount: number;
  deadStockCount: number;
  customerDuesCount: number;
  supplierDuesCount: number;
}

export interface NotificationItem {
  id: string;
  alertType: string;
  title: string;
  body: string;
  subjectKey: string;
  fingerprint: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

export interface AlertsPayload {
  businessDate: string | null;
  summaries: AlertSummaries;
  items: Array<{
    alertType: string;
    fingerprint: string;
    title: string;
    body: string;
  }>;
}
