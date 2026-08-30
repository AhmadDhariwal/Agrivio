export interface AlertSummaries {
  lowStockCount: number;
  upcomingExpiryCount: number;
  expiredStockCount: number;
  deadStockCount: number;
  customerDuesCount: number;
  supplierDuesCount: number;
  customerDuesAmount: { amount: string; currency: string };
  supplierDuesAmount: { amount: string; currency: string };
}

export interface NotificationItem {
  id: string;
  alertType: string;
  title: string;
  body: string;
  subjectKey: string;
  fingerprint: string;
  targetRoute?: string;
  isRead: boolean;
  active: boolean;
  activatedAt: string | null;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  createdAt: string | null;
}

export interface NotificationFeedPayload {
  items: NotificationItem[];
  unreadCount: number;
}

export interface NotificationsPayload {
  items: NotificationItem[];
  summaries: AlertSummaries;
  unreadCount: number;
  businessDate: string | null;
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
