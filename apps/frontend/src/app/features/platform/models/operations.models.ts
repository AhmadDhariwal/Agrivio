export interface BackupOperationItem {
  id: string;
  status: string;
  recordedAt: string;
  failureVisible: boolean;
  failureMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  databaseName: string | null;
  filename: string | null;
  fileSizeBytes: number | null;
  sha256: string | null;
  manifestVerified: boolean;
  checksumVerified: boolean;
  retentionDays: number | null;
  expiresAt: string | null;
  restoreReady: boolean;
  coverage: 'mongodb_application_data';
}

export interface AuditRetentionStatus {
  scope: 'tenant' | 'platform';
  organizationId: string | null;
  configuredRetentionDays: number | null;
  retentionSource: string;
  cutoffAt: string | null;
  oldestAccessibleEvent: string | null;
  newestEvent: string | null;
  currentEventCount: number;
  expiredEventCount: number;
  lastCleanupAt: string | null;
  nextCleanupAt: string | null;
}

export interface AuditRetentionPurgeResult {
  scope: 'tenant' | 'platform';
  organizationId: string | null;
  cutoffAt: string;
  deletedCount: number;
  completedAt: string;
}

export interface RestoreOperationItem {
  id: string;
  status: string;
  requestedAt: string;
  reason: string;
  productionRestoreExecuted: boolean;
  coordinationOnly: boolean;
  verificationStatus: string;
}
