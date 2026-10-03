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

export interface EnrichedNotificationItem extends NotificationItem {
  targetPath: string;
  targetQueryParams: Record<string, string>;
}

export function parseTargetRoute(targetRoute?: string | null): {
  path: string;
  queryParams: Record<string, string>;
} {
  if (!targetRoute) {
    return { path: '/app/alerts', queryParams: {} };
  }
  const [pathPart, queryPart] = targetRoute.split('?');
  const path = pathPart || '/app/alerts';
  if (!queryPart) {
    return { path, queryParams: {} };
  }
  const queryParams: Record<string, string> = {};
  const searchParams = new URLSearchParams(queryPart);
  searchParams.forEach((val, key) => {
    queryParams[key] = val;
  });
  return { path, queryParams };
}

export function enrichNotificationItem(item: NotificationItem): EnrichedNotificationItem {
  const { path, queryParams } = parseTargetRoute(item.targetRoute);
  return {
    ...item,
    targetPath: path,
    targetQueryParams: queryParams,
  };
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
