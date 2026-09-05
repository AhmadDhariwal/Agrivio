import { PaginationQuery } from '../../../shared/data-access/pagination';

export type PlatformOrganizationStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'suspended';

export type PlatformSubscriptionStatus =
  | 'pending_approval'
  | 'trial'
  | 'active'
  | 'grace'
  | 'suspended'
  | 'cancelled'
  | 'retained'
  | 'rejected';

export interface PlatformOrganizationSummary {
  id: string;
  name: string;
  status: PlatformOrganizationStatus | string;
  version?: number;
  timezone?: string | undefined;
  createdAt?: string | null | undefined;
  updatedAt?: string | null | undefined;
  approvedAt?: string | null | undefined;
  rejectedAt?: string | null | undefined;
  rejectionReason?: string | null | undefined;
  ownerUserId?: string | undefined;
  ownerEmail?: string | null | undefined;
  ownerStatus?: string | null | undefined;
  ownerNeedsActivation?: boolean | undefined;
  branchCount?: number | undefined;
  warehouseCount?: number | undefined;
  employeeCount?: number | undefined;
  ownerCount?: number | undefined;
  subscription?: {
    id: string;
    status: string;
    planCode: string;
    planVersion: number;
    trialEndsAt?: string | null | undefined;
    graceEndsAt?: string | null | undefined;
    periodStartsAt?: string | null | undefined;
    periodEndsAt?: string | null | undefined;
    version?: number | undefined;
  } | null | undefined;
}

export interface PlatformOrganizationActivationHandoff {
  organizationId: string;
  status: string;
  ownerEmail: string;
  ownerDisplayName: string;
  activationToken: string;
  activationTokenExpiresAt: string;
  activationPath: string;
  activationUrl: string;
  reissued?: boolean | undefined;
}

export interface PlatformOrganizationMember {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  branchAssignments?: Array<{ targetId: string }> | undefined;
  warehouseAssignments?: Array<{ targetId: string }> | undefined;
}

export interface PlatformAuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  reason?: string | undefined;
  scope?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export interface PlatformResourceUsageThreshold {
  current: number;
  limit: number | null;
}

export type ResourcePresentationState = 'normal' | 'near-limit' | 'limit-reached';

export interface PlatformOrganizationUsage {
  planCode: string | null;
  planVersion: number | null;
  resources: {
    branches: PlatformResourceUsageThreshold;
    warehouses: PlatformResourceUsageThreshold;
    activeUsers: PlatformResourceUsageThreshold;
  };
}

export interface PlatformOrganizationDetail extends PlatformOrganizationSummary {
  owner?: {
    id: string;
    email: string;
    displayName: string;
    status: string;
    hasPassword?: boolean | undefined;
  } | null | undefined;
  identity?: {
    name: string;
    timezone: string;
    settings?: {
      tradingName?: string | undefined;
      contactPhone?: string | undefined;
      contactEmail?: string | undefined;
      addressLine?: string | undefined;
      documentFooterNote?: string | undefined;
      version?: number | undefined;
    } | null | undefined;
  } | undefined;
  lifecycle?: {
    status: string;
    version: number;
  } | undefined;
  usage?: PlatformOrganizationUsage | undefined;
  members?: {
    items: PlatformOrganizationMember[];
    total: number;
  } | undefined;
  branches?: {
    items: Array<{ id: string; name: string; code?: string | undefined; isDefault?: boolean | undefined }>;
    total: number;
  } | undefined;
  warehouses?: {
    items: Array<{ id: string; name: string; code?: string | undefined; isDefault?: boolean | undefined }>;
    total: number;
  } | undefined;
  capabilities?: Record<string, unknown> | undefined;
  setup?: {
    completed: boolean;
    percentage: number;
    steps?: Array<{ key: string; completed: boolean; label: string }> | undefined;
  } | undefined;
  audit?: {
    total: number;
    recent: PlatformAuditEvent[];
  } | undefined;
  billing?: Record<string, unknown> | undefined;
  operationalWarnings?: Array<{ code: string; message: string; endsAt?: string | undefined }> | undefined;
}

export interface PlatformOrganizationQuery extends PaginationQuery {
  subscriptionStatus?: string;
  plan?: string;
  sort?: string;
  direction?: 'asc' | 'desc';
  createdFrom?: string;
  createdTo?: string;
}

export interface PlatformOrganizationKpis {
  total: number;
  active: number;
  suspended: number;
  trial: number;
}

export interface PlatformProfilePatchPayload {
  expectedVersion: number;
  reason: string;
  name?: string | undefined;
  timezone?: string | undefined;
}

export interface PlatformSuspendPayload {
  expectedVersion: number;
  reason: string;
  confirmed: true;
}

export interface PlatformReactivatePayload {
  expectedVersion: number;
  reason: string;
}

export interface PlatformChangePlanPayload {
  expectedVersion: number;
  planCode: string;
  planVersion: number;
  reason: string;
  effective?: 'immediate' | 'next_period' | undefined;
}
