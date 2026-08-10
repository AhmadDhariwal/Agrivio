import { HttpErrorResponse } from '@angular/common/http';

export interface SoftWarningPayload {
  softWarning?: boolean;
  reason?: string;
  limit?: number;
  currentUsage?: number;
  remaining?: number;
}

export function softWarningMessage(softWarning: SoftWarningPayload | null | undefined): string | null {
  if (!softWarning || softWarning.softWarning !== true) {
    return null;
  }
  const remaining =
    typeof softWarning.remaining === 'number' ? softWarning.remaining : undefined;
  if (remaining !== undefined) {
    return `Approaching plan limit: ${remaining} remaining before the hard limit.`;
  }
  return 'Approaching your plan creation limit.';
}

export function mapPlanLimitError(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  const message = error.error?.error?.message;
  if (typeof message === 'string' && message.toLowerCase().includes('plan limit')) {
    return message;
  }
  if (error.status === 403 && typeof message === 'string') {
    return message;
  }
  return typeof message === 'string' ? message : fallback;
}
