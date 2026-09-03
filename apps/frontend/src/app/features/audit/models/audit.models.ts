export interface AuditEventItem {
  id: string;
  scope?: 'tenant' | 'platform';
  organizationId: string | null;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  requestId?: string | null;
  occurredAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface AuditActorOption {
  value: string;
  label: string;
  system?: boolean;
}

export interface AuditRetentionNotice {
  retentionDays: number | null;
  cutoffAt: string | null;
  oldestVisibleEventAt: string | null;
  automaticCleanupEnabled: boolean;
  nextCleanupAt: string | null;
  expiredEventCount?: number;
  retentionSource?: string;
}

export interface AuditSummary {
  totalEvents: number;
  eventsToday: number;
  uniqueActors: number;
  resourceTypes: number;
  retention?: AuditRetentionNotice;
}
