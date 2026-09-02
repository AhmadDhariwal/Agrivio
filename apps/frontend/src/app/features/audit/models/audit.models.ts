export interface AuditEventItem {
  id: string;
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

export interface AuditSummary {
  totalEvents: number;
  eventsToday: number;
  uniqueActors: number;
  resourceTypes: number;
}
