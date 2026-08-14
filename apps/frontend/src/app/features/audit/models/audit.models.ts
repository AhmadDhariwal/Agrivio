export interface AuditEventItem {
  id: string;
  organizationId: string | null;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  reason: string | null;
  occurredAt: string;
}
