export interface BackupOperationItem {
  id: string;
  status: string;
  recordedAt: string;
  failureVisible: boolean;
  failureMessage: string | null;
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
